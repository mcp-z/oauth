/**
 * Account "me" tool - Who am I currently authenticated as?
 *
 * Provides current user identity across all auth modes:
 * - Loopback: email, alias, sessionExpiresIn from stored tokens
 * - DCR/Stateless: email from bearer token context, sessionExpiresIn=null
 * - Device Code: email, sessionExpiresIn from stored tokens
 * - Service Account: email, sessionExpiresIn="never" (JWT-based)
 *
 * Tool: {service}-account-me
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getAccountInfo, getActiveAccount, getToken } from '../../account-utils.ts';
import type { CachedToken, McpPrompt, McpTool } from '../../types.ts';
import type { AccountMeConfig } from './types.ts';

/**
 * Format milliseconds as human-readable duration
 * Examples: "2h 15m", "45m", "30s"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Create account-me tool for current user identity.
 *
 * Returns email, optional alias (loopback only), and session expiry info.
 * Throws error if no active account in loopback mode.
 */
export function createAccountMe(config: AccountMeConfig): { tools: McpTool[]; prompts: McpPrompt[] } {
  const { service, store, logger, mode } = config;

  const tools: McpTool[] = [
    {
      name: 'account-me',
      config: {
        description: `Show current ${service} user identity. Returns email, alias (if set), and session expiry information.`,
        inputSchema: {} as const,
        outputSchema: {
          result: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('success'),
              service: z.string(),
              email: z.string(),
              alias: z.string().optional(),
              sessionExpiresIn: z.string().nullable().optional(),
              message: z.string(),
            }),
          ]),
        } as const,
      },
      handler: async (_args: unknown, extra?: unknown): Promise<CallToolResult> => {
        try {
          // Mode-specific implementation
          if (mode === 'stateless') {
            // DCR/Stateless: Extract email from auth context
            const authContext = (extra as { authContext?: { accountId?: string } })?.authContext;

            if (!authContext?.accountId) {
              throw new Error('No authentication context available. DCR mode requires bearer token.');
            }

            const result = {
              type: 'success' as const,
              service,
              email: authContext.accountId,
              sessionExpiresIn: null, // Client-managed
              message: `Authenticated as ${authContext.accountId}. Session managed by MCP client.`,
            };

            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
              structuredContent: { result },
            };
          }

          // Loopback/Device Code/Service Account: Use store
          if (!store) {
            throw new Error('Store is required for non-stateless mode');
          }

          // Get active account
          const activeAccountId = await getActiveAccount(store, { service });
          if (!activeAccountId) {
            throw new Error(`No active ${service} account found. Use account-switch to add an account.`);
          }

          // Get account info (email, alias)
          const accountInfo = await getAccountInfo(store, { accountId: activeAccountId, service });
          const email = accountInfo?.email ?? activeAccountId;
          const alias = accountInfo?.alias;

          // Calculate session expiry
          let sessionExpiresIn: string | null = null;
          try {
            const token = await getToken<CachedToken>(store, { accountId: activeAccountId, service });
            if (token?.expiresAt) {
              const now = Date.now();
              if (token.expiresAt > now) {
                sessionExpiresIn = formatDuration(token.expiresAt - now);
              } else {
                sessionExpiresIn = 'expired';
              }
            } else {
              // No expiry = JWT-based service account or no token info
              sessionExpiresIn = 'never';
            }
          } catch {
            // Token not found or error reading - treat as "never" (service account pattern)
            sessionExpiresIn = 'never';
          }

          const result = {
            type: 'success' as const,
            service,
            email,
            ...(alias && { alias }),
            ...(sessionExpiresIn && { sessionExpiresIn }),
            message: `Authenticated as ${email}${alias ? ` (${alias})` : ''}${sessionExpiresIn ? `. Session expires in ${sessionExpiresIn}` : ''}.`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: { result },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger?.error?.('account-me.error', { service, error: message });

          throw new McpError(ErrorCode.InternalError, `Error getting ${service} account info: ${message}`, {
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    },
  ];

  const prompts: McpPrompt[] = [];

  return { tools, prompts };
}

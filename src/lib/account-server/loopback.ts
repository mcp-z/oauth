/**
 * Loopback OAuth account management tools.
 *
 * Provides account management for LoopbackOAuthProvider (server-managed multi-account).
 * Users can add multiple accounts, switch between them, and manage identities.
 *
 * Tools:
 * - account-me: Show current user identity (email, alias, session expiry)
 * - account-switch: Use account (add if needed, switch if already linked)
 * - account-remove: Remove account and delete tokens
 * - account-list: Show all linked accounts (returns empty array if none)
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { addAccount, getAccountInfo, getActiveAccount, getLinkedAccounts, removeAccount, setAccountInfo, setActiveAccount } from '../../account-utils.ts';
import type { AccountInfo, McpPrompt, McpTool } from '../../types.ts';
import { createAccountMe } from './me.ts';
import { findAccountByEmailOrAlias } from './shared-utils.ts';
import type { AccountLoopbackConfig } from './types.ts';

/**
 * Create loopback OAuth account management tools.
 * Returns 4 tools: account-me, account-switch, account-remove, account-list.
 */
export function createLoopback(config: AccountLoopbackConfig): { tools: McpTool[]; prompts: McpPrompt[] } {
  const { service, store, logger, auth } = config;

  // Create account-me tool
  const meTools = createAccountMe({ service, store, logger, mode: 'loopback' });

  const tools: McpTool[] = [
    ...meTools.tools,
    // account-switch
    {
      name: 'account-switch',
      config: {
        description: `Use ${service} account (smart mode). If email/alias provided and already linked, switches to it without triggering OAuth. If not linked or no email provided, triggers OAuth browser flow to add account. Returns account email, whether it was newly added, and total account count.`,
        inputSchema: {
          email: z.string().optional().describe('Email address to link (if already linked, switches without OAuth)'),
          alias: z.string().optional().describe('Optional alias for easy identification'),
        } as const,
        outputSchema: {
          result: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('success'),
              email: z.string(),
              isNew: z.boolean(),
              totalAccounts: z.number(),
              message: z.string(),
            }),
          ]),
        } as const,
      },
      handler: async (args: unknown): Promise<CallToolResult> => {
        const params = args as { email?: string; alias?: string };
        try {
          logger.info(`Starting account switch for ${service}`, { email: params.email, alias: params.alias });

          // Get existing accounts
          const existingAccounts = await getLinkedAccounts(store, { service });

          let email: string;
          let isNew: boolean;

          // Smart behavior: check if email provided and already linked
          if (params.email) {
            // Find account by email or alias
            const accountId = await findAccountByEmailOrAlias(store, service, params.email);

            if (accountId) {
              // Account already linked - just switch to it
              email = accountId;
              isNew = false;
              logger.info(`Account already linked: ${email}, switching without OAuth`);

              // Set as active account
              await setActiveAccount(store, { service, accountId: email });

              // Update alias if provided
              if (params.alias) {
                const existingInfo = await getAccountInfo(store, { accountId: email, service });
                const accountInfo: AccountInfo = {
                  email,
                  alias: params.alias,
                  addedAt: existingInfo?.addedAt ?? new Date().toISOString(),
                };
                await setAccountInfo(store, { accountId: email, service }, accountInfo);
              }

              const result = {
                type: 'success' as const,
                email,
                isNew: false,
                totalAccounts: existingAccounts.length,
                message: `Account already linked: ${email}. Set as active account (no OAuth needed).`,
              };

              return {
                content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
                structuredContent: { result },
              };
            }
          }

          // Not linked or no email provided - trigger OAuth flow for new account
          // Force an OAuth flow by passing a unique accountId to bypass any active account.
          await auth.getAccessToken(`new:${randomUUID()}`);

          email = await getActiveAccount(store, { service });
          if (!email) {
            throw new Error('OAuth flow completed without setting an active account');
          }

          // Check if account already exists (in case OAuth returned different email than requested)
          isNew = !existingAccounts.includes(email);

          if (isNew) {
            // Add new account
            await addAccount(store, { service, accountId: email });
            logger.info(`Added new ${service} account`, { email });
          } else {
            logger.info(`Account already linked: ${email}`);
          }

          // Set/update account info
          const existingInfo = await getAccountInfo(store, { accountId: email, service });
          const accountInfo: AccountInfo = {
            email,
            ...(params.alias ? { alias: params.alias } : {}),
            addedAt: isNew ? new Date().toISOString() : (existingInfo?.addedAt ?? new Date().toISOString()),
          };
          await setAccountInfo(store, { accountId: email, service }, accountInfo);

          // Set as active account
          await setActiveAccount(store, { service, accountId: email });

          const totalAccounts = isNew ? existingAccounts.length + 1 : existingAccounts.length;

          const result = {
            type: 'success' as const,
            email,
            isNew,
            totalAccounts,
            message: isNew ? `Successfully added ${service} account: ${email} (${totalAccounts} total)` : `Account already linked: ${email}. Set as active account.`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: { result },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new McpError(ErrorCode.InternalError, `Error switching ${service} account: ${message}`, {
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    },

    // account-remove
    {
      name: 'account-remove',
      config: {
        description: `Remove ${service} account and delete stored tokens permanently. If removing the active account, the first remaining account becomes active. Requires email or alias parameter.`,
        inputSchema: {
          accountId: z.string().min(1).describe('Email address or alias of account to remove'),
        } as const,
        outputSchema: {
          result: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('success'),
              service: z.string(),
              removed: z.string(),
              remainingAccounts: z.number(),
              newActiveAccount: z.string().optional(),
              message: z.string(),
            }),
          ]),
        } as const,
      },
      handler: async (args: unknown): Promise<CallToolResult> => {
        const params = args as { accountId: string };
        try {
          const linkedAccounts = await getLinkedAccounts(store, { service });
          if (linkedAccounts.length === 0) {
            throw new Error(`No ${service} accounts to remove`);
          }

          // Find account by email or alias
          const accountId = await findAccountByEmailOrAlias(store, service, params.accountId);

          if (!accountId) {
            throw new Error(`Account not found: ${params.accountId}`);
          }

          // Get current active account
          const activeAccount = await getActiveAccount(store, { service });
          const removingActive = activeAccount === accountId;

          // Remove the account
          await removeAccount(store, { service, accountId });
          const remainingAccounts = linkedAccounts.filter((id) => id !== accountId);

          // If we removed the active account, set first remaining as active
          let newActiveAccount: string | undefined;
          if (removingActive && remainingAccounts.length > 0) {
            const firstRemaining = remainingAccounts[0];
            if (firstRemaining) {
              newActiveAccount = firstRemaining;
              await setActiveAccount(store, { service, accountId: newActiveAccount });
            }
          }

          logger.info(`Successfully removed ${service} account`, { accountId, remainingAccounts: remainingAccounts.length });

          const result = {
            type: 'success' as const,
            service,
            removed: accountId,
            remainingAccounts: remainingAccounts.length,
            ...(newActiveAccount && { newActiveAccount }),
            message: `Removed ${service} account: ${accountId}${newActiveAccount ? `. Active account is now: ${newActiveAccount}` : ''}`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: { result },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new McpError(ErrorCode.InternalError, `Error removing ${service} account: ${message}`, {
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    },

    // account-list
    {
      name: 'account-list',
      config: {
        description: `List all linked ${service} accounts with their aliases and active status.`,
        inputSchema: {} as const,
        outputSchema: {
          result: z.discriminatedUnion('type', [
            z.object({
              type: z.literal('success'),
              service: z.string(),
              accounts: z.array(
                z.object({
                  email: z.string(),
                  alias: z.string().optional(),
                  isActive: z.boolean(),
                })
              ),
              totalAccounts: z.number(),
              message: z.string(),
            }),
          ]),
        } as const,
      },
      handler: async (): Promise<CallToolResult> => {
        try {
          const linkedAccounts = await getLinkedAccounts(store, { service });

          // Return empty array gracefully (no error when no accounts)
          if (linkedAccounts.length === 0) {
            const result = {
              type: 'success' as const,
              service,
              accounts: [],
              totalAccounts: 0,
              message: `No ${service} accounts linked. Use account-switch to add an account.`,
            };

            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
              structuredContent: { result },
            };
          }

          const activeAccountId = await getActiveAccount(store, { service });

          // Get account info for each linked account
          const accounts = await Promise.all(
            linkedAccounts.map(async (email) => {
              const accountInfo = await getAccountInfo(store, { accountId: email, service });
              return {
                email,
                alias: accountInfo?.alias,
                isActive: email === activeAccountId,
              };
            })
          );

          const result = {
            type: 'success' as const,
            service,
            accounts,
            totalAccounts: linkedAccounts.length,
            message: `Found ${linkedAccounts.length} ${service} account(s)`,
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: { result },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new McpError(ErrorCode.InternalError, `Error listing ${service} accounts: ${message}`, {
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    },
  ];

  const prompts: McpPrompt[] = [];

  return { tools, prompts };
}

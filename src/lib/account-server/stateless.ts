/**
 * Stateless tool set for MCP OAuth mode (DCR).
 *
 * Use this when authentication is managed by the MCP client.
 * Tokens are provided per-request and not stored by the server.
 *
 * Tools:
 * - {service}-account-me: Show current user identity from bearer token
 */

import type { McpPrompt, McpTool } from '../../types.ts';
import { createAccountMe } from './me.ts';
import type { AccountStatelessConfig } from './types.ts';

/**
 * Create stateless mode tools.
 * MCP client manages authentication. Server provides user identity from bearer token.
 * Returns 1 tool: account-me.
 */
export function createStateless(config: AccountStatelessConfig): { tools: McpTool[]; prompts: McpPrompt[] } {
  const { service } = config;

  // Create account-me tool for stateless mode
  const meTools = createAccountMe({ service, mode: 'stateless' });

  return { tools: meTools.tools, prompts: [] };
}

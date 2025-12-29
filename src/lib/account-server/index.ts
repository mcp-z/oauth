/**
 * Unified account management API for MCP servers.
 *
 * Provides two account management modes:
 * - Loopback: Server-managed multi-account OAuth (LoopbackOAuthProvider)
 * - Stateless: MCP client-managed OAuth (read-only status)
 *
 * @example
 * // Loopback OAuth account management
 * const {tools, prompts} = AccountServer.createLoopback({
 *   service: 'gmail',
 *   store: tokenStore,
 *   logger,
 *   auth: authProvider
 * });
 *
 * @example
 * // Stateless mode (MCP OAuth)
 * const {tools, prompts} = AccountServer.createStateless({
 *   service: 'gmail'
 * });
 */

import { createLoopback } from './loopback.ts';
import { createStateless } from './stateless.ts';

export const AccountServer = {
  /**
   * Create loopback OAuth account management tools.
   * Server manages multiple accounts with stored tokens (LoopbackOAuthProvider).
   * Returns 4 tools: account-me, account-switch, account-remove, account-list.
   * No prompts.
   */
  createLoopback,

  /**
   * Create stateless mode tools.
   * MCP client manages authentication. Server extracts user identity from bearer token.
   * Returns 1 tool: account-me.
   * No prompts.
   */
  createStateless,
};

export { createLoopback } from './loopback.ts';
export { createAccountMe } from './me.ts';
export { findAccountByEmailOrAlias } from './shared-utils.ts';
export { createStateless } from './stateless.ts';
export type { AccountLoopbackConfig, AccountMeConfig, AccountStatelessConfig } from './types.ts';

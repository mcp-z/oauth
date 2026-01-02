/**
 * Configuration types for account tool factories.
 */

import type { Keyv } from 'keyv';
import type { AccountAuthProvider, Logger } from '../../types.ts';

/**
 * Configuration for loopback OAuth account management.
 * Supports multiple accounts with server-managed tokens (LoopbackOAuthProvider).
 */
export interface AccountLoopbackConfig {
  service: string;
  store: Keyv;
  logger: Logger;
  auth: AccountAuthProvider;
}

/**
 * Configuration for stateless mode.
 * MCP client manages authentication. Server provides read-only status.
 */
export interface AccountStatelessConfig {
  service: string;
}

/**
 * Configuration for account-me tool.
 * Works across all auth modes: loopback, stateless, device code, service account.
 */
export interface AccountMeConfig {
  service: string;
  store?: Keyv;
  logger?: Logger;
  mode: 'loopback' | 'stateless' | 'device-code' | 'service-account';
}

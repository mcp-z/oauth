/**
 * Key generation utilities for consistent storage key format
 *
 * Key format: {accountId}:{service}:{type}
 * Example: work@gmail.com:gmail:token
 */

import type { Keyv } from 'keyv';

/**
 * Key types for account-scoped data (requires accountId)
 */
export type AccountKeyType = 'token' | 'metadata' | 'dcr-client';

/**
 * Key types for service-scoped data (no accountId)
 */
export type ServiceKeyType = 'active' | 'linked';

/**
 * Parameters for account-scoped keys.
 * All fields are required - no silent defaults.
 */
export interface AccountKeyParams {
  /** Account identifier - typically an email address */
  accountId: string;

  /** Service name (e.g., 'gmail', 'sheets', 'drive', 'outlook') */
  service: string;
}

/**
 * Parameters for service-scoped keys.
 * These keys don't include accountId.
 */
export interface ServiceKeyParams {
  /** Service name */
  service: string;
}

/**
 * Validate key parameters don't contain colon delimiter
 */
function validateKeyParams(params: AccountKeyParams | ServiceKeyParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') {
      throw new Error(`Key parameter '${key}' must be a string, got: ${typeof value}`);
    }
    if (value.includes(':')) {
      throw new Error(`Key parameter '${key}' cannot contain colon character: ${value}`);
    }
  }
}

/**
 * Create account-scoped storage key.
 *
 * These keys are scoped to a specific account (email address) and store
 * account-specific data like OAuth tokens and account metadata.
 *
 * @param type - Key type ('token' for OAuth tokens, 'metadata' for account details, 'dcr-client' for DCR registration)
 * @param params - Account key parameters with explicit field names
 * @returns Storage key in format: "{accountId}:{service}:{type}"
 *
 * @example
 * ```typescript
 * // Store OAuth token
 * const tokenKey = createAccountKey('token', {
 *   accountId: 'alice@gmail.com',
 *   service: 'gmail'
 * });
 * // Returns: "alice@gmail.com:gmail:token"
 *
 * // Store account metadata (alias, timestamps, profile)
 * const metadataKey = createAccountKey('metadata', {
 *   accountId: 'alice@gmail.com',
 *   service: 'gmail'
 * });
 * // Returns: "alice@gmail.com:gmail:metadata"
 *
 * // Store DCR client registration info
 * const dcrKey = createAccountKey('dcr-client', {
 *   accountId: 'alice@outlook.com',
 *   service: 'outlook'
 * });
 * // Returns: "alice@outlook.com:outlook:dcr-client"
 * ```
 */
export function createAccountKey(type: AccountKeyType, params: AccountKeyParams): string {
  validateKeyParams(params);
  return `${params.accountId}:${params.service}:${type}`;
}

/**
 * Create service-scoped storage key.
 *
 * These keys are scoped to a service (not a specific account) and store
 * service-level data like which account is active or the list of linked accounts.
 *
 * @param type - Key type ('active' for active account, 'linked' for account list)
 * @param params - Service key parameters
 * @returns Storage key in format: "{service}:{type}"
 *
 * @example
 * ```typescript
 * // Track active account
 * const activeKey = createServiceKey('active', {
 *   service: 'gmail'
 * });
 * // Returns: "gmail:active"
 *
 * // Store list of linked accounts
 * const linkedKey = createServiceKey('linked', {
 *   service: 'gmail'
 * });
 * // Returns: "gmail:linked"
 * ```
 */
export function createServiceKey(type: ServiceKeyType, params: ServiceKeyParams): string {
  validateKeyParams(params);
  return `${params.service}:${type}`;
}

/**
 * Parse token key to extract components
 *
 * @param key - Storage key to parse
 * @returns Object with accountId and service, or undefined if invalid format
 *
 * @example
 * const parsed = parseTokenKey('user@gmail.com:gmail:token');
 * // Returns: { accountId: 'user@gmail.com', service: 'gmail' }
 *
 * const invalid = parseTokenKey('invalid-key');
 * // Returns: undefined
 */
export function parseTokenKey(key: string): { accountId: string; service: string } | undefined {
  const parts = key.split(':');
  if (parts.length !== 3 || parts[2] !== 'token' || !parts[0] || !parts[1]) {
    return undefined;
  }
  return {
    accountId: parts[0],
    service: parts[1],
  };
}

/**
 * List all account IDs for a service
 *
 * Iterates token keys and returns all accountIds that match the service.
 * Encapsulates key format details for forward compatibility.
 *
 * @param store - Keyv store to iterate
 * @param service - Service name
 * @returns Array of account IDs (e.g., email addresses)
 *
 * @example
 * const accounts = await listAccountIds(store, 'gmail');
 * // Returns: ['alice@gmail.com', 'bob@gmail.com']
 *
 * @example
 * // Empty array if no accounts found
 * const empty = await listAccountIds(store, 'unknown-service');
 * // Returns: []
 */
export async function listAccountIds(store: Keyv, service: string): Promise<string[]> {
  const accountIds: string[] = [];

  try {
    const iterator = store.iterator?.(undefined);
    if (!iterator) {
      return accountIds;
    }

    for await (const [key] of iterator) {
      const parsed = parseTokenKey(key);
      if (parsed && parsed.service === service) {
        accountIds.push(parsed.accountId);
      }
    }
  } catch (_error) {
    // If iteration fails, return empty array (fail gracefully)
    // This handles stores that don't support iteration
    return accountIds;
  }

  return accountIds;
}

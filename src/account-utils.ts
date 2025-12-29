/**
 * Account management utilities for OAuth token storage
 *
 * Provides account lifecycle operations (add, remove, activate) and account data
 * access (tokens, metadata). Uses named parameters consistent with key-utils.ts.
 */

import type { Keyv } from 'keyv';
import { type AccountKeyParams, createAccountKey, createServiceKey, type ServiceKeyParams } from './key-utils.ts';
import type { AccountInfo } from './types.ts';

// ============================================================================
// Account Lifecycle Operations
// ============================================================================

/**
 * Add account to linked accounts list and set as active if first account.
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (service, accountId)
 *
 * @example
 * await addAccount(tokenStore, {
 *   service: 'gmail',
 *   accountId: 'alice@gmail.com'
 * });
 */
export async function addAccount(store: Keyv, params: AccountKeyParams): Promise<void> {
  const linked = await getLinkedAccounts(store, { service: params.service });

  if (!linked.includes(params.accountId)) {
    linked.push(params.accountId);
    const linkedKey = createServiceKey('linked', { service: params.service });
    await store.set(linkedKey, linked);
  }

  const active = await getActiveAccount(store, { service: params.service });
  if (!active) {
    await setActiveAccount(store, params);
  }
}

/**
 * Remove account: delete token, metadata, update linked list, and active account.
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (service, accountId)
 *
 * @example
 * await removeAccount(tokenStore, {
 *   service: 'gmail',
 *   accountId: 'alice@gmail.com'
 * });
 */
export async function removeAccount(store: Keyv, params: AccountKeyParams): Promise<void> {
  const tokenKey = createAccountKey('token', params);
  await store.delete(tokenKey);

  const infoKey = createAccountKey('metadata', params);
  await store.delete(infoKey);

  const linked = await getLinkedAccounts(store, { service: params.service });
  const filtered = linked.filter((id) => id !== params.accountId);
  const linkedKey = createServiceKey('linked', { service: params.service });
  await store.set(linkedKey, filtered);

  // Set new active account if we're removing the currently active one
  const active = await getActiveAccount(store, { service: params.service });
  if (active === params.accountId) {
    const newActive = filtered[0];
    if (newActive) {
      await setActiveAccount(store, { service: params.service, accountId: newActive });
    } else {
      const activeKey = createServiceKey('active', { service: params.service });
      await store.delete(activeKey);
    }
  }
}

// ============================================================================
// Service-Scoped Account Operations
// ============================================================================

/**
 * Get active account ID for a service.
 *
 * Key: {service}:active
 *
 * @param store - Keyv storage instance
 * @param params - Service identification (service)
 * @returns Active account ID or undefined if none set
 */
export async function getActiveAccount(store: Keyv, params: ServiceKeyParams): Promise<string | undefined> {
  const key = createServiceKey('active', params);
  return await store.get(key);
}

/**
 * Set active account ID for a service.
 * Pass null as accountId to deactivate (clear active account).
 *
 * Key: {service}:active
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (service, accountId). Pass accountId: null to deactivate.
 */
export async function setActiveAccount(store: Keyv, params: AccountKeyParams | (ServiceKeyParams & { accountId: null })): Promise<void> {
  const key = createServiceKey('active', { service: params.service });
  if ('accountId' in params && params.accountId === null) {
    // accountId: null signals deactivation per API contract
    await store.delete(key);
  } else {
    await store.set(key, (params as AccountKeyParams).accountId);
  }
}

/**
 * Get list of linked account IDs for a service.
 *
 * Key: {service}:linked
 *
 * @param store - Keyv storage instance
 * @param params - Service identification (service)
 * @returns Array of account IDs (empty array if none)
 */
export async function getLinkedAccounts(store: Keyv, params: ServiceKeyParams): Promise<string[]> {
  const key = createServiceKey('linked', params);
  const accounts = await store.get(key);
  return accounts || [];
}

// ============================================================================
// Account Data Operations
// ============================================================================

/**
 * Get account metadata (alias, lastUsed, etc).
 *
 * Key: {accountId}:{service}:metadata
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (accountId, service)
 * @returns Account info or undefined if not found
 */
export async function getAccountInfo(store: Keyv, params: AccountKeyParams): Promise<AccountInfo | undefined> {
  const key = createAccountKey('metadata', params);
  return await store.get(key);
}

/**
 * Set account metadata (alias, lastUsed, etc).
 *
 * Key: {accountId}:{service}:metadata
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (accountId, service)
 * @param info - Account metadata to store
 */
export async function setAccountInfo(store: Keyv, params: AccountKeyParams, info: AccountInfo): Promise<void> {
  const key = createAccountKey('metadata', params);
  await store.set(key, info);
}

/**
 * Get OAuth token for an account.
 *
 * Key: {accountId}:{service}:token
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (accountId, service)
 * @returns Token or undefined if not found
 */
export async function getToken<T>(store: Keyv, params: AccountKeyParams): Promise<T | undefined> {
  const key = createAccountKey('token', params);
  return await store.get(key);
}

/**
 * Set OAuth token for an account.
 *
 * Key: {accountId}:{service}:token
 *
 * @param store - Keyv storage instance
 * @param params - Account identification (accountId, service)
 * @param token - OAuth token data to store
 */
export async function setToken<T>(store: Keyv, params: AccountKeyParams, token: T): Promise<void> {
  const key = createAccountKey('token', params);
  await store.set(key, token);
}

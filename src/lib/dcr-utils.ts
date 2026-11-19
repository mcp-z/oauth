/**
 * DCR Storage Utilities
 *
 * Keyv-based storage utilities for Dynamic Client Registration.
 * Follows @mcp-z/oauth pattern: single Keyv store with compound keys.
 *
 * Key Patterns:
 * - dcr:client:{clientId} -> RegisteredClient
 * - dcr:provider:{dcrToken} -> ProviderTokens
 * - dcr:authcode:{code} -> AuthorizationCode
 * - dcr:access:{token} -> AccessToken
 * - dcr:refresh:{token} -> AccessToken
 */

import { randomUUID } from 'crypto';
import type { Keyv } from 'keyv';
import type { AccessToken, AuthorizationCode, DcrClientInformation, DcrClientMetadata, ProviderTokens, RegisteredClient } from './dcr-types.ts';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// Client Operations
// ============================================================================

/**
 * Register a new OAuth client (RFC 7591 Section 3.1)
 *
 * @param store - Keyv store for all DCR data
 * @param metadata - Client registration metadata
 * @returns Registered client with credentials
 * @throws Error if validation fails
 */
export async function registerClient(store: Keyv, metadata: DcrClientMetadata): Promise<DcrClientInformation> {
  // Validate redirect URIs (required per RFC 7591)
  if (!metadata.redirect_uris || metadata.redirect_uris.length === 0) {
    throw new Error('redirect_uris is required');
  }

  // Generate client credentials
  const client_id = `dcr_${randomUUID()}`;
  const client_secret = randomUUID();

  // Default grant types and response types per RFC 7591 Section 2
  const grant_types = metadata.grant_types ?? ['authorization_code', 'refresh_token'];
  const response_types = metadata.response_types ?? ['code'];

  // Build registered client - only include optional fields if they have values
  const client: RegisteredClient = {
    client_id,
    client_secret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // Never expires
    redirect_uris: metadata.redirect_uris,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method ?? 'client_secret_basic',
    grant_types,
    response_types,
    ...(metadata.client_name !== undefined && { client_name: metadata.client_name }),
    ...(metadata.client_uri !== undefined && { client_uri: metadata.client_uri }),
    ...(metadata.logo_uri !== undefined && { logo_uri: metadata.logo_uri }),
    ...(metadata.scope !== undefined && { scope: metadata.scope }),
    ...(metadata.contacts !== undefined && { contacts: metadata.contacts }),
    ...(metadata.tos_uri !== undefined && { tos_uri: metadata.tos_uri }),
    ...(metadata.policy_uri !== undefined && { policy_uri: metadata.policy_uri }),
    ...(metadata.jwks_uri !== undefined && { jwks_uri: metadata.jwks_uri }),
    ...(metadata.jwks !== undefined && { jwks: metadata.jwks }),
    ...(metadata.software_id !== undefined && { software_id: metadata.software_id }),
    ...(metadata.software_version !== undefined && { software_version: metadata.software_version }),
    created_at: Date.now(),
  };

  // Store client
  await store.set(`dcr:client:${client_id}`, client);

  // Return client information (excluding internal created_at)
  const { created_at, ...clientInfo } = client;
  return clientInfo;
}

/**
 * Get a registered client by ID
 *
 * @param store - Keyv store for all DCR data
 * @param clientId - Client identifier
 * @returns Registered client or undefined if not found
 */
export async function getClient(store: Keyv, clientId: string): Promise<RegisteredClient | undefined> {
  return await store.get(`dcr:client:${clientId}`);
}

/**
 * Validate client credentials
 *
 * @param store - Keyv store for all DCR data
 * @param clientId - Client identifier
 * @param clientSecret - Client secret
 * @returns True if credentials are valid
 */
export async function validateClient(store: Keyv, clientId: string, clientSecret: string): Promise<boolean> {
  const client = await getClient(store, clientId);
  if (!client) return false;
  return client.client_secret === clientSecret;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Match a requested redirect URI against a registered one
 *
 * `http` loopback URIs match on any port (RFC 8252 section 7.3); every other URI must be equal.
 *
 * @param registered - Redirect URI registered by the client
 * @param requested - Redirect URI sent in the request
 * @returns True if the requested URI is allowed by the registered one
 */
export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  let reg: URL;
  let req: URL;
  try {
    reg = new URL(registered);
    req = new URL(requested);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTS.has(reg.hostname) || !LOOPBACK_HOSTS.has(req.hostname)) return false;
  return reg.protocol === 'http:' && req.protocol === 'http:' && reg.hostname === req.hostname && reg.username === req.username && reg.password === req.password && reg.pathname === req.pathname && reg.search === req.search && reg.hash === req.hash;
}

/**
 * Validate redirect URI for a client
 *
 * @param store - Keyv store for all DCR data
 * @param clientId - Client identifier
 * @param redirectUri - Redirect URI to validate
 * @returns True if a registered redirect URI matches (`http` loopback URIs on any port)
 */
export async function validateRedirectUri(store: Keyv, clientId: string, redirectUri: string): Promise<boolean> {
  const client = await getClient(store, clientId);
  if (!client || !client.redirect_uris) return false;
  return client.redirect_uris.some((registered) => redirectUriMatches(registered, redirectUri));
}

/**
 * List all registered clients (for debugging)
 *
 * Keyv 6 ignores any prefix passed to `iterator()` and keyv 5 may filter by it, so the
 * `dcr:client:` filter is applied here for both. Stores that cannot iterate yield nothing.
 *
 * @param store - Keyv store for all DCR data
 * @returns Array of all registered clients
 */
export async function listClients(store: Keyv): Promise<RegisteredClient[]> {
  const clients: RegisteredClient[] = [];

  const iterator = store.iterator?.();
  if (!iterator) return clients;

  for await (const [key, value] of iterator) {
    if (key.startsWith('dcr:client:') && value !== undefined) {
      clients.push(value as RegisteredClient);
    }
  }

  return clients;
}

/**
 * Delete a registered client
 *
 * @param store - Keyv store for all DCR data
 * @param clientId - Client identifier
 */
export async function deleteClient(store: Keyv, clientId: string): Promise<void> {
  await store.delete(`dcr:client:${clientId}`);
}

// ============================================================================
// Provider Token Operations
// ============================================================================

/**
 * Store provider tokens for a DCR access token
 *
 * @param store - Keyv store for all DCR data
 * @param dcrToken - DCR-issued access token (used as key)
 * @param tokens - Provider tokens (access, refresh, expiry)
 */
export async function setProviderTokens(store: Keyv, dcrToken: string, tokens: ProviderTokens): Promise<void> {
  await store.set(`dcr:provider:${dcrToken}`, tokens, ONE_HOUR_MS);
}

function expiryOf(record: string | { expires?: number | undefined }): number | undefined {
  return typeof record === 'object' ? record.expires : undefined;
}

/**
 * Persist provider tokens refreshed while verifying a DCR access token.
 *
 * @param store - Keyv store for all DCR data
 * @param tokenData - Updated access token data
 */
export async function persistProviderTokenRefresh(store: Keyv, tokenData: AccessToken): Promise<void> {
  // Rewrite each record with its remaining lifetime so a refresh never extends or drops a TTL.
  // `getRaw` exists in keyv 5 and 6; `setRaw` only in 6, so the write goes through `set`.
  const rewrite = async <T>(key: string, value: T, expires: number | undefined, message: string): Promise<void> => {
    const ttl = expires === undefined ? undefined : expires - Date.now();
    if (ttl !== undefined && ttl <= 0) return;
    if (!(await store.set(key, value, ttl))) throw new Error(message);
  };

  const accessKey = `dcr:access:${tokenData.access_token}`;
  const accessRecord = await store.getRaw<AccessToken>(accessKey);
  if (!accessRecord) throw new Error('Cannot persist provider refresh for a missing DCR access token');
  await rewrite(accessKey, tokenData, expiryOf(accessRecord), 'Failed to persist refreshed DCR access token');

  if (tokenData.refresh_token) {
    const refreshKey = `dcr:refresh:${tokenData.refresh_token}`;
    const refreshRecord = await store.getRaw<AccessToken>(refreshKey);
    if (refreshRecord) await rewrite(refreshKey, tokenData, expiryOf(refreshRecord), 'Failed to persist refreshed DCR refresh token');
  }

  const providerKey = `dcr:provider:${tokenData.access_token}`;
  const providerRecord = await store.getRaw<ProviderTokens>(providerKey);
  if (providerRecord) await rewrite(providerKey, tokenData.providerTokens, expiryOf(providerRecord), 'Failed to persist refreshed provider token index');
}

/**
 * Retrieve provider tokens for a DCR access token
 *
 * @param store - Keyv store for all DCR data
 * @param dcrToken - DCR-issued access token
 * @returns Provider tokens or undefined if not found
 */
export async function getProviderTokens(store: Keyv, dcrToken: string): Promise<ProviderTokens | undefined> {
  return await store.get(`dcr:provider:${dcrToken}`);
}

/**
 * Delete provider tokens for a DCR access token
 *
 * @param store - Keyv store for all DCR data
 * @param dcrToken - DCR-issued access token
 */
export async function deleteProviderTokens(store: Keyv, dcrToken: string): Promise<void> {
  await store.delete(`dcr:provider:${dcrToken}`);
}

// ============================================================================
// Authorization Code Operations
// ============================================================================

/**
 * Store an authorization code
 *
 * @param store - Keyv store for all DCR data
 * @param code - Authorization code
 * @param authCode - Authorization code data
 */
export async function setAuthCode(store: Keyv, code: string, authCode: AuthorizationCode): Promise<void> {
  await store.set(`dcr:authcode:${code}`, authCode, TEN_MINUTES_MS);
}

/**
 * Get an authorization code
 *
 * @param store - Keyv store for all DCR data
 * @param code - Authorization code
 * @returns Authorization code data or undefined if not found
 */
export async function getAuthCode(store: Keyv, code: string): Promise<AuthorizationCode | undefined> {
  return await store.get(`dcr:authcode:${code}`);
}

/**
 * Delete an authorization code
 *
 * @param store - Keyv store for all DCR data
 * @param code - Authorization code
 */
export async function deleteAuthCode(store: Keyv, code: string): Promise<void> {
  await store.delete(`dcr:authcode:${code}`);
}

// ============================================================================
// Access Token Operations
// ============================================================================

/**
 * Store an access token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Access token
 * @param tokenData - Access token data
 */
export async function setAccessToken(store: Keyv, token: string, tokenData: AccessToken): Promise<void> {
  await store.set(`dcr:access:${token}`, tokenData, ONE_HOUR_MS);
}

/**
 * Get an access token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Access token
 * @returns Access token data or undefined if not found
 */
export async function getAccessToken(store: Keyv, token: string): Promise<AccessToken | undefined> {
  return await store.get(`dcr:access:${token}`);
}

/**
 * Delete an access token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Access token
 */
export async function deleteAccessToken(store: Keyv, token: string): Promise<void> {
  await store.delete(`dcr:access:${token}`);
}

// ============================================================================
// Refresh Token Operations
// ============================================================================

/**
 * Store a refresh token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Refresh token
 * @param tokenData - Access token data (contains refresh token context)
 */
export async function setRefreshToken(store: Keyv, token: string, tokenData: AccessToken): Promise<void> {
  await store.set(`dcr:refresh:${token}`, tokenData, THIRTY_DAYS_MS);
}

/**
 * Get a refresh token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Refresh token
 * @returns Access token data or undefined if not found
 */
export async function getRefreshToken(store: Keyv, token: string): Promise<AccessToken | undefined> {
  return await store.get(`dcr:refresh:${token}`);
}

/**
 * Delete a refresh token
 *
 * @param store - Keyv store for all DCR data
 * @param token - Refresh token
 */
export async function deleteRefreshToken(store: Keyv, token: string): Promise<void> {
  await store.delete(`dcr:refresh:${token}`);
}

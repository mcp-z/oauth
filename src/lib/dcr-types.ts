/**
 * Dynamic Client Registration (DCR) types per RFC 7591
 *
 * Defines core types for OAuth 2.0 Dynamic Client Registration Protocol.
 * Used by providers to register clients dynamically with authorization servers.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7591
 */

import type { Logger } from '../types.ts';

/**
 * Client metadata for dynamic registration request (RFC 7591 Section 2)
 *
 * All fields are optional per RFC 7591. Authorization server may have
 * required fields or default values based on policy.
 */
export interface DcrClientMetadata {
  /** Array of redirection URI strings for redirect-based flows */
  redirect_uris?: string[];

  /** Client authentication method for token endpoint */
  token_endpoint_auth_method?: 'none' | 'client_secret_post' | 'client_secret_basic';

  /** OAuth 2.0 grant types the client may use */
  grant_types?: string[];

  /** OAuth 2.0 response types the client may use */
  response_types?: string[];

  /** Human-readable client name */
  client_name?: string;

  /** URL providing information about the client */
  client_uri?: string;

  /** URL referencing a logo for the client */
  logo_uri?: string;

  /** Space-separated list of scope values */
  scope?: string;

  /** Array of contact strings (typically email addresses) */
  contacts?: string[];

  /** URL pointing to terms of service document */
  tos_uri?: string;

  /** URL pointing to privacy policy document */
  policy_uri?: string;

  /** URL referencing the client's JSON Web Key Set */
  jwks_uri?: string;

  /** Client's JSON Web Key Set document value */
  jwks?: object;

  /** Unique identifier for the client software */
  software_id?: string;

  /** Version identifier for the client software */
  software_version?: string;

  /** JWT containing client metadata claims (signed software statement) */
  software_statement?: string;
}

/**
 * Client information response from successful registration (RFC 7591 Section 3.2.1)
 *
 * Authorization server returns client credentials and echoes/modifies metadata.
 * client_id is always returned, client_secret is optional for public clients.
 */
export interface DcrClientInformation {
  /** REQUIRED: OAuth 2.0 client identifier string */
  client_id: string;

  /** OPTIONAL: OAuth 2.0 client secret (omitted for public clients) */
  client_secret?: string;

  /** OPTIONAL: Timestamp of client ID issuance (seconds since Unix epoch) */
  client_id_issued_at?: number;

  /**
   * REQUIRED if client_secret issued: Expiration timestamp (seconds since epoch)
   * Value of 0 indicates the secret does not expire
   */
  client_secret_expires_at?: number;

  // All registered metadata fields (echoed or server-modified)
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  jwks_uri?: string;
  jwks?: object;
  software_id?: string;
  software_version?: string;
}

/**
 * Provider tokens for stateless DCR pattern
 *
 * In stateless mode, DCR provider receives provider credentials from context
 * rather than managing token storage. Used for MCP server deployments where
 * client manages all tokens.
 */
export interface ProviderTokens {
  /** OAuth 2.0 access token for provider API calls */
  accessToken: string;

  /** Optional refresh token for token renewal */
  refreshToken?: string;

  /** Token expiration timestamp (seconds since Unix epoch) */
  expiresAt?: number;

  /** Space-separated list of granted scopes */
  scope?: string;
}

/**
 * Configuration for DCR provider initialization
 *
 * Minimal config for creating DCR provider instances. Additional provider-specific
 * config (client IDs, secrets, redirect URIs) handled by concrete implementations.
 */
export interface DcrConfig {
  /** Authorization server's registration endpoint URL */
  registrationEndpoint: string;

  /** Client metadata to register with authorization server */
  metadata: DcrClientMetadata;

  /** Optional logger for DCR operations */
  logger?: Logger;
}

/**
 * DCR error response per RFC 7591 Section 3.2.2
 *
 * Authorization server returns HTTP 400 with error details when
 * registration fails due to invalid metadata or policy violations.
 */
export interface DcrErrorResponse {
  /** REQUIRED: Single ASCII error code string */
  error: 'invalid_redirect_uri' | 'invalid_client_metadata' | 'invalid_software_statement' | 'unapproved_software_statement' | string;

  /** OPTIONAL: Human-readable ASCII description */
  error_description?: string;
}

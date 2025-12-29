/**
 * RFC 8414 Authorization Server Metadata
 * @see https://www.rfc-editor.org/rfc/rfc8414.html
 */
export interface RFC8414Metadata {
  /** Authorization server issuer URL */
  issuer: string;
  /** OAuth 2.0 authorization endpoint */
  authorization_endpoint: string;
  /** OAuth 2.0 token endpoint */
  token_endpoint: string;
  /** Dynamic Client Registration endpoint (RFC 7591) */
  registration_endpoint: string;
  /** Optional: Token revocation endpoint */
  revocation_endpoint?: string;
  /** Optional: Supported OAuth scopes */
  scopes_supported?: string[];
  /** Optional: Supported response types */
  response_types_supported?: string[];
  /** Optional: Supported grant types */
  grant_types_supported?: string[];
  /** Optional: Supported token endpoint auth methods */
  token_endpoint_auth_methods_supported?: string[];
  /** Optional: Supported PKCE code challenge methods (RFC 7636) */
  code_challenge_methods_supported?: string[];
  /** Optional: Service documentation URL */
  service_documentation?: string;
  /** Allow additional provider-specific fields */
  [key: string]: unknown;
}

/**
 * RFC 9728 Protected Resource Metadata
 * @see https://www.rfc-editor.org/rfc/rfc9728.html
 */
export interface RFC9728Metadata {
  /** Protected resource URL */
  resource: string;
  /** List of authorization servers that can issue tokens for this resource */
  authorization_servers: string[];
  /** OAuth scopes supported by this resource */
  scopes_supported: string[];
  /** Methods for providing bearer tokens (typically ['header']) */
  bearer_methods_supported: string[];
  /** Allow additional provider-specific fields */
  [key: string]: unknown;
}

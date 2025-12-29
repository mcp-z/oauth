/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 *
 * Implements RFC 7636 PKCE extension for public OAuth clients.
 * Generates cryptographically secure code verifier and challenge.
 */

import { createHash, randomBytes } from 'crypto';

/**
 * PKCE code verifier and challenge pair
 */
export interface PKCEPair {
  /** Code verifier - random string sent to token endpoint */
  verifier: string;
  /** Code challenge - SHA256 hash of verifier sent to authorization endpoint */
  challenge: string;
}

/**
 * Generate PKCE code verifier and challenge pair
 *
 * Uses SHA-256 hashing (S256 method) as recommended by RFC 7636.
 * Code verifier is 32 random bytes base64url-encoded (43 characters).
 *
 * @returns PKCE pair with verifier and challenge
 *
 * @example
 * ```typescript
 * const { verifier, challenge } = generatePKCE();
 *
 * // Use challenge in authorization URL
 * authUrl.searchParams.set('code_challenge', challenge);
 * authUrl.searchParams.set('code_challenge_method', 'S256');
 *
 * // Later, use verifier in token exchange
 * tokenParams.code_verifier = verifier;
 * ```
 */
export function generatePKCE(): PKCEPair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return {
    verifier,
    challenge,
  };
}

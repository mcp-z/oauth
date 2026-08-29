/**
 * JWT-based user authentication for multi-tenant deployments
 *
 * Extracts user ID from JWT tokens with signature and claims verification.
 * Supports HS256/384/512, RS256/384/512, PS256/384/512, and ES256/384/512 algorithms via node:crypto.
 */

import { constants, createHmac, createPublicKey, type KeyObject, timingSafeEqual, verify as verifySignature } from 'crypto';
import type { JWTUserAuthConfig, UserAuthProvider } from './types.ts';

/**
 * HTTP request interface (subset needed for JWT auth)
 */
interface HttpRequest {
  headers?: {
    authorization?: string;
  };
}

interface JWTHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

type JWTPayload = Record<string, unknown> & {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
};

interface JWK {
  kty: string;
  kid?: string;
  [key: string]: unknown;
}

// Verification algorithm is chosen from the configured key type, never from the token header,
// so an attacker cannot pick the algorithm (e.g. HS256 signed with a known RSA public key).
const HMAC_DIGESTS: Record<string, string> = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };
const RSA_DIGESTS: Record<string, string> = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
const PSS_DIGESTS: Record<string, string> = { PS256: 'sha256', PS384: 'sha384', PS512: 'sha512' };
const EC_DIGESTS: Record<string, string> = { ES256: 'sha256', ES384: 'sha384', ES512: 'sha512' };
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function base64urlDecode(input: string): Buffer {
  if (!BASE64URL_RE.test(input)) {
    throw new Error('Invalid JWT base64url encoding');
  }
  return Buffer.from(input, 'base64url');
}

function decodeJson<T>(segment: string, label: string): T {
  try {
    return JSON.parse(base64urlDecode(segment).toString('utf8')) as T;
  } catch {
    throw new Error(`Invalid JWT ${label} encoding`);
  }
}

/**
 * Fetches and caches a JWKS by URL, selecting keys by 'kid'.
 * Refetches on an unknown kid, throttled by a cooldown so a bad token cannot trigger unbounded fetches.
 */
class RemoteJWKSet {
  private cache?: JWK[];
  private lastFetch = 0;
  private readonly cooldownMs = 60_000;
  private readonly url: URL;

  constructor(url: URL) {
    this.url = url;
  }

  async getKey(kid: string | undefined): Promise<KeyObject> {
    let jwk = this.cache && this.findKey(this.cache, kid);
    if (!jwk) {
      const now = Date.now();
      if (this.cache && now - this.lastFetch < this.cooldownMs) {
        throw new Error(`No matching JWKS key found for kid '${kid}'`);
      }
      this.lastFetch = now;
      this.cache = await this.fetchKeys();
      jwk = this.findKey(this.cache, kid);
    }
    if (!jwk) {
      throw new Error(`No matching JWKS key found for kid '${kid}'`);
    }
    return createPublicKey({ key: jwk, format: 'jwk' });
  }

  private findKey(keys: JWK[], kid: string | undefined): JWK | undefined {
    if (kid) return keys.find((key) => key.kid === kid);
    return keys.length === 1 ? keys[0] : undefined;
  }

  private async fetchKeys(): Promise<JWK[]> {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS (HTTP ${response.status})`);
    }
    const data = (await response.json()) as { keys?: JWK[] };
    return data.keys ?? [];
  }
}

/**
 * JWT-based user authentication provider
 *
 * Verifies JWT tokens and extracts user IDs from claims.
 * Use for multi-tenant deployments where users authenticate via JWT.
 *
 * @example
 * ```typescript
 * // HS256 with shared secret
 * const userAuth = new JWTUserAuth({
 *   secret: process.env.JWT_SECRET!,
 *   issuer: 'https://auth.example.com',
 *   audience: 'api.example.com',
 * });
 *
 * // RS256 with public key
 * const userAuth = new JWTUserAuth({
 *   publicKey: process.env.JWT_PUBLIC_KEY!,
 *   issuer: 'https://auth.example.com',
 * });
 *
 * // RS256 with JWKS URL (dynamic key rotation)
 * const userAuth = new JWTUserAuth({
 *   jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
 *   issuer: 'https://auth.example.com',
 *   audience: 'api.example.com',
 * });
 * ```
 */
export class JWTUserAuth implements UserAuthProvider {
  private readonly config: {
    secret?: string;
    publicKey?: string | object;
    jwksUrl?: string;
    issuer?: string | string[];
    audience?: string | string[];
    userIdClaim: string;
    algorithms: string[];
    clockTolerance: number;
  };
  private readonly remoteJWKSet?: RemoteJWKSet;

  constructor(config: JWTUserAuthConfig) {
    // Validate configuration
    if (!config.secret && !config.publicKey && !config.jwksUrl) {
      throw new Error('JWTUserAuth: Must provide one of: secret (HS256), publicKey (RS256/ES256), or jwksUrl');
    }

    if (config.secret && config.secret.length < 32) {
      throw new Error('JWTUserAuth: secret must be at least 32 characters for HS256');
    }

    if ((config.secret ? 1 : 0) + (config.publicKey ? 1 : 0) + (config.jwksUrl ? 1 : 0) > 1) {
      throw new Error('JWTUserAuth: Provide only one of: secret, publicKey, or jwksUrl');
    }

    // Store configuration with defaults
    this.config = {
      ...(config.secret !== undefined && { secret: config.secret }),
      ...(config.publicKey !== undefined && { publicKey: config.publicKey }),
      ...(config.jwksUrl !== undefined && { jwksUrl: config.jwksUrl }),
      ...(config.issuer !== undefined && { issuer: config.issuer }),
      ...(config.audience !== undefined && { audience: config.audience }),
      userIdClaim: config.userIdClaim ?? 'sub',
      algorithms: config.algorithms ?? [],
      clockTolerance: config.clockTolerance ?? 0,
    };

    // Create remote JWK set if using JWKS URL
    if (config.jwksUrl) {
      this.remoteJWKSet = new RemoteJWKSet(new URL(config.jwksUrl));
    }
  }

  /**
   * Extract and verify user ID from JWT token
   *
   * @param req - HTTP request object with Authorization header
   * @returns User ID from verified JWT claims
   * @throws Error if token missing, invalid, expired, or claims invalid
   */
  async getUserId(req: unknown): Promise<string> {
    const httpReq = req as HttpRequest;

    // Extract Authorization header
    const authHeader = httpReq.headers?.authorization;
    if (!authHeader) {
      throw new Error('JWTUserAuth: No Authorization header found');
    }

    // Parse Bearer token
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match) {
      throw new Error('JWTUserAuth: Invalid Authorization header format (expected "Bearer <token>")');
    }

    const token = match[1];
    if (!token) {
      throw new Error('JWTUserAuth: Empty JWT token');
    }

    // Verify JWT and extract payload
    const payload = await this.verifyToken(token);

    // Extract user ID from configured claim
    const userId = payload[this.config.userIdClaim];
    if (!userId || typeof userId !== 'string') {
      throw new Error(`JWTUserAuth: JWT missing or invalid '${this.config.userIdClaim}' claim`);
    }

    return userId;
  }

  /**
   * Verify JWT signature and claims
   */
  private async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Malformed JWT (expected 3 segments)');
      }
      const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

      const header = decodeJson<JWTHeader>(headerB64, 'header');
      const payload = decodeJson<JWTPayload>(payloadB64, 'payload');
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Malformed JWT (claims must be a JSON object)');
      }

      if (typeof header.alg !== 'string' || header.alg === 'none') {
        throw new Error('Missing or unsupported "alg" header');
      }

      const signingInput = `${headerB64}.${payloadB64}`;
      const signature = base64urlDecode(signatureB64);

      if (this.config.secret) {
        this.verifyHmac(header.alg, signingInput, signature, this.config.secret);
      } else {
        const key = this.remoteJWKSet ? await this.remoteJWKSet.getKey(header.kid) : this.resolvePublicKey();
        this.verifyAsymmetric(header.alg, signingInput, signature, key);
      }

      this.verifyClaims(payload);
      return payload;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`JWTUserAuth: JWT verification failed: ${error.message}`);
      }
      throw new Error('JWTUserAuth: JWT verification failed');
    }
  }

  /**
   * Resolve the configured static public key (PEM string or JWK object)
   */
  private resolvePublicKey(): KeyObject {
    const publicKey = this.config.publicKey;
    if (!publicKey) {
      throw new Error('No verification key configured');
    }
    return typeof publicKey === 'string' ? createPublicKey(publicKey) : createPublicKey({ key: publicKey as JWK, format: 'jwk' });
  }

  /**
   * Verify an HMAC-signed token. Only reachable in secret mode, so an HMAC key is never
   * used to check a token signed with an asymmetric key (and vice versa).
   */
  private verifyHmac(alg: string, signingInput: string, signature: Buffer, secret: string): void {
    const allowed = this.config.algorithms.length > 0 ? this.config.algorithms : ['HS256'];
    const digest = HMAC_DIGESTS[alg];
    if (!digest || !allowed.includes(alg)) {
      throw new Error(`Algorithm '${alg}' is not permitted for this key`);
    }

    const expected = createHmac(digest, secret).update(signingInput).digest();
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
      throw new Error('Signature verification failed');
    }
  }

  /**
   * Verify an RS256/PS256/ES256-signed token against a public key. The digest and padding are
   * chosen from the key's own type (RSA vs EC), not from the token header, so the header
   * cannot select them.
   */
  private verifyAsymmetric(alg: string, signingInput: string, signature: Buffer, key: KeyObject): void {
    const allowed = this.config.algorithms.length > 0 ? this.config.algorithms : ['RS256', 'ES256'];
    const keyType = key.asymmetricKeyType;
    const isEc = keyType === 'ec';
    if (!isEc && keyType !== 'rsa') {
      throw new Error(`Unsupported key type '${keyType}'`);
    }
    const digests = isEc ? EC_DIGESTS : { ...RSA_DIGESTS, ...PSS_DIGESTS };
    const digest = digests[alg];
    if (!digest || !allowed.includes(alg)) {
      throw new Error(`Algorithm '${alg}' is not permitted for this key`);
    }

    // JWS ECDSA signatures are raw R||S; Node defaults to DER, so EC verification needs ieee-p1363.
    // Node's default PSS salt length (digest length) matches RFC 8017, so only padding differs.
    const keyOptions = isEc ? { key, dsaEncoding: 'ieee-p1363' as const } : PSS_DIGESTS[alg] ? { key, padding: constants.RSA_PKCS1_PSS_PADDING } : key;
    const valid = verifySignature(digest, Buffer.from(signingInput), keyOptions, signature);
    if (!valid) {
      throw new Error('Signature verification failed');
    }
  }

  /**
   * Validate exp/nbf/iat/iss/aud claims against the configured clock tolerance
   */
  private verifyClaims(payload: JWTPayload): void {
    const now = Math.floor(Date.now() / 1000);
    const tolerance = this.config.clockTolerance;

    // exp is required; all timestamps must be NumericDate (integer seconds)
    if (typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp)) {
      throw new Error('"exp" claim must be a number');
    }
    if (now > payload.exp + tolerance) {
      throw new Error('"exp" claim timestamp check failed');
    }
    if (payload.nbf !== undefined) {
      if (typeof payload.nbf !== 'number' || !Number.isSafeInteger(payload.nbf)) {
        throw new Error('"nbf" claim must be a number');
      }
      if (now < payload.nbf - tolerance) {
        throw new Error('"nbf" claim timestamp check failed');
      }
    }
    if (payload.iat !== undefined) {
      if (typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat)) {
        throw new Error('"iat" claim must be a number');
      }
      if (payload.iat > now + tolerance) {
        throw new Error('"iat" claim timestamp check failed');
      }
    }
    if (this.config.issuer !== undefined) {
      const issuers = Array.isArray(this.config.issuer) ? this.config.issuer : [this.config.issuer];
      if (typeof payload.iss !== 'string' || !issuers.includes(payload.iss)) {
        throw new Error('"iss" claim value mismatch');
      }
    }
    if (this.config.audience !== undefined) {
      const expected = Array.isArray(this.config.audience) ? this.config.audience : [this.config.audience];
      const actual = payload.aud === undefined ? [] : Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!actual.some((aud) => expected.includes(aud))) {
        throw new Error('"aud" claim value mismatch');
      }
    }
  }
}

/**
 * JWT-based user authentication for multi-tenant deployments
 *
 * Extracts user ID from JWT tokens with signature and claims verification.
 * Supports HS256, RS256, ES256 algorithms via JOSE library.
 */

import { createRemoteJWKSet, importSPKI, type JWK, type JWTPayload, type JWTVerifyOptions, type JWTVerifyResult, jwtVerify } from 'jose';
import type { JWTUserAuthConfig, UserAuthProvider } from './types.ts';

/**
 * HTTP request interface (subset needed for JWT auth)
 */
interface HttpRequest {
  headers?: {
    authorization?: string;
  };
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
    publicKey?: string | JWK;
    jwksUrl?: string;
    issuer?: string | string[];
    audience?: string | string[];
    userIdClaim: string;
    algorithms: string[];
    clockTolerance: number;
  };
  private readonly remoteJWKSet?: ReturnType<typeof createRemoteJWKSet>;

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
      this.remoteJWKSet = createRemoteJWKSet(new URL(config.jwksUrl));
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
      // Build verification options
      const options: JWTVerifyOptions = {
        ...(this.config.issuer && { issuer: this.config.issuer }),
        ...(this.config.audience && { audience: this.config.audience }),
        ...(this.config.clockTolerance && { clockTolerance: this.config.clockTolerance }),
      };

      // Verify with appropriate key type
      let result: JWTVerifyResult;

      if (this.config.secret) {
        // HS256 verification with shared secret
        const secret = new TextEncoder().encode(this.config.secret);
        result = await jwtVerify(token, secret, {
          ...options,
          algorithms: this.config.algorithms.length > 0 ? this.config.algorithms : ['HS256'],
        });
      } else if (this.remoteJWKSet) {
        // RS256/ES256 verification with remote JWKS
        result = await jwtVerify(token, this.remoteJWKSet, {
          ...options,
          algorithms: this.config.algorithms.length > 0 ? this.config.algorithms : ['RS256', 'ES256'],
        });
      } else if (this.config.publicKey) {
        // RS256/ES256 verification with provided public key
        // If string (PEM), import it first; if JWK, use directly
        const key = typeof this.config.publicKey === 'string' ? await importSPKI(this.config.publicKey, 'RS256') : this.config.publicKey;

        result = await jwtVerify(token, key, {
          ...options,
          algorithms: this.config.algorithms.length > 0 ? this.config.algorithms : ['RS256', 'ES256'],
        });
      } else {
        throw new Error('JWTUserAuth: No verification key configured');
      }

      return result.payload;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`JWTUserAuth: JWT verification failed: ${error.message}`);
      }
      throw new Error('JWTUserAuth: JWT verification failed');
    }
  }
}

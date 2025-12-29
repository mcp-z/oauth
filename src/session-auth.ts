/**
 * Session-based user authentication for multi-tenant deployments
 *
 * Extracts user ID from HTTP session cookies with HMAC signature verification.
 * Compatible with Express/Connect session middleware patterns.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUserAuthConfig, UserAuthProvider } from './types.ts';

/**
 * HTTP request interface (subset needed for session auth)
 */
interface HttpRequest {
  headers?: {
    cookie?: string;
  };
}

/**
 * Session cookie structure
 */
interface SessionData {
  userId: string;
  exp?: number; // Optional expiration timestamp (ms)
}

/**
 * Session-based user authentication provider
 *
 * Verifies signed session cookies and extracts user IDs.
 * Use for multi-tenant deployments where users authenticate via web sessions.
 *
 * @example
 * ```typescript
 * // Multi-tenant server setup with session-based user authentication
 * const userAuth = new SessionUserAuth({
 *   sessionSecret: process.env.SESSION_SECRET!,
 *   cookieName: 'app_session',
 * });
 *
 * // Create OAuth adapters with session-based user identification
 * const oauthAdapters = await createOAuthAdapters(
 *   config.transport,
 *   {
 *     service: 'gmail',
 *     clientId: process.env.GOOGLE_CLIENT_ID!,
 *     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 *     scope: GOOGLE_SCOPE,
 *     auth: 'loopback-oauth',
 *     headless: false,
 *     redirectUri: undefined,
 *   },
 *   {
 *     logger,
 *     tokenStore,
 *     userAuth, // Session-based user identification for multi-tenant deployments
 *   }
 * );
 *
 * // Use auth middleware with tools
 * const { middleware: authMiddleware } = oauthAdapters;
 * const tools = toolFactories.map(f => f()).map(authMiddleware.withToolAuth);
 * ```
 */
export class SessionUserAuth implements UserAuthProvider {
  private readonly secret: string;
  private readonly cookieName: string;
  private readonly algorithm: 'sha256' | 'sha512';

  constructor(config: SessionUserAuthConfig) {
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      throw new Error('SessionUserAuth: sessionSecret must be at least 32 characters');
    }

    this.secret = config.sessionSecret;
    this.cookieName = config.cookieName ?? 'session';
    this.algorithm = config.algorithm ?? 'sha256';
  }

  /**
   * Extract and verify user ID from session cookie
   *
   * @param req - HTTP request object with cookie header
   * @returns User ID from verified session
   * @throws Error if session missing, invalid, or expired
   */
  async getUserId(req: unknown): Promise<string> {
    const httpReq = req as HttpRequest;

    const cookieHeader = httpReq.headers?.cookie;
    if (!cookieHeader) {
      throw new Error('SessionUserAuth: No cookie header found');
    }

    const sessionCookie = this.parseCookie(cookieHeader, this.cookieName);
    if (!sessionCookie) {
      throw new Error(`SessionUserAuth: Session cookie '${this.cookieName}' not found`);
    }

    // Format: base64(data).signature
    const parts = sessionCookie.split('.');
    if (parts.length !== 2) {
      throw new Error('SessionUserAuth: Invalid session format (expected data.signature)');
    }

    const [dataB64, signature] = parts as [string, string];

    const expectedSignature = this.sign(dataB64);
    if (!this.constantTimeCompare(signature, expectedSignature)) {
      throw new Error('SessionUserAuth: Invalid session signature');
    }

    let sessionData: SessionData;
    try {
      const dataJson = Buffer.from(dataB64, 'base64').toString('utf8');
      sessionData = JSON.parse(dataJson) as SessionData;
    } catch {
      throw new Error('SessionUserAuth: Invalid session data encoding');
    }

    if (sessionData.exp !== undefined && Date.now() > sessionData.exp) {
      throw new Error('SessionUserAuth: Session expired');
    }

    if (!sessionData.userId || typeof sessionData.userId !== 'string') {
      throw new Error('SessionUserAuth: Session missing userId field');
    }

    return sessionData.userId;
  }

  /**
   * Parse cookie from header string
   */
  private parseCookie(cookieHeader: string, name: string): string | null {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [key, ...valueParts] = cookie.trim().split('=');
      if (key === name) {
        return valueParts.join('='); // Handle values with = in them
      }
    }
    return null;
  }

  /**
   * Generate HMAC signature for session data
   */
  private sign(data: string): string {
    return createHmac(this.algorithm, this.secret).update(data).digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Helper for creating session cookies (for testing/integration)
   *
   * @param userId - User ID to encode in session
   * @param expiresInMs - Optional expiration time in milliseconds from now
   * @returns Signed session cookie value
   */
  createSessionCookie(userId: string, expiresInMs?: number): string {
    const sessionData: SessionData = {
      userId,
      ...(expiresInMs !== undefined && { exp: Date.now() + expiresInMs }),
    };

    const dataJson = JSON.stringify(sessionData);
    const dataB64 = Buffer.from(dataJson).toString('base64');
    const signature = this.sign(dataB64);

    return `${dataB64}.${signature}`;
  }
}

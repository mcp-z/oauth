/**
 * PKCE (Proof Key for Code Exchange) Utility Tests
 *
 * Tests the generatePKCE() function that creates secure code verifier
 * and challenge pairs for OAuth 2.0 PKCE flow (RFC 7636).
 */

import assert from 'assert';
import { createHash } from 'crypto';
import { generatePKCE } from '../../src/pkce.ts';

describe('pkce', () => {
  describe('generatePKCE', () => {
    it('generates verifier with correct length', () => {
      const result = generatePKCE();

      // RFC 7636: code verifier must be 43-128 characters
      // Implementation uses 32 random bytes base64url-encoded = 43 characters
      assert.strictEqual(result.verifier.length, 43, 'Verifier should be 43 characters (32 bytes base64url)');
      assert.ok(result.verifier.length >= 43, 'Verifier should be at least 43 characters (RFC 7636)');
      assert.ok(result.verifier.length <= 128, 'Verifier should be at most 128 characters (RFC 7636)');
    });

    it('generates base64url-encoded verifier', () => {
      const result = generatePKCE();

      // Base64url uses only: A-Z a-z 0-9 - _
      const base64urlPattern = /^[A-Za-z0-9_-]+$/;
      assert.ok(base64urlPattern.test(result.verifier), 'Verifier should be base64url encoded');
    });

    it('generates base64url-encoded challenge', () => {
      const result = generatePKCE();

      // Base64url uses only: A-Z a-z 0-9 - _
      const base64urlPattern = /^[A-Za-z0-9_-]+$/;
      assert.ok(base64urlPattern.test(result.challenge), 'Challenge should be base64url encoded');

      // SHA256 hash produces 32 bytes = 43 base64url characters (no padding)
      assert.strictEqual(result.challenge.length, 43, 'SHA256 hash should produce 43 base64url characters');
    });

    it('generates unique values on each call', () => {
      const result1 = generatePKCE();
      const result2 = generatePKCE();

      assert.notStrictEqual(result1.verifier, result2.verifier, 'Each call should generate unique verifier');
      assert.notStrictEqual(result1.challenge, result2.challenge, 'Each call should generate unique challenge');
    });

    it('generates deterministic challenge from verifier', () => {
      const result1 = generatePKCE();
      const result2 = generatePKCE();

      // Different verifiers should produce different challenges
      assert.notStrictEqual(result1.challenge, result2.challenge, 'Different verifiers should produce different challenges');
    });

    it('returns PKCEPair with verifier and challenge fields', () => {
      const result = generatePKCE();

      assert.ok('verifier' in result, 'Result should have verifier field');
      assert.ok('challenge' in result, 'Result should have challenge field');
      assert.strictEqual(Object.keys(result).length, 2, 'Result should only have verifier and challenge fields');
    });

    it('challenge is SHA-256 hash of verifier', () => {
      const { verifier, challenge } = generatePKCE();

      // Manually compute expected challenge to verify implementation
      const expectedChallenge = createHash('sha256').update(verifier).digest('base64url');

      assert.strictEqual(challenge, expectedChallenge, 'Challenge should be SHA-256 hash of verifier');
    });
  });
});

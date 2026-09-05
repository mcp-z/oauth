import type { JWTUserAuthConfig } from '@mcp-z/oauth';
import { JWTUserAuth } from '@mcp-z/oauth';
import assert from 'assert';
import { constants, createHmac, createPrivateKey, createPublicKey, sign as cryptoSign, generateKeyPairSync } from 'crypto';
import * as http from 'http';

const SECRET = 'test-jwt-secret-0123456789-abcdefgh';
const ISSUER = 'https://auth.example.com';
const AUDIENCE = 'api.example.com';

const pemKeys = {
  publicKeyEncoding: { type: 'spki', format: 'pem' } as const,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' } as const,
};

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, ...pemKeys });
const rsaOther = generateKeyPairSync('rsa', { modulusLength: 2048, ...pemKeys });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256', ...pemKeys });
const ecOther = generateKeyPairSync('ec', { namedCurve: 'P-256', ...pemKeys });

const nowSeconds = () => Math.floor(Date.now() / 1000);

function b64url(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function defaultClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = nowSeconds();
  return { sub: 'test-user', iss: ISSUER, aud: AUDIENCE, iat: now - 10, nbf: now - 10, exp: now + 3600, ...overrides };
}

const DIGESTS: Record<string, string> = { '256': 'sha256', '384': 'sha384', '512': 'sha512' };

function digestFor(alg: string): string {
  const digest = DIGESTS[alg.replace(/^[A-Z]+/, '')];
  if (!digest) throw new Error(`test helper: unsupported alg '${alg}'`);
  return digest;
}

function signHmac(signingInput: string, alg: string, secret: string): string {
  return createHmac(digestFor(alg), secret).update(signingInput).digest('base64url');
}

function signAsymmetric(signingInput: string, alg: string, privateKeyPem: string): string {
  const data = Buffer.from(signingInput);
  const digest = digestFor(alg);
  // JWS ECDSA signatures are raw R||S, matching the verifier's ieee-p1363 expectation
  if (alg.startsWith('ES')) {
    return cryptoSign(digest, data, { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  }
  if (alg.startsWith('PS')) {
    return cryptoSign(digest, data, { key: createPrivateKey(privateKeyPem), padding: constants.RSA_PKCS1_PSS_PADDING }).toString('base64url');
  }
  return cryptoSign(digest, data, privateKeyPem).toString('base64url');
}

interface IssueOptions {
  secret?: string;
  privateKey?: string;
  kid?: string;
  headerAlg?: string;
  claims?: Record<string, unknown>;
}

function issueToken(alg: string, options: IssueOptions): string {
  const claims = defaultClaims(options.claims);
  const header: { alg: string; kid?: string } = { alg: options.headerAlg ?? alg };
  if (options.kid) header.kid = options.kid;
  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const signature = options.secret !== undefined ? signHmac(signingInput, alg, options.secret) : signAsymmetric(signingInput, alg, options.privateKey ?? rsa.privateKey);
  return `${signingInput}.${signature}`;
}

function hsAuth(extra: Partial<JWTUserAuthConfig> = {}): JWTUserAuth {
  return new JWTUserAuth({ secret: SECRET, issuer: ISSUER, audience: AUDIENCE, ...extra });
}

function rsaAuth(extra: Partial<JWTUserAuthConfig> = {}): JWTUserAuth {
  return new JWTUserAuth({ publicKey: rsa.publicKey, issuer: ISSUER, audience: AUDIENCE, ...extra });
}

function ecAuth(extra: Partial<JWTUserAuthConfig> = {}): JWTUserAuth {
  return new JWTUserAuth({ publicKey: ec.publicKey, issuer: ISSUER, audience: AUDIENCE, ...extra });
}

function authRequest(token: string | undefined): { headers: { authorization?: string } } {
  return { headers: { ...(token !== undefined && { authorization: `Bearer ${token}` }) } };
}

describe('JWTUserAuth', () => {
  describe('configuration', () => {
    it('throws when no key material is provided', () => {
      assert.throws(() => new JWTUserAuth({}), /one of: secret/);
    });

    it('throws when multiple key sources are provided', () => {
      assert.throws(() => new JWTUserAuth({ secret: SECRET, publicKey: rsa.publicKey }), /only one/);
    });

    it('throws when the HS256 secret is shorter than 32 characters', () => {
      assert.throws(() => new JWTUserAuth({ secret: 'short' }), /at least 32/);
    });
  });

  describe('HS256', () => {
    it('verifies a valid token and returns the sub claim', async () => {
      const token = issueToken('HS256', { secret: SECRET });
      assert.strictEqual(await hsAuth().getUserId(authRequest(token)), 'test-user');
    });

    it('reads the user id from a custom claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { sub: 'ignored', uid: 'uid-user' } });
      assert.strictEqual(await hsAuth({ userIdClaim: 'uid' }).getUserId(authRequest(token)), 'uid-user');
    });

    it('rejects a token signed with a different secret', async () => {
      const token = issueToken('HS256', { secret: 'other-secret-0123456789-0123456789' });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /Signature verification failed/);
    });

    it('rejects an expired token', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { exp: nowSeconds() - 10 } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"exp" claim timestamp check failed/);
    });

    it('accepts an expired token within clockTolerance', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { exp: nowSeconds() - 10 } });
      await assert.doesNotReject(hsAuth({ clockTolerance: 60 }).getUserId(authRequest(token)));
    });

    it('rejects a token before its nbf', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { nbf: nowSeconds() + 3600 } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"nbf" claim timestamp check failed/);
    });

    it('rejects an issuer not in the allowed list', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { iss: 'https://evil.example.com' } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"iss" claim value mismatch/);
    });

    it('accepts an issuer in an array of allowed issuers', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { iss: 'https://second.example.com' } });
      await assert.doesNotReject(hsAuth({ issuer: [ISSUER, 'https://second.example.com'] }).getUserId(authRequest(token)));
    });

    it('rejects an audience not in the allowed list', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { aud: 'other-api' } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"aud" claim value mismatch/);
    });

    it('accepts an audience in an array of allowed audiences', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { aud: 'other-api' } });
      await assert.doesNotReject(hsAuth({ audience: [AUDIENCE, 'other-api'] }).getUserId(authRequest(token)));
    });

    it('rejects a token without an exp claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { exp: undefined } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"exp" claim must be a number/);
    });

    it('rejects a token with a non-numeric exp claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { exp: '2026-01-01' } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"exp" claim must be a number/);
    });

    it('rejects a token with a non-numeric nbf claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { nbf: 'soon' } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"nbf" claim must be a number/);
    });

    it('rejects a token with a future iat claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { iat: nowSeconds() + 100 } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /"iat" claim timestamp check failed/);
    });

    it('rejects an HS384 token by default', async () => {
      const token = issueToken('HS384', { secret: SECRET });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /not permitted/);
    });

    it('accepts HS384 when explicitly allowed', async () => {
      const token = issueToken('HS384', { secret: SECRET });
      await assert.doesNotReject(hsAuth({ algorithms: ['HS384'] }).getUserId(authRequest(token)));
    });

    it('rejects a token with alg none', async () => {
      const token = issueToken('HS256', { secret: SECRET, headerAlg: 'none' });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /alg/);
    });

    it('rejects a token missing the user id claim', async () => {
      const token = issueToken('HS256', { secret: SECRET, claims: { sub: undefined } });
      await assert.rejects(hsAuth().getUserId(authRequest(token)), /missing or invalid 'sub' claim/);
    });
  });

  describe('request handling', () => {
    it('rejects a request without an Authorization header', async () => {
      await assert.rejects(hsAuth().getUserId({ headers: {} }), /No Authorization header/);
    });

    it('rejects a non-Bearer Authorization header', async () => {
      await assert.rejects(hsAuth().getUserId({ headers: { authorization: 'Basic abc' } }), /Invalid Authorization header/);
    });

    it('rejects a Bearer header without a token', async () => {
      await assert.rejects(hsAuth().getUserId({ headers: { authorization: 'Bearer' } }), /Invalid Authorization header/);
    });

    it('rejects a malformed token with two segments', async () => {
      await assert.rejects(hsAuth().getUserId(authRequest('abc.def')), /Malformed JWT/);
    });

    it('rejects a token segment containing padding', async () => {
      const token = issueToken('HS256', { secret: SECRET });
      const [header, payload, signature] = token.split('.') as [string, string, string];
      await assert.rejects(hsAuth().getUserId(authRequest(`${header}.${payload}.${signature}=`)), /base64url/);
    });

    it('rejects a token whose claims are not a JSON object', async () => {
      const header = b64url({ alg: 'HS256' });
      const payload = b64url([1, 2, 3]);
      const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      await assert.rejects(hsAuth().getUserId(authRequest(`${header}.${payload}.${signature}`)), /claims must be a JSON object/);
    });
  });

  describe('RS256', () => {
    it('verifies a valid token', async () => {
      const token = issueToken('RS256', { privateKey: rsa.privateKey });
      assert.strictEqual(await rsaAuth().getUserId(authRequest(token)), 'test-user');
    });

    it('rejects a token signed by a different RSA key', async () => {
      const token = issueToken('RS256', { privateKey: rsaOther.privateKey });
      await assert.rejects(rsaAuth().getUserId(authRequest(token)), /Signature verification failed/);
    });

    it('verifies a PS256 token when explicitly allowed', async () => {
      const token = issueToken('PS256', { privateKey: rsa.privateKey });
      await assert.doesNotReject(rsaAuth({ algorithms: ['PS256'] }).getUserId(authRequest(token)));
    });

    it('rejects a PS256 token by default', async () => {
      const token = issueToken('PS256', { privateKey: rsa.privateKey });
      await assert.rejects(rsaAuth().getUserId(authRequest(token)), /not permitted/);
    });

    it('verifies an RS512 token when explicitly allowed', async () => {
      const token = issueToken('RS512', { privateKey: rsa.privateKey });
      await assert.doesNotReject(rsaAuth({ algorithms: ['RS512'] }).getUserId(authRequest(token)));
    });

    it('rejects an ES256 token presented to an RSA key', async () => {
      const token = issueToken('ES256', { privateKey: ec.privateKey });
      await assert.rejects(rsaAuth().getUserId(authRequest(token)), /not permitted/);
    });
  });

  describe('ES256', () => {
    it('verifies a valid token', async () => {
      const token = issueToken('ES256', { privateKey: ec.privateKey });
      assert.strictEqual(await ecAuth().getUserId(authRequest(token)), 'test-user');
    });

    it('rejects a token signed by a different EC key', async () => {
      const token = issueToken('ES256', { privateKey: ecOther.privateKey });
      await assert.rejects(ecAuth().getUserId(authRequest(token)), /Signature verification failed/);
    });
  });

  describe('JWK public key', () => {
    it('verifies an RS256 token with a JWK object', async () => {
      const jwk = createPublicKey(rsa.publicKey).export({ format: 'jwk' }) as Record<string, unknown>;
      const auth = new JWTUserAuth({ publicKey: jwk, issuer: ISSUER, audience: AUDIENCE });
      const token = issueToken('RS256', { privateKey: rsa.privateKey });
      assert.strictEqual(await auth.getUserId(authRequest(token)), 'test-user');
    });
  });

  describe('JWKS', () => {
    let jwksUrl = '';
    let closeServer = () => Promise.resolve();

    before(async () => {
      const jwk = createPublicKey(rsa.publicKey).export({ format: 'jwk' }) as Record<string, unknown>;
      const server = http.createServer((_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1' }] }));
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test helper: JWKS server has no port');
      jwksUrl = `http://127.0.0.1:${address.port}/jwks.json`;
      closeServer = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });

    after(async () => {
      await closeServer();
    });

    it('verifies a token with a matching kid', async () => {
      const auth = new JWTUserAuth({ jwksUrl, issuer: ISSUER, audience: AUDIENCE });
      const token = issueToken('RS256', { privateKey: rsa.privateKey, kid: 'key-1' });
      assert.strictEqual(await auth.getUserId(authRequest(token)), 'test-user');
    });

    it('rejects a token with an unknown kid', async () => {
      const auth = new JWTUserAuth({ jwksUrl, issuer: ISSUER, audience: AUDIENCE });
      const token = issueToken('RS256', { privateKey: rsa.privateKey, kid: 'missing' });
      await assert.rejects(auth.getUserId(authRequest(token)), /No matching JWKS key/);
    });

    it('uses the only JWKS key when the token has no kid', async () => {
      const auth = new JWTUserAuth({ jwksUrl, issuer: ISSUER, audience: AUDIENCE });
      const token = issueToken('RS256', { privateKey: rsa.privateKey });
      assert.strictEqual(await auth.getUserId(authRequest(token)), 'test-user');
    });
  });
});

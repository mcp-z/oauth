/**
 * Token Isolation Integration Test
 *
 * Tests token storage with the new key format:
 * - New key format: {accountId}:{service}:token
 * - Keyv operations (KeyvFile in test, KeyvDuckDB in prod)
 * - Token isolation between accounts and services
 * - Token close on account removal
 *
 * This validates the token storage architecture with multi-account support.
 */

import assert from 'assert';
import { rm } from 'fs/promises';
import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';
import * as path from 'path';
import { getToken, removeAccount, setToken } from '../../src/account-utils.ts';
import { createAccountKey, parseTokenKey } from '../../src/key-utils.ts';

interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

describe('Token Isolation Integration', () => {
  let testDir: string;
  let tokenStore: Keyv;

  beforeEach(async () => {
    // Create isolated test directory for each test
    testDir = path.join('.tmp', `token-isolation-test-${Date.now()}`);

    // Create Keyv store with KeyvFile backend
    tokenStore = new Keyv({
      store: new KeyvFile({ filename: path.join(testDir, 'test-store.json') }),
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(testDir, { recursive: true, force: true });
  });

  it('should use new key format without userId', async () => {
    const accountId = 'test@gmail.com';
    const service = 'gmail';

    const testToken: CachedToken = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    };

    // Store token using new function
    await setToken(tokenStore, { accountId, service }, testToken);

    // Retrieve token using new function
    const retrieved = await getToken<CachedToken>(tokenStore, { accountId, service });

    assert.ok(retrieved, 'Token should be retrieved');
    assert.equal(retrieved.accessToken, testToken.accessToken);
    assert.equal(retrieved.refreshToken, testToken.refreshToken);
    assert.equal(retrieved.expiresAt, testToken.expiresAt);
    assert.equal(retrieved.scope, testToken.scope);

    // Verify key format
    const key = createAccountKey('token', { accountId, service });
    assert.ok(key.startsWith(accountId), 'Key should start with accountId');
    assert.equal(key, `${accountId}:${service}:token`, 'Key format should be accountId:service:token');
  });

  it('should parse token keys correctly', async () => {
    const parsed = parseTokenKey('user@gmail.com:gmail:token');
    assert.ok(parsed, 'Should parse valid key');
    assert.equal(parsed.accountId, 'user@gmail.com', 'AccountId should match');
    assert.equal(parsed.service, 'gmail', 'Service should match');
  });

  it('should isolate tokens between accounts', async () => {
    const account1 = 'user1@gmail.com';
    const account2 = 'user2@gmail.com';
    const service = 'gmail';

    const token1: CachedToken = {
      accessToken: 'token1',
      expiresAt: Date.now() + 3600000,
      scope: 'scope1',
    };

    const token2: CachedToken = {
      accessToken: 'token2',
      expiresAt: Date.now() + 3600000,
      scope: 'scope2',
    };

    // Store tokens for both accounts
    await setToken(tokenStore, { accountId: account1, service }, token1);
    await setToken(tokenStore, { accountId: account2, service }, token2);

    // Retrieve tokens independently
    const retrieved1 = await getToken<CachedToken>(tokenStore, { accountId: account1, service });
    const retrieved2 = await getToken<CachedToken>(tokenStore, { accountId: account2, service });

    // Verify isolation
    assert.ok(retrieved1, 'Token1 should exist');
    assert.ok(retrieved2, 'Token2 should exist');
    assert.equal(retrieved1.accessToken, 'token1', 'Token1 should match');
    assert.equal(retrieved2.accessToken, 'token2', 'Token2 should match');
    assert.notEqual(retrieved1.accessToken, retrieved2.accessToken, 'Tokens should be isolated');
  });

  it('should isolate tokens between services', async () => {
    const accountId = 'user@gmail.com';
    const gmailService = 'gmail';
    const sheetsService = 'sheets';

    const gmailToken: CachedToken = {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600000,
      scope: 'gmail-scope',
    };

    const sheetsToken: CachedToken = {
      accessToken: 'sheets-token',
      expiresAt: Date.now() + 3600000,
      scope: 'sheets-scope',
    };

    // Store tokens for same account but different services
    await setToken(tokenStore, { accountId, service: gmailService }, gmailToken);
    await setToken(tokenStore, { accountId, service: sheetsService }, sheetsToken);

    // Retrieve tokens independently
    const retrievedGmail = await getToken<CachedToken>(tokenStore, { accountId, service: gmailService });
    const retrievedSheets = await getToken<CachedToken>(tokenStore, { accountId, service: sheetsService });

    // Verify isolation
    assert.ok(retrievedGmail, 'Gmail token should exist');
    assert.ok(retrievedSheets, 'Sheets token should exist');
    assert.equal(retrievedGmail.accessToken, 'gmail-token', 'Gmail token should match');
    assert.equal(retrievedSheets.accessToken, 'sheets-token', 'Sheets token should match');
    assert.notEqual(retrievedGmail.accessToken, retrievedSheets.accessToken, 'Service tokens should be isolated');
  });

  it('should clean up tokens on account removal', async () => {
    const service = 'gmail';

    await setToken(tokenStore, { accountId: 'user1@gmail.com', service }, { accessToken: 'token1', expiresAt: Date.now(), scope: 'test' });
    await setToken(tokenStore, { accountId: 'user2@gmail.com', service }, { accessToken: 'token2', expiresAt: Date.now(), scope: 'test' });

    // Remove one account
    await removeAccount(tokenStore, { accountId: 'user1@gmail.com', service });

    // Verify token removed
    const token1 = await getToken(tokenStore, { accountId: 'user1@gmail.com', service });
    const token2 = await getToken<CachedToken>(tokenStore, { accountId: 'user2@gmail.com', service });

    assert.equal(token1, undefined, 'Token1 should be removed');
    assert.ok(token2, 'Token2 should still exist');
    assert.equal(token2.accessToken, 'token2', 'Token2 should match');
  });

  it('should handle missing tokens gracefully', async () => {
    const result = await getToken(tokenStore, { accountId: 'nonexistent@gmail.com', service: 'gmail' });
    assert.equal(result, undefined, 'Should return undefined for non-existent token');
  });

  it('should provide fast O(1) lookups with compound keys', async () => {
    const accountId = 'performance-test@gmail.com';
    const service = 'gmail';

    const testToken: CachedToken = {
      accessToken: 'perf-test-token',
      expiresAt: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    };

    await setToken(tokenStore, { accountId, service }, testToken);

    // Measure lookup time
    const startTime = Date.now();
    const retrieved = await getToken<CachedToken>(tokenStore, { accountId, service });
    const lookupTime = Date.now() - startTime;

    assert.ok(retrieved, 'Token should be found');
    assert.equal(retrieved.accessToken, testToken.accessToken);

    // Keyv lookups should be very fast (< 10ms for direct key access)
    assert.ok(lookupTime < 50, `Lookup should be fast (was ${lookupTime}ms)`);
  });

  it('should handle multiple concurrent operations', async () => {
    const service = 'gmail';
    const accounts = Array.from({ length: 10 }, (_, i) => `user${i}@gmail.com`);
    const tokens: CachedToken[] = [];

    // Store multiple tokens concurrently
    await Promise.all(
      accounts.map(async (accountId, i) => {
        const token: CachedToken = {
          accessToken: `token-${i}`,
          expiresAt: Date.now() + 3600000,
          scope: `scope-${i}`,
        };
        tokens[i] = token;
        await setToken(tokenStore, { accountId, service }, tokens[i]);
      })
    );

    // Retrieve all tokens concurrently
    const results = await Promise.all(accounts.map((accountId) => getToken<CachedToken>(tokenStore, { accountId, service })));

    // Verify all tokens retrieved correctly
    for (let i = 0; i < accounts.length; i++) {
      assert.ok(results[i], `Token ${i} should exist`);
      assert.equal(results[i]?.accessToken, `token-${i}`, `Token ${i} should match`);
    }
  });

  it('should work with special characters in accountIds', async () => {
    const accountIds = ['user+tag@gmail.com', 'user.name@company.co.uk', 'user_name@example.org', 'user-name@test-domain.com'];

    const service = 'gmail';

    // Store token for each accountId format
    for (const accountId of accountIds) {
      const token: CachedToken = {
        accessToken: `token-for-${accountId}`,
        expiresAt: Date.now() + 3600000,
        scope: 'test',
      };
      await setToken(tokenStore, { accountId, service }, token);

      // Verify retrieval
      const retrieved = await getToken<CachedToken>(tokenStore, { accountId, service });
      assert.ok(retrieved, `Token for ${accountId} should exist`);
      assert.equal(retrieved.accessToken, `token-for-${accountId}`, `Token for ${accountId} should match`);
    }
  });
});

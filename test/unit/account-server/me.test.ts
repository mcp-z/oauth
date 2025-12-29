import assert from 'assert';
import Keyv from 'keyv';
import { addAccount, setToken } from '../../../src/account-utils.ts';
import { createAccountMe } from '../../../src/lib/account-server/me.ts';
import type { CachedToken } from '../../../src/types.ts';

describe('createAccountMe', () => {
  const service = 'gmail';
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  describe('Stateless mode', () => {
    it('extracts email from authContext', async () => {
      const { tools } = createAccountMe({ service, mode: 'stateless' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const extra = { authContext: { accountId: 'test@example.com' } };
      const result = await meTool.handler({}, extra);

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; sessionExpiresIn: null };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'test@example.com');
      assert.strictEqual(data.sessionExpiresIn, null);
    });

    it('throws error when authContext is missing', async () => {
      const { tools } = createAccountMe({ service, mode: 'stateless' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      await assert.rejects(async () => {
        await meTool.handler({}, {});
      }, /No authentication context available/);
    });

    it('throws error when accountId is missing from authContext', async () => {
      const { tools } = createAccountMe({ service, mode: 'stateless' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const extra = { authContext: {} };
      await assert.rejects(async () => {
        await meTool.handler({}, extra);
      }, /No authentication context available/);
    });

    it('includes service name in response', async () => {
      const { tools } = createAccountMe({ service: 'outlook', mode: 'stateless' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const extra = { authContext: { accountId: 'user@outlook.com' } };
      const result = await meTool.handler({}, extra);

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { service: string };
      assert.strictEqual(data.service, 'outlook');
    });
  });

  describe('Loopback mode - Error cases', () => {
    it('throws error when store is not provided', async () => {
      const { tools } = createAccountMe({ service, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      await assert.rejects(async () => {
        await meTool.handler({}, {});
      }, /Store is required for non-stateless mode/);
    });

    it('throws error when no active account exists', async () => {
      const store = new Keyv();
      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      await assert.rejects(async () => {
        await meTool.handler({}, {});
      }, /No active gmail account found/);
    });
  });

  describe('Loopback mode - Token expiry scenarios', () => {
    it('shows time remaining when token has future expiry', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      // Add account and set as active
      await addAccount(store, { service, accountId });

      // Set token with future expiry (2 hours from now)
      const futureExpiry = Date.now() + 2 * 60 * 60 * 1000;
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: futureExpiry,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.ok(data.sessionExpiresIn);
      assert.ok(data.sessionExpiresIn.includes('h')); // Should be in hours format
    });

    it('shows "expired" when token expiry is in the past', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      await addAccount(store, { service, accountId });

      // Set token with past expiry
      const pastExpiry = Date.now() - 1000;
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: pastExpiry,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.strictEqual(data.sessionExpiresIn, 'expired');
    });

    it('shows "never" when token has no expiry (service account pattern)', async () => {
      const store = new Keyv();
      const accountId = 'service-account@example.com';

      await addAccount(store, { service, accountId });

      // Set token without expiry (JWT-based service account)
      const token: CachedToken = {
        accessToken: 'jwt-token',
        // No expiresAt field
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.strictEqual(data.sessionExpiresIn, 'never');
    });

    it('shows "never" when token is not found', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      // Add account but don't set any token
      await addAccount(store, { service, accountId });

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.strictEqual(data.sessionExpiresIn, 'never');
    });
  });

  describe('Duration formatting', () => {
    it('formats seconds correctly (< 60s)', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      await addAccount(store, { service, accountId });

      // 30 seconds from now
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: Date.now() + 30 * 1000,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.ok(data.sessionExpiresIn);
      assert.ok(data.sessionExpiresIn.endsWith('s')); // Should be in seconds format
    });

    it('formats minutes correctly (< 60m)', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      await addAccount(store, { service, accountId });

      // 45 minutes from now
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: Date.now() + 45 * 60 * 1000,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.ok(data.sessionExpiresIn);
      assert.ok(data.sessionExpiresIn.includes('m')); // Should be in minutes format
      assert.ok(!data.sessionExpiresIn.includes('h')); // Should NOT include hours
    });

    it('formats hours only when no remaining minutes', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      await addAccount(store, { service, accountId });

      // Exactly 2 hours from now
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.ok(data.sessionExpiresIn);
      assert.ok(data.sessionExpiresIn.includes('h'));
    });

    it('formats hours and minutes when both present', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';

      await addAccount(store, { service, accountId });

      // 2 hours 15 minutes from now
      const token: CachedToken = {
        accessToken: 'test-token',
        expiresAt: Date.now() + (2 * 60 + 15) * 60 * 1000,
      };
      await setToken(store, { accountId, service }, token);

      const { tools } = createAccountMe({ service, store, logger, mode: 'loopback' });
      const meTool = tools.find((t) => t.name === 'account-me');
      assert.ok(meTool);

      const result = await meTool.handler({}, {});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { sessionExpiresIn?: string };
      assert.ok(data.sessionExpiresIn);
      assert.ok(data.sessionExpiresIn.includes('h'));
      assert.ok(data.sessionExpiresIn.includes('m'));
    });
  });

  describe('Tool structure', () => {
    it('returns exactly 1 tool', () => {
      const { tools } = createAccountMe({ service, mode: 'stateless' });
      assert.strictEqual(tools.length, 1);
    });

    it('returns 0 prompts', () => {
      const { prompts } = createAccountMe({ service, mode: 'stateless' });
      assert.strictEqual(prompts.length, 0);
    });

    it('tool has correct name', () => {
      const { tools } = createAccountMe({ service, mode: 'stateless' });
      assert.strictEqual(tools[0]?.name, 'account-me');
    });
  });
});

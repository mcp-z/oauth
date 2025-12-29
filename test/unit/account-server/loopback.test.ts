import assert from 'assert';
import Keyv from 'keyv';
import { addAccount, getAccountInfo, getActiveAccount, setAccountInfo } from '../../../src/account-utils.ts';
import { createLoopback } from '../../../src/lib/account-server/loopback.ts';
import type { AccountInfo, AuthEmailProvider } from '../../../src/types.ts';

describe('AccountServer.createLoopback', () => {
  const service = 'gmail';
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  describe('Tool: account-switch', () => {
    it('adds first account and sets it as active', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
        authenticateNewAccount: async () => 'user1@gmail.com',
      };

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      const result = await switchTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user1@gmail.com');
      assert.strictEqual(data.isNew, true);

      // Verify active account
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user1@gmail.com');
    });

    it('adds second account without replacing first', async () => {
      const store = new Keyv();
      let emailIndex = 0;
      const emails = ['user1@gmail.com', 'user2@gmail.com'];
      const auth: AuthEmailProvider = {
        getUserEmail: async () => {
          const email = emails[emailIndex];
          if (!email) throw new Error('No more emails');
          return email;
        },
        authenticateNewAccount: async () => {
          const email = emails[emailIndex++];
          if (!email) throw new Error('No more emails');
          return email;
        },
      };

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Link first account
      await switchTool.handler({});

      // Link second account
      const result = await switchTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user2@gmail.com');
      assert.strictEqual(data.isNew, true);

      // Verify second account is now active
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user2@gmail.com');
    });

    it('re-linking existing account does not duplicate', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
        authenticateNewAccount: async () => 'user1@gmail.com',
      };

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Switch first time
      await switchTool.handler({});

      // Switch again
      const result = await switchTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user1@gmail.com');
      assert.strictEqual(data.isNew, false);
    });

    it('stores account alias when provided', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
        authenticateNewAccount: async () => 'user1@gmail.com',
      };

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      await switchTool.handler({ alias: 'work' });

      const accountInfo = await getAccountInfo(store, { accountId: 'user1@gmail.com', service });
      assert.ok(accountInfo);
      assert.strictEqual(accountInfo.alias, 'work');
    });

    it('smart switch: switches to already-linked account by email without OAuth', async () => {
      const store = new Keyv();
      let oauthCallCount = 0;
      const auth: AuthEmailProvider = {
        getUserEmail: async () => {
          oauthCallCount++;
          return 'user1@gmail.com';
        },
      };

      // Setup: Add two accounts
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Smart switch with email parameter - should switch without OAuth
      const result = await switchTool.handler({ email: 'user2@gmail.com' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean; message: string };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user2@gmail.com');
      assert.strictEqual(data.isNew, false);
      assert.ok(data.message.includes('no OAuth needed'));

      // Verify OAuth was NOT called
      assert.strictEqual(oauthCallCount, 0, 'OAuth should not be triggered for already-linked account');

      // Verify active account switched
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user2@gmail.com');
    });

    it('smart switch: switches to already-linked account by alias without OAuth', async () => {
      const store = new Keyv();
      let oauthCallCount = 0;
      const auth: AuthEmailProvider = {
        getUserEmail: async () => {
          oauthCallCount++;
          return 'user1@gmail.com';
        },
      };

      // Setup: Add two accounts, second with alias
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });
      const accountInfo: AccountInfo = {
        email: 'user2@gmail.com',
        alias: 'work',
        addedAt: new Date().toISOString(),
      };
      await setAccountInfo(store, { accountId: 'user2@gmail.com', service }, accountInfo);

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Smart switch with alias parameter - should switch without OAuth
      const result = await switchTool.handler({ email: 'work' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user2@gmail.com');
      assert.strictEqual(data.isNew, false);

      // Verify OAuth was NOT called
      assert.strictEqual(oauthCallCount, 0, 'OAuth should not be triggered for already-linked account');

      // Verify active account switched
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user2@gmail.com');
    });

    it('smart switch: triggers OAuth when email provided but not linked', async () => {
      const store = new Keyv();
      let oauthCallCount = 0;
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user2@gmail.com',
        authenticateNewAccount: async () => {
          oauthCallCount++;
          return 'user2@gmail.com';
        },
      };

      // Setup: Add only first account
      await addAccount(store, { service, accountId: 'user1@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Smart switch with email for non-linked account - should trigger OAuth
      const result = await switchTool.handler({ email: 'user2@gmail.com' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.email, 'user2@gmail.com');
      assert.strictEqual(data.isNew, true);

      // Verify OAuth WAS called
      assert.strictEqual(oauthCallCount, 1, 'OAuth should be triggered for non-linked account');

      // Verify new account is active
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user2@gmail.com');
    });

    it('smart switch: handles OAuth returning different email than requested', async () => {
      const store = new Keyv();
      let oauthCallCount = 0;
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
        authenticateNewAccount: async () => {
          oauthCallCount++;
          // Simulate user selecting a different account during OAuth
          return 'user2@gmail.com';
        },
      };

      // Setup: Add only first account
      await addAccount(store, { service, accountId: 'user1@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Request to switch to a DIFFERENT account that's not linked
      // OAuth should be triggered via authenticateNewAccount
      const result = await switchTool.handler({ email: 'user2@gmail.com' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; email: string; isNew: boolean };
      assert.strictEqual(data.type, 'success');

      // Should successfully add the new account via OAuth
      assert.strictEqual(data.email, 'user2@gmail.com', 'Should return user2@gmail.com from OAuth flow');
      assert.strictEqual(data.isNew, true, 'Should recognize user2 as new account');
      assert.strictEqual(oauthCallCount, 1, 'OAuth should be triggered once via authenticateNewAccount');
    });

    it('smart switch: updates alias when switching to already-linked account', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add account without alias
      await addAccount(store, { service, accountId: 'user1@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const switchTool = tools.find((t) => t.name === 'account-switch');
      assert.ok(switchTool);

      // Smart switch with alias for already-linked account - should update alias
      await switchTool.handler({ email: 'user1@gmail.com', alias: 'work' });

      const accountInfo = await getAccountInfo(store, { accountId: 'user1@gmail.com', service });
      assert.ok(accountInfo);
      assert.strictEqual(accountInfo.alias, 'work');
    });
  });

  describe('Tool: account-remove', () => {
    it('removes specified account', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add two accounts
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const removeTool = tools.find((t) => t.name === 'account-remove');
      assert.ok(removeTool);

      const result = await removeTool.handler({ accountId: 'user1@gmail.com' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; removed: string };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.removed, 'user1@gmail.com');
    });

    it('switches to another account when removing active account', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add two accounts, first is active
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const removeTool = tools.find((t) => t.name === 'account-remove');
      assert.ok(removeTool);

      // Remove active account
      await removeTool.handler({ accountId: 'user1@gmail.com' });

      // Should switch to user2
      const activeAccount = await getActiveAccount(store, { service });
      assert.strictEqual(activeAccount, 'user2@gmail.com');
    });

    it('finds account by alias', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add account with alias
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      const accountInfo: AccountInfo = {
        email: 'user1@gmail.com',
        alias: 'work',
        addedAt: new Date().toISOString(),
      };
      await setAccountInfo(store, { accountId: 'user1@gmail.com', service }, accountInfo);

      const { tools } = createLoopback({ service, store, logger, auth });
      const removeTool = tools.find((t) => t.name === 'account-remove');
      assert.ok(removeTool);

      const result = await removeTool.handler({ accountId: 'work' });

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; removed: string };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.removed, 'user1@gmail.com');
    });

    it('throws error when account not found', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add one account so we get "Account not found" instead of "No accounts to remove"
      await addAccount(store, { service, accountId: 'user1@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const removeTool = tools.find((t) => t.name === 'account-remove');
      assert.ok(removeTool);

      await assert.rejects(async () => {
        await removeTool.handler({ accountId: 'nonexistent@gmail.com' });
      }, /Account not found/);
    });
  });

  describe('Tool: account-list', () => {
    it('returns empty array when no accounts', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      const { tools } = createLoopback({ service, store, logger, auth });
      const listTool = tools.find((t) => t.name === 'account-list');
      assert.ok(listTool);

      const result = await listTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; accounts: Array<unknown>; totalAccounts: number; message: string };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.accounts.length, 0);
      assert.strictEqual(data.totalAccounts, 0);
      assert.ok(data.message.includes('No gmail accounts linked'));
    });

    it('returns all linked accounts with active status', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add two accounts
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const { tools } = createLoopback({ service, store, logger, auth });
      const listTool = tools.find((t) => t.name === 'account-list');
      assert.ok(listTool);

      const result = await listTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; accounts: Array<{ email: string; isActive: boolean }> };
      assert.strictEqual(data.type, 'success');
      assert.strictEqual(data.accounts.length, 2);
      const account0 = data.accounts[0];
      const account1 = data.accounts[1];
      assert.ok(account0);
      assert.ok(account1);
      assert.strictEqual(account0.email, 'user1@gmail.com');
      assert.strictEqual(account0.isActive, true); // First account is active
      assert.strictEqual(account1.email, 'user2@gmail.com');
      assert.strictEqual(account1.isActive, false);
    });

    it('includes alias when present', async () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      // Setup: Add account with alias
      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      const accountInfo: AccountInfo = {
        email: 'user1@gmail.com',
        alias: 'work',
        addedAt: new Date().toISOString(),
      };
      await setAccountInfo(store, { accountId: 'user1@gmail.com', service }, accountInfo);

      const { tools } = createLoopback({ service, store, logger, auth });
      const listTool = tools.find((t) => t.name === 'account-list');
      assert.ok(listTool);

      const result = await listTool.handler({});

      assert.ok(result.structuredContent);
      const data = result.structuredContent.result as { type: string; accounts: Array<{ email: string; alias?: string }> };
      assert.strictEqual(data.type, 'success');
      const account0 = data.accounts[0];
      assert.ok(account0);
      assert.strictEqual(account0.alias, 'work');
    });
  });

  describe('Tool count', () => {
    it('provides exactly 4 tools', () => {
      const store = new Keyv();
      const auth: AuthEmailProvider = {
        getUserEmail: async () => 'user1@gmail.com',
      };

      const { tools } = createLoopback({ service, store, logger, auth });

      assert.strictEqual(tools.length, 4);
      assert.ok(tools.find((t) => t.name === 'account-me'));
      assert.ok(tools.find((t) => t.name === 'account-switch'));
      assert.ok(tools.find((t) => t.name === 'account-remove'));
      assert.ok(tools.find((t) => t.name === 'account-list'));
    });
  });
});

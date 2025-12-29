import assert from 'assert';
import Keyv from 'keyv';
import { addAccount, getAccountInfo, getActiveAccount, getLinkedAccounts, getToken, removeAccount, setAccountInfo, setActiveAccount, setToken } from '../../src/account-utils.ts';
import type { AccountInfo } from '../../src/types.ts';

describe('account-manager', () => {
  describe('active account management', () => {
    it('sets and gets active account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await setActiveAccount(store, { service, accountId: 'user@gmail.com' });
      const active = await getActiveAccount(store, { service });

      assert.strictEqual(active, 'user@gmail.com');
    });

    it('returns undefined when no active account', async () => {
      const store = new Keyv();
      const active = await getActiveAccount(store, { service: 'gmail' });
      assert.strictEqual(active, undefined);
    });

    it('updates active account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await setActiveAccount(store, { service, accountId: 'user1@gmail.com' });
      await setActiveAccount(store, { service, accountId: 'user2@gmail.com' });

      const active = await getActiveAccount(store, { service });
      assert.strictEqual(active, 'user2@gmail.com');
    });
  });

  describe('linked accounts management', () => {
    it('returns empty array when no linked accounts', async () => {
      const store = new Keyv();
      const linked = await getLinkedAccounts(store, { service: 'gmail' });
      assert.deepStrictEqual(linked, []);
    });

    it('adds account to linked accounts', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user@gmail.com' });
      const linked = await getLinkedAccounts(store, { service });

      assert.deepStrictEqual(linked, ['user@gmail.com']);
    });

    it('sets first account as active automatically', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user@gmail.com' });
      const active = await getActiveAccount(store, { service });

      assert.strictEqual(active, 'user@gmail.com');
    });

    it('does not duplicate accounts', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user@gmail.com' });
      await addAccount(store, { service, accountId: 'user@gmail.com' });

      const linked = await getLinkedAccounts(store, { service });
      assert.deepStrictEqual(linked, ['user@gmail.com']);
    });

    it('adds multiple accounts', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const linked = await getLinkedAccounts(store, { service });
      assert.deepStrictEqual(linked, ['user1@gmail.com', 'user2@gmail.com']);
    });

    it('does not change active account when adding second account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      const active = await getActiveAccount(store, { service });
      assert.strictEqual(active, 'user1@gmail.com');
    });
  });

  describe('account removal', () => {
    it('removes account from linked accounts', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user@gmail.com' });
      await removeAccount(store, { service, accountId: 'user@gmail.com' });

      const linked = await getLinkedAccounts(store, { service });
      assert.deepStrictEqual(linked, []);
    });

    it('removes account token', async () => {
      const store = new Keyv();
      const service = 'gmail';
      const accountId = 'user@gmail.com';

      await setToken(store, { accountId, service }, { accessToken: 'token123' });
      await removeAccount(store, { service, accountId });

      const token = await getToken(store, { accountId, service });
      assert.strictEqual(token, undefined);
    });

    it('removes account info', async () => {
      const store = new Keyv();
      const service = 'gmail';
      const accountId = 'user@gmail.com';

      const info: AccountInfo = {
        email: accountId,
        addedAt: new Date().toISOString(),
      };
      await setAccountInfo(store, { accountId, service }, info);
      await removeAccount(store, { service, accountId });

      const retrieved = await getAccountInfo(store, { accountId, service });
      assert.strictEqual(retrieved, undefined);
    });

    it('updates active account when removing active account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      // user1 is active (first added)
      await removeAccount(store, { service, accountId: 'user1@gmail.com' });

      // Should switch to user2
      const active = await getActiveAccount(store, { service });
      assert.strictEqual(active, 'user2@gmail.com');
    });

    it('clears active account when removing last account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user@gmail.com' });
      await removeAccount(store, { service, accountId: 'user@gmail.com' });

      const active = await getActiveAccount(store, { service });
      assert.strictEqual(active, undefined);
    });

    it('does not change active account when removing non-active account', async () => {
      const store = new Keyv();
      const service = 'gmail';

      await addAccount(store, { service, accountId: 'user1@gmail.com' });
      await addAccount(store, { service, accountId: 'user2@gmail.com' });

      // user1 is active
      await removeAccount(store, { service, accountId: 'user2@gmail.com' });

      const active = await getActiveAccount(store, { service });
      assert.strictEqual(active, 'user1@gmail.com');
    });
  });

  describe('account info management', () => {
    it('sets and gets account info', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';
      const service = 'gmail';

      const info: AccountInfo = {
        email: accountId,
        alias: 'work',
        addedAt: new Date().toISOString(),
      };

      await setAccountInfo(store, { accountId, service }, info);
      const retrieved = await getAccountInfo(store, { accountId, service });

      assert.deepStrictEqual(retrieved, info);
    });

    it('returns undefined for non-existent account info', async () => {
      const store = new Keyv();
      const info = await getAccountInfo(store, { accountId: 'user@gmail.com', service: 'gmail' });
      assert.strictEqual(info, undefined);
    });
  });

  describe('token management', () => {
    it('sets and gets token', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';
      const service = 'gmail';
      const token = { accessToken: 'token123', refreshToken: 'refresh456' };

      await setToken(store, { accountId, service }, token);
      const retrieved = await getToken(store, { accountId, service });

      assert.deepStrictEqual(retrieved, token);
    });

    it('returns undefined for non-existent token', async () => {
      const store = new Keyv();
      const token = await getToken(store, { accountId: 'user@gmail.com', service: 'gmail' });
      assert.strictEqual(token, undefined);
    });

    it('supports typed tokens', async () => {
      const store = new Keyv();
      const accountId = 'user@gmail.com';
      const service = 'gmail';

      type GoogleToken = {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      };

      const token: GoogleToken = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        expiresAt: Date.now() + 3600000,
      };

      await setToken<GoogleToken>(store, { accountId, service }, token);
      const retrieved = await getToken<GoogleToken>(store, { accountId, service });

      assert.deepStrictEqual(retrieved, token);
    });
  });
});

import assert from 'assert';
import { createAccountKey, createServiceKey, parseTokenKey } from '../../src/key-utils.ts';

describe('key-utils', () => {
  describe('createAccountKey', () => {
    it('creates token key with correct format', () => {
      const key = createAccountKey('token', { accountId: 'user@gmail.com', service: 'gmail' });
      assert.strictEqual(key, 'user@gmail.com:gmail:token');
    });

    it('creates key without userId prefix', () => {
      const key = createAccountKey('token', { accountId: 'user@example.com', service: 'sheets' });
      assert.strictEqual(key, 'user@example.com:sheets:token');
    });

    it('creates key with test accountId', () => {
      const key = createAccountKey('token', { accountId: 'test@example.com', service: 'outlook' });
      assert.strictEqual(key, 'test@example.com:outlook:token');
    });

    it('creates key with session accountId', () => {
      const key = createAccountKey('token', { accountId: 'user@example.com', service: 'drive' });
      assert.strictEqual(key, 'user@example.com:drive:token');
    });
  });

  describe('createServiceKey', () => {
    it('creates active key with correct format', () => {
      const key = createServiceKey('active', { service: 'gmail' });
      assert.strictEqual(key, 'gmail:active');
    });

    it('creates key without userId prefix', () => {
      const key = createServiceKey('active', { service: 'sheets' });
      assert.strictEqual(key, 'sheets:active');
    });
  });

  describe('createServiceKey', () => {
    it('creates linked key with correct format', () => {
      const key = createServiceKey('linked', { service: 'gmail' });
      assert.strictEqual(key, 'gmail:linked');
    });

    it('creates key without userId prefix', () => {
      const key = createServiceKey('linked', { service: 'outlook' });
      assert.strictEqual(key, 'outlook:linked');
    });
  });

  describe('createAccountKey', () => {
    it('creates account info key with correct format', () => {
      const key = createAccountKey('metadata', { accountId: 'user@gmail.com', service: 'gmail' });
      assert.strictEqual(key, 'user@gmail.com:gmail:metadata');
    });

    it('creates key without userId prefix', () => {
      const key = createAccountKey('metadata', { accountId: 'work@company.com', service: 'sheets' });
      assert.strictEqual(key, 'work@company.com:sheets:metadata');
    });
  });

  describe('parseTokenKey', () => {
    it('parses valid token key correctly', () => {
      const parsed = parseTokenKey('user@gmail.com:gmail:token');
      assert.deepStrictEqual(parsed, {
        accountId: 'user@gmail.com',
        service: 'gmail',
      });
    });

    it('parses token key with new format', () => {
      const parsed = parseTokenKey('work@company.com:sheets:token');
      assert.deepStrictEqual(parsed, {
        accountId: 'work@company.com',
        service: 'sheets',
      });
    });

    it('returns undefined for invalid format', () => {
      const parsed = parseTokenKey('invalid-key');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for wrong number of segments', () => {
      const parsed = parseTokenKey('user:os-alice:gmail:token');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for wrong prefix', () => {
      const parsed = parseTokenKey('account:os-alice:user@gmail.com:gmail:token');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for wrong suffix', () => {
      const parsed = parseTokenKey('user:os-alice:user@gmail.com:gmail:tokens');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for malformed key', () => {
      const parsed = parseTokenKey('invalid:key');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for empty accountId', () => {
      const parsed = parseTokenKey('user:os-alice::gmail:token');
      assert.strictEqual(parsed, undefined);
    });

    it('returns undefined for empty service', () => {
      const parsed = parseTokenKey('user:os-alice:user@gmail.com::token');
      assert.strictEqual(parsed, undefined);
    });
  });

  describe('key format consistency', () => {
    it('all keys use colon as delimiter', () => {
      const tokenKey = createAccountKey('token', { accountId: 'user@gmail.com', service: 'gmail' });
      const activeKey = createServiceKey('active', { service: 'gmail' });
      const linkedKey = createServiceKey('linked', { service: 'gmail' });
      const infoKey = createAccountKey('metadata', { accountId: 'user@gmail.com', service: 'gmail' });

      // All should use colon delimiter
      assert.ok(tokenKey.includes(':'));
      assert.ok(activeKey.includes(':'));
      assert.ok(linkedKey.includes(':'));
      assert.ok(infoKey.includes(':'));
    });

    it('accountId with special characters does not conflict with key structure', () => {
      const key = createAccountKey('token', { accountId: 'user@gmail.com', service: 'gmail' });

      // Should be able to split on colon without ambiguity
      const parts = key.split(':');
      assert.strictEqual(parts.length, 3);

      assert.strictEqual(parts[0], 'user@gmail.com');
      assert.strictEqual(parts[1], 'gmail');
      assert.strictEqual(parts[2], 'token');
    });
  });
});

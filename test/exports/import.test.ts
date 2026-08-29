import { createAccountKey, generatePKCE, getToken, listAccountIds, openUrl } from '@mcp-z/oauth';
import assert from 'assert';

describe('exports .ts', () => {
  it('named exports resolve', () => {
    for (const fn of [getToken, createAccountKey, listAccountIds, openUrl, generatePKCE]) assert.equal(typeof fn, 'function');
  });
});

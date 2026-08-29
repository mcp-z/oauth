const assert = require('assert');
const { createAccountKey, generatePKCE, getToken, listAccountIds, openUrl } = require('@mcp-z/oauth');

describe('exports .cjs', () => {
  it('named exports resolve', () => {
    for (const fn of [getToken, createAccountKey, listAccountIds, openUrl, generatePKCE]) assert.equal(typeof fn, 'function');
  });
});

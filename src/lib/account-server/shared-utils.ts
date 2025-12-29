import type { Keyv } from 'keyv';
import { getAccountInfo, getLinkedAccounts } from '../../account-utils.ts';

/**
 * Find account ID by email or alias lookup.
 * Returns accountId if found, otherwise null.
 */
export async function findAccountByEmailOrAlias(store: Keyv, service: string, emailOrAlias: string): Promise<string | null> {
  const linkedAccountIds = await getLinkedAccounts(store, { service });

  // Try exact email match first
  if (linkedAccountIds.includes(emailOrAlias)) {
    return emailOrAlias;
  }

  // Search by alias
  for (const accountId of linkedAccountIds) {
    const info = await getAccountInfo(store, { accountId, service });
    if (info?.alias === emailOrAlias) {
      return accountId;
    }
  }

  return null;
}

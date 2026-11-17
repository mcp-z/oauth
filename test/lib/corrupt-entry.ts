import type Keyv from 'keyv';

/**
 * Overwrites `key` in the Map backing `store` with an entry the store cannot parse, in whichever
 * form the installed keyv writes (keyv 5: prefixed key, serialized string; keyv 6: bare key, record object).
 */
export async function plantCorruptEntry(store: Keyv, map: Map<string, unknown>, key: string): Promise<void> {
  await store.set(key, 'probe');
  const backingKey = [...map.keys()].find((k) => k === key || k === `keyv:${key}`);
  if (backingKey === undefined) throw new Error(`Backing store has no entry for ${key}`);
  map.set(backingKey, typeof map.get(backingKey) === 'string' ? '{corrupt' : { value: '{corrupt' });
}

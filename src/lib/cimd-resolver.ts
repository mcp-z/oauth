/**
 * Resolves Client ID Metadata Documents (CIMD) without allowing a client_id
 * URL to become an SSRF primitive for the authorization server.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

export interface CimdClientMetadataDocument {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  [key: string]: unknown;
}

export class CimdResolverError extends Error {
  constructor() {
    super('Invalid client metadata document');
    this.name = 'CimdResolverError';
  }
}

export interface CimdResolverOptions {
  /** Explicit development-only escape hatch for http:// loopback documents. */
  allowHttpLoopback?: boolean;
  /** DNS implementation, injectable for deterministic tests. */
  lookup?: (hostname: string, options: { all: true; verbatim: true }, callback: (error: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void) => void;
  /** Per request connect/read deadline in milliseconds. */
  timeoutMs?: number;
  /** Maximum response size in bytes. */
  maxBodyBytes?: number;
  /** Default success-cache lifetime in milliseconds. */
  defaultTtlMs?: number;
  /** Upper bound for origin-provided cache lifetimes in milliseconds. */
  maxTtlMs?: number;
  /** Maximum cached documents; least recently used entries are evicted. */
  maxCacheEntries?: number;
  /** Minimum time between resolution attempts for one client ID. */
  rateLimitMs?: number;
  /** Maximum tracked client IDs for rate limiting. */
  maxRateLimitEntries?: number;
}

export interface CimdResolver {
  resolve(clientId: string): Promise<CimdClientMetadataDocument>;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BODY_BYTES = 5_120;
const DEFAULT_TTL_MS = 300_000;
const DEFAULT_MAX_TTL_MS = 3_600_000;
const DEFAULT_MAX_CACHE_ENTRIES = 256;
const DEFAULT_RATE_LIMIT_MS = 1_000;
const DEFAULT_MAX_RATE_LIMIT_ENTRIES = 1_024;

type LookupRecord = { address: string; family: number };
type Lookup = NonNullable<CimdResolverOptions['lookup']>;

const documentSchema = z
  .object({
    client_id: z.string().min(1),
    client_name: z.string().min(1),
    redirect_uris: z.array(z.string().min(1)).min(1),
    token_endpoint_auth_method: z.string().optional(),
    jwks: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }).optional(),
  })
  .passthrough();

function invalid(): CimdResolverError {
  return new CimdResolverError();
}

function loopback(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'loopback';
  } catch {
    return false;
  }
}

function publicUnicast(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function validUrl(clientId: string, allowHttpLoopback: boolean): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw invalid();
  }
  // URL normalizes dot segments, so inspect the supplied value before parsing.
  const rawPath = clientId.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]+(\/[^?#]*)?/i)?.[1];
  if (!rawPath || /(?:^|\/)(?:\.|%2e)(?:(?:\.|%2e))?(?:\/|$)/i.test(rawPath)) throw invalid();
  const hostname = url.hostname.replace(/^\[(.*)]$/, '$1');
  const developmentHttp = allowHttpLoopback && url.protocol === 'http:';
  if ((!developmentHttp && url.protocol !== 'https:') || url.username || url.password || url.hash || !url.pathname) throw invalid();
  if (isIP(hostname) && !(developmentHttp ? loopback(hostname) : publicUnicast(hostname))) throw invalid();
  return url;
}

function parseCacheTtl(headers: http.IncomingHttpHeaders, now: number, defaultTtlMs: number, maxTtlMs: number): number {
  const cacheControl = headers['cache-control'];
  const value = Array.isArray(cacheControl) ? cacheControl.join(',') : cacheControl;
  if (/(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|$)/i.test(value ?? '')) return 0;
  const maxAge = value?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
  let ttl = maxAge === undefined ? defaultTtlMs : Number(maxAge) * 1_000;
  if (maxAge === undefined && typeof headers.expires === 'string') {
    const expires = Date.parse(headers.expires);
    if (Number.isFinite(expires)) ttl = Math.max(0, expires - now);
  }
  const age = Number(headers.age);
  if (Number.isFinite(age) && age > 0) ttl -= age * 1_000;
  return Math.min(Math.max(0, ttl), maxTtlMs);
}

function documentFromJson(value: unknown, clientId: string): CimdClientMetadataDocument {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success || parsed.data.client_id !== clientId) throw invalid();
  const document = parsed.data as Record<string, unknown>;
  if ('client_secret' in document || 'client_secret_expires_at' in document || (typeof document.token_endpoint_auth_method === 'string' && /^client_secret_/i.test(document.token_endpoint_auth_method))) throw invalid();
  const jwks = document.jwks as { keys: Record<string, unknown>[] } | undefined;
  if (jwks?.keys.some((key: Record<string, unknown>) => ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some((member) => member in key))) throw invalid();
  return parsed.data as CimdClientMetadataDocument;
}

/** Creates a bounded, SSRF-safe CIMD resolver. */
export function createCimdResolver(options: CimdResolverOptions = {}): CimdResolver {
  const lookup = options.lookup ?? (dns.lookup as unknown as Lookup);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  const maxTtlMs = options.maxTtlMs ?? DEFAULT_MAX_TTL_MS;
  const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const maxRateLimitEntries = options.maxRateLimitEntries ?? DEFAULT_MAX_RATE_LIMIT_ENTRIES;
  if (
    !(
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0 &&
      Number.isFinite(maxBodyBytes) &&
      maxBodyBytes > 0 &&
      Number.isFinite(defaultTtlMs) &&
      defaultTtlMs >= 0 &&
      Number.isFinite(maxTtlMs) &&
      maxTtlMs >= 0 &&
      Number.isFinite(rateLimitMs) &&
      rateLimitMs >= 0 &&
      Number.isSafeInteger(maxCacheEntries) &&
      maxCacheEntries > 0 &&
      Number.isSafeInteger(maxRateLimitEntries) &&
      maxRateLimitEntries > 0
    )
  )
    throw new TypeError('Invalid CIMD resolver options');
  const cache = new Map<string, { document: CimdClientMetadataDocument; expiresAt: number }>();
  const inflight = new Map<string, Promise<CimdClientMetadataDocument>>();
  const attempted = new Map<string, number>();

  const remember = (map: Map<string, unknown>, key: string, limit: number): void => {
    map.delete(key);
    map.set(key, undefined);
    if (map.size > limit) map.delete(map.keys().next().value as string);
  };

  const resolveAddress = (url: URL): Promise<LookupRecord[]> =>
    new Promise((resolve, reject) => {
      const hostname = url.hostname.replace(/^\[(.*)]$/, '$1');
      if (isIP(hostname)) return resolve([{ address: hostname, family: hostname.includes(':') ? 6 : 4 }]);
      let settled = false;
      const fail = (): void => {
        if (!settled) {
          settled = true;
          clearTimeout(deadline);
          reject(invalid());
        }
      };
      const deadline = setTimeout(fail, timeoutMs);
      lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (error || addresses.length === 0) reject(invalid());
        else resolve(addresses);
      });
    });

  const request = async (url: URL): Promise<{ body: string; headers: http.IncomingHttpHeaders }> => {
    const addresses = await resolveAddress(url);
    const localHttp = options.allowHttpLoopback && url.protocol === 'http:';
    if (addresses.some(({ address }) => (localHttp ? !loopback(address) : !publicUnicast(address)))) throw invalid();
    const address = addresses[0];
    if (!address) throw invalid();
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      let settled = false;
      let req: http.ClientRequest | undefined;
      let response: http.IncomingMessage | undefined;
      const deadline = setTimeout(() => {
        req?.destroy();
        response?.destroy();
        fail();
      }, timeoutMs);
      const finish = (): void => clearTimeout(deadline);
      const fail = (): void => {
        if (!settled) {
          settled = true;
          finish();
          reject(invalid());
        }
      };
      const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      };
      req = transport.get(url, { agent: false, headers: { accept: 'application/json, application/*+json' }, lookup: pinnedLookup }, (res) => {
        response = res;
        if (res.statusCode !== 200 || typeof res.headers['content-type'] !== 'string' || !/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(res.headers['content-type'])) {
          res.resume();
          return fail();
        }
        const length = Number(res.headers['content-length']);
        if (Number.isFinite(length) && length > maxBodyBytes) {
          res.resume();
          return fail();
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            res.destroy();
            fail();
          } else chunks.push(chunk);
        });
        res.once('error', fail);
        res.once('end', () => {
          if (!settled) {
            settled = true;
            finish();
            resolve({ body: Buffer.concat(chunks).toString('utf8'), headers: res.headers });
          }
        });
      });
      req.setTimeout(timeoutMs, () => req?.destroy());
      req.once('error', fail);
    });
  };

  const fetchDocument = async (clientId: string): Promise<CimdClientMetadataDocument> => {
    const url = validUrl(clientId, options.allowHttpLoopback === true);
    const response = await request(url);
    let document: CimdClientMetadataDocument;
    try {
      document = documentFromJson(JSON.parse(response.body), clientId);
    } catch {
      throw invalid();
    }
    const now = Date.now();
    const ttl = parseCacheTtl(response.headers, now, defaultTtlMs, maxTtlMs);
    if (ttl > 0) {
      cache.delete(clientId);
      cache.set(clientId, { document, expiresAt: now + ttl });
      if (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value as string);
    }
    return document;
  };

  return {
    async resolve(clientId: string): Promise<CimdClientMetadataDocument> {
      const now = Date.now();
      const cached = cache.get(clientId);
      if (cached && cached.expiresAt > now) {
        cache.delete(clientId);
        cache.set(clientId, cached);
        return cached.document;
      }
      if (cached) cache.delete(clientId);
      const running = inflight.get(clientId);
      if (running) return running;
      const last = attempted.get(clientId);
      if (last !== undefined && now - last < rateLimitMs) throw invalid();
      remember(attempted, clientId, maxRateLimitEntries);
      attempted.set(clientId, now);
      const promise = fetchDocument(clientId);
      inflight.set(clientId, promise);
      try {
        return await promise;
      } catch {
        // The resolver is an authorization-server trust boundary. Never let
        // URL, DNS, socket, or parser details escape to its caller.
        throw invalid();
      } finally {
        inflight.delete(clientId);
      }
    },
  };
}

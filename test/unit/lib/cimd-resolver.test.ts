import http from 'node:http';
import { type CimdClientMetadataDocument, createCimdResolver } from '@mcp-z/oauth';
import assert from 'assert';

type LookupCallback = (error: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void;
type ResolverLookup = NonNullable<Parameters<typeof createCimdResolver>[0]>['lookup'];

async function withServer(handler: http.RequestListener, test: (origin: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function metadata(clientId: string): CimdClientMetadataDocument {
  return { client_id: clientId, client_name: 'Example client', redirect_uris: ['https://client.example/callback'] };
}

describe('cimd-resolver', () => {
  it('resolves a metadata document and honors its cache lifetime', async () => {
    let calls = 0;
    await withServer(
      (req, res) => {
        calls += 1;
        const clientId = `http://127.0.0.1:${req.socket.localPort}/metadata`;
        res.writeHead(200, { 'cache-control': 'max-age=60', 'content-type': 'application/json' });
        res.end(JSON.stringify(metadata(clientId)));
      },
      async (origin) => {
        const resolver = createCimdResolver({ allowHttpLoopback: true });
        const clientId = `${origin}/metadata`;
        assert.deepStrictEqual(await resolver.resolve(clientId), metadata(clientId));
        await resolver.resolve(clientId);
        assert.strictEqual(calls, 1);
      }
    );
  });

  const refusalCases: [string, http.RequestListener][] = [
    [
      'wrong content type',
      (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('{}');
      },
    ],
    [
      'oversized body',
      (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('x'.repeat(2_560));
        res.end('x'.repeat(2_561));
      },
    ],
    [
      'redirect',
      (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(302, { location: 'http://127.0.0.1/private' });
        res.end();
      },
    ],
    [
      'server error',
      (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{}');
      },
    ],
  ];
  for (const [name, handler] of refusalCases) {
    it(`refuses ${name} without exposing request details`, async () => {
      await withServer(handler, async (origin) => {
        const clientId = `${origin}/metadata`;
        await assert.rejects(createCimdResolver({ allowHttpLoopback: true, rateLimitMs: 0 }).resolve(clientId), (error: Error) => error.message === 'Invalid client metadata document');
      });
    });
  }

  it('rejects malformed URLs and invalid metadata without fetching them', async () => {
    const resolver = createCimdResolver({ allowHttpLoopback: true, rateLimitMs: 0 });
    for (const clientId of [
      'http://example.test/document',
      'https://example.test',
      'https://example.test/../private',
      'https://example.test/%2e%2e/private',
      'https://user@example.test/document',
      'https://example.test/document#fragment',
      'https://0x7f000001/document',
      'https://0177.0.0.1/document',
      'https://[::ffff:127.0.0.1]/document',
    ]) {
      await assert.rejects(resolver.resolve(clientId), /Invalid client metadata document/);
    }
  });

  it('rejects malformed documents and secrets', async () => {
    let invalidDocuments: Record<string, unknown>[] = [];
    await withServer(
      (_req, res) => {
        const document = invalidDocuments.shift();
        if (!document) throw new Error('Missing fixture');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(document));
      },
      async (origin) => {
        const clientId = `${origin}/metadata`;
        invalidDocuments = [
          { client_id: 'wrong', client_name: 'Example', redirect_uris: ['https://client.example/callback'] },
          { client_id: clientId, redirect_uris: ['https://client.example/callback'] },
          { client_id: clientId, client_name: 'Example', redirect_uris: [] },
          { client_id: clientId, client_name: 'Example', redirect_uris: ['https://client.example/callback'], client_secret: 'secret' },
          { client_id: clientId, client_name: 'Example', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'client_secret_basic' },
          { client_id: clientId, client_name: 'Example', redirect_uris: ['https://client.example/callback'], jwks: { keys: [{ kty: 'RSA', d: 'private' }] } },
        ];
        const resolver = createCimdResolver({ allowHttpLoopback: true, rateLimitMs: 0 });
        for (let index = 0; index < 6; index += 1) await assert.rejects(resolver.resolve(clientId), /Invalid client metadata document/);
      }
    );
  });

  it('does not cache no-store responses and coalesces concurrent resolutions', async () => {
    let calls = 0;
    await withServer(
      (req, res) => {
        calls += 1;
        const clientId = `http://127.0.0.1:${req.socket.localPort}/metadata`;
        res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' });
        setTimeout(() => res.end(JSON.stringify(metadata(clientId))), 10);
      },
      async (origin) => {
        const resolver = createCimdResolver({ allowHttpLoopback: true, rateLimitMs: 0 });
        const clientId = `${origin}/metadata`;
        await Promise.all([resolver.resolve(clientId), resolver.resolve(clientId)]);
        assert.strictEqual(calls, 1);
        await resolver.resolve(clientId);
        assert.strictEqual(calls, 2);
      }
    );
  });

  it('rate limits repeated failed resolutions and bounds hanging DNS', async () => {
    let lookups = 0;
    const resolver = createCimdResolver({
      lookup: ((_hostname: string, _options: unknown, callback: LookupCallback) => {
        lookups += 1;
        callback(new Error('DNS failure') as NodeJS.ErrnoException, []);
      }) as ResolverLookup,
      rateLimitMs: 10_000,
    });
    await assert.rejects(resolver.resolve('https://client.example/document'), /Invalid client metadata document/);
    assert.strictEqual(lookups, 1);
    await assert.rejects(resolver.resolve('https://client.example/document'), /Invalid client metadata document/);
    assert.strictEqual(lookups, 1);
    const hanging = createCimdResolver({ lookup: (() => undefined) as unknown as ResolverLookup, timeoutMs: 10, rateLimitMs: 0 });
    await assert.rejects(hanging.resolve('https://client.example/document'), /Invalid client metadata document/);
    const throwing = createCimdResolver({
      lookup: (() => {
        throw new Error('internal resolver detail');
      }) as ResolverLookup,
      rateLimitMs: 0,
    });
    await assert.rejects(throwing.resolve('https://client.example/document'), (error: Error) => error.message === 'Invalid client metadata document');
  });

  it('blocks every non-public address returned by DNS before a request', async () => {
    for (const address of ['10.0.0.1', '172.16.0.1', '192.168.0.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      const resolver = createCimdResolver({ lookup: ((_hostname: string, _options: unknown, callback: LookupCallback) => callback(null, [{ address, family: address.includes(':') ? 6 : 4 }])) as ResolverLookup, rateLimitMs: 0 });
      await assert.rejects(resolver.resolve('https://client.example/document'), /Invalid client metadata document/, address);
    }
  });

  it('pins the validated DNS address into the actual request', async () => {
    let lookups = 0;
    await withServer(
      (req, res) => {
        const clientId = `http://cimd.invalid:${req.socket.localPort}/metadata`;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(metadata(clientId)));
      },
      async (origin) => {
        const port = new URL(origin).port;
        const clientId = `http://cimd.invalid:${port}/metadata`;
        const resolver = createCimdResolver({
          allowHttpLoopback: true,
          lookup: ((_hostname: string, _options: unknown, callback: LookupCallback) => {
            lookups += 1;
            callback(null, [{ address: lookups === 1 ? '127.0.0.1' : '169.254.169.254', family: 4 }]);
          }) as ResolverLookup,
        });
        assert.deepStrictEqual(await resolver.resolve(clientId), metadata(clientId));
        assert.strictEqual(lookups, 1);
      }
    );
  });
});

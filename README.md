# @mcp-z/oauth

Multi-account orchestration and secure token storage for OAuth-based MCP servers.

## Common uses

- Add consistent account tools to MCP servers
- Store OAuth tokens with a shared config and storage backend
- Reuse the same account lifecycle across Google and Microsoft providers
- Resolve public Client ID Metadata Documents (CIMD) safely for authorization servers

## Client ID Metadata Documents

`createCimdResolver()` resolves a public HTTPS `client_id` metadata document with SSRF protections: public-unicast DNS validation pinned into the request, no redirects, a 5 KiB JSON response limit, bounded caching, and per-client request limiting. Local development can explicitly allow HTTP loopback documents with `allowHttpLoopback: true`.

In production, route this traffic through an egress proxy or network policy that blocks internal destinations (for example, Smokescreen-style controls). That defense composes with the resolver's application-level checks.

## Install

```bash
npm install @mcp-z/oauth
```

Optional storage backends:

```bash
npm install keyv-duckdb
npm install keyv-file
```

## Account tools and modes

Use `AccountServer` to add account tools to your MCP server.

### Loopback mode (multi-account)

When using loopback OAuth, these tools are added:

- `account-me`
- `account-switch`
- `account-remove`
- `account-list`

### Stateless mode (DCR/bearer)

When using stateless auth (DCR/bearer tokens), only this tool is available:

- `account-me`

## Example

```ts
import { AccountServer } from '@mcp-z/oauth';

const { tools, prompts } = AccountServer.createStateless({ service: 'gmail' });
// Register these tools and prompts with your MCP server.
```

Use `createLoopback` when the server manages multiple stored accounts. It requires a Keyv store, logger, and OAuth provider from your application. `createStateless` needs only the service name and reports the account represented by the MCP client's bearer token.

## Logging helper

Use `sanitizeForLoggingFormatter` to avoid leaking secrets in logs.

## Requirements

- Node.js >= 18

## Documentation

[API Docs](https://mcp-z.github.io/oauth)

# @mcp-z/oauth

Docs: https://mcp-z.github.io/oauth
Multi-account OAuth orchestration and token storage for MCP servers.

## Common uses

- Add consistent account tools to MCP servers
- Store OAuth tokens with a shared config and storage backend
- Reuse the same account lifecycle across Google and Microsoft providers

## Install

```bash
npm install @mcp-z/oauth
```

Optional storage backends:

```bash
npm install keyv-duckdb
npm install keyv-file
```

## Initialize token storage

```bash
npx @mcp-z/oauth init
```

This creates a `.tokens/` directory and a default config file for token storage.

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

const { tools, prompts } = AccountServer.createLoopback({
  service: 'gmail',
  store: tokenStore,
  logger,
  auth: authProvider
});
```

## Logging helper

Use `sanitizeForLoggingFormatter` to avoid leaking secrets in logs.

## Requirements

- Node.js >= 22

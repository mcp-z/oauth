# Changelog

## [2.1.0] - 2026-09-07

### Added

- `createCimdResolver()` resolves Client ID Metadata Documents for authorization servers with bounded caching and SSRF protections. `RFC8414Metadata` now types the `client_id_metadata_document_supported` capability flag.

## [2.0.0] - 2026-09-06

### Changed

- Migrated from the v1 MCP SDK (`@modelcontextprotocol/sdk`) to the v2 SDK (`@modelcontextprotocol/server`). The wire protocol served is unchanged. Errors thrown by this package's tools are now the v2 SDK's `ProtocolError` / `ProtocolErrorCode` instead of the v1 `McpError` / `ErrorCode`, with identical wire codes — a consumer that catches tool errors by `instanceof` must import the v2 classes.
- `ToolConfig.inputSchema` / `.outputSchema` narrow from a union to `StandardSchemaWithJSON`, and `McpTool.config.inputSchema` / `.outputSchema` from `Record<string, unknown>` to the same. The `account-me`, `account-switch`, `account-remove`, and `account-list` tools returned by `createLoopback` and `createStateless` now carry `z.object(...)` schemas in those fields where they previously carried plain objects.
- The `TExtra` default of `ToolHandler` and `AuthMiddlewareWrapper` is now the SDK's `ServerContext` (was `RequestHandlerExtra`).
- The `zod` dependency floor is raised to `^4.2.0`, the v2 SDK's own requirement; below it npm nests a second zod copy and schema identity checks fail.

### Added

- A `support/1.x` maintenance line, published under the `support-1` dist-tag, with a publish guard that refuses a bare `npm publish` from that branch. 1.x fixes land on that branch, not in this line; its releases from 1.1.2 are recorded in that branch's `CHANGELOG.md`.

## [1.1.1] - 2026-08-31

Documentation only; the code is identical to 1.1.0.

## [1.1.0] - 2026-08-29

Test and tooling only; the public API is unchanged. The suite now verifies the package loads through the CommonJS, ESM, and `.ts` entry points.

## [1.0.5] - 2026-08-28

### Changed

- `engines.node` changed from `>=24` to `>=18`.

## [1.0.4] - 2026-08-28

### Added

- `openUrl(url)`, which launches the system browser for an OAuth flow (macOS, Windows, Linux, and WSL; `http:`/`https:` URLs only).

## [1.0.3] - 2026-08-28

### Changed

- `JWTUserAuth` verification is reimplemented on `node:crypto`; the `jose` dependency is removed. Supported algorithms expand from HS256/RS256/ES256 to HS256/384/512, RS256/384/512, PS256/384/512, and ES256/384/512, and a statically configured public key may now be RSA or EC (it was imported as RS256 before).
- A token without an `exp` claim is now rejected.

## [1.0.2] - 2026-08-23

No public API changes. The `keyv` and `keyv-file` ranges are relaxed to `^5.0.0`, and the `log` callback of `sanitizeForLoggingFormatter` gets an explicit parameter type.

## [1.0.1] - 2026-01-02

### Changed

- `AuthEmailProvider` is renamed `AccountAuthProvider` (the old name remains as an alias type), and `AccountAuthProvider` is added to the public type exports. The interface now requires `getAccessToken` and no longer has the optional `authenticateNewAccount`; the `account-switch` tool triggers a fresh OAuth flow through `getAccessToken` rather than calling `authenticateNewAccount`.

## [1.0.0] - 2025-12-28

Initial release.

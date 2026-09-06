# Contributing to MCP-Z

## Branches

Two lines. `master` is the current major and where all new work goes; `support/1.x` maintains the 1.x line for consumers who have not migrated.

    master          2.x    current    the v2 MCP SDK, both protocol eras
    support/1.x     1.x    security fixes and bugs only, cut at v1.1.1

Check which one you are on before editing:

```bash
git rev-parse --abbrev-ref HEAD
```

Features, migrations and new APIs go to `master` only. A fix that also affects the 1.x line is cherry-picked to `support/1.x`, never merged across. Releases from `support/1.x` publish under the `support-1` dist-tag, never `latest`; `prepublishOnly` refuses a bare publish from this branch.

## Before Starting

**MUST READ**:
- [QUALITY.MD](QUALITY.md) - Quality principles (summarize before starting work)

## Pre-Commit Commands

Install ts-dev-stack globally if not already installed:
```bash
npm install -g ts-dev-stack
```

Run before committing:
```bash
tsds validate
```

## Pre-Publish Verification

Before publishing packages to npm, verify each package builds and runs correctly:

```bash
# Verify specific package
cd servers/mcp-gmail && npm run verify

# Verify all server packages
for server in gmail outlook sheets drive workflows; do
  echo "Verifying @mcp-z/mcp-$server..."
  cd servers/$server && npm run verify && cd ../.. || exit 1
done
```

**Two-Phase Verification:**

**Phase 1: Built Package Verification** (fast)
- ✅ Package builds successfully (TypeScript compilation)
- ✅ Required files exist (bin/, dist/)
- ✅ Server starts using @mcp-z/cli infrastructure
- ✅ Tools respond correctly

**Phase 2: npm pack + Install Verification** (comprehensive)
- ✅ npm pack creates valid tarball
- ✅ Installation from tarball succeeds (production dependencies only)
- ✅ Installed package structure valid
- ✅ Excluded files not present (scripts/, test/, src/)
- ✅ Server starts from installed package
- ✅ Runtime dependencies complete (no missing deps)

**Production-Grade Error Handling:**
Uses @mcp-z/cli infrastructure for:
- ✅ Timeout protection (5s graceful shutdown)
- ✅ SIGKILL fallback (prevents hanging)
- ✅ No orphaned processes
- ✅ Comprehensive cleanup

**Automatic verification:**
Verification runs automatically during `npm publish` via the `prepublishOnly` hook. If **either phase** fails, publish is blocked.

**Execution time:** ~30-60 seconds per package (Phase 1: ~15s, Phase 2: ~30s)

## Package Development

See package documentation:
- `README.md` - Package overview and usage
- `QUALITY.md` - Quality principles and standards
- `CLAUDE.md` - Development patterns and architecture guidance


/**
 * @mcp-z/oauth - Multi-account OAuth orchestration and secure token storage for MCP servers
 *
 * Provides account management functions, account tools generation, and secure logging utilities.
 * Designed to work with any storage backend (file, Redis, DuckDB) via Keyv interface.
 */

// Core account management - Public API
// Internal functions - For provider implementations and testing
export { addAccount, getActiveAccount, getToken, removeAccount, setAccountInfo, setActiveAccount, setToken } from './account-utils.ts';
// Auth classes - For multi-tenant testing
export { JWTUserAuth } from './jwt-auth.ts';
export { type AccountKeyParams, type AccountKeyType, createAccountKey, createServiceKey, listAccountIds, type ServiceKeyParams, type ServiceKeyType } from './key-utils.ts';
// Account server and factory functions - Public API
export { type AccountLoopbackConfig, AccountServer, type AccountStatelessConfig, createLoopback, createStateless } from './lib/account-server/index.ts';
// DCR types - Public API
export type { DcrClientInformation, DcrClientMetadata, DcrConfig, DcrErrorResponse, ProviderTokens } from './lib/dcr-types.ts';
// RFC Metadata Types - Public API
export type { RFC8414Metadata, RFC9728Metadata } from './lib/rfc-metadata-types.ts';
export { generatePKCE, type PKCEPair } from './pkce.ts';
// Logging utilities - Public API
export { sanitizeForLogging, sanitizeForLoggingFormatter } from './sanitizer.ts';
// Schemas
export * as schemas from './schemas/index.ts';
export { SessionUserAuth } from './session-auth.ts';
export { getErrorTemplate, getSuccessTemplate } from './templates.ts';

// Public types - core interfaces that consumers use
export type {
  // Account management types
  AccountInfo,
  // Provider interfaces
  AuthEmailProvider,
  AuthFlowDescriptor,
  AuthMiddlewareWrapper,
  CachedToken,
  Credentials,
  // Auth config types
  JWTUserAuthConfig,
  // Utility types
  Logger,
  McpPrompt,
  McpTool,
  OAuth2TokenStorageProvider,
  SessionUserAuthConfig,
  ToolConfig,
  ToolHandler,
  ToolModule,
  UserAuthProvider,
} from './types.ts';

// Public error classes
export { AccountManagerError, AccountNotFoundError, AuthRequiredError, ConfigurationError, RequiresAuthenticationError } from './types.ts';

/**
 * Type definitions for multi-account management and OAuth integration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, GetPromptResult, ServerNotification, ServerRequest, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export type Logger = Pick<Console, 'info' | 'error' | 'warn' | 'debug'>;

export interface AccountInfo {
  email: string;
  alias?: string;
  addedAt: string;
  lastUsed?: string;
  metadata?: {
    name?: string;
    picture?: string;
    [key: string]: unknown;
  };
}

/**
 * MCP tool module definition with configuration and handler function.
 *
 * Represents a registered tool in the Model Context Protocol server that can be
 * invoked by MCP clients. Tools are the primary mechanism for executing operations
 * in response to client requests.
 *
 * @property name - Unique tool identifier (e.g., "gmail-message-send", "sheets-values-get")
 * @property config - Tool configuration including description and schemas
 * @property config.description - Human-readable description shown to MCP clients
 * @property config.inputSchema - Zod schema defining tool arguments (JSON-serializable)
 * @property config.outputSchema - Zod schema defining tool response structure
 * @property handler - Async function that executes the tool operation
 *
 * @remarks
 * This is the runtime representation of an MCP tool after registration. The handler
 * receives JSON-serializable arguments validated against inputSchema and returns
 * a CallToolResult validated against outputSchema.
 *
 * Tools are typically created using tool factory functions and registered with the
 * MCP server during initialization.
 *
 * @example
 * ```typescript
 * const tool: McpTool = {
 *   name: "gmail-message-send",
 *   config: {
 *     description: "Send an email message",
 *     inputSchema: { to: { type: "string" }, subject: { type: "string" } },
 *     outputSchema: { result: { type: "object" } }
 *   },
 *   handler: async (args, context) => {
 *     // Implementation
 *     return { content: [{ type: "text", text: "Message sent" }] };
 *   }
 * };
 * ```
 *
 * @see {@link McpPrompt} for prompt module definition
 */
export interface McpTool {
  name: string;
  config: {
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  };
  handler: (args: unknown, context?: unknown) => Promise<CallToolResult>;
}

/**
 * MCP prompt module definition with configuration and handler function.
 *
 * Represents a registered prompt template in the Model Context Protocol server that
 * can be retrieved and rendered by MCP clients. Prompts provide reusable templates
 * for common interaction patterns.
 *
 * @property name - Unique prompt identifier (e.g., "draft-email", "summarize-thread")
 * @property config - Prompt configuration (schema and metadata are prompt-specific)
 * @property handler - Async function that generates the prompt content
 *
 * @remarks
 * This is the runtime representation of an MCP prompt after registration. Unlike
 * {@link McpTool} which executes operations, prompts generate templated content
 * that clients can use to structure interactions.
 *
 * The handler receives optional arguments and returns a GetPromptResult containing
 * the rendered prompt messages.
 *
 * @example
 * ```typescript
 * const prompt: McpPrompt = {
 *   name: "draft-email",
 *   config: {
 *     description: "Generate email draft from key points",
 *     arguments: [{ name: "points", description: "Key points to include" }]
 *   },
 *   handler: async (args) => {
 *     const points = args?.points || [];
 *     return {
 *       messages: [{
 *         role: "user",
 *         content: { type: "text", text: `Draft email covering: ${points.join(", ")}` }
 *       }]
 *     };
 *   }
 * };
 * ```
 *
 * @see {@link McpTool} for tool module definition
 */
export interface McpPrompt {
  name: string;
  config: unknown;
  handler: (args: unknown) => Promise<GetPromptResult>;
}

export class AccountManagerError extends Error {
  public code: string;
  public retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = 'AccountManagerError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class AccountNotFoundError extends AccountManagerError {
  constructor(accountRef: string) {
    super(`Account '${accountRef}' not found`, 'ACCOUNT_NOT_FOUND', false);
  }
}

export class ConfigurationError extends AccountManagerError {
  constructor(message: string) {
    super(`Configuration error: ${message}`, 'CONFIGURATION_ERROR', false);
  }
}

export class RequiresAuthenticationError extends AccountManagerError {
  public accountId: string | undefined;

  constructor(service: string, accountId?: string) {
    const message = accountId ? `No account found for ${service} (account: ${accountId}). Use account-add to connect one.` : `No account found for ${service}. Use account-add to connect one.`;
    super(message, 'REQUIRES_AUTHENTICATION', false);
    this.accountId = accountId;
  }
}

export interface AccountAuthProvider {
  getAccessToken(accountId?: string): Promise<string>;
  getUserEmail(accountId?: string): Promise<string>;
}

// TODO: Remove AuthEmailProvider alias in a future major release.
export type AuthEmailProvider = AccountAuthProvider;

export interface UserAuthProvider {
  getUserId(req: unknown): Promise<string>; // Throws if auth invalid
}

export interface JWTUserAuthConfig {
  secret?: string; // HS256 - MUST be at least 32 characters
  publicKey?: string | object; // RS256/ES256 - PEM string, JWK object, or JWKS URL
  jwksUrl?: string; // Alternative to publicKey
  issuer?: string | string[];
  audience?: string | string[];
  userIdClaim?: string; // Default: 'sub'
  algorithms?: string[]; // Default: auto-detect
  clockTolerance?: number; // Default: 0
}

export interface SessionUserAuthConfig {
  sessionSecret: string; // MUST be at least 32 characters
  cookieName?: string; // Default: 'session'
  algorithm?: 'sha256' | 'sha512'; // Default: 'sha256'
}

export interface Credentials {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  idToken?: string;
}

export type AuthFlowDescriptor =
  | { kind: 'credentials'; connection?: string; provider?: string; credentials: Credentials }
  | { kind: 'auth_url'; connection?: string; provider?: string; url: string; txn?: string; state?: string; codeVerifier?: string; poll?: { statusUrl: string; interval?: number }; hint?: string }
  | { kind: 'device_code'; connection?: string; provider?: string; txn?: string; device: { userCode: string; verificationUri: string; verificationUriComplete?: string; expiresIn: number; interval: number }; poll?: { statusUrl: string; interval?: number }; hint?: string }
  | { kind: 'error'; error: string; code?: number };

export class AuthRequiredError extends Error {
  public descriptor: AuthFlowDescriptor;

  constructor(descriptor: AuthFlowDescriptor, message?: string) {
    super(message || `Authentication required: ${descriptor.kind}`);
    this.name = 'AuthRequiredError';
    this.descriptor = descriptor;
  }
}

export interface CachedToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

/**
 * Tool config signature - explicit structural type mirroring SDK registerTool config
 *
 * Uses explicit structure instead of Parameters<> extraction to avoid TypeScript inference
 * collapse to 'never' when using ToolModule[] arrays. The deep conditional types from
 * Parameters<> cannot be unified across array elements.
 *
 * Validated against SDK signature for compatibility - compile errors if SDK changes.
 *
 * NOTE: This type is duplicated in @mcp-z/server for architectural independence.
 * Keep these definitions synchronized manually when updating.
 */
export type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: ZodRawShapeCompat | AnySchema;
  outputSchema?: ZodRawShapeCompat | AnySchema;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
};

// Compile-time validation that ToolConfig is compatible with SDK
type _ValidateToolConfigAssignable = ToolConfig extends Parameters<McpServer['registerTool']>[1] ? true : never;
type _ValidateToolConfigReceivable = Parameters<McpServer['registerTool']>[1] extends ToolConfig ? true : never;

/**
 * Tool handler signature with generic support for middleware.
 *
 * @template TArgs - Tool arguments type (default: unknown for SDK compatibility)
 * @template TExtra - Request handler extra type (default: RequestHandlerExtra from SDK)
 *
 * Defaults provide SDK-extracted types for compatibility with MCP SDK.
 * Generic parameters enable type-safe middleware transformation.
 *
 * NOTE: This interface is duplicated in @mcp-z/server for architectural independence.
 * Keep these definitions synchronized manually when updating.
 */
export type ToolHandler<TArgs = unknown, TExtra = RequestHandlerExtra<ServerRequest, ServerNotification>> = (args: TArgs, extra: TExtra) => Promise<CallToolResult>;

/**
 * Tool module interface with bounded generics.
 *
 * @template TConfig - Tool config type (default: SDK ToolConfig)
 * @template THandler - Handler function type (default: SDK ToolHandler)
 *
 * Use without generics for SDK-typed tools:
 * - Business tool factories: `ToolModule`
 * - Tool registration: `ToolModule[]`
 *
 * Use with generics for middleware transformation:
 * - Auth middleware: `ToolModule<ToolConfig, ToolHandler<TArgs, EnrichedExtra>>`
 *
 * The bounds ensure compatibility with SDK registration.
 *
 * NOTE: This interface is duplicated in @mcp-z/server for architectural independence.
 * Keep these definitions synchronized manually when updating.
 *
 * @see {@link ToolHandler} for handler function signature
 * @see {@link AuthMiddlewareWrapper} for middleware wrapper pattern
 */
export interface ToolModule<TConfig = ToolConfig, THandler = unknown> {
  name: string;
  config: TConfig;
  handler: THandler;
}

/**
 * Middleware wrapper that enriches tool modules with authentication context.
 *
 * Wraps plain tool modules to inject authentication, logging, and request metadata.
 * The wrapper pattern allows separation of business logic from cross-cutting concerns.
 *
 * @template TArgs - Tool arguments type (inferred from tool module)
 * @template TExtra - Enriched extra type with auth context and logger
 *
 * @param toolModule - Plain tool module to wrap with auth middleware
 * @returns Wrapped tool module with enriched handler signature
 *
 * @remarks
 * Auth middleware wrappers typically:
 * - Extract auth context from MCP request or OAuth provider
 * - Inject logger instance for structured logging
 * - Handle authentication errors with proper MCP error responses
 * - Preserve tool configuration and metadata
 *
 * @example
 * ```typescript
 * // Actual usage pattern from OAuth providers (LoopbackOAuthProvider, ServiceAccountProvider, DcrOAuthProvider)
 * const provider = new LoopbackOAuthProvider({ service: 'gmail', ... });
 * const authMiddleware = provider.authMiddleware();
 *
 * // Apply middleware to tools (handlers receive enriched extra with authContext)
 * const tools = toolFactories.map(f => f()).map(authMiddleware.withToolAuth);
 * const resources = resourceFactories.map(f => f()).map(authMiddleware.withResourceAuth);
 * const prompts = promptFactories.map(f => f()).map(authMiddleware.withPromptAuth);
 *
 * // Tool handler receives enriched extra with guaranteed authContext
 * async function handler({ id }: In, extra: EnrichedExtra) {
 *   // extra.authContext.auth is OAuth2Client (from middleware)
 *   const gmail = google.gmail({ version: 'v1', auth: extra.authContext.auth });
 *   // ... business logic with authenticated context
 * }
 * ```
 *
 * @see {@link ToolModule} for base tool interface
 * @see {@link ToolHandler} for handler function signature
 */
export type AuthMiddlewareWrapper<TArgs = unknown, TExtra = RequestHandlerExtra<ServerRequest, ServerNotification>> = (toolModule: ToolModule) => ToolModule<ToolConfig, ToolHandler<TArgs, TExtra>>;

/**
 * Base interface for stateful OAuth adapters (LoopbackOAuthProvider pattern)
 *
 * Stateful adapters manage token storage, refresh, and multi-account state.
 * Used for local development, test setup, and CI/CD workflows.
 *
 * Key characteristics:
 * - Token storage and retrieval via tokenStore
 * - Automatic token refresh with provider
 * - Interactive OAuth flows (browser, ephemeral server)
 * - Multi-account management
 *
 * Parameter usage:
 * - accountId: Account identifier (email address for token storage)
 */
export interface OAuth2TokenStorageProvider {
  /**
   * Get access token for the specified account.
   * If token is expired, automatically refreshes it.
   * If token is missing, triggers OAuth flow (interactive) or throws AuthRequired (headless).
   *
   * @param accountId - Account identifier for multi-account support
   * @returns Access token string
   */
  getAccessToken(accountId?: string): Promise<string>;

  /**
   * Get email address for the specified account.
   * Used during account registration to verify identity with provider.
   *
   * @param accountId - Account identifier
   * @returns Email address from provider verification
   */
  getUserEmail(accountId?: string): Promise<string>;
}

/**
 * Data sanitization utilities for secure logging.
 * Redacts sensitive OAuth tokens, API keys, and credentials from log output.
 *
 * @example
 * ```typescript
 * sanitizeData({ accountId: 'test@example.com', access_token: 'secret_token_value' })
 * // { accountId: 'test@example.com', access_token: 'secr****alue' }
 *
 * sanitizeForLogging('Processing token', { token: 'secret_value' })
 * // { message: 'Processing token', meta: { token: 'secr****alue' } }
 * ```
 */

/** Regex patterns for sensitive data that should be redacted from logs */
const SENSITIVE_PATTERNS = [
  // OAuth tokens, codes, and secrets
  /access_token['":\s]*['"]\s*([^'"]+)['"]/gi,
  /(access_token_[a-zA-Z0-9_]+)/gi,
  /refresh_token['":\s]*['"]\s*([^'"]+)['"]/gi,
  /client_secret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /id_token['":\s]*['"]\s*([^'"]+)['"]/gi,
  /\bcode['":\s]*['"]\s*([^'"]+)['"]/gi,
  /\bstate['":\s]*['"]\s*([^'"]+)['"]/gi,
  /code_verifier['":\s]*['"]\s*([^'"]+)['"]/gi,
  /code_challenge['":\s]*['"]\s*([^'"]+)['"]/gi,
  /codeVerifier['":\s]*['"]\s*([^'"]+)['"]/gi,
  /codeChallenge['":\s]*['"]\s*([^'"]+)['"]/gi,
  /device_code['":\s]*['"]\s*([^'"]+)['"]/gi,
  /user_code['":\s]*['"]\s*([^'"]+)['"]/gi,
  /verification_uri['":\s]*['"]\s*([^'"]+)['"]/gi,
  /verification_uri_complete['":\s]*['"]\s*([^'"]+)['"]/gi,

  // Provider credentials and identifiers
  /app_secret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /appSecret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /tenant_id['":\s]*['"]\s*([^'"]+)['"]/gi,
  /tenantId['":\s]*['"]\s*([^'"]+)['"]/gi,
  /client_id['":\s]*['"]\s*([^'"]+)['"]/gi,
  /clientId['":\s]*['"]\s*([^'"]+)['"]/gi,
  /app_id['":\s]*['"]\s*([^'"]+)['"]/gi,
  /appId['":\s]*['"]\s*([^'"]+)['"]/gi,
  /redirect_uri['":\s]*['"]\s*([^'"]+)['"]/gi,
  /redirectUri['":\s]*['"]\s*([^'"]+)['"]/gi,
  /subscription_key['":\s]*['"]\s*([^'"]+)['"]/gi,
  /subscriptionKey['":\s]*['"]\s*([^'"]+)['"]/gi,

  // Security secrets and keys
  /webhook_secret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /webhookSecret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /signing_secret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /signingSecret['":\s]*['"]\s*([^'"]+)['"]/gi,
  /encryption_key['":\s]*['"]\s*([^'"]+)['"]/gi,
  /encryptionKey['":\s]*['"]\s*([^'"]+)['"]/gi,
  /private_key['":\s]*['"]\s*([^'"]+)['"]/gi,
  /privateKey['":\s]*['"]\s*([^'"]+)['"]/gi,
  /certificate['":\s]*['"]\s*([^'"]+)['"]/gi,
  /cert['":\s]*['"]\s*([^'"]+)['"]/gi,

  // Authorization headers
  /Authorization['":\s]*['"]\s*Bearer\s+([^'"]+)['"]/gi,
  /authorization['":\s]*['"]\s*Bearer\s+([^'"]+)['"]/gi,
  /Bearer\s+([A-Za-z0-9+/=\-_.]+)/gi,
  /Authorization:\s*Bearer\s+([A-Za-z0-9+/=\-_.]+)/gi,
  /[A-Z_]+_(SECRET|KEY|TOKEN|PASSWORD)['":\s]*['"]\s*([^'"]+)['"]/gi,

  // Session and CSRF tokens
  /\bnonce['":\s]*['"]\s*([^'"]+)['"]/gi,
  /session[_-]?id['":\s]*['"]\s*([^'"]+)['"]/gi,
  /csrf[_-]?token['":\s]*['"]\s*([^'"]+)['"]/gi,

  // Other sensitive patterns
  /"email"\s*:\s*"([^@"]{1,64}@[^."]{1,63}\.[a-z]{2,6})"/gi,
  /api[_-]?key['":\s]*['"]\s*([^'"]+)['"]/gi,
  /password['":\s]*['"]\s*([^'"]+)['"]/gi,
  /\b(ey[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=\-_]+)/g,

  // Base64 secrets (split into length ranges for practical matching)
  /\b([A-Za-z0-9+/]{60,200}={0,2})\b/g,
  /\b([A-Za-z0-9+/]{201,1000}={0,2})\b/g,
  /\b([A-Za-z0-9+/]{1001,5000}={0,2})\b/g,

  // Connection identifiers
  /connection[_-]?id['":\s]*['"]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]/gi,
];

/** Field names that should be redacted when found as object keys */
const SENSITIVE_FIELDS = new Set([
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'client_secret',
  'clientSecret',
  'id_token',
  'idToken',
  'code',
  'authorization_code',
  'authorizationCode',
  'device_code',
  'deviceCode',
  'user_code',
  'userCode',
  'verification_uri',
  'verificationUri',
  'verification_uri_complete',
  'verificationUriComplete',
  'client_id',
  'clientId',
  'app_id',
  'appId',
  'app_secret',
  'appSecret',
  'tenant_id',
  'tenantId',
  'bot_id',
  'botId',
  'workspace_id',
  'workspaceId',
  'organization_id',
  'organizationId',
  'redirect_uri',
  'redirectUri',
  'audience',
  'realm',
  'domain',
  'webhook_secret',
  'webhookSecret',
  'signing_secret',
  'signingSecret',
  'subscription_key',
  'subscriptionKey',
  'encryption_key',
  'encryptionKey',
  'private_key',
  'privateKey',
  'certificate',
  'cert',
  'stripe-signature',
  'x-hub-signature',
  'x-hub-signature-256',
  'x-slack-signature',
  'x-mcp-z-webhook-secret',
  'password',
  'secret',
  'token',
  'authorization',
  'credential',
  'auth',
  'verifier',
  'challenge',
  'code_verifier',
  'codeVerifier',
  'code_challenge',
  'codeChallenge',
  'nonce',
  'session_id',
  'sessionId',
  'csrf_token',
  'csrfToken',
  'api_key',
  'apiKey',
  'state',
  'connection_id',
  'connectionId',
  'gmail_connection_id',
  'gmailConnectionId',
]);

function isAlreadySanitized(value: string): boolean {
  return value.includes('****') || value.includes('[REDACTED]') || value === '[REDACTED]';
}

function redactValue(value: string): string {
  if (isAlreadySanitized(value)) {
    return value;
  }

  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }

  // Show first 4 and last 4 characters
  return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
}

export function sanitizeData(data: unknown): unknown {
  if (typeof data === 'string') {
    if (isAlreadySanitized(data)) {
      return data;
    }

    let sanitized = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, (match, captured) => {
        if (typeof captured === 'string') {
          const redacted = redactValue(captured);
          return match.replace(captured, redacted);
        }
        return match;
      });
    }

    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  if (data && typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      if (SENSITIVE_FIELDS.has(lowerKey) || SENSITIVE_FIELDS.has(key)) {
        if (typeof value === 'string') {
          sanitized[key] = redactValue(value);
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeData(value);
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Prevent log injection attacks by escaping control characters
 * SECURITY: Critical for preventing CRLF injection (OWASP A03)
 */
export function sanitizeLogMessage(message: string, maxLength = 50000): string {
  if (typeof message !== 'string') {
    return String(message);
  }

  // Truncation protection - prevent log poisoning via huge payloads
  let processedMessage = message;
  if (processedMessage.length > maxLength) {
    processedMessage = `${processedMessage.substring(0, maxLength)} [TRUNCATED]`;
  }

  return (
    processedMessage
      .normalize('NFKC')
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/\t/g, ' ')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Security sanitization requires control character removal
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars used for obfuscation
      .trim()
  );
}

/**
 * Sanitize log message and metadata for safe logging
 * Applies both CRLF protection and sensitive data redaction
 *
 * @param message - The log message to sanitize
 * @param meta - Optional metadata object to sanitize
 * @param enableDataSanitization - Whether to apply sensitive data redaction (default: true)
 * @returns Sanitized message and metadata ready for logging
 */
export function sanitizeForLogging(message: string, meta?: Record<string, unknown>, enableDataSanitization = true): { message: string; meta: Record<string, unknown> } {
  const cleanMessage = sanitizeLogMessage(message);

  if (!enableDataSanitization) {
    return {
      message: cleanMessage,
      meta: meta || {},
    };
  }

  return {
    message: sanitizeData(cleanMessage) as string,
    meta: sanitizeData(meta || {}) as Record<string, unknown>,
  };
}

export function sanitizeForLoggingFormatter() {
  return {
    log: (obj) => {
      const message = (obj.msg || obj.message || '') as string;
      const { message: clean, meta } = sanitizeForLogging(message, obj as Record<string, unknown>);
      return { ...meta, msg: clean };
    },
  };
}

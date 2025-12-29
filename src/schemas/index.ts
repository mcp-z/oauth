/**
 * OAuth-specific schemas and response builders
 *
 * Provider-agnostic schemas and utilities for building OAuth auth_required responses.
 * Individual OAuth packages (oauth-google, oauth-microsoft) wrap these with provider-specific defaults.
 */

import { z } from 'zod';

// Re-export z for use in middleware (MCP requires zod)
export type { z };

/**
 * Authentication required response type
 */
export interface AuthRequired {
  type: 'auth_required';
  provider: string;
  message: string;
  url: string;
  flow?: string;
  instructions: string;
  user_code?: string;
  expires_in?: number;
  accountId?: string;
}

/**
 * Zod schema for auth_required responses
 */
export const AuthRequiredSchema = z
  .object({
    type: z.literal('auth_required'),
    provider: z.string().describe('OAuth provider name (e.g., "google", "microsoft")'),
    message: z.string().describe('Human-readable message explaining why auth is needed'),
    url: z.string().url().describe('Authentication URL to open in browser'),
    flow: z.string().optional().describe('Authentication flow type (e.g., "auth_url", "device_code")'),
    instructions: z.string().describe('Clear instructions for the user'),
    user_code: z.string().optional().describe('Code user must enter at verification URL (device flows only)'),
    expires_in: z.number().optional().describe('Seconds until code expires (device flows only)'),
    accountId: z.string().optional().describe('Account identifier (email) that requires authentication'),
  })
  .describe('Authentication required with clear actionable instructions for user');

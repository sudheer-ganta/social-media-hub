import axios, { AxiosError } from 'axios';
import { ProviderError } from '../provider.interface';
import { linkedinConfig } from './config';
import type {
  LinkedInAccessToken,
  LinkedInTokenRequest,
  LinkedInTokenResponse,
} from './types';

/**
 * Step 2 of the callback: turn the one-time authorization code into an access
 * token.
 *
 * Lives here rather than in the route so the HTTP call to LinkedIn stays inside
 * the provider layer. This module knows LinkedIn's wire format and nothing
 * about Prisma, repositories or our tables.
 */

/** LinkedIn is fast; a hung socket should not hold the member's browser open. */
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Exchanges `code` for an access token.
 *
 * Throws {@link ProviderError} on any failure. The message is written for the
 * server log — the caller redirects the browser to `status=failed` and never
 * echoes it, because LinkedIn's error bodies can quote the request back at us.
 */
export async function exchangeAuthorizationCode(
  code: string,
): Promise<LinkedInAccessToken> {
  const form: LinkedInTokenRequest = {
    grant_type: 'authorization_code',
    code,
    // Must be byte-identical to the redirect_uri sent on the authorization
    // request, or LinkedIn rejects the exchange with invalid_grant.
    redirect_uri: linkedinConfig.redirectUri,
    client_id: linkedinConfig.clientId,
    client_secret: linkedinConfig.clientSecret,
  };

  let response: { data: LinkedInTokenResponse };
  try {
    response = await axios.post<LinkedInTokenResponse>(
      linkedinConfig.tokenUrl,
      // URLSearchParams gives us the x-www-form-urlencoded body LinkedIn
      // requires; it rejects a JSON payload outright.
      new URLSearchParams(form as unknown as Record<string, string>).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: TOKEN_REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw new ProviderError(
      `LinkedIn token exchange failed: ${describeAxiosError(error)}`,
      502,
      'linkedin',
    );
  }

  const token = response.data;
  if (!token?.access_token) {
    throw new ProviderError(
      'LinkedIn token exchange returned no access_token',
      502,
      'linkedin',
    );
  }

  return {
    accessToken: token.access_token,
    // Captured if LinkedIn volunteered one, null otherwise — which is the
    // common case. Nothing in this sprint refreshes with it; storing it now
    // just means the column is already populated when something does.
    refreshToken: token.refresh_token ?? null,
    expiresAt:
      typeof token.expires_in === 'number' && token.expires_in > 0
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
    scope: token.scope ?? null,
  };
}

/**
 * Builds a log-safe description of a failed request.
 *
 * Only the status and LinkedIn's own `error` / `error_description` fields are
 * kept. The full response body is deliberately dropped: on some failures
 * LinkedIn echoes the request parameters, which would put the authorization
 * code — and in a misconfiguration, the client secret — into our logs.
 */
function describeAxiosError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const axiosError = error as AxiosError<{
    error?: string;
    error_description?: string;
  }>;
  const status = axiosError.response?.status ?? 'no response';
  const body = axiosError.response?.data;
  const detail =
    [body?.error, body?.error_description].filter(Boolean).join(' — ') ||
    axiosError.code ||
    axiosError.message;

  return `HTTP ${status} (${detail})`;
}

export const linkedinTokenService = { exchangeAuthorizationCode };

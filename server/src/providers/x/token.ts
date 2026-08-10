import axios from 'axios';
import { ProviderError } from '../provider.interface';
import { xConfig } from './config';
import { REQUEST_TIMEOUT_MS, basicAuthHeader, toProviderError } from './http';
import type {
  XAccessToken,
  XRefreshRequest,
  XTokenRequest,
  XTokenResponse,
} from './types';

/**
 * Code → token, and refresh_token → token.
 *
 * Both grants hit the same endpoint with the same content type and the same
 * Basic auth header, so they share `postTokenRequest` — the difference between
 * them is entirely in the form body.
 *
 * ─── Why refresh is implemented here and not deferred ───────────────────────
 *
 * X access tokens last **two hours**. LinkedIn's last sixty days and Instagram's
 * are extended by presenting themselves, which is why neither provider has a
 * refresh path yet. Two hours means a connection made in the morning cannot
 * publish in the afternoon, so refreshing is part of X working at all, not an
 * optimisation.
 *
 * X rotates the refresh token on every use: the response carries a *new*
 * `refresh_token` and the one just presented stops working. Failing to store the
 * new one bricks the connection on the following refresh, so
 * {@link refreshAccessToken} always returns what it was given back.
 */

/**
 * Exchanges the authorization code for an access token.
 *
 * `codeVerifier` is the PKCE half that travelled in the signed state cookie. X
 * verifies it against the `code_challenge` sent at authorization time; a
 * mismatch is an `invalid_grant`.
 *
 * Throws {@link ProviderError} on any failure. The message is written for the
 * server log — the caller redirects the browser to `status=failed` and never
 * echoes it.
 */
export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<XAccessToken> {
  const form: XTokenRequest = {
    grant_type: 'authorization_code',
    code,
    // Must be byte-identical to the redirect_uri sent on the authorization
    // request, or X rejects the exchange.
    redirect_uri: xConfig.redirectUri,
    client_id: xConfig.clientId,
    code_verifier: codeVerifier,
  };

  return normalise(await postTokenRequest(form, 'token exchange'));
}

/**
 * Trades a refresh token for a fresh access token.
 *
 * Returns the rotated refresh token X issues, falling back to the one presented
 * when X omits it — losing it would leave a connection that can never refresh
 * again, and a stale-but-present value is at worst rejected next time.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<XAccessToken> {
  const form: XRefreshRequest = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: xConfig.clientId,
  };

  const token = normalise(await postTokenRequest(form, 'token refresh'));
  return { ...token, refreshToken: token.refreshToken ?? refreshToken };
}

/** The shared leg: form-encoded POST, Basic auth, no logging of the body. */
async function postTokenRequest(
  form: XTokenRequest | XRefreshRequest,
  step: string,
): Promise<XTokenResponse> {
  try {
    const response = await axios.post<XTokenResponse>(
      xConfig.tokenUrl,
      // URLSearchParams gives us the x-www-form-urlencoded body X requires; it
      // rejects a JSON payload outright.
      new URLSearchParams(form as unknown as Record<string, string>).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Confidential client. The secret travels in this header and nowhere
          // else — never in the body, never in a log.
          Authorization: basicAuthHeader(xConfig.clientId, xConfig.clientSecret),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return response.data;
  } catch (error) {
    // toProviderError reads X's `error_description` for the log and drops the
    // request body, which holds the code, the verifier and nothing we want kept.
    throw toProviderError(error, step);
  }
}

/** X's token payload as the provider-neutral shape the service layer takes. */
function normalise(token: XTokenResponse | undefined): XAccessToken {
  if (!token?.access_token) {
    throw new ProviderError('X token response contained no access_token', 502, 'x');
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt:
      typeof token.expires_in === 'number' && token.expires_in > 0
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
    scope: token.scope ?? null,
  };
}

export const xTokenService = { exchangeAuthorizationCode, refreshAccessToken };

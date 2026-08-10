import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { facebookConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type {
  FacebookDebugTokenResponse,
  FacebookPermissionsResponse,
  FacebookTokenResponse,
  FacebookUserAccessToken,
} from './types';

/**
 * Step 2 of the callback: code → long-lived **user** token.
 *
 * Three calls, and all three are needed:
 *
 *   1. `GET /{version}/oauth/access_token` with the code → a short-lived user
 *      token (a couple of hours).
 *   2. the same endpoint with `grant_type=fb_exchange_token` → a **long-lived**
 *      user token, about 60 days.
 *   3. `GET /me/permissions` → what the member actually granted.
 *
 * Call 2 is not optional, and it is the reason this file exists rather than a
 * one-liner. A Page access token inherits the lifetime of the user token it was
 * minted from: ask `/me/accounts` with a short-lived token and you get Page
 * tokens that die in an hour or two; ask with a long-lived one and you get Page
 * tokens that **do not expire at all**. Getting this order wrong produces a
 * connection that works all the way through testing and is dead the next
 * morning — see `pages.ts`, which is deliberately only ever called with the
 * result of this function.
 *
 * Call 3 exists because Facebook, unlike Instagram's Business Login, does not
 * tell you what was granted alongside the token. A member can untick "Manage
 * your Pages" on the consent screen and still complete the flow, so without
 * this read `social_accounts.scopes` would record what we *asked* for and the
 * "publishing disabled" card would never appear.
 */

/**
 * Exchanges the authorization code for a long-lived user access token.
 *
 * Throws {@link ProviderError} on any failure. The message is written for the
 * server log — the caller redirects the browser to `status=failed` and never
 * echoes it, because Meta's error bodies can quote our request back at us.
 */
export async function exchangeAuthorizationCode(
  code: string,
): Promise<FacebookUserAccessToken> {
  const shortLived = await exchangeForShortLivedToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived);

  return {
    accessToken: longLived.accessToken,
    expiresAt: longLived.expiresAt,
    scope: await readGrantedScopes(longLived.accessToken),
  };
}

/** Leg 1 — the short-lived user token. */
async function exchangeForShortLivedToken(code: string): Promise<string> {
  let response: { data: FacebookTokenResponse };
  try {
    response = await axios.get<FacebookTokenResponse>(facebookConfig.tokenUrl, {
      // Meta's convention on this endpoint is credentials in the query string.
      // Nothing logs a Graph URL — see `http.ts`.
      params: {
        client_id: facebookConfig.appId,
        client_secret: facebookConfig.appSecret,
        // Must be byte-identical to the redirect_uri sent on the authorization
        // request, or Meta rejects the exchange.
        redirect_uri: facebookConfig.redirectUri,
        code,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw toProviderError(error, 'token exchange');
  }

  const token = response.data?.access_token;
  if (!token) {
    throw new ProviderError(
      'Facebook token exchange returned no access_token',
      502,
      'facebook',
    );
  }

  return token;
}

/**
 * Leg 2 — the ~60-day user token.
 *
 * The one call that makes Page tokens permanent. See the header note.
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  let response: { data: FacebookTokenResponse };
  try {
    response = await axios.get<FacebookTokenResponse>(facebookConfig.tokenUrl, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: facebookConfig.appId,
        client_secret: facebookConfig.appSecret,
        fb_exchange_token: shortLivedToken,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw toProviderError(error, 'long-lived token exchange');
  }

  const token = response.data?.access_token;
  if (!token) {
    throw new ProviderError(
      'Facebook long-lived token exchange returned no access_token',
      502,
      'facebook',
    );
  }

  return {
    accessToken: token,
    expiresAt:
      typeof response.data.expires_in === 'number' && response.data.expires_in > 0
        ? new Date(Date.now() + response.data.expires_in * 1000)
        : null,
  };
}

/**
 * Leg 3 — what the member actually granted, comma-delimited.
 *
 * Never throws. A connection whose permissions could not be read is still a
 * usable connection: an empty scope list reads downstream as "unknown, let Meta
 * be the authority" rather than "nothing granted" — see `validator.canPublish`.
 * Failing the whole connect because a bookkeeping read timed out would be a
 * worse answer than a card that cannot pre-empt a permission error.
 */
export async function readGrantedScopes(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await axios.get<FacebookPermissionsResponse>(
      `${facebookConfig.graphUrl}/me/permissions`,
      { params: { access_token: accessToken }, timeout: REQUEST_TIMEOUT_MS },
    );

    const granted = (response.data?.data ?? [])
      .filter((entry) => entry?.status === 'granted' && entry.permission)
      .map((entry) => entry.permission as string);

    return granted.length > 0 ? granted.join(',') : null;
  } catch (error) {
    console.warn('[facebook] granted permissions could not be read', {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * Diagnostic — logs the token's *granular* scopes, never the token.
 *
 * Under Facebook Login for Business a permission is granted against a set of
 * assets chosen in the dialog, and `/me/permissions` cannot show that: it
 * reports `pages_show_list: granted` identically whether the member selected
 * every Page or none. `debug_token` is the only endpoint that returns the
 * `target_ids` behind each permission, which is the difference between "the app
 * was not allowed to read Pages" and "the app was allowed to read a set of
 * Pages that is empty" — the two causes of a 200 with `data: []`.
 *
 * Safe to log, and nothing else is: permission names, the Page ids the member
 * selected, the app id, validity and expiry. The token, the secret and the
 * `debug_token` URL (which carries both) never appear.
 *
 * Never throws, for the same reason `readGrantedScopes` does not — a connection
 * must not fail because a diagnostic read did.
 */
export async function logGranularScopes(accessToken: string): Promise<void> {
  try {
    const response = await axios.get<FacebookDebugTokenResponse>(
      `${facebookConfig.graphUrl}/debug_token`,
      {
        params: {
          input_token: accessToken,
          // The app access token. Meta's convention on this endpoint; it is the
          // only credential that may inspect our own tokens.
          access_token: `${facebookConfig.appId}|${facebookConfig.appSecret}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const data = response.data?.data;

    console.log('[facebook] token debug', {
      appId: data?.app_id ?? null,
      isValid: data?.is_valid ?? null,
      // 0 means "never expires", which is what a Page token minted from this
      // one inherits. Rendered as a date so it is readable next to the rest.
      expiresAt:
        typeof data?.expires_at === 'number'
          ? data.expires_at === 0
            ? 'never'
            : new Date(data.expires_at * 1000).toISOString()
          : null,
      // The answer. An entry whose `targetIds` is null or empty is a permission
      // granted over no assets — the app may read Pages, and there are no Pages
      // it may read.
      granularScopes:
        data?.granular_scopes?.map((entry) => ({
          scope: entry.scope ?? null,
          targetIds: entry.target_ids ?? null,
        })) ?? null,
    });
  } catch (error) {
    console.warn('[facebook] token debug could not be read', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

export const facebookTokenService = {
  exchangeAuthorizationCode,
  readGrantedScopes,
};

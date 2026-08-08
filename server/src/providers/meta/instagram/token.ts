import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { instagramConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type {
  InstagramAccessToken,
  InstagramLongLivedTokenResponse,
  InstagramTokenPayload,
  InstagramTokenRequest,
  InstagramTokenResponse,
} from './types';

/**
 * Step 2 of the callback: code → token.
 *
 * Instagram's exchange is two calls, not one, and both are mandatory:
 *
 *   1. `POST api.instagram.com/oauth/access_token` gives a **short-lived** token
 *      that expires in **one hour**.
 *   2. `GET graph.instagram.com/access_token?grant_type=ig_exchange_token`
 *      upgrades it to a **long-lived** token good for **60 days**.
 *
 * Doing only the first would produce a connection that works during testing and
 * is dead by the time anyone publishes with it — the kind of bug that looks
 * like an intermittent outage. So the upgrade happens inline, here, before the
 * account is ever stored.
 */

/**
 * Exchanges the authorization code for a long-lived Instagram User access token.
 *
 * Throws {@link ProviderError} on any failure. The message is written for the
 * server log — the caller redirects the browser to `status=failed` and never
 * echoes it, because Meta's error bodies can quote our request back at us.
 */
export async function exchangeAuthorizationCode(
  code: string,
): Promise<InstagramAccessToken> {
  const shortLived = await exchangeForShortLivedToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token);

  return {
    accessToken: longLived.accessToken,
    // Instagram has no refresh-token grant; a long-lived token is extended by
    // presenting itself. See the note on InstagramAccessToken.
    refreshToken: null,
    expiresAt: longLived.expiresAt,
    scope: toScopeString(shortLived.permissions),
    userId:
      shortLived.user_id !== undefined && shortLived.user_id !== null
        ? String(shortLived.user_id)
        : null,
  };
}

/**
 * Meta's `permissions` as the delimited `scope` string the service layer is
 * typed for.
 *
 * Business Login answers with an array; OAuth 2.0 and LinkedIn answer with one
 * space-delimited string. That disagreement is a Meta detail and it stops here —
 * everything downstream of {@link InstagramAccessToken} is provider-neutral, so
 * translating the network's shape into the shared contract is this layer's job.
 * Letting the array through is what produced `scope.split is not a function` in
 * the callback.
 *
 * Comma-delimited out because that is Meta's own convention for these lists, and
 * `parseScopes` accepts commas and spaces alike. Non-string entries are dropped
 * rather than coerced: a `["a", null]` would otherwise stringify to `"a,null"`
 * and record a permission nobody granted.
 */
export function toScopeString(
  permissions: string | string[] | undefined,
): string | null {
  if (typeof permissions === 'string') return permissions || null;
  if (!Array.isArray(permissions)) return null;

  const granted = permissions.filter(
    (permission): permission is string =>
      typeof permission === 'string' && permission.length > 0,
  );

  return granted.length > 0 ? granted.join(',') : null;
}

/** Leg 1 — the one-hour token, plus the granted permissions and user id. */
async function exchangeForShortLivedToken(
  code: string,
): Promise<InstagramTokenPayload> {
  const form: InstagramTokenRequest = {
    client_id: instagramConfig.appId,
    client_secret: instagramConfig.appSecret,
    grant_type: 'authorization_code',
    // Must be byte-identical to the redirect_uri sent on the authorization
    // request, or Meta rejects the exchange.
    redirect_uri: instagramConfig.redirectUri,
    code,
  };

  let response: { data: InstagramTokenResponse };
  try {
    response = await axios.post<InstagramTokenResponse>(
      instagramConfig.tokenUrl,
      // Form-encoded; this endpoint rejects a JSON payload.
      new URLSearchParams(form as unknown as Record<string, string>).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'token exchange');
  }

  const payload = readTokenPayload(response.data);
  if (!payload?.access_token) {
    throw new ProviderError(
      'Instagram token exchange returned no access_token',
      502,
      'instagram',
    );
  }

  return payload;
}

/**
 * Reads the token payload out of either response shape.
 *
 * Meta's current Business Login documentation shows `{ data: [ { … } ] }`,
 * while the endpoint has historically answered with the same fields flat at the
 * top level. Which one a given app gets is not something we can determine from
 * our side, and guessing wrong is a Connect button that never works — so both
 * are accepted. The wrapped form is checked first because it is what the docs
 * currently specify.
 */
function readTokenPayload(
  body: InstagramTokenResponse | undefined,
): InstagramTokenPayload | null {
  if (!body) return null;

  const wrapped = Array.isArray(body.data) ? body.data[0] : undefined;
  if (wrapped?.access_token) return wrapped;

  return body.access_token ? (body as InstagramTokenPayload) : null;
}

/** Leg 2 — the 60-day token. */
async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  let response: { data: InstagramLongLivedTokenResponse };
  try {
    response = await axios.get<InstagramLongLivedTokenResponse>(
      instagramConfig.longLivedTokenUrl,
      {
        // Meta's convention is credentials in the query string on this
        // endpoint. Nothing logs a Graph URL — see `http.ts`.
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: instagramConfig.appSecret,
          access_token: shortLivedToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'long-lived token exchange');
  }

  const token = response.data;
  if (!token?.access_token) {
    throw new ProviderError(
      'Instagram long-lived token exchange returned no access_token',
      502,
      'instagram',
    );
  }

  return {
    accessToken: token.access_token,
    expiresAt:
      typeof token.expires_in === 'number' && token.expires_in > 0
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
  };
}

export const instagramTokenService = { exchangeAuthorizationCode };

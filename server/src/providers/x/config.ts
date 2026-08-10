import { env } from '../../config/env';
import type { XScope } from './types';

/**
 * Where we send the member, what we ask for, and which hosts answer.
 *
 * Every value comes from the environment or from a documented X constant;
 * nothing here is a literal credential.
 *
 * ─── Why this looks different from LinkedIn and Meta ────────────────────────
 *
 * X is the first provider on **OAuth 2.0 Authorization Code with PKCE**. Two
 * consequences run through this folder:
 *
 *  1. Every authorization request carries a `code_challenge`, and the matching
 *     `code_verifier` has to survive the redirect. It rides in the same signed
 *     state cookie the other providers already use — see `x-state.ts`.
 *  2. The token endpoint authenticates a confidential client with HTTP Basic,
 *     not with `client_secret` in the form body. Sending the secret as a form
 *     field is answered with an unhelpful 401.
 */

/** The member-facing consent screen. `x.com`, not `api.x.com`. */
export const X_AUTHORIZATION_URL = 'https://x.com/i/oauth2/authorize';

/** Code → token, and refresh_token → token. Form-encoded POST, Basic auth. */
export const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

/** Token revocation, used by nothing yet — named so the gap is deliberate. */
export const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';

/** API host. Versioned by path segment, not by header or query parameter. */
export const X_API_HOST = 'https://api.x.com';

/**
 * The API major version. Everything FlowPost calls lives under it:
 * `/2/users/me`, `/2/tweets`.
 */
export const X_API_VERSION = env.X_API_VERSION;

/** Versioned base, e.g. `https://api.x.com/2`. */
export const X_API_URL = `${X_API_HOST}/${X_API_VERSION}`;

/**
 * The permissions FlowPost asks for.
 *
 *  - `tweet.read`     — required by `users.read`; X rejects the pair separated
 *  - `tweet.write`    — create posts
 *  - `users.read`     — read the connected account's own profile
 *  - `offline.access` — issue a refresh token
 *
 * `offline.access` is not optional for us. Without it X returns an access token
 * good for **two hours** and no way to renew it, which is a connection that
 * works during testing and is dead before anything is scheduled.
 */
export const X_SCOPES: XScope[] = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
];

/** X wants scopes space-delimited, like LinkedIn — Meta wants commas. */
export const X_SCOPE_STRING = X_SCOPES.join(' ');

/** The scope a connection must actually hold to publish. */
export const X_PUBLISH_SCOPE = 'tweet.write';

/** How long a minted OAuth state stays valid. */
export const X_STATE_TTL_MS = 10 * 60 * 1000;

/** From the Developer Portal's User authentication settings. */
export const X_CLIENT_ID = env.X_CLIENT_ID;

/** Never logged, never sent anywhere but X's token endpoint. */
export const X_CLIENT_SECRET = env.X_CLIENT_SECRET;

/**
 * Must match a Callback URI registered on the app, character for character —
 * including the trailing slash or its absence.
 *
 * Read from the environment and never derived from request headers: a redirect
 * URI computed from `Host` or `X-Forwarded-Host` is attacker-controlled, and
 * the token exchange has to send back a byte-identical value anyway.
 */
export const X_REDIRECT_URI = env.X_REDIRECT_URI;

/**
 * Fails fast when the app is misconfigured. Called at the top of `connect()`
 * rather than at import time so a missing X credential breaks the X route only,
 * not the whole server boot.
 */
export function assertXConfigured(): void {
  const missing: string[] = [];
  if (!X_CLIENT_ID) missing.push('X_CLIENT_ID');
  if (!X_REDIRECT_URI) missing.push('X_REDIRECT_URI');
  // Checked at connect rather than only at callback: a connect that cannot
  // possibly be completed should fail before we send the member to X.
  if (!X_CLIENT_SECRET) missing.push('X_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(`X OAuth is not configured. Missing: ${missing.join(', ')}`);
  }
}

export const xConfig = {
  authorizationUrl: X_AUTHORIZATION_URL,
  tokenUrl: X_TOKEN_URL,
  revokeUrl: X_REVOKE_URL,
  apiUrl: X_API_URL,
  apiVersion: X_API_VERSION,
  clientId: X_CLIENT_ID,
  clientSecret: X_CLIENT_SECRET,
  redirectUri: X_REDIRECT_URI,
  scopes: X_SCOPES,
  scopeString: X_SCOPE_STRING,
  publishScope: X_PUBLISH_SCOPE,
  stateTtlMs: X_STATE_TTL_MS,
};

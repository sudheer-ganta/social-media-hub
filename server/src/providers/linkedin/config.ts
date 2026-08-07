import { env } from '../../config/env';
import type { LinkedInScope } from './types';

/**
 * Everything about *where* we send the user and *what* we ask for. Values come
 * from the environment so the same build works against a dev app and a
 * production app; nothing here is a literal credential.
 */

/** LinkedIn's OAuth 2.0 authorization endpoint (member authorization). */
export const LINKEDIN_AUTHORIZATION_URL =
  'https://www.linkedin.com/oauth/v2/authorization';

/** LinkedIn's OAuth 2.0 token endpoint — swaps an authorization code for a token. */
export const LINKEDIN_TOKEN_URL =
  'https://www.linkedin.com/oauth/v2/accessToken';

/**
 * The OpenID Connect userinfo endpoint. This is the profile endpoint the
 * products we're enabled for actually grant: `openid` + `profile` from
 * "Sign In with LinkedIn using OpenID Connect". The older `/v2/me` endpoint
 * needs `r_liteprofile`, which those products do not include.
 */
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export const LINKEDIN_CLIENT_ID = env.LINKEDIN_CLIENT_ID;

/** Never logged, never sent anywhere but LinkedIn's token endpoint. */
export const LINKEDIN_CLIENT_SECRET = env.LINKEDIN_CLIENT_SECRET;

/** Must match a redirect URL registered on the LinkedIn app, character for character. */
export const LINKEDIN_REDIRECT_URI = env.LINKEDIN_REDIRECT_URI;

/**
 * Only the scopes our LinkedIn products actually grant:
 *
 *  - `openid` + `profile` — Sign In with LinkedIn using OpenID Connect
 *  - `w_member_social`    — Share on LinkedIn, posting as the member
 *
 * Asking for anything the app is not approved for makes LinkedIn reject the
 * whole authorization request with `unauthorized_scope_error`, so this list
 * stays in step with the products enabled on the app.
 */
export const LINKEDIN_SCOPES: LinkedInScope[] = [
  'openid',
  'profile',
  'w_member_social',
];

/** LinkedIn wants scopes space-delimited in the query string. */
export const LINKEDIN_SCOPE_STRING = LINKEDIN_SCOPES.join(' ');

/** How long a minted OAuth state stays valid. Ten minutes is LinkedIn's own window. */
export const LINKEDIN_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Fails fast when the app is misconfigured. Called at the top of `connect()`
 * rather than at import time so a missing LinkedIn credential breaks the
 * LinkedIn route only, not the whole server boot.
 */
export function assertLinkedInConfigured(): void {
  const missing: string[] = [];
  if (!LINKEDIN_CLIENT_ID) missing.push('LINKEDIN_CLIENT_ID');
  if (!LINKEDIN_REDIRECT_URI) missing.push('LINKEDIN_REDIRECT_URI');
  // Checked here rather than only in the callback: a connect that cannot
  // possibly be completed should fail before we send the member to LinkedIn.
  if (!LINKEDIN_CLIENT_SECRET) missing.push('LINKEDIN_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `LinkedIn OAuth is not configured. Missing: ${missing.join(', ')}`,
    );
  }
}

export const linkedinConfig = {
  authorizationUrl: LINKEDIN_AUTHORIZATION_URL,
  tokenUrl: LINKEDIN_TOKEN_URL,
  userinfoUrl: LINKEDIN_USERINFO_URL,
  clientId: LINKEDIN_CLIENT_ID,
  clientSecret: LINKEDIN_CLIENT_SECRET,
  redirectUri: LINKEDIN_REDIRECT_URI,
  scopes: LINKEDIN_SCOPES,
  scopeString: LINKEDIN_SCOPE_STRING,
  stateTtlMs: LINKEDIN_STATE_TTL_MS,
};

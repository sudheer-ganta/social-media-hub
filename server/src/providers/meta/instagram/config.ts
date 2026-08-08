import { env } from '../../../config/env';
import { META_API_VERSION } from '../config';
import type { InstagramScope } from './types';

/**
 * Where we send the member, what we ask for, and which hosts answer.
 *
 * Every value comes from the environment or from a documented Meta constant;
 * nothing here is a literal credential. See `providers/meta/config.ts` for why
 * this is the *Instagram Login* model and not the Facebook Login one.
 */

/**
 * Business Login for Instagram — the member-facing consent screen.
 *
 * Note the host: `www.instagram.com`, not `api.instagram.com` and not
 * `facebook.com`. The authorization leg and the token leg live on different
 * hosts in this model, which is unusual enough to be worth stating.
 */
export const INSTAGRAM_AUTHORIZATION_URL =
  'https://www.instagram.com/oauth/authorize';

/**
 * Swaps the one-time authorization code for a *short-lived* Instagram User
 * access token. Form-encoded POST; a JSON body is rejected.
 */
export const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

/**
 * The Graph host for Instagram Login. Every read and publish call goes here.
 *
 * Not `graph.facebook.com` — that is the Facebook Login model's host, and an
 * Instagram User access token is not valid against it.
 */
export const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';

/** Versioned base for node and edge requests, e.g. `…/v25.0/me`. */
export const INSTAGRAM_GRAPH_URL = `${INSTAGRAM_GRAPH_HOST}/${META_API_VERSION}`;

/**
 * Turns a short-lived token (1 hour) into a long-lived one (60 days).
 *
 * Deliberately unversioned — Meta documents this endpoint at the host root.
 * Called immediately after the code exchange: a connection that stopped working
 * an hour after it was made would look like a bug to every member who hit it.
 */
export const INSTAGRAM_LONG_LIVED_TOKEN_URL = `${INSTAGRAM_GRAPH_HOST}/access_token`;

/**
 * Extends an unexpired long-lived token by another 60 days.
 *
 * Not called anywhere yet — nothing in this sprint runs on a schedule. It is
 * named here because it is the one piece of the token lifecycle a reader will
 * look for, and its absence should be a documented gap rather than an
 * apparent oversight. Meta requires the token to be at least 24 hours old and
 * not yet expired, so a refresh job has a real window to work in.
 */
export const INSTAGRAM_REFRESH_TOKEN_URL = `${INSTAGRAM_GRAPH_HOST}/refresh_access_token`;

/**
 * The permissions Business Login for Instagram grants.
 *
 * Only what FlowPost actually uses today:
 *
 *  - `instagram_business_basic`           — read the account's own profile, and
 *                                           the permission a token refresh
 *                                           requires
 *  - `instagram_business_content_publish` — create and publish media
 *
 * The app's use case also offers `instagram_business_manage_messages` and
 * `instagram_business_manage_comments`. Both are deliberately *not* requested:
 * asking for a permission the product does not use is a consent screen a member
 * is more likely to decline, and a scope we would have to justify at App Review
 * for a feature that does not exist.
 *
 * These are the values that replaced the older `business_basic` family, which
 * Meta deprecated on 27 January 2025.
 */
export const INSTAGRAM_SCOPES: InstagramScope[] = [
  'instagram_business_basic',
  'instagram_business_content_publish',
];

/**
 * Instagram wants scopes comma-delimited, where LinkedIn wants spaces. Getting
 * this wrong produces an authorization error that names no scope in particular.
 */
export const INSTAGRAM_SCOPE_STRING = INSTAGRAM_SCOPES.join(',');

/** The scope a connection must actually hold to publish. */
export const INSTAGRAM_PUBLISH_SCOPE = 'instagram_business_content_publish';

/** How long a minted OAuth state stays valid. */
export const INSTAGRAM_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * The Instagram App ID — **not** the Meta App ID.
 *
 * Both are shown in the App Dashboard and they are different numbers. Using the
 * Meta App ID here produces an authorization screen that fails with a generic
 * error, which is a genuinely hard misconfiguration to diagnose; hence the
 * naming here matching the dashboard's own label exactly.
 */
export const INSTAGRAM_APP_ID = env.INSTAGRAM_APP_ID;

/** Never logged, never sent anywhere but Meta's token endpoints. */
export const INSTAGRAM_APP_SECRET = env.INSTAGRAM_APP_SECRET;

/**
 * Must match a redirect URI registered under the app's Instagram Business Login
 * settings, character for character — including the trailing slash or its
 * absence.
 */
export const INSTAGRAM_REDIRECT_URI = env.INSTAGRAM_REDIRECT_URI;

/**
 * Fails fast when the app is misconfigured. Called at the top of `connect()`
 * rather than at import time so a missing Instagram credential breaks the
 * Instagram route only, not the whole server boot — and never LinkedIn.
 */
export function assertInstagramConfigured(): void {
  const missing: string[] = [];
  if (!INSTAGRAM_APP_ID) missing.push('INSTAGRAM_APP_ID');
  if (!INSTAGRAM_REDIRECT_URI) missing.push('INSTAGRAM_REDIRECT_URI');
  // Checked here rather than only in the callback: a connect that cannot
  // possibly be completed should fail before we send the member to Instagram.
  if (!INSTAGRAM_APP_SECRET) missing.push('INSTAGRAM_APP_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Instagram OAuth is not configured. Missing: ${missing.join(', ')}`,
    );
  }
}

export const instagramConfig = {
  authorizationUrl: INSTAGRAM_AUTHORIZATION_URL,
  tokenUrl: INSTAGRAM_TOKEN_URL,
  graphUrl: INSTAGRAM_GRAPH_URL,
  longLivedTokenUrl: INSTAGRAM_LONG_LIVED_TOKEN_URL,
  refreshTokenUrl: INSTAGRAM_REFRESH_TOKEN_URL,
  apiVersion: META_API_VERSION,
  appId: INSTAGRAM_APP_ID,
  appSecret: INSTAGRAM_APP_SECRET,
  redirectUri: INSTAGRAM_REDIRECT_URI,
  scopes: INSTAGRAM_SCOPES,
  scopeString: INSTAGRAM_SCOPE_STRING,
  publishScope: INSTAGRAM_PUBLISH_SCOPE,
  stateTtlMs: INSTAGRAM_STATE_TTL_MS,
};

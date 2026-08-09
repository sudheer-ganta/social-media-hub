import { env } from '../../../config/env';
import { META_API_VERSION } from '../config';
import type { FacebookScope } from './types';

/**
 * Where we send the member, what we ask for, and which hosts answer.
 *
 * ─── Why none of this is shared with Instagram ───────────────────────────────
 *
 * FlowPost's Instagram integration uses **Instagram API with Instagram Login**:
 * `www.instagram.com` for consent, `api.instagram.com` for the token,
 * `graph.instagram.com` for everything else, authenticated by the *Instagram*
 * App ID and Secret.
 *
 * Facebook Pages is the other model — **Facebook Login** — and every one of
 * those four things is different: consent at `www.facebook.com`, token and
 * Graph at `graph.facebook.com`, authenticated by the **Meta** App ID and
 * Secret from the app's own Settings → Basic page. An Instagram User token is
 * not valid here and a Facebook user token is not valid there.
 *
 * The two surfaces share exactly two things, and they are both in
 * `providers/meta/config.ts`: the Graph API version, and the shape of an error.
 * Nothing in this file touches the Instagram configuration.
 */

/** The member-facing consent screen. Versioned, unlike Instagram's. */
export const FACEBOOK_AUTHORIZATION_URL = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;

/** The Graph host for the Facebook Login model. */
export const FACEBOOK_GRAPH_HOST = 'https://graph.facebook.com';

/** Versioned base for node and edge requests, e.g. `…/v25.0/me/accounts`. */
export const FACEBOOK_GRAPH_URL = `${FACEBOOK_GRAPH_HOST}/${META_API_VERSION}`;

/**
 * Both legs of the user-token exchange live on this one endpoint, separated by
 * `grant_type`: the authorization code first, then `fb_exchange_token` to turn
 * the short-lived result into a ~60-day one.
 */
export const FACEBOOK_TOKEN_URL = `${FACEBOOK_GRAPH_URL}/oauth/access_token`;

/**
 * The permissions we request. Configurable per the implementation brief —
 * override with `FACEBOOK_SCOPES` (comma-delimited) without a redeploy, which
 * matters because App Review can approve a different set than we first asked
 * for and the fix should not be a code change.
 *
 * Unknown values in the override are dropped rather than sent: a typo'd scope
 * makes Facebook reject the whole authorization with an error that names
 * nothing, and silently asking for a permission this integration has no use for
 * is worse than ignoring the override.
 */
export const FACEBOOK_DEFAULT_SCOPES: FacebookScope[] = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
];

const KNOWN_SCOPES = new Set<string>(FACEBOOK_DEFAULT_SCOPES);

export function resolveScopes(override: string): FacebookScope[] {
  const requested = override
    .split(/[\s,]+/)
    .filter((scope): scope is FacebookScope => KNOWN_SCOPES.has(scope));

  return requested.length > 0 ? [...new Set(requested)] : FACEBOOK_DEFAULT_SCOPES;
}

export const FACEBOOK_SCOPES = resolveScopes(env.FACEBOOK_SCOPES);

/** Facebook's own convention for these lists. */
export const FACEBOOK_SCOPE_STRING = FACEBOOK_SCOPES.join(',');

/** The scope a connection must actually hold to publish. */
export const FACEBOOK_PUBLISH_SCOPE = 'pages_manage_posts';

/**
 * The Page task that means "may publish".
 *
 * A member can be an Analyst or a Moderator on a Page — roles that appear in
 * `/me/accounts` and cannot create posts. Offering those in the picker would
 * produce a connection that looks healthy and fails on first publish, which is
 * the same mistake Instagram's account-type check exists to prevent.
 */
export const FACEBOOK_PUBLISH_TASK = 'CREATE_CONTENT';

/** How long a minted OAuth state stays valid. Matches Instagram's. */
export const FACEBOOK_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * How long a pending Page selection stays valid.
 *
 * Shorter than the OAuth state's window, because by this point the member is
 * looking at a dialog in an app they are already signed into — and the entry
 * holds a live long-lived user token, so the less time it sits in memory the
 * better.
 */
export const FACEBOOK_SELECTION_TTL_MS = 5 * 60 * 1000;

/**
 * The **Meta** App ID — the one on Settings → Basic, *not* the Instagram App ID.
 *
 * Named to match the dashboard's own label. Using the Instagram App ID here
 * produces a Facebook consent screen that fails with a generic error, which is
 * exactly as hard to diagnose in this direction as in the other.
 */
export const FACEBOOK_APP_ID = env.FACEBOOK_APP_ID;

/** Never logged, never sent anywhere but Meta's token endpoints. */
export const FACEBOOK_APP_SECRET = env.FACEBOOK_APP_SECRET;

/**
 * Must match a redirect URI registered under Facebook Login → Settings → Valid
 * OAuth Redirect URIs, character for character.
 *
 * Note that "Enforce HTTPS" is on by default for every app created since March
 * 2018 and cannot be turned off, so a plain `http://` URI here — localhost
 * included — is liable to be rejected or silently upgraded to `https://` by
 * Meta. If the callback never arrives, that is the first thing to check.
 */
export const FACEBOOK_REDIRECT_URI = env.FACEBOOK_REDIRECT_URI;

/**
 * The Business Login Configuration ID, when this app uses **Facebook Login for
 * Business**.
 *
 * ─── Why this exists, and how to tell whether you need it ────────────────────
 *
 * Meta ships two Facebook Login products and serves a different dialog for
 * each:
 *
 *   • **Facebook Login** (consumer) — the app asks for permissions with the
 *     `scope` parameter, and the dialog renders them.
 *   • **Facebook Login for Business** — the permission and asset set lives in a
 *     *configuration* created in the App Dashboard, and the dialog is invoked
 *     with that configuration's id. `scope` is not used; Meta's own
 *     documentation recommends not sending it at all.
 *
 * Which one you get is decided by **what you ask for**, not by an app setting.
 * Measured against this app by requesting the dialog while logged out and
 * reading `is_business_login` off the login.php redirect:
 *
 *     scope=pages_show_list,pages_read_engagement,pages_manage_posts → 1
 *     scope=public_profile                                          → 0
 *     no scope at all                                               → 0
 *     config_id=…                                                   → 0
 *
 * So asking for `pages_*` permissions through `scope` is itself what invokes
 * the business dialog — and that dialog has no configuration to render, so
 * Meta answers **HTTP 500 — "Sorry, something went wrong"** with no error body.
 * That is the failure this variable fixes, and it is why it is a genuine
 * configuration value rather than a workaround for a cosmetic error.
 *
 * Note the flag is *not* a way to validate a config id: a deliberately bogus
 * one also reports 0, and Meta only rejects it after the member logs in.
 *
 * Empty is still a supported state — the provider falls back to the `scope`
 * flow, which is correct for any permission set that does not trigger business
 * login. It is not correct for Page publishing.
 */
export const FACEBOOK_CONFIG_ID = env.FACEBOOK_CONFIG_ID;

/**
 * Fails fast when the app is misconfigured. Called at the top of `connect()`
 * rather than at import time, so a missing Facebook credential breaks the
 * Facebook route only — never Instagram, never LinkedIn, never the boot.
 */
export function assertFacebookConfigured(): void {
  const missing: string[] = [];
  if (!FACEBOOK_APP_ID) missing.push('FACEBOOK_APP_ID');
  if (!FACEBOOK_REDIRECT_URI) missing.push('FACEBOOK_REDIRECT_URI');
  // Checked here as well as in the callback: a connect that cannot possibly be
  // completed should fail before we send the member to Facebook.
  if (!FACEBOOK_APP_SECRET) missing.push('FACEBOOK_APP_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Facebook OAuth is not configured. Missing: ${missing.join(', ')}`,
    );
  }
}

export const facebookConfig = {
  authorizationUrl: FACEBOOK_AUTHORIZATION_URL,
  tokenUrl: FACEBOOK_TOKEN_URL,
  graphUrl: FACEBOOK_GRAPH_URL,
  apiVersion: META_API_VERSION,
  appId: FACEBOOK_APP_ID,
  appSecret: FACEBOOK_APP_SECRET,
  redirectUri: FACEBOOK_REDIRECT_URI,
  configId: FACEBOOK_CONFIG_ID,
  scopes: FACEBOOK_SCOPES,
  scopeString: FACEBOOK_SCOPE_STRING,
  publishScope: FACEBOOK_PUBLISH_SCOPE,
  publishTask: FACEBOOK_PUBLISH_TASK,
  stateTtlMs: FACEBOOK_STATE_TTL_MS,
  selectionTtlMs: FACEBOOK_SELECTION_TTL_MS,
};

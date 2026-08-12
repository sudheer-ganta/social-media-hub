import { env } from '../../config/env';
import { analyticsScopeEnabled } from '../analytics-scopes';
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

/**
 * The versioned Posts API — where a share is actually created.
 *
 * This is the endpoint the *Share on LinkedIn* product's `w_member_social`
 * scope authorizes. It supersedes `/v2/ugcPosts`, which LinkedIn has
 * deprecated in favour of this one; see {@link LINKEDIN_UGC_POSTS_URL} for why
 * the old path is still referenced below.
 */
export const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/rest/posts';

/**
 * The legacy UGC endpoint, kept only as a fallback.
 *
 * LinkedIn's *consumer* Share on LinkedIn documentation still describes this
 * unversioned path, while the versioned Posts API above lives under the
 * marketing docs. Which of the two a given self-serve app is admitted to is
 * not something we can determine from our side without making the call, so the
 * publisher tries the versioned endpoint first and falls back to this one when
 * — and only when — LinkedIn rejects the request for a version or permission
 * reason. See `publisher.ts`.
 */
export const LINKEDIN_UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';

/**
 * The versioned Images API — where image bytes are registered and uploaded.
 *
 * `w_member_social` is one of the permissions LinkedIn documents for this
 * resource, and `owner` accepts a person URN, so the Share on LinkedIn product
 * reaches it without a new scope. One caveat shapes `media.ts`: with only
 * `w_member_social` the versioned gateway is **write-only**, so we can POST the
 * `initializeUpload` action but cannot GET an image back to check its status.
 *
 * Called with `?action=initializeUpload`; see `media.ts`.
 */
export const LINKEDIN_IMAGES_URL = 'https://api.linkedin.com/rest/images';

/**
 * The legacy Assets API, the media counterpart to {@link LINKEDIN_UGC_POSTS_URL}.
 *
 * Superseded by the Images API — LinkedIn's own docs say Assets "won't have any
 * feature additions and will be deprecated in the future" — but it is still the
 * only media flow the consumer *Share on LinkedIn* guide documents, which is
 * the product this app is enabled for. Same reasoning as the two publishing
 * endpoints: kept as a fallback, never as the first choice.
 *
 * Called with `?action=registerUpload`.
 */
export const LINKEDIN_ASSETS_URL = 'https://api.linkedin.com/v2/assets';

/**
 * The recipe an image upload is registered under on the Assets API.
 *
 * Assets requires callers to declare a *use case* up front and gives back an
 * asset that only works for it. The Images API dropped the concept entirely —
 * one more reason it is tried first.
 */
export const LINKEDIN_FEEDSHARE_IMAGE_RECIPE =
  'urn:li:digitalmediaRecipe:feedshare-image';

/**
 * The API version sent as `LinkedIn-Version` on every versioned request.
 *
 * Sourced from the environment because it has a shelf life — see the note in
 * `config/env.ts`. Anything older than roughly a year is sunset and answers
 * every request with an error regardless of how correct the body is.
 */
export const LINKEDIN_API_VERSION = env.LINKEDIN_API_VERSION;

/**
 * Rest.li protocol version. Required on every LinkedIn API call, versioned or
 * not, and constant across all of them.
 */
export const LINKEDIN_RESTLI_VERSION = '2.0.0';

/**
 * Where a published share lives on linkedin.com.
 *
 * LinkedIn does not return a URL when it creates a post — only a URN — so the
 * "View on LinkedIn" link is built from that. This prefix plus the URN is the
 * documented shape of a feed permalink.
 */
export const LINKEDIN_FEED_UPDATE_URL = 'https://www.linkedin.com/feed/update/';

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
  // Analytics, and only where the app is approved for it. Unconditional here
  // would make `unauthorized_scope_error` the answer to every connect attempt
  // on a deployment without the product — losing publishing to enable a read.
  ...(analyticsScopeEnabled('linkedin')
    ? (['r_member_postAnalytics'] as const)
    : []),
];

/** The scope member post analytics requires. */
export const LINKEDIN_ANALYTICS_SCOPE = 'r_member_postAnalytics';

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
  postsUrl: LINKEDIN_POSTS_URL,
  ugcPostsUrl: LINKEDIN_UGC_POSTS_URL,
  imagesUrl: LINKEDIN_IMAGES_URL,
  assetsUrl: LINKEDIN_ASSETS_URL,
  feedshareImageRecipe: LINKEDIN_FEEDSHARE_IMAGE_RECIPE,
  apiVersion: LINKEDIN_API_VERSION,
  restliVersion: LINKEDIN_RESTLI_VERSION,
  feedUpdateUrl: LINKEDIN_FEED_UPDATE_URL,
  clientId: LINKEDIN_CLIENT_ID,
  clientSecret: LINKEDIN_CLIENT_SECRET,
  redirectUri: LINKEDIN_REDIRECT_URI,
  scopes: LINKEDIN_SCOPES,
  scopeString: LINKEDIN_SCOPE_STRING,
  stateTtlMs: LINKEDIN_STATE_TTL_MS,
};

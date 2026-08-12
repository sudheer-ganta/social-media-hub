/**
 * LinkedIn-specific shapes. Sprint 3.1 only needs what the authorization
 * request is built from; token, profile and share payloads arrive with the
 * callback in 3.2.
 */
import type { ContentType } from '../capabilities';
import type { ProviderMediaAsset } from '../provider.interface';

/** Scopes we are approved for on the LinkedIn app's products. */
export type LinkedInScope =
  | 'openid'
  | 'profile'
  | 'w_member_social'
  /**
   * Member post analytics. Requested only when the deployment declares the app
   * approved for it — see `providers/analytics-scopes.ts`. LinkedIn rejects the
   * whole authorization for an unapproved scope, so this is never unconditional.
   */
  | 'r_member_postAnalytics';

/**
 * The query string LinkedIn's `/oauth/v2/authorization` endpoint expects.
 * `scope` is space-delimited on the wire even though we keep it as an array in
 * config — see {@link import('./config').LINKEDIN_SCOPES}.
 */
export interface LinkedInAuthorizationParams {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
}

/** One pending authorization request, held only until the callback lands. */
export interface LinkedInPendingState {
  /** Wall-clock ms at which the entry stops being accepted. */
  expiresAt: number;
  /**
   * The FlowPost user who started this connect, resolved from their Supabase
   * session before we ever left the app. LinkedIn's redirect carries no
   * identity of ours, so this binding is the only thing that tells the callback
   * whose `social_accounts` row to write.
   */
  userId: string;
}

/**
 * The form body LinkedIn's `/oauth/v2/accessToken` endpoint expects, posted as
 * `application/x-www-form-urlencoded`.
 */
export interface LinkedInTokenRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
}

/**
 * LinkedIn's token response.
 *
 * Everything except `access_token` is optional on purpose: LinkedIn issues a
 * `refresh_token` only to apps approved for programmatic refresh, and the same
 * app can get one on some flows and not others. Nothing downstream may assume
 * it exists.
 */
export interface LinkedInTokenResponse {
  access_token: string;
  /** Lifetime in seconds. LinkedIn's member tokens are 60 days today. */
  expires_in?: number;
  /** Absent far more often than present. See the note above. */
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  /** Present because we ask for `openid`. Not used — the userinfo call is authoritative. */
  id_token?: string;
}

/**
 * The OpenID Connect claims `/v2/userinfo` returns for the `openid profile`
 * scopes. Everything but `sub` is optional: LinkedIn omits `picture` for
 * members with no photo, and locale settings can leave names blank.
 */
export interface LinkedInUserInfo {
  /** The member's stable OpenID subject identifier. */
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string | { country?: string; language?: string };
}

/** The provider-neutral shape the service layer stores. */
export interface LinkedInProfile {
  /** Goes into `social_accounts.provider_account_id`. */
  providerAccountId: string;
  displayName: string | null;
  profileImage: string | null;
}

/**
 * The kinds of media a post can carry.
 *
 * All four of LinkedIn's are named here even though only `image` uploads
 * today. That is the point: the type is the contract, and a kind that exists
 * in the union but not in `media.ts` fails as an explicit "not supported yet"
 * rather than as a shape nobody modelled. Adding video is a branch in
 * {@link import('./media').uploadMedia}, not a second upload system.
 */
export type LinkedInMediaKind = 'image' | 'video' | 'document';

/**
 * One piece of media, already fetched, on its way to LinkedIn.
 *
 * Bytes rather than a URL, deliberately. Downloading a member-supplied address
 * is a server-side request forgery primitive and this backend has exactly one
 * vetted way to do it (`ai/vision/image-source.ts`); handing the provider a URL
 * would make every provider a second place that has to get that right.
 *
 * Video is the exception that proves the rule, and it is why this is now an
 * alias for {@link ProviderMediaAsset} rather than a restatement of it: a
 * 500MB upload cannot be a Buffer, so `data` is null there and `openStream`
 * carries the bytes a chunk at a time instead. Restating the shape locally
 * would mean keeping two copies of that distinction in step.
 */
export type LinkedInMediaAsset = ProviderMediaAsset;

/** One asset that made it to LinkedIn, and the URN that now refers to it. */
export interface LinkedInUploadedMedia {
  kind: LinkedInMediaKind;
  /** `urn:li:image:…` from the Images API, `urn:li:digitalmediaAsset:…` from Assets. */
  urn: string;
  altText: string | null;
  /** Which upload surface produced the URN. Decides the post body's shape. */
  endpoint: LinkedInMediaEndpoint;
}

/**
 * The two upload surfaces, which pair with the two publishing surfaces.
 *
 * `images` (versioned `/rest/images`) pairs with `/rest/posts`; `assets`
 * (`/v2/assets`) pairs with `/v2/ugcPosts`. They are **not** interchangeable
 * after the fact — see the note in `publisher.ts` about why the choice is made
 * before a single byte is uploaded.
 */
export type LinkedInMediaEndpoint = 'images' | 'assets';

/**
 * Everything `publisher.ts` needs to create one post.
 *
 * Deliberately not a `Post` or a `SocialAccount`: the provider layer takes
 * primitives so it stays ignorant of our tables. Assembling this from a draft
 * and a connection is the publish service's job.
 */
export interface LinkedInPublishInput {
  /**
   * Plaintext, decrypted by the caller immediately before this call. The
   * publisher holds it for the duration of one HTTP request and never logs,
   * stores or echoes it.
   */
  accessToken: string;
  /** The OIDC `sub` we stored at connect time. Becomes `urn:li:person:{sub}`. */
  providerAccountId: string;
  /** The member's text, unescaped. The formatter handles little text format. */
  caption: string;
  /**
   * Attached media, in the order it should appear. Absent or empty publishes a
   * text post — the publisher branches on this and nothing above it needs to
   * know which of the two happened.
   */
  media?: LinkedInMediaAsset[];
  /**
   * What the member is publishing this as. Resolved by the publish service —
   * see `publish/services/content-type.ts`. Decides which of LinkedIn's three
   * content shapes the post body takes: none, `media`, `multiImage`.
   *
   * Optional here, required on `ProviderPublishInput`. The publish service
   * always sets it; a direct caller that does not — the offline verify scripts
   * — gets the pre-content-type behaviour, which is the same count-based
   * resolution every post published before this field existed took.
   */
  contentType?: ContentType;
}

/** What a successful publish hands back. Provider-neutral by design. */
export interface LinkedInPublishResult {
  /** LinkedIn's own id, e.g. `urn:li:share:6844785523593134080`. */
  urn: string;
  /**
   * A permalink built from the URN, or null when the URN's shape is one we
   * cannot construct a URL for. Null means the UI hides "View on LinkedIn"
   * rather than offering a link that goes nowhere.
   */
  url: string | null;
  /** Which of LinkedIn's two publishing endpoints actually created the post. */
  endpoint: 'posts' | 'ugcPosts';
  /** URNs of any media attached, in post order. Empty for a text post. */
  mediaUrns: string[];
}

/** What a completed token exchange hands back to the callback. */
export interface LinkedInAccessToken {
  /** Plaintext. Encrypted by the repository before it reaches the database. */
  accessToken: string;
  /**
   * Plaintext, and **usually null** — see {@link LinkedInTokenResponse}. Stored
   * encrypted when LinkedIn does issue one so a later sprint has it, but no
   * code path in 3.2 reads it back.
   */
  refreshToken: string | null;
  /** Absolute expiry derived from `expires_in`, or null when LinkedIn omits it. */
  expiresAt: Date | null;
  /** Scopes LinkedIn actually granted, which can be narrower than we asked for. */
  scope: string | null;
}

// ─── Post analytics ──────────────────────────────────────────────────────────

/**
 * `GET /rest/socialActions?ids=List(urn,urn)` — the batched engagement read.
 *
 * Keyed by the URN, which arrives URL-encoded in the response object even
 * though it was sent raw. Callers must therefore decode the keys rather than
 * assume they match what was asked for.
 */
export interface LinkedInSocialActionNode {
  /** Echoed back by LinkedIn; not trusted over the key we asked under. */
  urn?: string;
  likesSummary?: {
    totalLikes?: number;
    /** Present on some versions; the same number under an older name. */
    aggregatedTotalLikes?: number;
  };
  commentsSummary?: {
    aggregatedTotalComments?: number;
    totalFirstLevelComments?: number;
  };
}

export interface LinkedInSocialActionsResponse {
  results?: Record<string, LinkedInSocialActionNode>;
  errors?: Record<string, unknown>;
}

/**
 * One element of `GET /rest/memberPostAnalytics`.
 *
 * Every field is optional because this surface is versioned and LinkedIn moves
 * metrics between releases. Anything absent stays null — an analytics response
 * that has changed shape must produce *no* number rather than a wrong one.
 */
export interface LinkedInPostAnalyticsElement {
  impressionCount?: number;
  uniqueImpressionsCount?: number;
  /** Reactions of every type, not just "like". */
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
  clickCount?: number;
  engagement?: number;
  videoViewCount?: number;
  /** Milliseconds, on the versions that serve it. */
  videoWatchTime?: number;
}

export interface LinkedInPostAnalyticsResponse {
  elements?: LinkedInPostAnalyticsElement[];
}

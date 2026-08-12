/**
 * Instagram-specific wire shapes.
 *
 * Everything Meta sends us, and the neutral shapes we turn it into. Nothing in
 * here refers to Prisma, Express or our tables — that is the line the whole
 * provider layer keeps.
 */
import type { ContentType } from '../../capabilities';

/** The permissions Business Login for Instagram grants. See `config.ts`. */
export type InstagramScope =
  | 'instagram_business_basic'
  | 'instagram_business_content_publish'
  | 'instagram_business_manage_messages'
  | 'instagram_business_manage_comments'
  /**
   * Media and account insights. Requested only when the deployment declares the
   * app approved for it — see `providers/analytics-scopes.ts`.
   */
  | 'instagram_business_manage_insights';

/** The query string `https://www.instagram.com/oauth/authorize` expects. */
export interface InstagramAuthorizationParams {
  client_id: string;
  redirect_uri: string;
  response_type: 'code';
  /** Comma-delimited on the wire — Instagram, unlike LinkedIn, rejects spaces. */
  scope: string;
  state: string;
}

/** The form body posted to `https://api.instagram.com/oauth/access_token`. */
export interface InstagramTokenRequest {
  client_id: string;
  client_secret: string;
  grant_type: 'authorization_code';
  redirect_uri: string;
  code: string;
}

/**
 * The short-lived token payload.
 *
 * Meta's current documentation shows this wrapped in a `data` array, while the
 * endpoint has historically answered with the same fields flat at the top
 * level. Both are modelled because we cannot control which one a given app
 * gets, and a token exchange that fails on a shape difference would be a
 * connect button that simply never works. See `readTokenPayload` in `token.ts`.
 */
export interface InstagramTokenPayload {
  access_token: string;
  /** The Instagram User's own id. Becomes `provider_account_id`. */
  user_id?: string | number;
  /**
   * What the member actually granted.
   *
   * A JSON **array** — `["instagram_business_basic", …]` — on Business Login,
   * where OAuth 2.0 and every other provider we integrate send one delimited
   * string. This was declared as `string` alone, which typechecked cleanly and
   * was simply untrue of the wire, so the array reached a `.split()` downstream
   * and the callback died with `scope.split is not a function`.
   *
   * The string form is kept because the older flat response shape has been seen
   * with one, and the same `readTokenPayload` accepts both shapes already.
   * `toScopeString` in `token.ts` collapses either into the provider-neutral
   * value the service layer is typed for.
   */
  permissions?: string | string[];
}

export interface InstagramTokenResponse extends Partial<InstagramTokenPayload> {
  data?: InstagramTokenPayload[];
}

/** The long-lived exchange and refresh responses share this shape. */
export interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type?: string;
  /** Seconds. About 60 days. */
  expires_in?: number;
}

/** What a completed token exchange hands back to the callback. */
export interface InstagramAccessToken {
  /** Plaintext. Encrypted by the repository before it reaches the database. */
  accessToken: string;
  /**
   * Always null. Instagram has no refresh-token grant — a long-lived token is
   * extended by presenting *itself* to `refresh_access_token`, so there is no
   * separate credential to store. Modelled so the shared
   * `ConnectAccountInput` needs no Instagram-shaped exception.
   */
  refreshToken: null;
  /** Absolute expiry derived from `expires_in`. ~60 days out. */
  expiresAt: Date | null;
  /** Permissions granted, comma-delimited, as Meta sent them. */
  scope: string | null;
  /** Present when the short-lived exchange volunteered it. */
  userId: string | null;
}

/** Fields we read off the Instagram User node. */
export interface InstagramUserNode {
  /**
   * The app-scoped Instagram User id used in publishing paths. Distinct from
   * `id` on this node, which is the legacy identifier; Meta's own examples use
   * `user_id` for content publishing.
   */
  user_id?: string | number;
  id?: string | number;
  username?: string;
  name?: string;
  /** `BUSINESS`, `MEDIA_CREATOR` or `PERSONAL`. Publishing needs the first two. */
  account_type?: string;
  profile_picture_url?: string;
}

/** The provider-neutral profile shape the service layer stores. */
export interface InstagramProfile {
  /** Goes into `social_accounts.provider_account_id`. */
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
  /** Kept so the UI can explain a personal account that cannot publish. */
  accountType: string | null;
}

/** `POST /{ig-id}/media` — creates an image container. */
export interface InstagramMediaContainerRequest {
  /**
   * A publicly reachable URL Meta's servers fetch the image from. There is no
   * byte-upload endpoint for feed images in this API; see `publisher.ts`.
   *
   * Optional because a Reel has a {@link video_url} instead. Exactly one of the
   * two is ever sent.
   */
  image_url?: string;
  /**
   * The same, for video. Meta fetches and transcodes it on its own servers —
   * which is why a Reel is never downloaded into this process however large it
   * is. See the `url` transport in `providers/capabilities.ts`.
   */
  video_url?: string;
  /**
   * Which product this container becomes.
   *
   * Absent is a feed image, which is what every container FlowPost created
   * before Reels and Stories existed sent — so leaving it out keeps those
   * publishes byte-identical. `REELS` and `STORIES` are the two additions, and
   * both are authorised by the same `instagram_business_content_publish` grant
   * a feed post already uses.
   */
  media_type?: 'REELS' | 'STORIES';
  caption?: string;
  alt_text?: string;
  /**
   * Marks this container as a member of a carousel rather than a post of its
   * own.
   *
   * A child container is never published directly — it exists only to be named
   * in the parent's `children`. Meta ignores `caption` on one, which is why the
   * caption goes on the parent and only the alt text stays here.
   */
  is_carousel_item?: boolean;
}

/**
 * `POST /{ig-id}/media` — creates the carousel container that holds the
 * children.
 *
 * A separate shape from the image container above because it carries no
 * `image_url` at all: the pictures are already uploaded as children, and this
 * request only says which ones, in which order, under what caption.
 */
export interface InstagramCarouselContainerRequest {
  media_type: 'CAROUSEL';
  /** Child container ids, comma-delimited. Order is the order they render in. */
  children: string;
  caption?: string;
}

/** Both `/media` and `/media_publish` answer with just an id. */
export interface InstagramCreatedNode {
  id?: string;
}

/** `GET /{ig-container-id}?fields=status_code,status` — the readiness poll. */
export interface InstagramContainerStatusNode {
  id?: string;
  /** `FINISHED` | `IN_PROGRESS` | `ERROR` | `EXPIRED` | `PUBLISHED`. */
  status_code?: string;
  /** Human-readable detail; carries the error text when `status_code` is ERROR. */
  status?: string;
}

/** `GET /{ig-media-id}?fields=permalink` */
export interface InstagramMediaNode {
  id?: string;
  permalink?: string;
}

/**
 * One piece of media on its way to Instagram.
 *
 * Carries both the bytes and the URL they came from. The bytes are what the
 * validator checks — format, size, dimensions — and the URL is what actually
 * gets sent, because Meta fetches the image itself. Validating the bytes we
 * downloaded is the only way to know, before spending a request, that the URL
 * we are about to hand over resolves to something Instagram will accept.
 *
 * Video is the case where "the bytes are what the validator checks" stops being
 * true, and deliberately so: a Reel can be a gigabyte and Meta is going to
 * fetch it from Cloudinary regardless, so nothing is downloaded and the checks
 * run against the metadata Cloudinary reported at upload time. That is why
 * `durationMs` is here and why it may be null — see {@link ProviderMediaAsset}.
 */
export interface InstagramMediaAsset {
  kind: 'image' | 'video' | 'document';
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  /** The public URL these exact bytes were fetched from. */
  sourceUrl: string;
  /** Video only, and null when nothing measured it. Never guessed. */
  durationMs?: number | null;
}

/** Everything `publisher.ts` needs to create one post. */
export interface InstagramPublishInput {
  /** Plaintext, decrypted by the caller immediately before this call. */
  accessToken: string;
  /** The Instagram User id stored at connect time. */
  providerAccountId: string;
  caption: string;
  media?: InstagramMediaAsset[];
  /**
   * What the member is publishing this as.
   *
   * The one thing this publisher cannot work out for itself. `IMAGE`,
   * `CAROUSEL`, `REEL` and `STORY` are four `media_type` values on one edge,
   * and a video attached to a post is a Reel or a Story depending on nothing
   * but what the member chose.
   *
   * Optional here, required on `ProviderPublishInput` — see LinkedIn's note.
   * Absent falls back to the count-based resolution, which can only ever
   * produce IMAGE or CAROUSEL and so can never silently publish a Story.
   */
  contentType?: ContentType;
}

/** What a successful publish hands back. */
export interface InstagramPublishResult {
  /** The published media's id. Stored on `post_platforms.published_id`. */
  urn: string;
  /**
   * The permalink Meta returned, or null if the follow-up read failed.
   *
   * Unlike LinkedIn's, this cannot be reconstructed from the id — it contains
   * an opaque shortcode. If it is not captured here it is not recoverable
   * without another API call, which is why it is stored rather than derived.
   */
  url: string | null;
  endpoint: 'media_publish';
  /**
   * The containers that produced the post: one id for a single image, and for a
   * carousel every child followed by the parent that was published.
   */
  mediaUrns: string[];
}

// ─── Insights ────────────────────────────────────────────────────────────────

/**
 * What Instagram files a publication as.
 *
 * Two independent axes, and both are needed to read a post correctly.
 * `media_type` says what the *file* is and `media_product_type` says what
 * *surface* it was published to — a video with `REELS` is a Reel, the same
 * video with `FEED` is a feed video, and they do not accept the same metrics.
 * Asking a Reel for `navigation` or a Story for `saved` fails the whole request.
 */
export type InstagramMediaTypeValue =
  | 'IMAGE'
  | 'VIDEO'
  | 'CAROUSEL_ALBUM'
  | string;

export type InstagramMediaProductType =
  | 'AD'
  | 'FEED'
  | 'STORY'
  | 'REELS'
  | string;

/** `GET /?ids=a,b,c&fields=id,media_type,media_product_type,timestamp` */
export interface InstagramMediaInfoNode {
  id?: string;
  media_type?: InstagramMediaTypeValue;
  media_product_type?: InstagramMediaProductType;
  timestamp?: string;
}

/**
 * One metric from `GET /{ig-media-id}/insights`.
 *
 * Two shapes, both live. The older one puts the number in `values[0].value`;
 * the newer per-metric total puts it in `total_value.value`. Meta serves
 * whichever the metric uses and does not say which in advance, so both are read
 * and a metric present in neither stays null rather than becoming zero.
 */
export interface InstagramInsightNode {
  name?: string;
  period?: string;
  values?: Array<{ value?: unknown }>;
  total_value?: { value?: unknown };
}

export interface InstagramInsightsResponse {
  data?: InstagramInsightNode[];
}

/** `GET /{ig-user-id}?fields=followers_count,follows_count,media_count` */
export interface InstagramAccountNode {
  id?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

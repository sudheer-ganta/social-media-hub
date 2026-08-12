import type {
  ProviderPublishInput,
  ProviderPublishResult,
} from '../provider.interface';

/**
 * X's wire shapes, and the provider-neutral ones this folder maps them onto.
 *
 * Everything here describes bytes on the wire to or from api.x.com. Nothing in
 * this file knows about Prisma, Express or our tables.
 */

/** The OAuth 2.0 scopes FlowPost requests. See `config.ts` for why each one. */
export type XScope =
  | 'tweet.read'
  | 'tweet.write'
  | 'users.read'
  | 'media.write'
  | 'offline.access';

/** Query parameters on the authorization request. All required by X. */
export interface XAuthorizationParams {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  /** base64url(SHA-256(code_verifier)). */
  code_challenge: string;
  code_challenge_method: 'S256';
}

/** Form body for the authorization-code exchange. */
export interface XTokenRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  /** Sent alongside the Basic auth header — X wants both for a confidential client. */
  client_id: string;
  code_verifier: string;
}

/** Form body for a refresh. */
export interface XRefreshRequest {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
}

/** X's token response, for both grants. */
export interface XTokenResponse {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * A token exchange, normalised.
 *
 * `refreshToken` is non-null in practice because `offline.access` is requested,
 * but it is typed nullable: X omits it if the scope was declined on the consent
 * screen, and pretending otherwise would put an `undefined` into storage.
 */
export interface XAccessToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

/** `GET /2/users/me` — X wraps every resource in `data`. */
export interface XUserResponse {
  data?: {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
}

/** The provider-neutral profile this folder hands back. */
export interface XProfile {
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
}

/** `POST /2/tweets` request body. */
export interface XCreateTweetRequest {
  text: string;
  /** Ids from {@link XMediaUploadResponse}, in the order they should render. */
  media?: { media_ids: string[] };
}

/**
 * `POST /2/media/upload` — the id an uploaded image is referenced by.
 *
 * Two field names because X changed one: the v2 endpoint answers with
 * `data.id`, and the v1.1 endpoint it grew out of answered with a top-level
 * `media_id_string`. Both are read so an account served by either shape works.
 * The *string* form is what matters — the numeric `media_id` loses precision in
 * JavaScript, which is exactly why X publishes a string alongside it.
 */
export interface XMediaUploadResponse {
  data?: { id?: string; media_key?: string; media_id_string?: string };
  media_id_string?: string;
}

/**
 * `GET /2/media/upload?command=STATUS` — how the transcode is going.
 *
 * Only ever populated for media that needs one: video, and a GIF too large for
 * X to handle inline. **An absent `processing_info` is a success**, not an
 * unknown — it means the upload was usable the moment FINALIZE returned, and
 * waiting for a state that will never arrive would stall every small GIF.
 *
 * Two envelopes for the same reason {@link XMediaUploadResponse} has two: the
 * v2 endpoint nests under `data`, the v1.1 shape it grew out of did not.
 */
export interface XMediaStatusResponse {
  data?: { processing_info?: XMediaProcessingInfo };
  processing_info?: XMediaProcessingInfo;
}

export interface XMediaProcessingInfo {
  state?: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  /** X's own advice on when to poll again. Honoured when present. */
  check_after_secs?: number;
  progress_percent?: number;
  /**
   * Why the transcode failed. The one vendor string worth showing a member —
   * "unsupported codec" is something they can act on, where a status code is
   * not. Surfaced inside a sentence, never as raw JSON.
   */
  error?: { code?: number; name?: string; message?: string };
}

/** `POST /2/tweets` response. */
export interface XCreateTweetResponse {
  data?: {
    id?: string;
    text?: string;
  };
}

/**
 * The metrics X attaches to a post it owns.
 *
 * Three envelopes, and the difference between them is a permission boundary,
 * not a naming accident:
 *
 *  • `public_metrics`  — what anyone can see. Always returned.
 *  • `organic_metrics` — the author's own view: link clicks and profile clicks,
 *    which are not public. OAuth 2.0 user context only, and **only for posts
 *    from the last 30 days**. Older posts return an error for this field, which
 *    is why `analytics.ts` asks for it separately and degrades rather than
 *    failing the whole read.
 *  • `non_public_metrics` — impressions on the same terms as organic. Requested
 *    alongside organic and subject to the same window.
 *
 * Every field is optional because X omits rather than zeroes. An absent
 * `impression_count` means "not told", and the adapter maps it to null.
 */
export interface XPostMetrics {
  impression_count?: number;
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  url_link_clicks?: number;
  user_profile_clicks?: number;
}

/** One post in a `GET /2/tweets` response. */
export interface XTweetNode {
  id?: string;
  text?: string;
  created_at?: string;
  attachments?: { media_keys?: string[] };
  public_metrics?: XPostMetrics;
  organic_metrics?: XPostMetrics;
  non_public_metrics?: XPostMetrics;
}

/** One entry in the `includes.media` expansion. */
export interface XMediaNode {
  media_key?: string;
  /** X's own vocabulary: `photo`, `video`, `animated_gif`. */
  type?: string;
}

/**
 * `GET /2/tweets?ids=…`.
 *
 * `errors` is populated *alongside* `data` for ids X could not serve — a
 * deleted post, or one whose organic metrics are past the 30-day window. A
 * partial answer is the normal case, not a failure.
 */
export interface XTweetsResponse {
  data?: XTweetNode[];
  includes?: { media?: XMediaNode[] };
  errors?: Array<{ detail?: string; title?: string; resource_id?: string }>;
}

/** `GET /2/users/me?user.fields=public_metrics`. */
export interface XAccountMetricsResponse {
  data?: {
    id?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
    };
  };
}

/**
 * X's error envelope. Two shapes, both real: OAuth endpoints answer with
 * `{ error, error_description }`, the v2 API with `{ title, detail, errors }`.
 */
export interface XErrorBody {
  error?: string;
  error_description?: string;
  title?: string;
  detail?: string;
  reason?: string;
  errors?: Array<{ message?: string; detail?: string }>;
}

export type XPublishInput = ProviderPublishInput;
export type XPublishResult = ProviderPublishResult;

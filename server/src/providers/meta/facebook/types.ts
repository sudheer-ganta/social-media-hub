/**
 * Facebook-specific wire shapes.
 *
 * Everything Meta sends us on the Facebook Login / Pages API surface, and the
 * neutral shapes we turn it into. Nothing here refers to Prisma, Express or our
 * tables — the same line the rest of the provider layer keeps.
 *
 * Deliberately separate from `../instagram/types.ts`. The two surfaces share a
 * company and an error envelope and nothing else: different hosts, different
 * credentials, different token model, different publishing endpoints. Merging
 * them would mean one type describing two wires, which is how a field that only
 * exists on one of them ends up silently optional on both.
 */

/**
 * The permissions FlowPost asks Facebook for.
 *
 * Publish-only, and no more than that:
 *
 *  - `pages_show_list`        — list the Pages the member manages, so they can
 *                               pick one. Without it `/me/accounts` is empty.
 *  - `pages_read_engagement`  — read a Page's own name, username and picture;
 *                               a documented dependency of `pages_manage_posts`.
 *  - `pages_manage_posts`     — create posts on the selected Page.
 *
 * Deliberately *not* requested: `pages_manage_metadata`, `pages_manage_engagement`
 * (comments and reactions — features FlowPost does not have),
 * `business_management`, `publish_video` (Reels are out of scope), and anything
 * ads-related. Every extra permission is one more thing a member can decline and
 * one more thing to justify at App Review for a feature that does not exist.
 */
export type FacebookScope =
  | 'pages_show_list'
  | 'pages_read_engagement'
  | 'pages_manage_posts';

/**
 * The query string `https://www.facebook.com/{version}/dialog/oauth` expects.
 *
 * Two shapes, because Meta serves two different dialogs — see
 * `config.FACEBOOK_CONFIG_ID`. The union is deliberate rather than one
 * interface with both fields optional: `scope` and `config_id` are mutually
 * exclusive in practice, and a type that permits sending both would permit
 * exactly the request that produces Meta's HTTP 500.
 */
export type FacebookAuthorizationParams =
  | FacebookConsumerAuthorizationParams
  | FacebookBusinessAuthorizationParams;

/** Facebook Login (consumer apps): permissions come from `scope`. */
export interface FacebookConsumerAuthorizationParams {
  client_id: string;
  redirect_uri: string;
  response_type: 'code';
  /** Comma-delimited on the wire. Facebook also accepts spaces; commas are its own convention. */
  scope: string;
  state: string;
}

/**
 * Facebook Login for Business: permissions come from the dashboard
 * configuration named by `config_id`, and `scope` is deliberately absent.
 */
export interface FacebookBusinessAuthorizationParams {
  client_id: string;
  redirect_uri: string;
  response_type: 'code';
  /** The Business Login Configuration's id. */
  config_id: string;
  /**
   * Required alongside `response_type=code`. Without it the business dialog
   * falls back to its own default response type and returns an access token in
   * the fragment instead of a code in the query — which this server-side flow
   * cannot see at all.
   */
  override_default_response_type: 'true';
  state: string;
}

/**
 * `GET /{version}/oauth/access_token` — both the code exchange and the
 * long-lived upgrade answer with this shape.
 */
export interface FacebookTokenResponse {
  access_token?: string;
  token_type?: string;
  /** Seconds. Absent on some responses, which is why `expiresAt` is nullable. */
  expires_in?: number;
}

/**
 * `GET /me/permissions` — what the member actually granted.
 *
 * Facebook, unlike Instagram's Business Login, does not return the granted
 * scopes with the token. They have to be read back, and a member who unticked
 * "Manage your Pages" on the consent screen still completes the flow — so the
 * read is not optional if `social_accounts.scopes` is to mean anything.
 */
export interface FacebookPermissionsResponse {
  data?: Array<{ permission?: string; status?: string }>;
}

/**
 * `GET /debug_token`. Diagnostic only — see `token.logGranularScopes`.
 *
 * `granular_scopes` is the Business-Login-specific part: the assets each
 * permission was granted over. It is absent entirely on a consumer-login token,
 * where a permission has no asset set to speak of.
 */
export interface FacebookDebugTokenResponse {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    /** Unix seconds. `0` means the token does not expire. */
    expires_at?: number;
    granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
  };
}

/** One entry of `GET /me/accounts`. */
export interface FacebookPageNode {
  id?: string;
  name?: string;
  username?: string;
  /**
   * The Page access token, minted against whichever user token asked for it.
   * A Page token derived from a **long-lived** user token does not itself
   * expire — see `token.ts`. Never logged.
   */
  access_token?: string;
  /**
   * What this member may do on the Page. `CREATE_CONTENT` is the one that
   * matters: a Page the member can only analyse or moderate cannot be published
   * to, and offering it in the picker would produce a connection that fails on
   * first publish.
   */
  tasks?: string[];
  picture?: { data?: { url?: string } };
}

export interface FacebookAccountsResponse {
  data?: FacebookPageNode[];
  paging?: { next?: string };
}

/** A Page the member may publish to, normalised. */
export interface FacebookPage {
  /** Goes into `social_accounts.provider_account_id`. */
  id: string;
  name: string;
  username: string | null;
  profileImage: string | null;
  /** Plaintext Page access token. Encrypted by the repository, never logged. */
  accessToken: string;
}

/** A Page as the *browser* is allowed to see it. Note the absent token. */
export interface FacebookPageChoice {
  id: string;
  name: string;
  username: string | null;
  profileImage: string | null;
}

/** What a completed user-token exchange hands back. */
export interface FacebookUserAccessToken {
  /** Long-lived user token, ~60 days. Plaintext; the caller encrypts it. */
  accessToken: string;
  /** Absolute expiry derived from `expires_in`, or null when Meta omitted it. */
  expiresAt: Date | null;
  /** Granted permissions, comma-delimited, read back from `/me/permissions`. */
  scope: string | null;
}

/** Fields we read off a Page node when confirming a connection. */
export interface FacebookPageProfile {
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
}

/** One piece of media on its way to a Facebook Page. */
export interface FacebookMediaAsset {
  kind: 'image' | 'video' | 'document';
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  /** The public URL these exact bytes were fetched from. */
  sourceUrl: string;
}

/** Everything `publisher.ts` needs to create one post. */
export interface FacebookPublishInput {
  /** Plaintext Page token, decrypted by the caller immediately before this call. */
  accessToken: string;
  /** The Page id stored at connect time. Never a user id. */
  providerAccountId: string;
  caption: string;
  media?: FacebookMediaAsset[];
}

/**
 * `POST /{page-id}/feed` and `POST /{page-id}/photos` answers.
 *
 * They differ, and the difference matters: `/feed` returns the post id as `id`,
 * while `/photos` returns the *photo* id as `id` and the post id separately as
 * `post_id`. Storing the photo id would give us something that cannot be turned
 * into a permalink.
 */
export interface FacebookCreatedNode {
  id?: string;
  post_id?: string;
}

/** `GET /{post-id}?fields=permalink_url` */
export interface FacebookPostNode {
  id?: string;
  permalink_url?: string;
}

/** What a successful publish hands back. */
export interface FacebookPublishResult {
  /** The Page post id, `{page-id}_{post-id}`. Stored on `post_platforms`. */
  urn: string;
  /** The permalink Meta returned, or null if the follow-up read failed. */
  url: string | null;
  endpoint: 'feed' | 'photos';
  /** The photo id, when the post carried one. */
  mediaUrns: string[];
}

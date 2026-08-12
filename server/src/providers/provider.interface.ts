import type { Request, Response } from 'express';
import type { ContentType } from './capabilities';

/**
 * The contract every social network integration implements.
 *
 * LinkedIn is the first; Instagram, Facebook, X, TikTok and YouTube follow the
 * same three-step shape. Keeping the surface this small is deliberate — the
 * provider layer only ever talks to the remote network. It builds authorization
 * URLs, exchanges codes and calls publish APIs. It does not know about Prisma,
 * repositories or our own tables; persistence is the caller's job.
 *
 * See {@link ProviderId} for the registry key each implementation is filed under.
 */
export interface Provider {
  /** Stable key used by routes, the registry and the `provider` column. */
  readonly id: ProviderId;

  /** Human-readable name, safe to render in the UI. */
  readonly displayName: string;

  /**
   * Starts the OAuth dance: mint a state value, build the network's
   * authorization URL and 302 the browser to it.
   */
  connect(req: Request, res: Response): Promise<void>;

  /**
   * Handles the network's redirect back to us — validates state, exchanges the
   * code for tokens and hands them to the service layer to store.
   */
  callback(req: Request, res: Response): Promise<void>;

  /**
   * Revokes the connection at the network where the API allows it. Deleting our
   * own row is the caller's responsibility, not the provider's.
   */
  disconnect(req: Request, res: Response): Promise<void>;

  /**
   * Optional. Asks the network whether an access token still works, and returns
   * the member's current profile if it does.
   *
   * Deliberately *not* an HTTP handler: this is called from the service layer
   * on behalf of a user (Refresh Connection), not from a browser navigation, so
   * it takes a token and returns data rather than touching req/res.
   *
   * Never throws for an expected outcome — a dead token is a `false` result,
   * not an exception — because the caller's job is to record a status, not to
   * decide whether an error is fatal.
   */
  verify?(accessToken: string): Promise<ProviderVerification>;

  /**
   * Optional. Publishes a post — text, or text with media — and returns the
   * network's own id for it.
   *
   * Deliberately *one* method rather than `publishText` plus `publishImage`.
   * Whether a post carries media is a property of the post, not a different
   * operation, and a caller that has to pick the right method is a caller that
   * has to learn each network's media rules. Providers branch internally; the
   * publish service hands over a draft and gets back a result.
   *
   * Like {@link Provider.verify}, this is *not* an HTTP handler: it is called
   * from the publish service with an already-decrypted token, never from a
   * browser navigation. That is what lets one publish service drive every
   * network — it assembles this input from a draft and a connection and does
   * not care which implementation answers.
   *
   * Unlike `verify`, this **does** throw on failure. The distinction is
   * deliberate: a failed verification is a routine answer about a token's
   * health, whereas a failed publish is an exception the caller must record
   * against the post and surface to the member.
   */
  publish?(input: ProviderPublishInput): Promise<ProviderPublishResult>;

  /**
   * Optional. Trades a refresh token for a fresh access token.
   *
   * Present only for networks whose access tokens expire fast enough that a
   * member cannot be asked to reconnect each time — X's last two hours, where
   * LinkedIn's last sixty days and Meta's are extended by presenting
   * themselves. Its absence is what tells the publish service to treat a
   * past-due expiry as "reconnect", exactly as it did before this existed.
   *
   * Like {@link Provider.publish}, this is *not* an HTTP handler: it takes an
   * already-decrypted refresh token and returns plaintext tokens for the caller
   * to store. Storing them — and encrypting them — is the caller's job.
   *
   * Throws on failure. A refresh token the network rejects is a connection the
   * member has to remake, and swallowing that would produce a publish that
   * fails later with a less useful message.
   */
  refreshTokens?(refreshToken: string): Promise<ProviderTokenRefresh>;

  /**
   * Optional. What this network will accept as media, so the *fetcher* can
   * enforce it.
   *
   * Networks disagree, and the disagreement has to be known before the bytes
   * are downloaded: LinkedIn takes JPEG, PNG and GIF, Instagram takes JPEG and
   * nothing else. Without this the media service would hardcode one network's
   * rules for all of them, which is what it did when LinkedIn was the only one.
   *
   * Absent means "no opinion" and the service falls back to its own defaults.
   */
  readonly mediaRequirements?: ProviderMediaRequirements;

  /**
   * Optional. Whether a connection's *granted* scopes allow publishing.
   *
   * A member can decline a permission on the consent screen and still complete
   * the connection, producing an account that looks healthy and cannot publish.
   * The check is per-network because the scope name is — `w_member_social` on
   * LinkedIn, `instagram_business_content_publish` on Instagram — and it lives
   * here so the publish service never grows a chain of provider ifs.
   *
   * Absent means "cannot be determined from scopes"; the network is then the
   * only authority and a rejection is handled as a publish failure.
   */
  canPublish?(scopes: string[]): boolean;

  /**
   * Optional. How to read this network's performance data.
   *
   * Absent means FlowPost cannot read analytics from this network *at all* —
   * which today is true only of YouTube, which has no implementation. Absent is
   * a permanent, honest "no" that the sync service reports as `unsupported`; it
   * is never a reason to estimate a number instead.
   *
   * Present is **not** a promise that analytics will work for a given
   * connection. X's scopes are granted on every connection, but LinkedIn,
   * Instagram and Facebook each need a permission behind App Review that a
   * member can decline and that older connections predate. That case is
   * {@link ProviderAnalytics.hasRequiredScopes} answering false, and the sync
   * service reports it as `missing_scopes` — "reconnect to enable analytics".
   * The two are deliberately different answers because only one of them is
   * something a member can fix.
   *
   * Its own object rather than three more optional methods on `Provider`
   * because analytics has state the rest of the contract does not: which scopes
   * it needs, and how far back the network will still answer. Both have to be
   * readable *without* calling anything, so the API can say "reconnect to
   * enable analytics" rather than discovering it on a 403.
   */
  readonly analytics?: ProviderAnalytics;
}

/**
 * What a network can tell us about performance, and what it costs to ask.
 *
 * Everything here is provider-neutral: no Prisma types, no table names, no
 * `SocialAccount`. The adapter takes a token and ids and hands back normalised
 * numbers — persisting them is `services/analytics-sync.service.ts`'s job, the
 * same division that keeps `publish` from knowing what a `post_platforms` row
 * is.
 */
export interface ProviderAnalytics {
  /**
   * The scopes a connection must actually hold before any call here will work.
   *
   * Read from `social_accounts.scopes` — what the member *granted*, which can
   * be narrower than what we asked for. This is what turns a would-be 403 into
   * a "Reconnect to enable analytics" before a single request goes out.
   */
  readonly requiredScopes: readonly string[];

  /**
   * How far back post metrics can still be read, in days.
   *
   * A hard property of the network, not a policy of ours: X serves organic
   * metrics for posts from the last 30 days and nothing older, ever. The sync
   * service uses it to stop asking for posts it can never get an answer for,
   * which is the difference between a bounded sync and one that re-requests
   * every post the member has published since they joined.
   *
   * Absent means no known limit.
   */
  readonly postMetricsMaxAgeDays?: number;

  /**
   * How many post ids one call may carry. Absent means one per call.
   */
  readonly postMetricsBatchSize?: number;

  /** Whether a connection's granted scopes permit reading analytics. */
  hasRequiredScopes(grantedScopes: string[]): boolean;

  /**
   * Reads performance for specific published posts.
   *
   * Takes the network's own post ids — what `post_platforms.published_id`
   * holds. Returns one entry per id the network answered for, which may be
   * *fewer* than were asked for: a deleted post simply does not come back, and
   * that is a normal outcome rather than an error. Callers must key the result
   * by `platformPostId` rather than by position.
   *
   * Throws only when the call itself failed — a dead token, a rate limit, a
   * network that is down. A post that returned no data is an absence, not an
   * exception.
   */
  fetchPostMetrics?(
    input: ProviderMetricsRequest,
  ): Promise<ProviderPostMetrics[]>;

  /**
   * Reads the connected account's own audience figures.
   *
   * Same rules: throws on a failed call, returns nulls for anything the network
   * does not report.
   */
  fetchAccountMetrics?(
    input: ProviderAccountMetricsRequest,
  ): Promise<ProviderAccountMetrics>;
}

export interface ProviderMetricsRequest {
  /** Plaintext, decrypted by the caller immediately before the call. */
  accessToken: string;
  /** The network's own ids, from `post_platforms.published_id`. */
  platformPostIds: string[];
}

export interface ProviderAccountMetricsRequest {
  accessToken: string;
  providerAccountId: string;
}

/**
 * What a publication is, in provider-neutral terms.
 *
 * Deliberately the same seven labels as the `MediaType` enum in the database,
 * and deliberately *not* imported from the generated Prisma client — providers
 * must not depend on our schema. `analytics/normalise.ts` holds an exhaustive
 * mapping between the two, so a value added on either side fails typecheck
 * rather than silently falling through to OTHER.
 */
export type ProviderMediaType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'CAROUSEL'
  | 'REEL'
  | 'STORY'
  | 'OTHER';

/**
 * One publication's numbers, normalised.
 *
 * **Null is the whole point of this shape.** Every field is optional-and-
 * nullable, and null carries exactly one meaning: this network did not report
 * this metric. Adapters must never substitute `0` for an absent field — a post
 * with no reported reach and a post with a genuine reach of zero are different
 * facts, and only one of them should be averaged.
 */
export interface NormalizedPostMetrics {
  impressions?: number | null;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  reposts?: number | null;
  saves?: number | null;
  clicks?: number | null;
  videoViews?: number | null;
  watchTimeMs?: number | null;
}

export interface NormalizedAccountMetrics {
  followers?: number | null;
  following?: number | null;
  postCount?: number | null;
  impressions?: number | null;
  reach?: number | null;
  profileViews?: number | null;
}

export interface ProviderPostMetrics {
  /** The network's own id. Callers key on this, never on array position. */
  platformPostId: string;
  /**
   * What the network says this post is, or null when it does not say.
   *
   * Null is not "text". It means the format is unknown and whatever was
   * inferred at publish time still stands — see
   * `post_platforms.media_type_from_platform`.
   */
  mediaType: ProviderMediaType | null;
  metrics: NormalizedPostMetrics;
  /** The network's untouched response for this post. Stored verbatim. */
  raw: unknown;
}

export interface ProviderAccountMetrics {
  metrics: NormalizedAccountMetrics;
  raw: unknown;
}

/** A network's media rules, applied before anything is downloaded. */
export interface ProviderMediaRequirements {
  /** MIME types this network's upload or fetch will accept. Lowercased. */
  imageMimeTypes: ReadonlySet<string>;
  /**
   * Byte ceiling for one image. Ours as much as the network's — the bytes pass
   * through this process' memory, and an unbounded download is a way to run the
   * API out of heap.
   */
  maxImageBytes: number;
  /**
   * How many items this network will carry on one post.
   *
   * Stated here so the *fetcher* knows it, for the same reason the formats are:
   * a post carrying more than a network can take has already failed, and
   * finding that out before downloading eleven images is the difference between
   * a fast rejection and a slow one. The provider's own validator still checks
   * it — this is an early exit, never the authority.
   *
   * The number itself comes from each provider's validator constant, so the
   * catalogue the browser reads, the ceiling enforced here and the one the
   * publisher enforces are all the same value. Absent means one.
   */
  maxItems?: number;
}

/**
 * The kinds of media a post can carry, across every network.
 *
 * Provider-neutral on purpose. LinkedIn, Instagram and X disagree about what
 * they accept and how it is uploaded; they agree that an image is an image.
 */
export type ProviderMediaKind = 'image' | 'video' | 'document';

/**
 * One piece of media, already fetched, on its way to a network.
 *
 * Bytes rather than a URL, deliberately. Downloading a member-supplied address
 * is a server-side request forgery primitive and this backend has exactly one
 * vetted way to do it; handing providers a URL would make every provider a
 * second place that has to get that right. Resolving a draft's media into this
 * shape is the publish service's job — see `publish/services/media.service.ts`.
 */
export interface ProviderMediaAsset {
  kind: ProviderMediaKind;
  /** From the response that produced these bytes. Lowercased, no charset. */
  mimeType: string;
  /**
   * The whole asset in memory — or **null**, which is the important case.
   *
   * Null means nothing was downloaded, and it is the normal state of a video.
   * A Reel can be a gigabyte; buffering one to hand Meta a URL it was going to
   * fetch from Cloudinary anyway is how a publish takes the API process out
   * with it. Which transport an asset took is declared per content type in
   * `providers/capabilities.ts`:
   *
   *   • `url`     → data is null. The network fetches {@link sourceUrl}.
   *   • `bytes`   → data is the whole asset. Images only, under a stated
   *                 ceiling — this is what LinkedIn and X images have always
   *                 done and it is unchanged.
   *   • `chunked` → data is null; {@link openStream} yields the bytes a chunk
   *                 at a time.
   *
   * A provider that needs bytes must handle null rather than assume — the type
   * is what makes forgetting a typecheck failure instead of a crash on the
   * first large upload.
   */
  data: Buffer | null;
  /**
   * The asset's size.
   *
   * Always real, whether or not {@link data} is present: for a streamed or
   * URL-delivered asset it comes from Cloudinary's own metadata, which is also
   * what lets a ceiling be enforced *before* a byte moves.
   */
  byteLength: number;
  /**
   * The public URL these exact bytes were fetched from.
   *
   * Present because not every network takes an upload. LinkedIn wants the
   * bytes; Instagram's Content Publishing API takes an `image_url` and fetches
   * it from Meta's own servers — there is no byte-upload endpoint for it at
   * all. A provider that needs a URL uses this one rather than reaching for
   * `post.image_url`, which is the raw member-supplied value and may not be
   * what was actually downloaded (see the Cloudinary JPEG rewrite in
   * `publish/services/media.service.ts`).
   *
   * Fetching it is still the media service's job, and the bytes above are still
   * what proves the URL resolves to an image this network accepts — so a
   * URL-fetching provider gets the same format and size guarantees as an
   * uploading one, for free.
   */
  sourceUrl: string;
  /** Null when the format's header could not be read. Providers may still send it. */
  width: number | null;
  height: number | null;
  /** Accessibility text, or null to omit it. Never an empty string. */
  altText: string | null;

  /**
   * How long the video runs, or null.
   *
   * Null for every still image, and for a video whose duration nothing
   * reported. It is **never guessed**: the value comes from Cloudinary's
   * response at upload time, which is the one party that has actually decoded
   * the file. Parsing an MP4 container in this process to recover it would mean
   * reading the file we deliberately did not download.
   *
   * A null duration is not a validation failure. Every network below re-checks
   * the file itself, and refusing a publish because *we* could not measure it
   * would fail posts the network would have accepted.
   */
  durationMs?: number | null;

  /**
   * A still frame for the video, as a URL. Null for images and when none exists.
   *
   * Cloudinary derives it on delivery from the stored video — it is not a second
   * upload and it does not touch the master.
   */
  posterUrl?: string | null;

  /**
   * Opens a byte stream over the asset, for the `chunked` transport.
   *
   * Present only on assets whose content type declared `chunked`. The caller
   * pipes it into the network's multi-part upload and never collects it: the
   * whole point is that one chunk is resident at a time, so a `for await` that
   * pushes each piece straight out is the only correct use, and concatenating
   * the stream into a Buffer would reintroduce exactly the problem this exists
   * to avoid.
   */
  openStream?: () => Promise<NodeJS.ReadableStream>;
}

/**
 * The provider-neutral publish request.
 *
 * Primitives only — no `Post`, no `SocialAccount`. A provider that could be
 * handed a database row would be a provider that could reach into the
 * database, and the layering here is the only thing stopping that.
 */
export interface ProviderPublishInput {
  /**
   * Plaintext, decrypted by the caller immediately before the call. Providers
   * must never log, store or echo it.
   */
  accessToken: string;
  /** The network's own id for the account, as stored on the connection. */
  providerAccountId: string;
  /** The member's text, unescaped. Per-network formatting is the provider's job. */
  caption: string;
  /**
   * Attached media, in the order it should appear. Absent or empty publishes a
   * text post. Providers reject what they cannot carry rather than dropping it
   * silently — a post that quietly loses its image is a worse answer than one
   * that fails with a reason.
   */
  media?: ProviderMediaAsset[];

  /**
   * What the member is publishing this *as*.
   *
   * The one thing a provider cannot work out for itself. One video is a REEL, a
   * STORY or a VIDEO depending on nothing but intent, and inferring it from the
   * attached media — "it is a video, so it must be a Reel" — is the guess this
   * field exists to stop.
   *
   * Always set by the publish service, which resolves it from what the member
   * asked for and what the network can carry. See
   * `publish/services/content-type.ts`; a post that never named one resolves to
   * exactly what it would have published before this field existed.
   */
  contentType: ContentType;
}

/** What a successful publish reports back. */
export interface ProviderPublishResult {
  /** The network's id for the created post. Stored on `post_platforms`. */
  urn: string;
  /**
   * A permalink, or null when the network gives us no way to build one.
   *
   * Two kinds of network here, and the difference is why this is stored rather
   * than rebuilt on read. LinkedIn's permalink is a pure function of the URN,
   * so it can be derived any time. Instagram's is an opaque shortcode only the
   * API knows, so if it is not captured now it is gone — see
   * `post_platforms.permalink`.
   */
  url: string | null;
  /** Which endpoint served the request, for support and debugging. */
  endpoint?: string;
  /** The network's ids for any media attached, in post order. */
  mediaUrns?: string[];

  /**
   * What actually went out, when it is not what was asked for.
   *
   * Absent — the normal case, on every network — means the publish carried
   * exactly what it was given. `text_only_fallback` means the media was
   * refused by the network and the text was published without it.
   *
   * Optional rather than defaulted so that a provider which does not implement
   * any fallback cannot accidentally claim one, and so that every existing
   * publisher is unchanged. Only X sets it today; see
   * `providers/x/media-fallback.ts`.
   */
  publishedAs?: 'full' | 'text_only_fallback';

  /**
   * Whether media the member attached did not make it onto the publication.
   *
   * The flag the rest of the system keys on, kept separate from
   * {@link publishedAs} because "what was published" and "was something lost"
   * are different questions and a later fallback mode might answer them
   * differently.
   *
   * **This must never be true without {@link reason} also being set.** Silently
   * dropping a member's media is the failure mode the whole feature is built to
   * avoid; a dropped asset that produces no sentence on screen is exactly that
   * failure wearing a success.
   */
  mediaDropped?: boolean;

  /**
   * Why the media was dropped, written for a member and safe to display.
   *
   * Never a status code, an endpoint or anything from the network's response
   * body — those go to the log. This is rendered beside a post that *did*
   * publish, so it has to read as a notice rather than an error.
   */
  reason?: string;
}

/**
 * The result of {@link Provider.refreshTokens}. Plaintext, for exactly as long
 * as it takes the caller to hand it to the repository.
 */
export interface ProviderTokenRefresh {
  accessToken: string;
  /**
   * The refresh token to store from here on.
   *
   * Non-null for networks that rotate — X issues a new one on every refresh and
   * invalidates the one presented, so storing the old value bricks the
   * connection at the *next* refresh rather than this one. Null means the
   * network gave us nothing new and the stored one still stands.
   */
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** The provider-neutral profile shape a verification hands back. */
export interface ProviderAccountSnapshot {
  providerAccountId: string;
  displayName: string | null;
  username?: string | null;
  profileImage: string | null;
}

/**
 * The result of {@link Provider.verify}.
 *
 * The two failure reasons mean genuinely different things and must not be
 * collapsed: `unauthorized` says the member has to reconnect, `unavailable`
 * says the network was unreachable and the connection is probably fine. Marking
 * an account REVOKED because LinkedIn had a bad minute would be a worse bug
 * than not noticing a dead token for an hour.
 */
export type ProviderVerification =
  | { ok: true; account: ProviderAccountSnapshot }
  | { ok: false; reason: 'unauthorized' | 'unavailable'; message: string };

/** Every network FlowPost publishes to, present and planned. */
export type ProviderId =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'youtube';

/**
 * Thrown by provider implementations when a step of the OAuth flow cannot be
 * completed. Carries an HTTP status so route handlers can answer without
 * having to guess.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly provider?: ProviderId,
    /**
     * The status the *network* returned, when the failure came from a call out
     * to it. Kept separate from {@link status}, which is what we would answer
     * our own caller with — a 401 from LinkedIn is a 502 from us.
     *
     * Health checks read this to tell "your token is dead" (401/403) from
     * "LinkedIn is having a moment" (5xx, timeout), which are the same failure
     * to an OAuth callback but opposite answers to a member.
     */
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Placeholder for the methods a provider has not implemented yet. Explicit and
 * loud beats an empty body that silently resolves and leaves the browser
 * hanging on a request that will never be answered.
 */
export function notImplemented(
  provider: ProviderId,
  method: keyof Provider,
): never {
  throw new ProviderError(
    `${provider}.${String(method)}() is not implemented yet`,
    501,
    provider,
  );
}

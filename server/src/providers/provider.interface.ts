import type { Request, Response } from 'express';

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
  data: Buffer;
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
  | 'youtube'
  | 'tiktok';

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

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
  /** A permalink, or null when the network gives us no way to build one. */
  url: string | null;
  /** Which endpoint served the request, for support and debugging. */
  endpoint?: string;
  /** The network's ids for any media attached, in post order. */
  mediaUrns?: string[];
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

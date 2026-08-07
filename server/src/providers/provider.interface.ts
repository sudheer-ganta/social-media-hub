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

import { ProviderError } from '../providers/provider.interface';

/**
 * What a failed analytics read *means*, and what may be done about it.
 *
 * The whole reason this file exists is one rule from the spec: **a temporary
 * analytics failure must never mark an account disconnected.** Metrics are a
 * background nicety; publishing is the product. An account flipped to EXPIRED
 * because X had a bad minute is a member who opens FlowPost to a "reconnect
 * your account" banner over a connection that was working perfectly.
 *
 * So the classification is deliberately conservative: only a `401` — the
 * network stating that this credential is not valid — is allowed to touch the
 * connection's status, and only after a token refresh has already been tried
 * and failed. Everything else backs off and tries again later.
 */

export type SyncFailureKind =
  /** 5xx, timeout, DNS. Might well work in five minutes. */
  | 'temporary'
  /** 429. Back off for a full rate-limit window. */
  | 'rate_limited'
  /** 401 after a refresh attempt. The credential is genuinely dead. */
  | 'unauthorized'
  /**
   * 403. The token is valid; this app or account may not read this.
   *
   * Distinct from `unauthorized` on purpose. X answers 403 for an entitlement
   * or permission problem, which reconnecting does not fix and which must not
   * mark the token dead — the same connection still publishes.
   */
  | 'forbidden'
  /** The response parsed but was not the shape the adapter expects. */
  | 'malformed'
  /** Anything unrecognised. Treated as temporary; see below. */
  | 'unknown';

export interface SyncFailure {
  kind: SyncFailureKind;
  /** Safe to store and show. Never carries a provider body or a credential. */
  message: string;
  /** Whether the connection's status may be changed on the strength of this. */
  affectsConnection: boolean;
  /** Whether to try this account again on a later tick. */
  retryable: boolean;
}

/**
 * The message stored against a failed sync.
 *
 * Written from the *classification*, never from the thrown error's own text.
 * `ProviderError` messages already exclude request bodies, but they do quote
 * the network's response detail, and `metric_sync_state.last_error` is read
 * straight into an API response. A fixed sentence per kind cannot leak an
 * access token, a refresh token, a client secret or an authorization code,
 * because it contains no interpolated data at all.
 */
const MESSAGES: Record<SyncFailureKind, string> = {
  temporary: 'The network could not be reached. FlowPost will try again.',
  rate_limited: 'Rate limited by the network. FlowPost will try again shortly.',
  unauthorized: 'The connection needs to be reconnected.',
  forbidden: 'This connection is not permitted to read analytics.',
  malformed: 'The network returned an unexpected response.',
  unknown: 'Analytics could not be collected. FlowPost will try again.',
};

/**
 * Classifies a thrown error.
 *
 * Unrecognised failures fall to `unknown`, which is **retryable and does not
 * touch the connection**. That default is the safe one in both directions: an
 * unknown failure retried a few times costs a handful of requests, whereas an
 * unknown failure treated as fatal silently ends a member's analytics with no
 * way to notice.
 */
export function classifySyncFailure(error: unknown): SyncFailure {
  const status =
    error instanceof ProviderError ? error.upstreamStatus : undefined;

  const of = (kind: SyncFailureKind, overrides: Partial<SyncFailure> = {}): SyncFailure => ({
    kind,
    message: MESSAGES[kind],
    affectsConnection: false,
    retryable: true,
    ...overrides,
  });

  if (status === 429) return of('rate_limited');
  if (status === 401) return of('unauthorized', { affectsConnection: true, retryable: false });
  if (status === 403) return of('forbidden', { retryable: false });
  if (status !== undefined && status >= 500) return of('temporary');

  // A 4xx that is none of the above — a malformed request on our side, or a
  // resource that is gone. Not retryable, and not the connection's fault.
  if (status !== undefined && status >= 400) return of('malformed', { retryable: false });

  if (error instanceof MalformedResponseError) return of('malformed', { retryable: false });

  return of('unknown');
}

/**
 * Thrown when a provider answered successfully but with something the adapter
 * cannot read.
 *
 * Its own type so it is never confused with a transport failure: a 200 carrying
 * nonsense is a code or contract problem, and retrying it forever would hide
 * that. Carries no payload — the body it failed to parse is exactly the thing
 * that must not be stored.
 */
export class MalformedResponseError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} returned an unexpected analytics response`);
    this.name = 'MalformedResponseError';
  }
}

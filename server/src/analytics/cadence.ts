/**
 * When a publication is worth asking about again, and when an account is.
 *
 * Pure arithmetic over timestamps — no database, no clock of its own, no
 * provider. That is deliberate: this file encodes the entire polling policy,
 * and a polling policy that can only be observed by watching production for
 * three days is one nobody can change safely.
 *
 * ─── The shape of the policy ─────────────────────────────────────────────────
 * A post's numbers move fast and then stop. Almost everything happens in the
 * first day; by day three the curve is flat. So:
 *
 *     T+1h   T+6h   T+24h   T+72h   then weekly
 *
 * Four observations while it matters, then a slow tail. A post published today
 * costs about eight reads over its entire measurable life, not one an hour
 * forever — which for X, where reads are billed per post, is the difference
 * between a few cents and a standing charge.
 *
 * ─── Why there is no `next_sync_at` column ───────────────────────────────────
 * Due-ness is *derived* from two timestamps we already store: when the post
 * went out (`post_platforms.published_at`) and when we last observed it
 * (`max(post_metric_snapshots.captured_at)`). Nothing is scheduled ahead of
 * time, so nothing can be left stale by a missed tick, a restart or a deploy —
 * the same property that makes the publish scheduler safe, for the same reason.
 * A worker that was asleep for six hours simply finds everything that became
 * due while it was away.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The observation points, as offsets from publication.
 *
 * Ascending, and the order is load-bearing — {@link isPublicationDue} walks it
 * to find the newest boundary that has passed.
 */
export const POST_SYNC_STAGES_MS = [
  1 * HOUR_MS,
  6 * HOUR_MS,
  24 * HOUR_MS,
  72 * HOUR_MS,
] as const;

/**
 * How often to look after the four staged observations are done.
 *
 * Weekly. A four-day-old post that gains impressions is gaining them slowly,
 * and the point of the tail is to notice a long-lived post at all rather than
 * to track it precisely.
 */
export const POST_SYNC_TAIL_INTERVAL_MS = 7 * DAY_MS;

/**
 * How often an account's own figures are worth re-reading.
 *
 * Daily. Follower counts are the input to long-run growth, which is measured in
 * weeks; sampling hourly would multiply the rows without adding a fact.
 */
export const ACCOUNT_SYNC_INTERVAL_MS = DAY_MS;

/**
 * The least time between two sync attempts against one connection.
 *
 * Pacing, distinct from the per-post cadence above. Without it, an account
 * holding posts at four different stages would be contacted on every tick;
 * with it, the worker gathers whatever is due and asks once. Thirty minutes is
 * fine enough that a T+1h observation lands between T+1h and T+1h30.
 */
export const ACCOUNT_MIN_SYNC_INTERVAL_MS = 30 * MINUTE_MS;

/**
 * How long to stand down after a network says "too many requests".
 *
 * Fifteen minutes, because that is X's rate-limit window: waiting exactly one
 * window is the shortest wait that can possibly succeed.
 *
 * ponytail: a fixed wait, not the `x-rate-limit-reset` header. Reading the
 * header would be more precise and needs the value plumbed through
 * `ProviderError`; do that when a second provider with a different window
 * arrives, not before.
 */
export const RATE_LIMIT_BACKOFF_MS = 15 * MINUTE_MS;

/**
 * Backoff after a failure that might not still be true later.
 *
 * Doubling from five minutes, capped at six hours. Capped rather than unbounded
 * because analytics are not urgent but they are also not abandonable: an
 * account whose network was down overnight should resume on its own the
 * following morning, not sit at a twelve-hour delay because it failed eleven
 * times.
 */
export function failureBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const doubling = 5 * MINUTE_MS * 2 ** (consecutiveFailures - 1);
  return Math.min(doubling, 6 * HOUR_MS);
}

/**
 * The newest staged boundary that has already passed for this publication, or
 * null when it is still younger than the first stage.
 *
 * Returning the *newest* rather than the next-unobserved one is what makes the
 * policy self-healing. A worker that was down from T+30m to T+30h does not owe
 * three catch-up reads; it owes one, at the T+24h boundary, because the T+1h
 * and T+6h numbers are no longer obtainable and asking for them now would just
 * return the T+30h figures three times.
 */
export function elapsedStageMs(ageMs: number): number | null {
  let latest: number | null = null;
  for (const stage of POST_SYNC_STAGES_MS) {
    if (ageMs >= stage) latest = stage;
    else break;
  }
  return latest;
}

/** One publication, as much of it as the cadence needs. */
export interface CadenceInput {
  publishedAt: Date;
  /** The newest observation we hold, or null if it has never been synced. */
  lastCapturedAt: Date | null;
}

/**
 * Whether this publication should be read now.
 *
 * `maxAgeMs` is the provider's own horizon — X serves post metrics for 30 days
 * and nothing older — and a publication past it is never due again, because no
 * amount of asking will produce an answer.
 */
export function isPublicationDue(
  input: CadenceInput,
  now: Date,
  maxAgeMs?: number,
): boolean {
  const ageMs = now.getTime() - input.publishedAt.getTime();

  // Published in the future, or clock skew. Not an error, just not due.
  if (ageMs < 0) return false;
  if (maxAgeMs !== undefined && ageMs > maxAgeMs) return false;

  const stage = elapsedStageMs(ageMs);

  // Younger than the first observation point. Reading a post ten minutes after
  // it went out mostly measures how fast we can make an HTTP request.
  if (stage === null) return false;

  // Never observed, and old enough to be worth observing.
  if (input.lastCapturedAt === null) return true;

  const lastMs = input.lastCapturedAt.getTime();
  const finalStage = POST_SYNC_STAGES_MS[POST_SYNC_STAGES_MS.length - 1]!;

  if (stage < finalStage) {
    // Mid-schedule: due when the newest elapsed boundary has not been observed.
    return lastMs < input.publishedAt.getTime() + stage;
  }

  // Past the staged schedule. The last stage still gets its own observation,
  // then the weekly tail takes over.
  if (lastMs < input.publishedAt.getTime() + finalStage) return true;
  return now.getTime() - lastMs >= POST_SYNC_TAIL_INTERVAL_MS;
}

/** Whether an account's own figures are stale enough to re-read. */
export function isAccountDue(
  lastAccountCaptureAt: Date | null,
  now: Date,
): boolean {
  if (lastAccountCaptureAt === null) return true;
  return now.getTime() - lastAccountCaptureAt.getTime() >= ACCOUNT_SYNC_INTERVAL_MS;
}

/** What the worker knows about a connection before deciding to contact it. */
export interface AccountPacingInput {
  lastSyncAt: Date | null;
  consecutiveFailures: number;
  rateLimitedUntil: Date | null;
}

/**
 * Whether this connection may be contacted at all right now.
 *
 * Three gates, checked in order of how much they cost to get wrong: an explicit
 * rate-limit stand-down, then the failure backoff, then ordinary pacing.
 * Deliberately separate from "is there anything due" — a connection can be
 * holding due posts and still have to wait, and conflating the two produces a
 * worker that retries a rate-limited account every thirty seconds because it
 * can see work.
 */
export function isAccountEligible(
  state: AccountPacingInput,
  now: Date,
): boolean {
  if (state.rateLimitedUntil && state.rateLimitedUntil.getTime() > now.getTime()) {
    return false;
  }

  if (state.lastSyncAt === null) return true;

  const sinceLast = now.getTime() - state.lastSyncAt.getTime();

  if (state.consecutiveFailures > 0) {
    return sinceLast >= failureBackoffMs(state.consecutiveFailures);
  }

  return sinceLast >= ACCOUNT_MIN_SYNC_INTERVAL_MS;
}

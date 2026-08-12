import type { AccountContext } from '../services/account-context';

/**
 * The three time dimensions FlowPost analytics reasons about.
 *
 * They are three *concepts*, not three settings on one date filter, and keeping
 * them apart is the difference between analytics that answer a question and
 * analytics that produce a number.
 *
 *   LIFETIME     "since you started with FlowPost". Every observation ever
 *                retained. Answers totals and long-run growth. Never narrowed
 *                by the intelligence window — choosing to analyse the last 20
 *                posts must not make the other 227 disappear from a lifetime
 *                count, which is the single most common way a dashboard starts
 *                lying to somebody.
 *
 *   PERIOD       "the last 30 days". A calendar range over the same
 *                observations. Answers reporting and growth charts. Bounded by
 *                dates, so a member who published nothing in the range sees
 *                zero posts — which is a true answer, unlike an intelligence
 *                window, which would reach back past the range to find twenty.
 *
 *   WINDOW       "your last 20 published posts". A *count* of publications, not
 *                a duration. Answers "what is working lately". Deliberately
 *                immune to publishing cadence: somebody who posts twice a month
 *                and somebody who posts daily both get twenty posts' worth of
 *                signal, where "last 30 days" would give the first four posts
 *                and the second ninety.
 *
 * A single generic date filter collapses all three, and the collapse is not
 * recoverable afterwards — that is why this file exists rather than a `from`
 * and `to` on every query.
 */

/** Every publication ever retained for the scope. */
export interface LifetimeDimension {
  kind: 'lifetime';
}

/** A calendar range. `to` is exclusive. */
export interface PeriodDimension {
  kind: 'period';
  from: Date;
  to: Date;
}

/** The last N publications, newest first. */
export interface WindowDimension {
  kind: 'window';
  size: IntelligenceWindowSize;
}

export type TimeDimension =
  | LifetimeDimension
  | PeriodDimension
  | WindowDimension;

/**
 * The sizes the intelligence window offers.
 *
 * A closed list rather than any integer. An open `?window=` is a way to ask for
 * a sample of three and get a confident-looking answer computed from it, and
 * every consumer of this window would then need its own minimum-sample guard.
 * Four sizes is what the product offers, so four is what the API accepts.
 */
export const INTELLIGENCE_WINDOW_SIZES = [10, 20, 30, 60] as const;

export type IntelligenceWindowSize = (typeof INTELLIGENCE_WINDOW_SIZES)[number];

/**
 * The default sample.
 *
 * Twenty is enough to see a media-type or caption-shape difference and short
 * enough to still mean "lately". It is explicitly *not* enough to place a best
 * posting time — see `MIN_POSTS_FOR_TIMING` below, which is why that feature is
 * not built on this window.
 */
export const DEFAULT_INTELLIGENCE_WINDOW: IntelligenceWindowSize = 20;

/**
 * How many published posts *per platform* a personal best-time recommendation
 * needs before it is worth making.
 *
 * Stated here, in the module that owns sampling, so that the number is on the
 * record before anything tries to use it — and so the reason is too. Twenty
 * posts spread over four weekday evenings is two or three observations per
 * slot, which will always produce a winner and will almost never produce the
 * same winner twice. Nothing in this phase reads this constant; it exists so
 * that when the best-time engine is built it starts from a stated threshold
 * rather than from whatever the intelligence window happened to be.
 */
export const MIN_POSTS_FOR_TIMING = 30;

/**
 * Who the numbers belong to.
 *
 * The user *and* the context, always together. Every analytics query takes one
 * of these and every one filters on all three fields, which is what makes
 * "never blend Personal and Brand" a property of the query layer rather than a
 * rule each caller has to remember. A brand scope carries its brandId; a
 * personal scope carries null, and `brandId: null` is a filter in its own right
 * — without it, a personal query would match every brand post the member has.
 */
export interface AnalyticsScope {
  userId: string;
  contextType: AccountContext['contextType'];
  brandId: string | null;
}

/** Binds an already-ownership-checked context to its user. */
export function scopeFor(
  userId: string,
  context: AccountContext,
): AnalyticsScope {
  return {
    userId,
    contextType: context.contextType,
    brandId: context.brandId,
  };
}

/** A malformed analytics query. Routes turn this into a 400. */
export class AnalyticsQueryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'AnalyticsQueryError';
  }
}

function singleValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Reads `?window=10|20|30|60`, defaulting to 20.
 *
 * An unrecognised value is refused rather than rounded to the nearest offered
 * size. `?window=25` means the caller believes it is getting 25 posts, and
 * quietly serving 20 or 30 makes every number downstream subtly not what was
 * asked for.
 */
export function readIntelligenceWindow(
  query: Record<string, unknown>,
): WindowDimension {
  const raw = singleValue(query.window);
  if (raw === undefined || raw === '') {
    return { kind: 'window', size: DEFAULT_INTELLIGENCE_WINDOW };
  }

  const parsed = Number(raw);
  const match = INTELLIGENCE_WINDOW_SIZES.find((size) => size === parsed);
  if (match === undefined) {
    throw new AnalyticsQueryError(
      `window must be one of ${INTELLIGENCE_WINDOW_SIZES.join(', ')}.`,
    );
  }

  return { kind: 'window', size: match };
}

/**
 * How far back a reporting period may be asked to reach.
 *
 * Three years is past the point where any connected network still serves
 * post-level data, so a wider range cannot return more — it can only scan more.
 */
const MAX_PERIOD_DAYS = 1_095;

const DAY_MS = 86_400_000;

/**
 * Reads the reporting dimension: `?period=lifetime` (the default), `?days=30`,
 * or an explicit `?from=&to=`.
 *
 * Lifetime is the default because it is the honest one. A member opening
 * analytics for the first time should see everything FlowPost has, not a
 * 30-day slice that happens to be empty because they published three weeks
 * before connecting.
 */
export function readReportingDimension(
  query: Record<string, unknown>,
  now: Date = new Date(),
): LifetimeDimension | PeriodDimension {
  const from = singleValue(query.from);
  const to = singleValue(query.to);
  const days = singleValue(query.days);
  const period = singleValue(query.period);

  if (period === 'lifetime' || (!from && !to && !days)) {
    return { kind: 'lifetime' };
  }

  if (days !== undefined && days !== '') {
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PERIOD_DAYS) {
      throw new AnalyticsQueryError(
        `days must be a whole number between 1 and ${MAX_PERIOD_DAYS}.`,
      );
    }
    return {
      kind: 'period',
      from: new Date(now.getTime() - parsed * DAY_MS),
      to: now,
    };
  }

  if (!from || !to) {
    throw new AnalyticsQueryError('A custom range needs both from and to.');
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AnalyticsQueryError('from and to must be ISO-8601 timestamps.');
  }
  if (fromDate >= toDate) {
    throw new AnalyticsQueryError('from must be earlier than to.');
  }
  if (toDate.getTime() - fromDate.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
    throw new AnalyticsQueryError(
      `A range may not span more than ${MAX_PERIOD_DAYS} days.`,
    );
  }

  return { kind: 'period', from: fromDate, to: toDate };
}

/**
 * Floors an instant to the top of its hour.
 *
 * The idempotency key for both snapshot tables. Two syncs inside the same hour
 * produce the same `captured_at` and the second collides with the unique index
 * and is skipped; the T+1h and T+6h observations land in different hours and
 * are both kept. That is the whole duplicate-snapshot strategy — no dedupe
 * pass, no read-before-write, one index doing the work.
 */
export function floorToHour(instant: Date): Date {
  const floored = new Date(instant.getTime());
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

import { analyticsRepository } from '../repositories/analytics.repository';
import { toTimingPublications } from '../analytics/publication-view';
import {
  DEFAULT_TIMING_GATES,
  bestTimeFor,
  formatLocalTime,
  occurrencesFor,
  type BestTimeRecommendation,
  type TimingBasis,
  type TimingConfidence,
  type TimingEvidence,
  type TimingGates,
  type TimingMetric,
} from '../analytics/timing';
import type { AnalyticsScope } from '../analytics/window';
import { getCatalogEntry, isKnownProvider } from '../providers/catalog';
import { isValidTimeZone } from '../scheduler/timezone';
import { env } from '../config/env';
import type { MediaType } from '../generated/prisma/enums';

/**
 * "When should I post this?", answered from this account's own history.
 *
 * The thin layer between the database and `analytics/timing.ts`: read the
 * publications in scope, reduce each to the two numbers timing needs, resolve
 * the member's clock, and hand the pure engine one call per network. No ranking
 * arithmetic lives here — that is all in `timing.ts`, which is why it can be
 * tested without a database.
 *
 * ─── Personal and Brand never meet ───────────────────────────────────────────
 * There is one query, and it takes an {@link AnalyticsScope}. Every read in
 * `analytics.repository` filters on user *and* context *and* brand together, so
 * a personal Instagram history cannot reach a brand's recommendation and Brand
 * A's cannot reach Brand B's — not by convention, but because no function here
 * accepts anything smaller than a scope.
 *
 * ─── Failure is not an error ──────────────────────────────────────────────────
 * Every path returns a recommendation object, including "no recommendation".
 * Nothing here throws for missing data, because a member with no history is the
 * normal case on day one and the composer must still open. Scheduling works
 * whether or not this service answers.
 */

// ─── Gates ───────────────────────────────────────────────────────────────────

/** Reads a positive integer override, ignoring anything that is not one. */
function positiveInt(raw: string): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The sample gates in force, defaults with environment overrides applied.
 *
 * Computed per call rather than at module load so a test can set the variables
 * and a deployment can change them without a rebuild. `strong` is floored at
 * `early` — a configuration where "strong" is reachable before "early" would
 * make the two labels meaningless, and silently swapping them would be worse
 * than clamping.
 */
export function timingGates(): TimingGates {
  const early = positiveInt(env.BEST_TIME_MIN_EARLY) ?? DEFAULT_TIMING_GATES.early;
  const strong = positiveInt(env.BEST_TIME_MIN_STRONG) ?? DEFAULT_TIMING_GATES.strong;

  return {
    ...DEFAULT_TIMING_GATES,
    early,
    strong: Math.max(early, strong),
  };
}

// ─── Wire shape ──────────────────────────────────────────────────────────────

/**
 * One network's answer, as the browser reads it.
 *
 * Times are `HH:mm` strings rather than minute counts, and the two prefill
 * fields are `YYYY-MM-DDTHH:mm`. Both are the formats the composer's existing
 * inputs and the schedule API already take, so nothing on the client has to do
 * clock arithmetic — which is the point, since the client is the one place that
 * genuinely does not know the member's scheduling zone for certain.
 */
export interface BestTimeEntry {
  provider: string;
  /** The network's display name, for the sentence. */
  label: string;
  confidence: TimingConfidence;
  basis: TimingBasis | null;
  metric: TimingMetric | null;
  evidence: TimingEvidence;
  timezone: string;
  sampleSize: number;
  /** `20:30`, or null when there is no recommendation. */
  recommendedTime: string | null;
  /** The hour it sits in, e.g. `{ start: '20:00', end: '21:00' }`. */
  window: { start: string; end: string } | null;
  /** The half-hour choices spanning the window. */
  slots: string[];
  /** Other windows that also beat the median, strongest first. */
  alternatives: string[];
  /** Whole percent above the member's median, e.g. `31`. Null when unclaimable. */
  liftPercent: number | null;
  /** Local weekdays the evidence spans, 0 = Sunday. Breadth, not a claim. */
  weekdaysObserved: number[];
  reason: string;
  /** Local wall clock for the scheduler. Null once the window has passed today. */
  today: string | null;
  tomorrow: string | null;
}

export interface BestTimeResult {
  scope: { contextType: string; brandId: string | null };
  timezone: string | null;
  /** How the zone was established, so the UI can say whose clock this is. */
  timezoneSource: 'request' | 'history' | 'none';
  gates: { early: number; strong: number };
  /** One entry per network asked about, in the order requested. */
  platforms: BestTimeEntry[];
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

/** The display name, falling back to the stored id for a network we do not model. */
function labelFor(provider: string): string {
  return isKnownProvider(provider)
    ? (getCatalogEntry(provider)?.displayName ?? provider)
    : provider;
}

/** The engine's minute counts turned into the wire's clock strings. */
function toEntry(
  recommendation: BestTimeRecommendation,
  label: string,
  now: Date,
): BestTimeEntry {
  const occurrences =
    recommendation.recommendedMinutes === null
      ? null
      : occurrencesFor(recommendation.recommendedMinutes, recommendation.timeZone, now);

  return {
    provider: recommendation.provider,
    label,
    confidence: recommendation.confidence,
    basis: recommendation.basis,
    metric: recommendation.metric,
    evidence: recommendation.evidence,
    timezone: recommendation.timeZone,
    sampleSize: recommendation.sampleSize,
    recommendedTime:
      recommendation.recommendedMinutes === null
        ? null
        : formatLocalTime(recommendation.recommendedMinutes),
    window: recommendation.window
      ? {
          start: formatLocalTime(recommendation.window.startMinutes),
          end: formatLocalTime(recommendation.window.endMinutes),
        }
      : null,
    slots: recommendation.slots.map(formatLocalTime),
    alternatives: recommendation.alternatives.map(formatLocalTime),
    // Rounded to a whole percent: "31%" is the claim the sample supports, and
    // "30.7%" implies a precision 42 posts do not carry.
    liftPercent:
      recommendation.lift === null ? null : Math.round(recommendation.lift * 100),
    weekdaysObserved: recommendation.weekdaysObserved,
    reason: recommendation.reason,
    today: occurrences?.today ?? null,
    tomorrow: occurrences?.tomorrow ?? null,
  };
}

// ─── The query ───────────────────────────────────────────────────────────────

export interface BestTimeOptions {
  /**
   * Which networks to answer for. Empty means every network this scope has
   * published to — which is what the analytics page wants, where the composer
   * passes the platforms actually selected.
   */
  providers?: string[];
  /** The format being planned, so a Reel time can come from Reels. */
  format?: MediaType | null;
  /**
   * The zone the member is scheduling in right now, from the composer's own
   * picker. Takes precedence over history: it is the clock the recommendation
   * will actually be applied on, and a member who has moved should get times in
   * the zone they are in rather than the one they used last year.
   */
  timezone?: string | null;
  now?: Date;
}

/**
 * The best time to post, per network, for one scope.
 *
 * Reads lifetime rather than the intelligence window on purpose. Twenty posts
 * is the right sample for "what is working lately" and far too small to place
 * an hour of the day — the whole reason `MIN_POSTS_FOR_TIMING` is 30 and not
 * `DEFAULT_INTELLIGENCE_WINDOW`. Timing wants every publication there is.
 *
 * ponytail: one lifetime read, mapped in memory. `findPublishedPublications`
 * carries a correlated subquery per publication and selects the post's caption
 * and media, none of which timing uses — fine for the hundreds of publications
 * a real account has. If an account with thousands makes this slow, the upgrade
 * is a lean projection (provider, published_at, media_type, content_type, latest
 * snapshot) behind its own repository function, not a cache.
 */
export async function bestTimes(
  scope: AnalyticsScope,
  options: BestTimeOptions = {},
): Promise<BestTimeResult> {
  const now = options.now ?? new Date();
  const gates = timingGates();

  const requested = (options.timezone ?? '').trim();
  const [publications, historyZone] = await Promise.all([
    analyticsRepository.findPublishedPublications(scope, {
      dimension: { kind: 'lifetime' },
    }),
    // Only asked for when it would be used — a valid request zone settles it.
    requested && isValidTimeZone(requested)
      ? Promise.resolve<string | null>(null)
      : analyticsRepository.findScopeTimezone(scope),
  ]);

  const timezone =
    requested && isValidTimeZone(requested)
      ? requested
      : historyZone && isValidTimeZone(historyZone)
        ? historyZone
        : null;

  const timezoneSource: BestTimeResult['timezoneSource'] =
    timezone === null ? 'none' : timezone === requested ? 'request' : 'history';

  const timing = toTimingPublications(publications);

  // Every network asked about, or every one with history when none was named.
  const providers =
    options.providers && options.providers.length > 0
      ? options.providers
      : [...new Set(timing.map((publication) => publication.provider))].sort();

  const base = {
    scope: { contextType: scope.contextType, brandId: scope.brandId },
    timezone,
    timezoneSource,
    gates: { early: gates.early, strong: gates.strong },
  };

  // No clock, no recommendation. Guessing UTC would put an Indian member's
  // evening slot in the middle of their afternoon and label it evidence.
  if (timezone === null) {
    return {
      ...base,
      platforms: providers.map((provider) => ({
        provider,
        label: labelFor(provider),
        confidence: 'none' as const,
        basis: null,
        metric: null,
        evidence: 'publish_history' as const,
        timezone: '',
        sampleSize: 0,
        recommendedTime: null,
        window: null,
        slots: [],
        alternatives: [],
        liftPercent: null,
        weekdaysObserved: [],
        reason:
          'Schedule a post once so FlowPost knows which timezone you post in, then it can work out your best time.',
        today: null,
        tomorrow: null,
      })),
    };
  }

  return {
    ...base,
    platforms: providers.map((provider) => {
      const label = labelFor(provider);
      return toEntry(
        bestTimeFor({
          provider,
          label,
          publications: timing,
          timeZone: timezone,
          format: options.format ?? null,
          gates,
        }),
        label,
        now,
      );
    }),
  };
}

export const bestTimeService = { bestTimes, timingGates };

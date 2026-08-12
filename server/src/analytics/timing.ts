import { MIN_POSTS_FOR_TIMING } from './window';
import { utcToZonedLocalIso } from '../scheduler/timezone';
import type { MediaType } from '../generated/prisma/enums';

/**
 * When this account's own posts have actually performed best.
 *
 * ─── What this is not ────────────────────────────────────────────────────────
 * It is not "Instagram users are most active at 8 PM". Nothing in FlowPost
 * collects audience-activity data — no network it integrates exposes
 * follower-online hours through the connections we hold (see
 * `TIMING_EVIDENCE_BY_PROVIDER` below) — so the only honest timing signal
 * available is the member's own publish history paired with what those posts
 * measured. Every sentence this module produces says *your posts performed*,
 * never *your audience is online*, and the distinction is enforced by
 * {@link TimingEvidence} rather than left to whoever writes the copy.
 *
 * ─── Why medians, not sums ───────────────────────────────────────────────────
 * One post that went unusually well would otherwise elect its own hour for
 * ever. A bucket is judged by the *median* of its posts and compared against
 * the median of the whole group, so a single outlier moves nothing and a bucket
 * only wins by being consistently better.
 *
 * ─── Why exposure normalisation ──────────────────────────────────────────────
 * 100 interactions on 10,000 impressions is a weaker post than 50 on 1,000, and
 * ranking hours by raw interaction count reliably recommends whenever the
 * account happened to be biggest rather than whenever its posts land best. So a
 * rate is preferred wherever the network reports exposure at all, and where it
 * does not — Facebook reports no exposure metric whatsoever at Graph v26 — the
 * fall back to counts is *declared* in {@link TimingMetric} rather than
 * silently mixed in. Two publications are never scored on different metrics
 * inside one comparison.
 *
 * Everything here is pure: no database, no provider, no clock of its own. The
 * instant is a parameter so the fallback chain and the sample gates can be
 * tested against fixed dates.
 */

// ─── Evidence ────────────────────────────────────────────────────────────────

/**
 * Where a recommendation's authority comes from.
 *
 *   publish_history    this member's own publications and their measured
 *                      performance. The only source in use today.
 *   audience_activity  the network's own report of when this account's
 *                      followers are active. Declared, never claimed — see
 *                      {@link TIMING_EVIDENCE_BY_PROVIDER}.
 *
 * A union rather than a boolean because the two license *different sentences*.
 * Only `audience_activity` may say "your followers are most active around
 * then"; `publish_history` may only say "your posts have performed best around
 * then", which is a claim about the posts and not about the people.
 */
export type TimingEvidence = 'publish_history' | 'audience_activity';

/**
 * Which networks expose audience-activity timing *through the integration
 * FlowPost actually holds*.
 *
 * All false, and that is a statement about this codebase rather than about the
 * platforms. Instagram's professional-account Insights do report follower
 * activity for eligible accounts, and Facebook Page Insights report when a
 * Page's audience is on Facebook — but neither is fetched anywhere in
 * `providers/`, neither is stored by any column of `account_metric_snapshots`,
 * and reading them needs scopes this app has not requested. Declaring the
 * capability here and reporting it false is what lets the engine *never* claim
 * audience activity while leaving exactly one entry to flip the day a provider
 * adapter starts populating it.
 *
 * ponytail: a declaration, not a fetch. Flip an entry and add the read in the
 * provider's `analytics.ts` together — this table must only ever describe what
 * that file genuinely populates, the same contract `metric-support.ts` keeps.
 */
export const TIMING_EVIDENCE_BY_PROVIDER: Record<string, boolean> = {
  instagram: false,
  facebook: false,
  linkedin: false,
  x: false,
};

/** Whether audience-activity evidence is available for one network. */
export function hasAudienceActivity(provider: string): boolean {
  return TIMING_EVIDENCE_BY_PROVIDER[provider] === true;
}

// ─── Confidence and gates ────────────────────────────────────────────────────

/**
 * How much of a timing recommendation to believe.
 *
 * `none` is a real answer and the reason the UI has a "not enough history yet"
 * branch. A winner computed from four posts always exists and is almost never
 * the same winner twice.
 */
export type TimingConfidence = 'none' | 'early' | 'strong';

/**
 * The thresholds, in one place and passed in rather than read from a module
 * constant at each use site.
 *
 * `strong` defaults to {@link MIN_POSTS_FOR_TIMING}, which the analytics
 * foundation declared for exactly this purpose — restating 30 here would create
 * the second source of truth that constant exists to prevent. The service
 * layer applies environment overrides on top; nothing else in the codebase
 * hardcodes any of these four numbers.
 */
export interface TimingGates {
  /** Below this, no personalised recommendation at all. */
  early: number;
  /** At or above this, a recommendation may be called strong. */
  strong: number;
  /** Fewest publications in one hour bucket before it may be recommended. */
  minBucketPosts: number;
  /** Fewest publications in a half-hour slot before the peak is narrowed to it. */
  minSlotPosts: number;
}

export const DEFAULT_TIMING_GATES: TimingGates = {
  early: 10,
  strong: MIN_POSTS_FOR_TIMING,
  minBucketPosts: 3,
  minSlotPosts: 5,
};

function confidenceFor(sampleSize: number, gates: TimingGates): TimingConfidence {
  if (sampleSize < gates.early) return 'none';
  return sampleSize >= gates.strong ? 'strong' : 'early';
}

// ─── Input ───────────────────────────────────────────────────────────────────

/**
 * One publication, reduced to what timing needs.
 *
 * `engagement` and `exposure` arrive already derived by `normalise.ts` —
 * `engagementOf` and `exposureOf` — so the null-propagation rule is enforced in
 * one place rather than restated here. Null means the network did not report
 * it, and a publication with no engagement figure is not scoreable at all.
 */
export interface TimingPublication {
  provider: string;
  publishedAt: Date;
  /** The network's own word for the format, when it gave one. */
  mediaType: MediaType | null;
  /** What the member asked to publish it as. */
  contentType: MediaType | null;
  engagement: number | null;
  /** Impressions, or views where that is the exposure metric. Never reach. */
  exposure: number | null;
}

/**
 * Which slice of history a recommendation was computed from.
 *
 * Disclosed on every result because it changes what the answer means: a Reel
 * time drawn from every Instagram post is a platform habit, not a Reel habit,
 * and presenting the two identically would let "best time for a Reel" be
 * answered by posts that were not Reels.
 */
export type TimingBasis = 'content_type' | 'media_type' | 'platform';

/** Which number the hours were ranked on. */
export type TimingMetric = 'engagement_rate' | 'engagement';

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** The median of a non-empty list. Even lengths take the mean of the middle two. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * One publication's score, or null when it cannot be scored on this metric.
 *
 * A rate needs both halves and a positive denominator; a count needs only the
 * engagement figure. Null propagates — an unscoreable publication is dropped
 * from the sample rather than counted as a zero, which would drag down whatever
 * hour it happened to fall in.
 */
export function scoreOf(
  publication: TimingPublication,
  metric: TimingMetric,
): number | null {
  const { engagement, exposure } = publication;
  if (engagement === null) return null;
  if (metric === 'engagement') return engagement;
  if (exposure === null || exposure <= 0) return null;
  return engagement / exposure;
}

/**
 * Which metric this sample supports.
 *
 * Rate wherever enough publications carry an exposure figure to clear the
 * lowest sample gate, counts otherwise. Deliberately all-or-nothing per
 * comparison: scoring some hours on a rate and others on a count would rank
 * them against each other on different scales, which is the failure mode the
 * declaration exists to prevent.
 */
export function chooseMetric(
  publications: TimingPublication[],
  gates: TimingGates = DEFAULT_TIMING_GATES,
): TimingMetric {
  const rateable = publications.filter(
    (publication) => scoreOf(publication, 'engagement_rate') !== null,
  ).length;
  return rateable >= gates.early ? 'engagement_rate' : 'engagement';
}

// ─── The fallback chain ──────────────────────────────────────────────────────

/**
 * The narrowest slice of history that still has enough posts to speak for.
 *
 * Content type first, then the observed format, then the whole platform. Each
 * step is tried against the lowest gate — a slice that cannot even reach "early
 * signal" cannot be the basis of a recommendation, so widening is correct
 * rather than a compromise.
 *
 * `format` null means the caller did not name one, in which case there is
 * nothing to narrow by and the platform slice is the honest answer immediately.
 */
export function selectBasis(
  publications: TimingPublication[],
  format: MediaType | null,
  gates: TimingGates = DEFAULT_TIMING_GATES,
): { publications: TimingPublication[]; basis: TimingBasis } {
  if (format !== null) {
    const byContentType = publications.filter(
      (publication) => publication.contentType === format,
    );
    if (scoreable(byContentType, gates) >= gates.early) {
      return { publications: byContentType, basis: 'content_type' };
    }

    const byMediaType = publications.filter(
      (publication) => publication.mediaType === format,
    );
    if (scoreable(byMediaType, gates) >= gates.early) {
      return { publications: byMediaType, basis: 'media_type' };
    }
  }

  return { publications, basis: 'platform' };
}

/** How many of these could actually be scored on the metric they support. */
function scoreable(
  publications: TimingPublication[],
  gates: TimingGates,
): number {
  const metric = chooseMetric(publications, gates);
  return publications.filter(
    (publication) => scoreOf(publication, metric) !== null,
  ).length;
}

// ─── Local time ──────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 1440;
/** One hour. The bucket width — see the note on {@link bucketBy}. */
export const BUCKET_MINUTES = 60;
/** Half an hour. What a member is offered inside the winning bucket. */
export const SLOT_MINUTES = 30;

/** Minutes from local midnight, plus the local weekday, for one instant. */
export interface LocalTime {
  /** 0–1439. */
  minutes: number;
  /** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
  weekday: number;
}

/**
 * Where an instant falls on the member's own clock.
 *
 * Built on the scheduler's `utcToZonedLocalIso` rather than on a second
 * timezone implementation: that function already resolves DST correctly and is
 * already the thing the publish path trusts, so a best-time bucket and a
 * scheduled publish agree about what "20:30 in Asia/Kolkata" means. Reading the
 * weekday back by reinterpreting the local ISO string as UTC is safe precisely
 * because the string carries no offset — the calendar day in it is the local
 * one, which is the day whose weekday we want.
 */
export function localTimeOf(instant: Date, timeZone: string): LocalTime {
  const localIso = utcToZonedLocalIso(instant, timeZone);
  const [datePart, timePart] = localIso.split('T');
  const [hours, minutes] = timePart.split(':').map(Number);
  return {
    minutes: hours * 60 + minutes,
    weekday: new Date(`${datePart}T00:00:00.000Z`).getUTCDay(),
  };
}

/** `20:30` for 1230. The wire format, and what the scheduler's time input takes. */
export function formatLocalTime(minutes: number): string {
  const normalised = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalised / 60);
  const rest = normalised % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * `8:30 PM` for 1230. Prose only — never a wire value.
 *
 * Separate from {@link formatLocalTime} because the two have different jobs and
 * must not be swapped: that one produces the `HH:mm` the scheduler's time input
 * and the schedule API parse, and this one produces the clock a member reads.
 * Sharing a formatter meant {@link explain} quoting "20:00–21:00" inside a
 * sentence sitting directly under a panel showing "8:00 PM–9:00 PM" — the same
 * window, twice, in two notations.
 */
export function formatClock(minutes: number): string {
  const normalised = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(normalised / 60);
  const rest = normalised % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(rest).padStart(2, '0')} ${suffix}`;
}

/**
 * When a recommended time next comes round, as the scheduler's own wire format.
 *
 * `YYYY-MM-DDTHH:mm` with no offset — deliberately the exact shape
 * `POST /api/scheduled-posts` already takes for `scheduledAt`, paired with the
 * same IANA zone. That is what makes "Schedule at 20:30" a *prefill* of the
 * existing scheduler rather than a second scheduling path: the recommendation
 * hands over a local wall clock and a zone, and `zonedTimeToUtc` on the publish
 * side resolves the instant exactly as it does for a time the member typed.
 *
 * `today` is null once the window has passed on the member's clock — offering
 * to schedule a post for 8:30 PM at 11 PM is offering a time in the past, which
 * the schedule API would rightly refuse.
 */
export interface TimingOccurrences {
  /** Null when the time has already gone by locally today. */
  today: string | null;
  tomorrow: string;
}

export function occurrencesFor(
  minutes: number,
  timeZone: string,
  now: Date,
): TimingOccurrences {
  const localIso = utcToZonedLocalIso(now, timeZone);
  const [today, timePart] = localIso.split('T');
  const [nowHours, nowMinutes] = timePart.split(':').map(Number);
  const nowLocalMinutes = nowHours * 60 + nowMinutes;

  const clock = formatLocalTime(minutes);
  // Date-only arithmetic in UTC, which is safe precisely because there is no
  // time of day in it: adding a day to a calendar date cannot cross a DST
  // boundary the way adding 86,400,000ms to an instant can.
  const tomorrow = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  return {
    today: minutes > nowLocalMinutes ? `${today}T${clock}` : null,
    tomorrow: `${tomorrow}T${clock}`,
  };
}

// ─── Buckets ─────────────────────────────────────────────────────────────────

export interface TimingBucket {
  /** Minutes from local midnight where the bucket starts. */
  startMinutes: number;
  /** How many scored publications fell in it. */
  n: number;
  /** The median score of those publications. */
  score: number;
  /** Local weekdays represented, ascending. Evidence breadth, never a per-day claim. */
  weekdays: number[];
}

/**
 * Publications grouped into hour-of-day buckets on the member's clock.
 *
 * An hour rather than the half hour the result finally offers, and rather than
 * the (weekday × half hour) grid the shape of the question invites. 336 cells
 * over 30 posts is a grid where the winner is whichever cell holds one post,
 * and it would look far more precise than the 30 posts behind it. The hour is
 * the coarsest bucket that still answers "morning or evening", and the peak is
 * narrowed to a half hour only where that half hour has its own sample — see
 * {@link narrowToSlot}.
 *
 * ponytail: time-of-day only. Weekday is reported as evidence breadth rather
 * than modelled, so this cannot answer "Tuesdays beat Fridays". Upgrade to a
 * weekday dimension when a real account carries enough publications per weekday
 * to clear `minBucketPosts` in a (weekday × hour) cell — which is roughly 500
 * publications, not 30.
 */
export function bucketBy(
  publications: TimingPublication[],
  timeZone: string,
  metric: TimingMetric,
): TimingBucket[] {
  const scores = new Map<number, number[]>();
  const weekdays = new Map<number, Set<number>>();

  for (const publication of publications) {
    const score = scoreOf(publication, metric);
    if (score === null) continue;

    const local = localTimeOf(publication.publishedAt, timeZone);
    const start = Math.floor(local.minutes / BUCKET_MINUTES) * BUCKET_MINUTES;

    const bucket = scores.get(start);
    if (bucket) bucket.push(score);
    else scores.set(start, [score]);

    const days = weekdays.get(start);
    if (days) days.add(local.weekday);
    else weekdays.set(start, new Set([local.weekday]));
  }

  return [...scores.entries()]
    .map(([startMinutes, values]) => ({
      startMinutes,
      n: values.length,
      // Non-null: a key only exists because at least one score was pushed.
      score: median(values) as number,
      weekdays: [...(weekdays.get(startMinutes) ?? [])].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.score - a.score || a.startMinutes - b.startMinutes);
}

/**
 * The half hour inside a bucket that actually carries the performance, when one
 * of them demonstrably does.
 *
 * Returns the bucket's own start unless the better half clears
 * `minSlotPosts` on its own. Splitting a three-post hour into two halves and
 * recommending 20:30 because two of them landed there is precision invented
 * from the same three posts.
 */
export function narrowToSlot(
  publications: TimingPublication[],
  timeZone: string,
  metric: TimingMetric,
  bucketStart: number,
  gates: TimingGates = DEFAULT_TIMING_GATES,
): number {
  const halves = new Map<number, number[]>();

  for (const publication of publications) {
    const score = scoreOf(publication, metric);
    if (score === null) continue;

    const { minutes } = localTimeOf(publication.publishedAt, timeZone);
    if (Math.floor(minutes / BUCKET_MINUTES) * BUCKET_MINUTES !== bucketStart) continue;

    const slot = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
    const values = halves.get(slot);
    if (values) values.push(score);
    else halves.set(slot, [score]);
  }

  const eligible = [...halves.entries()]
    .filter(([, values]) => values.length >= gates.minSlotPosts)
    .map(([slot, values]) => ({ slot, score: median(values) as number }))
    .sort((a, b) => b.score - a.score || a.slot - b.slot);

  return eligible.length > 0 ? eligible[0].slot : bucketStart;
}

// ─── The recommendation ──────────────────────────────────────────────────────

export interface TimingWindow {
  /** Minutes from local midnight. */
  startMinutes: number;
  /** Exclusive. */
  endMinutes: number;
}

export interface BestTimeRecommendation {
  provider: string;
  confidence: TimingConfidence;
  /** Null when confidence is `none`. */
  basis: TimingBasis | null;
  /** Null when confidence is `none`. */
  metric: TimingMetric | null;
  evidence: TimingEvidence;
  /** The IANA zone every time in this result is expressed in. */
  timeZone: string;
  /** Scored publications behind it. The number the UI quotes. */
  sampleSize: number;
  /** Minutes from local midnight. Null when there is no recommendation. */
  recommendedMinutes: number | null;
  /** The hour the recommendation sits in. Null with no recommendation. */
  window: TimingWindow | null;
  /** The half-hour choices spanning the window, ascending. */
  slots: number[];
  /** Other hours that also beat the median, strongest first. */
  alternatives: number[];
  /**
   * How far above the member's own median the winning window ran, e.g. `0.31`.
   *
   * Null when it cannot be stated honestly: no median to compare against, a
   * non-positive median, or a winner that is not actually above it. A null here
   * is why {@link reason} sometimes names a window without a percentage.
   */
  lift: number | null;
  /** Local weekdays the evidence spans. Breadth, not a per-day recommendation. */
  weekdaysObserved: number[];
  /** The sentence shown to the member. Never claims audience activity. */
  reason: string;
}

export interface BestTimeInput {
  provider: string;
  /** Display name for the sentence, e.g. `Instagram`. */
  label: string;
  publications: TimingPublication[];
  timeZone: string;
  /** The format being planned, when the member has chosen one. */
  format?: MediaType | null;
  gates?: TimingGates;
}

/** How many alternative windows to offer. Two — a third is noise. */
const MAX_ALTERNATIVES = 2;

/**
 * The whole calculation, for one network.
 *
 * One network per call by construction, and the reason is
 * `metric-support.ts`: Instagram measures reach, LinkedIn measures impressions,
 * Facebook measures no exposure at all. A single ranking over two networks
 * would be a ranking over two different measurements, so there is no signature
 * here that can express one.
 */
export function bestTimeFor({
  provider,
  label,
  publications,
  timeZone,
  format = null,
  gates = DEFAULT_TIMING_GATES,
}: BestTimeInput): BestTimeRecommendation {
  const evidence: TimingEvidence = hasAudienceActivity(provider)
    ? 'audience_activity'
    : 'publish_history';

  const mine = publications.filter(
    (publication) => publication.provider === provider,
  );
  const { publications: slice, basis } = selectBasis(mine, format, gates);
  const metric = chooseMetric(slice, gates);
  const buckets = bucketBy(slice, timeZone, metric);

  // The median every bucket is judged against is the median of the individual
  // publications, not the median of the bucket medians — the second would let a
  // quiet hour with two posts weigh as much as a busy one with twenty.
  const scores = slice
    .map((publication) => scoreOf(publication, metric))
    .filter((score): score is number => score !== null);
  const groupMedian = median(scores);
  const sampleSize = scores.length;
  const confidence = confidenceFor(sampleSize, gates);

  const none = (reason: string): BestTimeRecommendation => ({
    provider,
    confidence: 'none',
    basis: null,
    metric: null,
    evidence,
    timeZone,
    sampleSize,
    recommendedMinutes: null,
    window: null,
    slots: [],
    alternatives: [],
    lift: null,
    weekdaysObserved: [],
    reason,
  });

  if (confidence === 'none') {
    return none('Not enough history yet.');
  }

  const eligible = buckets.filter((bucket) => bucket.n >= gates.minBucketPosts);
  if (eligible.length === 0) {
    // Enough posts overall, but spread so thinly that no single hour has three
    // of them. Recommending the best of a set of one-post hours is exactly the
    // coin toss the bucket gate exists to refuse.
    return none(
      `Your ${label} posts are spread too evenly across the day to name a best time yet.`,
    );
  }

  const best = eligible[0];

  const lift =
    groupMedian !== null && groupMedian > 0 && best.score > groupMedian
      ? best.score / groupMedian - 1
      : null;

  const window: TimingWindow = {
    startMinutes: best.startMinutes,
    endMinutes: best.startMinutes + BUCKET_MINUTES,
  };

  const recommendedMinutes = narrowToSlot(
    slice,
    timeZone,
    metric,
    best.startMinutes,
    gates,
  );

  // The three choices spanning the window: its two halves and the top of the
  // next hour. A member told "8–9 PM" reaches for 8:00, 8:30 or 9:00.
  const slots = [
    window.startMinutes,
    window.startMinutes + SLOT_MINUTES,
    window.endMinutes,
  ];

  const alternatives = eligible
    .slice(1)
    .filter((bucket) => groupMedian === null || bucket.score > groupMedian)
    .slice(0, MAX_ALTERNATIVES)
    .map((bucket) => bucket.startMinutes);

  const weekdaysObserved = [
    ...new Set(buckets.flatMap((bucket) => bucket.weekdays)),
  ].sort((a, b) => a - b);

  return {
    provider,
    confidence,
    basis,
    metric,
    evidence,
    timeZone,
    sampleSize,
    recommendedMinutes,
    window,
    slots,
    alternatives,
    lift,
    weekdaysObserved,
    reason: explain({ label, confidence, basis, window, lift, sampleSize, format }),
  };
}

/**
 * The sentence, assembled from what the numbers actually support.
 *
 * Three rules it exists to keep:
 *  - It says *your posts performed*, never *your audience is active*. Only
 *    `audience_activity` evidence licenses the second, and nothing produces
 *    that evidence yet.
 *  - It quotes the sample every time. "Based on 42 measured posts" is what
 *    turns a number into a claim somebody can weigh.
 *  - It names the basis when the answer came from wider history than was asked
 *    for, so a Reel time drawn from all Instagram posts says so.
 */
function explain({
  label,
  confidence,
  basis,
  window,
  lift,
  sampleSize,
  format,
}: {
  label: string;
  confidence: TimingConfidence;
  basis: TimingBasis;
  window: TimingWindow;
  lift: number | null;
  sampleSize: number;
  format: MediaType | null;
}): string {
  // The reader's clock, not the wire's. See `formatClock`.
  const range = `${formatClock(window.startMinutes)}–${formatClock(window.endMinutes)}`;
  const posts = `${sampleSize} measured post${sampleSize === 1 ? '' : 's'}`;

  const performance =
    lift === null
      ? `Your ${label} posts published around ${range} have performed best.`
      : `Your ${label} posts published around ${range} have performed ${Math.round(lift * 100)}% above your median.`;

  const widened =
    format !== null && basis === 'platform'
      ? ` Drawn from all your ${label} posts — not enough ${format.toLowerCase()} history on its own yet.`
      : '';

  const strength =
    confidence === 'early'
      ? ` Early signal, based on only ${posts}.`
      : ` Based on ${posts}.`;

  return `${performance}${strength}${widened}`;
}

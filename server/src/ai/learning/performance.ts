import {
  chooseMetric,
  median,
  scoreOf,
  DEFAULT_TIMING_GATES,
  type TimingMetric,
} from '../../analytics/timing';
import { platformLabel } from '../analysis/platform-rules';
import {
  evidenceFor,
  isStatable,
  renderSignal,
  type EvidenceGates,
  type LearnedSignal,
  EVIDENCE_GATES,
} from './evidence';
import type { CaptionedPublication } from './hashtag-history';
import type { MediaType } from '../../generated/prisma/enums';

/**
 * What has actually worked for this account, learned from its own numbers.
 *
 * The piece the writing prompt was missing. Brand memory already knew *how* this
 * account writes (`ai/style/`) and what its brand claims to be
 * (`ai/brand/brand-profile.ts`); neither knew which of its posts did well. So
 * the model could sound like the brand and had no idea that its carousels
 * outperform its single images.
 *
 * ─── Nothing here compares two networks ──────────────────────────────────────
 * The single hardest rule in this file, and the one a reader will be tempted to
 * relax. Instagram reports **reach** (unique accounts), LinkedIn reports
 * **impressions** (appearances), and Facebook reports no exposure at all — see
 * `analytics/metric-support.ts`. So "Instagram outperforms LinkedIn for you" is
 * not a sentence this data can support at any sample size, and the shape of
 * {@link PerformanceProfile} is what prevents it: every signal is scoped inside
 * one platform's own median, and there is no field capable of holding a
 * cross-platform ranking.
 *
 * What it *can* say is "within your Instagram, carousels sit above your median",
 * which is the actionable half anyway.
 *
 * ─── Correlation, and a floor ────────────────────────────────────────────────
 * Every claim is hedged by `evidence.ts` and carries its count. Nothing is
 * stated from fewer than three posts, and no phrasing says a format *caused* a
 * result.
 *
 * Pure: publications and captions in, sentences out. No database, no model.
 */

/** Where a caption sits on length. Three bands, because five would not fill. */
export type CaptionLengthBand = 'short' | 'medium' | 'long';

/**
 * The band boundaries, in characters.
 *
 * 80 is roughly a single line on a phone; 300 is past the fold on every network
 * FlowPost publishes to. Both are about how a caption is *read* rather than
 * about round numbers, which is why they are not 100 and 500.
 */
const SHORT_MAX = 80;
const MEDIUM_MAX = 300;

export function lengthBandOf(caption: string): CaptionLengthBand {
  const length = caption.trim().length;
  if (length <= SHORT_MAX) return 'short';
  return length <= MEDIUM_MAX ? 'medium' : 'long';
}

const BAND_LABEL: Record<CaptionLengthBand, string> = {
  short: 'short captions (a line or so)',
  medium: 'medium-length captions',
  long: 'long captions',
};

const FORMAT_LABEL: Record<string, string> = {
  TEXT: 'text-only posts',
  IMAGE: 'single-image posts',
  VIDEO: 'video posts',
  CAROUSEL: 'carousels',
  REEL: 'Reels',
  STORY: 'Stories',
  OTHER: 'posts in other formats',
};

/**
 * How far from the median counts as a difference worth reporting.
 *
 * Fifteen percent, deliberately wider than the hashtag module's ten: a format
 * choice is a bigger commitment to ask of somebody than dropping a tag, so it
 * should clear a higher bar before the prompt mentions it.
 */
const MEANINGFUL_LIFT = 0.15;

/** One network's own record, never compared with another's. */
export interface PlatformPerformance {
  provider: string;
  label: string;
  /** Which number this network's posts were ranked on. */
  metric: TimingMetric;
  /** Scored publications behind it. */
  sampleSize: number;
  /** What stands out inside this network, strongest evidence first. */
  signals: LearnedSignal[];
}

export interface PerformanceProfile {
  platforms: PlatformPerformance[];
  /** Scored publications across every network. */
  sampleSize: number;
}

const EMPTY: PerformanceProfile = { platforms: [], sampleSize: 0 };

/** Groups publications by a key, dropping the ones that cannot be scored. */
function scoredGroups<K>(
  publications: CaptionedPublication[],
  metric: TimingMetric,
  keyOf: (publication: CaptionedPublication) => K | null,
): Map<K, number[]> {
  const groups = new Map<K, number[]>();

  for (const publication of publications) {
    const score = scoreOf(publication, metric);
    if (score === null) continue;

    const key = keyOf(publication);
    if (key === null) continue;

    const values = groups.get(key);
    if (values) values.push(score);
    else groups.set(key, [score]);
  }

  return groups;
}

/**
 * Turns one grouping into at most one signal — the strongest group.
 *
 * One rather than one per group on purpose. "Carousels are above your median and
 * single images are below it" is the same fact twice, and a prompt handed both
 * halves of every comparison stops reading any of them.
 */
function signalFrom<K>(
  groups: Map<K, number[]>,
  platformMedian: number,
  gates: EvidenceGates,
  describe: (key: K, above: boolean) => { id: string; detail: string } | null,
): LearnedSignal | null {
  const ranked = [...groups.entries()]
    .map(([key, values]) => ({
      key,
      n: values.length,
      score: median(values) as number,
    }))
    .filter((group) => isStatable(evidenceFor(group.n, gates)))
    .sort((a, b) => b.score - a.score);

  if (ranked.length < 2 || platformMedian <= 0) return null;

  const best = ranked[0];
  const lift = best.score / platformMedian - 1;
  if (lift < MEANINGFUL_LIFT) return null;

  const described = describe(best.key, true);
  if (!described) return null;

  return {
    id: described.id,
    // Non-null: the group cleared the floor, so it has a statable strength.
    strength: evidenceFor(best.n, gates) as Exclude<
      ReturnType<typeof evidenceFor>,
      'insufficient'
    >,
    detail: described.detail,
    observations: best.n,
  };
}

/**
 * What this account's history shows, per network.
 *
 * `publications` may span every network in the scope; they are split by provider
 * before anything is compared, and each network's metric is chosen from its own
 * publications so a network with no exposure figure is ranked on counts without
 * dragging the others onto the same scale.
 */
export function learnPerformance(
  publications: CaptionedPublication[],
  gates: EvidenceGates = EVIDENCE_GATES,
): PerformanceProfile {
  if (publications.length === 0) return EMPTY;

  const byProvider = new Map<string, CaptionedPublication[]>();
  for (const publication of publications) {
    const existing = byProvider.get(publication.provider);
    if (existing) existing.push(publication);
    else byProvider.set(publication.provider, [publication]);
  }

  let total = 0;
  const platforms: PlatformPerformance[] = [];

  for (const [provider, mine] of byProvider) {
    // `chooseMetric` reads only `early` — how many publications must carry an
    // exposure figure before a rate is trustworthy. The rest of the timing
    // gates are irrelevant here and are left at their defaults rather than
    // being invented from the evidence gates, which are a different scale.
    const metric = chooseMetric(mine, {
      ...DEFAULT_TIMING_GATES,
      early: gates.early,
    });
    const scores = mine
      .map((publication) => scoreOf(publication, metric))
      .filter((score): score is number => score !== null);

    if (scores.length === 0) continue;
    total += scores.length;

    const platformMedian = median(scores) as number;

    const signals = [
      // Which format sits above this network's own median.
      signalFrom(
        scoredGroups<MediaType>(
          mine,
          metric,
          // Observed format first, requested second — the same precedence
          // `analytics-query.byMediaType` uses, so the two never disagree.
          (publication) => publication.mediaType ?? publication.contentType,
        ),
        platformMedian,
        gates,
        (format) => ({
          id: `media_type:${format}`,
          detail: `${FORMAT_LABEL[format] ?? String(format).toLowerCase()} sit above this account’s median on ${platformLabel(provider)}`,
        }),
      ),

      // Which caption length sits above it.
      signalFrom(
        scoredGroups<CaptionLengthBand>(mine, metric, (publication) =>
          publication.caption.trim() ? lengthBandOf(publication.caption) : null,
        ),
        platformMedian,
        gates,
        (band) => ({
          id: `caption_length:${band}`,
          detail: `${BAND_LABEL[band]} have outperformed the others on ${platformLabel(provider)}`,
        }),
      ),
    ].filter((signal): signal is LearnedSignal => signal !== null);

    platforms.push({
      provider,
      label: platformLabel(provider),
      metric,
      sampleSize: scores.length,
      signals,
    });
  }

  return {
    // Most evidence first: a network with 200 posts says more than one with 4.
    platforms: platforms.sort((a, b) => b.sampleSize - a.sampleSize),
    sampleSize: total,
  };
}

/**
 * The profile as a prompt section, or null when nothing cleared the floor.
 *
 * Null is the common case on a young account and is why the caption prompt has
 * no "performance" branch to fall back on — the section is simply absent, and
 * the model writes from the brand, the image and the topic exactly as it did
 * before this existed.
 */
export function renderPerformanceSection(
  profile: PerformanceProfile,
): string | null {
  const withSignals = profile.platforms.filter(
    (platform) => platform.signals.length > 0,
  );
  if (withSignals.length === 0) return null;

  const lines = withSignals.flatMap((platform) =>
    platform.signals.map(renderSignal),
  );

  return [
    '## What has actually worked for this account',
    'Measured from its own published posts. These are correlations in its results, not rules — follow one only where it suits the post being written now.',
    ...lines,
    // Said explicitly because it is the one wrong conclusion a model would
    // otherwise draw from a list of per-network observations.
    'Never compare one network’s numbers with another’s: they measure different things.',
  ].join('\n');
}

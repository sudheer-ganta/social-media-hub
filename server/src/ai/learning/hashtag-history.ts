import { median, scoreOf, type TimingMetric, type TimingPublication } from '../../analytics/timing';
import {
  evidenceFor,
  isStatable,
  type EvidenceGates,
  type EvidenceStrength,
  EVIDENCE_GATES,
} from './evidence';

/**
 * What this account's own hashtag history actually shows.
 *
 * ─── Three findings, and the third is the useful one ─────────────────────────
 *   used often                 the tags that are part of how this account posts
 *   used on stronger posts     tags whose posts sit above the account's median
 *   used often, no difference  tags that appear constantly and change nothing
 *
 * The third is what a hashtag tool almost never tells anybody, and it is the one
 * that saves a member from carrying the same five dead tags for a year. It is
 * only sayable because the metrics are real and the null rules are honest.
 *
 * ─── Correlation, stated as correlation ──────────────────────────────────────
 * A tag on strong posts did not cause them to be strong. A member may simply
 * reach for it on their best work — which is a genuinely useful thing to know
 * and a completely different claim. Nothing in this file produces a causal
 * sentence, and the phrasing that keeps it that way lives in `evidence.ts`.
 *
 * Pure: no database, no model, no clock. It takes captions and already-derived
 * scores and returns counts.
 */

/** A publication plus the caption its tags come from. */
export interface CaptionedPublication extends TimingPublication {
  caption: string;
}

/**
 * Every tag in one caption, lowercased and without the `#`.
 *
 * Letters, numbers, underscore **and combining marks** — the last of those is
 * load-bearing rather than thorough: `\p{L}\p{N}_` matches `#द` out of
 * `#दिल्ली`, because Devanagari vowel signs are marks and not letters, and the
 * tag it yields is a different word from the one in the caption. Same for
 * Arabic, Tamil and Thai. Matches `hashtags/rules.ts`, which cleans with the
 * same class for the same reason.
 *
 * Deduplicated within a caption — a tag repeated twice in one post is one use.
 */
export function extractTags(caption: string): string[] {
  const matches = caption.match(/#[\p{L}\p{N}\p{M}_]+/gu) ?? [];
  return [
    ...new Set(
      matches.map((match) => match.slice(1).toLowerCase()).filter(Boolean),
    ),
  ];
}

/** One tag's record on this account. */
export interface HashtagObservation {
  tag: string;
  /** Posts carrying it that could be scored. */
  uses: number;
  /** How its posts compare with the account's median: 0.31 is 31% above. */
  lift: number | null;
  strength: EvidenceStrength;
}

export interface HashtagHistory {
  /** Most-used first. What this account's tagging habit actually is. */
  frequent: HashtagObservation[];
  /** Above the account median, strongest first. Correlation only. */
  strongerPosts: HashtagObservation[];
  /** Used often, no measurable difference. The ones worth dropping. */
  noDifference: HashtagObservation[];
  /** Scored publications behind all of it. */
  sampleSize: number;
  metric: TimingMetric | null;
}

const EMPTY: HashtagHistory = {
  frequent: [],
  strongerPosts: [],
  noDifference: [],
  sampleSize: 0,
  metric: null,
};

/** How many of each list is worth putting in a prompt. */
const LIST_LIMIT = 8;

/**
 * Below this much difference from the median, a tag has made no difference.
 *
 * Ten percent, and it is a threshold rather than a test of significance because
 * the sample never justifies one. A tag whose posts land within a tenth of the
 * account's median is doing nothing measurable, and saying so is more useful
 * than reporting a 3% edge as an edge.
 */
const NEUTRAL_BAND = 0.1;

/**
 * What the account's tags have actually done.
 *
 * `metric` is decided once for the whole sample and applied to every tag, so no
 * two tags are ever compared on different scales — the same rule the timing
 * engine keeps for the same reason.
 */
export function learnHashtags(
  publications: CaptionedPublication[],
  metric: TimingMetric,
  gates: EvidenceGates = EVIDENCE_GATES,
): HashtagHistory {
  const scores = new Map<string, number[]>();
  const all: number[] = [];

  for (const publication of publications) {
    const score = scoreOf(publication, metric);
    // An unmeasured post says nothing about its tags. It is not a zero.
    if (score === null) continue;
    all.push(score);

    for (const tag of extractTags(publication.caption)) {
      const values = scores.get(tag);
      if (values) values.push(score);
      else scores.set(tag, [score]);
    }
  }

  if (all.length === 0) return EMPTY;

  const accountMedian = median(all);

  const observations: HashtagObservation[] = [...scores.entries()]
    .map(([tag, values]) => {
      const tagMedian = median(values) as number;
      return {
        tag,
        uses: values.length,
        lift:
          accountMedian !== null && accountMedian > 0
            ? tagMedian / accountMedian - 1
            : null,
        strength: evidenceFor(values.length, gates),
      };
    })
    // A tag used once tells us nothing about itself, whatever its post did.
    .filter((observation) => isStatable(observation.strength));

  return {
    frequent: [...observations]
      .sort((a, b) => b.uses - a.uses || a.tag.localeCompare(b.tag))
      .slice(0, LIST_LIMIT),

    strongerPosts: observations
      .filter((observation) => (observation.lift ?? 0) > NEUTRAL_BAND)
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
      .slice(0, LIST_LIMIT),

    noDifference: observations
      .filter(
        (observation) =>
          observation.lift !== null && Math.abs(observation.lift) <= NEUTRAL_BAND,
      )
      .sort((a, b) => b.uses - a.uses)
      .slice(0, LIST_LIMIT),

    sampleSize: all.length,
    metric,
  };
}

/**
 * The history as a prompt section, or null when there is nothing to say.
 *
 * Every line is a correlation and says so. The section deliberately does *not*
 * tell the model to reuse the strong tags — that would turn a record into a
 * template and put last quarter's campaign tag on an unrelated post. It tells
 * the model these are this account's own patterns, to be used only where they
 * genuinely fit the content in front of it.
 */
export function renderHashtagHistory(history: HashtagHistory): string | null {
  if (history.sampleSize === 0) return null;

  const tags = (observations: HashtagObservation[]) =>
    observations.map((observation) => `#${observation.tag}`).join(' ');

  const lines = [
    history.frequent.length > 0 &&
      `- Tags this account already uses regularly: ${tags(history.frequent)}`,

    history.strongerPosts.length > 0 &&
      `- Tags that have appeared on its stronger posts: ${tags(history.strongerPosts)}. This is a correlation, not a cause — the account may simply reach for them on its best work. Use one only where it genuinely fits this post.`,

    history.noDifference.length > 0 &&
      `- Tags it uses often with no measurable difference either way: ${tags(history.noDifference)}. No reason to include these out of habit.`,
  ].filter((line): line is string => typeof line === 'string');

  if (lines.length === 0) return null;

  return [
    '## This account’s own hashtag record',
    `Measured across ${history.sampleSize} post${history.sampleSize === 1 ? '' : 's'}.`,
    ...lines,
  ].join('\n');
}

/**
 * Tags this account has genuinely used, for the spam filter to consult.
 *
 * The reason the ban list in `spam.ts` is not absolute: `#trending` is noise on
 * almost every post and is a legitimate branded tag on the account that has
 * built a series around it. Their own history is the only evidence available for
 * telling those two apart, so it is the exemption.
 */
export function tagsInUse(history: HashtagHistory): Set<string> {
  return new Set(history.frequent.map((observation) => observation.tag));
}

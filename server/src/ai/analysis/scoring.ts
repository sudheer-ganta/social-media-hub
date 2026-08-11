import { DEFAULT_WEIGHTS, normaliseWeights, type ScoringWeights } from './weights';
import type {
  CaptionMetrics,
  DimensionScore,
  PlatformFit,
  ScoreDimension,
  ScoreExplanation,
} from '../types';

/**
 * The roll-up: seven sub-scores in, one number out, plus the reason it is that
 * number.
 *
 * ─── "Why is it 74?" ─────────────────────────────────────────────────────────
 * A bare score is not actionable and, worse, is not trusted. The first question
 * anyone asks of a 74 is what the missing 26 was, and an analyser that cannot
 * answer that gets ignored within a week.
 *
 * So {@link explainScore} runs over the same dimension scores the roll-up used
 * and turns them into two plain lists. It reads the numbers rather than asking
 * the model to justify itself — a model asked "why did you give it 74" writes a
 * fluent rationalisation that need not correspond to its own scores, which is
 * strictly worse than no explanation.
 */

/** Above this a dimension is a strength worth naming. */
const STRENGTH_THRESHOLD = 8;
/** At or below this it is a weakness worth naming. */
const WEAKNESS_THRESHOLD = 6;

/** Human labels for the axes, used in explanations and the UI. */
export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  hook: 'Opening hook',
  visual: 'Use of the image',
  platformFit: 'Platform fit',
  audienceFit: 'Audience fit',
  cta: 'Call to action',
  readability: 'Readability',
  hashtags: 'Hashtags',
  // Personal. Deliberately named in the member's terms rather than the
  // analyser's — "Sounds like you" is a thing somebody can agree or disagree
  // with, where "Voice match" is a metric being reported at them.
  voiceMatch: 'Sounds like you',
  humanness: 'Sounds human',
  originality: 'Not a repeat',
};

export interface ScoreInput {
  scores: Partial<Record<ScoreDimension, DimensionScore>>;
  weights?: ScoringWeights;
}

export interface ScoreOutcome {
  /** 0–100. */
  reachScore: number;
  /** The renormalised weights actually applied. Sums to 1. */
  weights: Partial<Record<ScoreDimension, number>>;
}

/**
 * Rolls the dimension scores into a 0–100 reach score.
 *
 * Only the dimensions actually present are weighted, and the weights are
 * renormalised over them — see `weights.ts` for why a text-only post must not
 * be capped at 84 for the image it never had.
 *
 * Returns 0 with empty weights when nothing was scored at all. That case is
 * reachable only if the model returned no usable dimension, and the generator
 * treats it as a failure rather than publishing a zero.
 */
export function computeReachScore({ scores, weights = DEFAULT_WEIGHTS }: ScoreInput): ScoreOutcome {
  const present = (Object.keys(scores) as ScoreDimension[]).filter(
    (key) => scores[key] !== undefined,
  );

  if (present.length === 0) return { reachScore: 0, weights: {} };

  const applied = normaliseWeights(present, weights);

  const total = present.reduce((sum, key) => {
    const dimension = scores[key];
    const weight = applied[key] ?? 0;
    // Sub-scores are 0–10; dividing by 10 puts each on the same 0–1 scale the
    // weights are expressed in, so the sum is a fraction of a perfect post.
    return sum + (dimension ? (dimension.score / 10) * weight : 0);
  }, 0);

  return { reachScore: Math.round(total * 100), weights: applied };
}

/**
 * Turns the scores into the two lists shown under "Why?".
 *
 * Weakest first in `weaknesses`, strongest first in `strengths` — a user
 * skimming reads the top of each list, and the top of the weakness list should
 * be the thing most worth fixing.
 *
 * Deterministic checks are folded in alongside the model's dimension scores,
 * because some of the most useful lines here are arithmetic: "eleven hashtags"
 * is a fact, and it belongs next to "the hook is weak" rather than in a
 * separate panel the user has to cross-reference.
 */
export function explainScore(
  scores: Partial<Record<ScoreDimension, DimensionScore>>,
  metrics: CaptionMetrics,
  platforms: readonly PlatformFit[],
): ScoreExplanation {
  const entries = (Object.entries(scores) as Array<[ScoreDimension, DimensionScore]>).filter(
    ([, value]) => value !== undefined,
  );

  const strengths = entries
    .filter(([, value]) => value.score >= STRENGTH_THRESHOLD)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([key, value]) => `${DIMENSION_LABELS[key]}: ${value.reason}`);

  const weaknesses = entries
    .filter(([, value]) => value.score <= WEAKNESS_THRESHOLD)
    .sort((a, b) => a[1].score - b[1].score)
    .map(([key, value]) => `${DIMENSION_LABELS[key]}: ${value.reason}`);

  // Every failing platform check is a concrete, countable weakness. Warnings
  // are left out: they are already reflected in the platformFit score, and
  // repeating all of them here would bury the model's judgements under noise.
  for (const fit of platforms) {
    for (const item of fit.checks) {
      if (item.status === 'fail') weaknesses.push(`${fit.platform}: ${item.detail}`);
    }
  }

  // Two facts worth stating outright, because both are invisible to a writer
  // reading their own copy and neither is a matter of opinion.
  if (metrics.readingTimeSeconds > 60) {
    weaknesses.push(
      `Reading time is about ${Math.round(metrics.readingTimeSeconds / 60)} minutes — long for a feed.`,
    );
  }
  if (metrics.averageWordsPerSentence > 25) {
    weaknesses.push(
      `Sentences average ${metrics.averageWordsPerSentence} words. Under 20 reads faster on a phone.`,
    );
  }

  return { strengths, weaknesses };
}

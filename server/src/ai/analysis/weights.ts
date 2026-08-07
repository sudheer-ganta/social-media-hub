import type { ScoreDimension } from '../types';

/**
 * The scoring weights, and the one place they live.
 *
 * ─── Why not `hook * 2.5` inline ─────────────────────────────────────────────
 * The first draft of this scorer multiplied each sub-score by a constant at the
 * point of use. That has three problems, in increasing order of seriousness:
 *
 *  1. Re-tuning means editing arithmetic inside business logic.
 *  2. Nothing tells you what the maximum possible score is, so nothing checks
 *     that the total actually lands on 100.
 *  3. Nothing can be *reported*. A result that cannot say which weights
 *     produced it cannot be compared against a result from last month.
 *
 * Normalised weights fix all three: they sum to 1 by contract, the roll-up is
 * `Σ(score/10 × weight) × 100` with no magic constants, and the weights used are
 * returned in the response alongside {@link WEIGHTS_VERSION}.
 *
 * Note this is genuinely a different scale from unnormalised multipliers, not a
 * refactor of one. `hook * 2.5` contributes up to 25 raw points out of whatever
 * the other multipliers happen to add up to; `hook: 0.22` contributes exactly
 * 22% of the final score. The second is the one that stays correct when a
 * dimension is dropped.
 */

/** Bumped whenever {@link DEFAULT_WEIGHTS} changes. Reported in `meta.weightsVersion`. */
export const WEIGHTS_VERSION = '1.0.0';

export type ScoringWeights = Record<ScoreDimension, number>;

/**
 * Ordered by how much each axis moves real reach.
 *
 * The hook leads because on every feed that matters, the hook is the only part
 * of the caption a non-follower is guaranteed to see — everything below it is
 * read by people the first line already convinced. Hashtags trail because they
 * are the axis with the weakest link to outcomes on the networks this app
 * publishes to, and weighting them like a hook is what produces the
 * tag-stuffed, unreadable copy the analyser is supposed to catch.
 *
 * `audienceFit` is here rather than folded into `platformFit` because they
 * genuinely diverge: a post can be perfectly shaped for LinkedIn and pitched at
 * entirely the wrong reader, and collapsing the two hides exactly that case.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  hook: 0.22,
  visual: 0.16,
  platformFit: 0.16,
  audienceFit: 0.14,
  cta: 0.13,
  readability: 0.1,
  hashtags: 0.09,
};

/**
 * Renormalises the weights over the dimensions that actually applied.
 *
 * The case that makes this necessary: a text-only post has no `visual` score.
 * Leaving its 0.16 in the denominator would cap that post at 84/100 — it would
 * be marked down for the absence of an image nobody asked it to have. Dropping
 * the dimension and rescaling the rest means a text post is judged against
 * text-post criteria, and its 100 means the same thing as an image post's 100.
 *
 * The same applies to `hashtags` on a post published without any.
 *
 * Throws on an empty list rather than returning an empty object: a caller with
 * no applicable dimensions has nothing to score, and silently producing a
 * `reachScore` of 0 would read as "this caption is terrible" rather than "this
 * caption was never assessed".
 */
export function normaliseWeights(
  applicable: readonly ScoreDimension[],
  base: ScoringWeights = DEFAULT_WEIGHTS,
): Partial<ScoringWeights> {
  const dimensions = [...new Set(applicable)];

  if (dimensions.length === 0) {
    throw new Error('normaliseWeights needs at least one dimension');
  }

  const total = dimensions.reduce((sum, key) => sum + (base[key] ?? 0), 0);

  // Every applicable dimension weighted zero: fall back to an even split rather
  // than dividing by zero. Only reachable via a hand-edited weights table, but
  // a scorer that throws on a config typo is worse than one that degrades.
  if (total <= 0) {
    const even = 1 / dimensions.length;
    return Object.fromEntries(dimensions.map((key) => [key, even]));
  }

  return Object.fromEntries(
    dimensions.map((key) => [key, (base[key] ?? 0) / total]),
  );
}

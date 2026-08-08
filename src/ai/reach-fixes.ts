/**
 * Reach & Visibility, closed-loop: what a recommendation would change, and
 * whether the caption on screen already carries it.
 *
 * ─── The rule ────────────────────────────────────────────────────────────────
 * **The current caption is the only source of truth.** Nothing here records
 * that a member pressed Apply, because a record like that is a lie waiting to
 * happen: they can undo the change, edit it away, or paste over it, and a panel
 * that remembers the click would still be showing a tick.
 *
 * So "is this fixed?" is answered the only way it can be answered honestly —
 * by asking whether applying the fix again would change anything:
 *
 *     isApplied(improvement, caption) ⟺ applyImprovement(improvement, caption) === caption
 *
 * Every apply in this file is append-only and idempotent (see `utils/caption`
 * and `utils/hashtags`), which is what makes that equivalence hold. Delete the
 * line and the tick goes away on its own, with no re-analysis and no round
 * trip. That is the whole mechanism.
 *
 * ─── Deterministic first, model second ───────────────────────────────────────
 * Where a recommendation carries a concrete change, its status is arithmetic
 * over the current caption and cannot drift between runs. Where it does not —
 * "the hook is generic", "this reads as hard work" — there is nothing to
 * verify mechanically, so the model's score stands and re-checking is what
 * updates it. `statusFor` is where the two meet, and it prefers the
 * deterministic answer whenever there is one.
 *
 * ─── Future-ready ────────────────────────────────────────────────────────────
 * `Verdict.source` names where a verdict came from. When per-account analytics
 * arrive they become another source alongside these two; nothing else in the
 * panel has to learn about them.
 *
 * Pure and dependency-free apart from the two apply helpers, so
 * `verify-reach-apply.ts` can run the whole journey under plain `node`.
 */

// Relative and extensioned, unlike the rest of the app: the verification script
// runs this file under plain `node`, which knows neither the `@/` alias nor
// extensionless resolution. `allowImportingTsExtensions` makes it legal here,
// and Vite resolves it unchanged.
import { withHashtags } from "../utils/hashtags.ts";
import { withLead, withLine } from "../utils/caption.ts";
import type { CaptionAnalysis, Improvement, ScoreDimension } from "./analysis.ts";

/** At or above this, a model-scored dimension is treated as settled. */
export const STRONG_SCORE = 7;

/**
 * Where a recommendation's change belongs in the caption.
 *
 * Placement is a property of the dimension rather than a field on the wire: a
 * hook goes in front, an engagement prompt goes at the end, and there is no
 * third answer that would not amount to rewriting somebody's caption.
 */
export type FixKind = "lead" | "line" | "hashtags";

export function fixKind(improvement: Improvement): FixKind | null {
  if (improvement.suggestedHashtags?.length) return "hashtags";
  if (!improvement.suggestedLine) return null;
  return improvement.dimension === "hook" ? "lead" : "line";
}

/** True when this recommendation has a change a button can make. */
export function isActionable(improvement: Improvement): boolean {
  return fixKind(improvement) !== null;
}

/**
 * The caption this recommendation would produce. Pure — it returns the new
 * text and touches nothing.
 *
 * A recommendation with nothing concrete to apply returns the caption
 * unchanged, which keeps callers free of null checks and makes
 * {@link isApplied} report `false` for it rather than a meaningless `true`.
 */
export function applyImprovement(
  improvement: Improvement,
  caption: string,
  platforms: readonly string[] = [],
): string {
  switch (fixKind(improvement)) {
    case "lead":
      return withLead(caption, improvement.suggestedLine!);
    case "line":
      return withLine(caption, improvement.suggestedLine!);
    case "hashtags":
      return withHashtags(caption, improvement.suggestedHashtags!, platforms);
    default:
      return caption;
  }
}

/**
 * Whether the caption on screen already carries this recommendation.
 *
 * Deterministic and stateless: it reads the caption, nothing else.
 */
export function isApplied(
  improvement: Improvement,
  caption: string,
  platforms: readonly string[] = [],
): boolean {
  return (
    isActionable(improvement) &&
    applyImprovement(improvement, caption, platforms) === caption
  );
}

/**
 * Applies several recommendations to one caption, in the order that leaves the
 * result the same however they arrived.
 *
 * Leads go to the front, prompts to the end of the copy, tags last of all —
 * `withHashtags` appends its block at the very end, so tags applied last are
 * the ones that stay last. Doing it in any other order strands a question
 * underneath a block of hashtags.
 */
export function applyAll(
  improvements: readonly Improvement[],
  caption: string,
  platforms: readonly string[] = [],
): string {
  const order: FixKind[] = ["lead", "line", "hashtags"];
  return order.reduce(
    (text, kind) =>
      improvements
        .filter((item) => fixKind(item) === kind)
        .reduce((inner, item) => applyImprovement(item, inner, platforms), text),
    caption,
  );
}

export interface Verdict {
  ok: boolean;
  /**
   * `verified` — measured against the caption on screen, right now.
   * `score`    — the model's reading from the last analysis.
   * `unscored` — the analysis did not cover this; the panel says why.
   */
  source: "verified" | "score" | "unscored";
  /** The recommendation still outstanding, when there is one. */
  improvement?: Improvement;
}

/**
 * Where one dimension of the post stands.
 *
 * Order matters, and it is the order that keeps the goalposts still:
 *
 *  1. A dimension the model already rates highly is settled — a recommendation
 *     attached to an 8/10 is a nice-to-have, not a failure, and flipping it to
 *     a warning would punish someone for a post that is fine.
 *  2. Otherwise, if there is a concrete fix, the caption itself decides. This
 *     is the closed loop: apply it and it ticks, remove it and it un-ticks, and
 *     no analysis has to run in between.
 *  3. Otherwise the model's score stands, and "Check again" is what moves it.
 */
export function statusFor(
  analysis: CaptionAnalysis,
  dimension: ScoreDimension,
  caption: string,
  platforms: readonly string[] = [],
): Verdict {
  const score = analysis.scores[dimension];
  const improvement = analysis.improvements.find(
    (item) => item.dimension === dimension,
  );

  if (score && score.score >= STRONG_SCORE) return { ok: true, source: "score" };

  if (improvement && isActionable(improvement)) {
    const done = isApplied(improvement, caption, platforms);
    return {
      ok: done,
      source: "verified",
      ...(done ? {} : { improvement }),
    };
  }

  return {
    ok: false,
    source: score ? "score" : "unscored",
    ...(improvement && { improvement }),
  };
}

/**
 * The recommendations that can still be applied to this caption.
 *
 * Derived, never stored — a fix already present is simply one whose apply
 * would be a no-op, so nothing has to be marked as spent.
 */
export function outstanding(
  analysis: CaptionAnalysis,
  caption: string,
  platforms: readonly string[] = [],
): Improvement[] {
  return analysis.improvements.filter(
    (item) => isActionable(item) && !isApplied(item, caption, platforms),
  );
}

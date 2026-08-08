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
import type { TargetedImprovement } from "./improve.ts";

/** At or above this, a model-scored dimension is treated as settled. */
export const STRONG_SCORE = 7;

/**
 * Where a change belongs in the caption.
 *
 * Placement is a property of the dimension, not something a model chooses: a
 * hook goes in front, an engagement prompt at the end, tags through the
 * append-and-dedupe path. `replace` is the one exception and the one that can
 * lose work, which is why it only ever arrives from a regeneration the member
 * has been shown and has explicitly accepted — never from an analysis alone.
 */
export type FixKind = "lead" | "line" | "hashtags" | "replace";

/**
 * A change, from either source: a recommendation the analysis carried, or a
 * proposal a Regenerate produced. One shape so the apply path, the
 * verification path and the Apply-all path cannot diverge between the two.
 */
export interface ReachFix {
  dimension: ScoreDimension;
  kind: FixKind;
  /** For `lead` and `line`. */
  line?: string;
  /** For `hashtags`. */
  hashtags?: string[];
  /** For `replace`. */
  caption?: string;
}

/** The fix an analysis recommendation carries, or null when it carries none. */
export function fixFor(improvement: Improvement): ReachFix | null {
  if (improvement.suggestedHashtags?.length) {
    return {
      dimension: improvement.dimension,
      kind: "hashtags",
      hashtags: improvement.suggestedHashtags,
    };
  }
  if (improvement.suggestedLine) {
    return {
      dimension: improvement.dimension,
      kind: improvement.dimension === "hook" ? "lead" : "line",
      line: improvement.suggestedLine,
    };
  }
  return null;
}

export function fixKind(improvement: Improvement): FixKind | null {
  return fixFor(improvement)?.kind ?? null;
}

/** True when this recommendation has a change a button can make on its own. */
export function isActionable(improvement: Improvement): boolean {
  return fixFor(improvement) !== null;
}

/**
 * The caption a fix would produce. Pure — it returns the new text and touches
 * nothing.
 *
 * Three of the four kinds can only add: `lead` puts a line above, `line` puts
 * one below, `hashtags` appends what is missing. Only `replace` substitutes,
 * and only after the member has seen both versions.
 */
export function applyFix(
  fix: ReachFix,
  caption: string,
  platforms: readonly string[] = [],
): string {
  switch (fix.kind) {
    case "lead":
      return withLead(caption, fix.line ?? "");
    case "line":
      return withLine(caption, fix.line ?? "");
    case "hashtags":
      return withHashtags(caption, fix.hashtags ?? [], platforms);
    case "replace":
      return fix.caption?.trim() ? fix.caption : caption;
  }
}

/**
 * Whether the caption on screen already carries this fix.
 *
 * Deterministic and stateless: it reads the caption, nothing else. Holds
 * because every apply above is idempotent — applying a fix that is already
 * there returns the same string, so "would this change anything?" and "is this
 * already here?" are the same question.
 */
export function isFixPresent(
  fix: ReachFix,
  caption: string,
  platforms: readonly string[] = [],
): boolean {
  return applyFix(fix, caption, platforms) === caption;
}

/**
 * The caption this recommendation would produce, or the caption unchanged when
 * it carries nothing concrete.
 */
export function applyImprovement(
  improvement: Improvement,
  caption: string,
  platforms: readonly string[] = [],
): string {
  const fix = fixFor(improvement);
  return fix ? applyFix(fix, caption, platforms) : caption;
}

/** Whether the caption on screen already carries this recommendation. */
export function isApplied(
  improvement: Improvement,
  caption: string,
  platforms: readonly string[] = [],
): boolean {
  const fix = fixFor(improvement);
  return fix !== null && isFixPresent(fix, caption, platforms);
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
export function applyFixes(
  fixes: readonly ReachFix[],
  caption: string,
  platforms: readonly string[] = [],
): string {
  // `replace` first — it substitutes the whole caption, so anything applied
  // before it would be thrown away. Then the lead, then the closing line, then
  // the tags: `withHashtags` appends its block at the very end, so tags applied
  // last are the ones that stay last. Any other order strands a question
  // underneath a block of hashtags.
  const order: FixKind[] = ["replace", "lead", "line", "hashtags"];
  return order.reduce(
    (text, kind) =>
      fixes
        .filter((fix) => fix.kind === kind)
        .reduce((inner, fix) => applyFix(fix, inner, platforms), text),
    caption,
  );
}

export function applyAll(
  improvements: readonly Improvement[],
  caption: string,
  platforms: readonly string[] = [],
): string {
  const fixes = improvements
    .map(fixFor)
    .filter((fix): fix is ReachFix => fix !== null);
  return applyFixes(fixes, caption, platforms);
}

/**
 * A regenerated proposal, as a fix.
 *
 * The target names the same dimension the analysis scores, so the proposal
 * lands on the row that asked for it. The kind comes from the server, which
 * derives it from the target rather than letting the model pick where its own
 * output should go.
 */
export function fixFromProposal(proposal: TargetedImprovement): ReachFix {
  return {
    dimension: proposal.target,
    kind: proposal.kind,
    ...(proposal.line && { line: proposal.line }),
    ...(proposal.hashtags?.length && { hashtags: proposal.hashtags }),
    ...(proposal.caption && { caption: proposal.caption }),
  };
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
 * Whether the analysis on screen describes the caption on screen.
 *
 * The gate on every tick. An analysis run against an older caption may be a
 * perfectly good reading — of text that is no longer there.
 */
export function isVerified(caption: string, analysedCaption: string): boolean {
  return caption.trim() === analysedCaption.trim();
}

/** What a row shows. `checking` is the honest middle: not failing, not proven. */
export type RowState = "pass" | "warn" | "checking";

/**
 * The rule that stops a tick from ever being a reward for clicking.
 *
 * A row goes green on exactly one condition: the *current* caption was analysed
 * and that analysis is satisfied. Applying an improvement changes the caption,
 * which invalidates the analysis that recommended it — so the row cannot be
 * green until the re-analysis lands, and only the fresh result can make it so.
 *
 * The three arguments answer three different questions, and the order matters:
 *
 *  - `verified` — does this analysis describe the caption on screen? When it
 *    does, the verdict is the answer, pass or fail. Nothing else applies.
 *  - `rechecking` — is an analysis of the new caption running right now? Then
 *    the row is genuinely in between, and says so rather than showing a verdict
 *    about text that has already been replaced.
 *  - otherwise the verdict stands, with one exception: an unverified *pass*
 *    never renders as green. A re-analysis that failed, or that was never run,
 *    leaves the row at `checking` — the honest state — instead of settling on
 *    the answer the member was hoping for.
 *
 * The asymmetry is deliberate. An unverified failure is safe to show: the
 * member deleting the line they applied is provable from the caption in front
 * of us, and making them wait for a round trip to be told so would be slower
 * and no more true.
 */
export function rowState(
  verdict: Verdict,
  verified: boolean,
  rechecking = false,
): RowState {
  if (verified) return verdict.ok ? "pass" : "warn";
  if (rechecking) return "checking";
  return verdict.ok ? "checking" : "warn";
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

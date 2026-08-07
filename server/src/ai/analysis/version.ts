/**
 * The analyser's version, reported on every result as `meta.analysisVersion`.
 *
 * ─── Why a version at all ────────────────────────────────────────────────────
 * A reach score is only meaningful against other scores from the same scorer.
 * Re-tune the prompt or the weights and every number shifts — without a version
 * stamped on each stored analysis, a post scored 74 last month and one scored
 * 74 today are indistinguishable, and any comparison between them is quietly
 * wrong.
 *
 * Three version fields travel together on {@link AnalysisMeta} because they
 * move independently:
 *
 *   analysisVersion   this file — the analyser as a whole
 *   weightsVersion    analysis/weights.ts — the roll-up only
 *   promptVersion     prompts/analysis.prompt.ts — what the model was asked
 *
 * Re-weighting changes every score without touching a word of the prompt; the
 * reverse is equally possible. One combined number could not express either.
 *
 * Semver, read as: patch — a fix that should not move scores; minor — a new
 * dimension or check, additive; major — existing scores mean something
 * different and old ones should not be compared to new ones.
 */
export const ANALYSIS_VERSION = '1.0.0';

/** Bumped when `analysis.prompt.ts` changes shape. */
export const ANALYSIS_PROMPT_VERSION = 1;

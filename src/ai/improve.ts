/**
 * The targeted-improvement API's contract — "Regenerate", from the browser side.
 *
 * Mirrors `server/src/ai/types.ts` across the HTTP boundary the same way
 * `ai/analysis.ts` does for scoring: two files, one contract, changing either
 * means changing both.
 *
 * ─── Why this is not part of the analysis contract ───────────────────────────
 * Analysis is a reading of a post. This is a proposal about one part of it, and
 * the two have different lifetimes: an analysis is replaced wholesale by the
 * next Check again, while a proposal lives only as long as the member takes to
 * accept or dismiss it. Keeping them apart is what stops a proposal from ever
 * being mistaken for a verdict.
 *
 * ─── The rule that governs everything here ───────────────────────────────────
 * A proposal is not a change. Nothing in this file, and nothing that consumes
 * it, may write to the composer — that happens only when the member presses
 * "Use this improvement", and only through the append-only helpers in
 * `ai/reach-fixes.ts`.
 */

import type { ImageAnalysis } from "@/ai/types";
import type { AudienceRegister, CaptionMode } from "@/ai/caption";

/**
 * The parts of a post that can be regenerated.
 *
 * Deliberately fewer than the dimensions the analysis scores. `visual` is
 * absent because copy cannot fix a crop, a resolution or a missing image —
 * offering to regenerate it would be pretending text can solve a media problem.
 * `platformFit` and `audienceFit` are absent because they are properties of the
 * whole post rather than of one passage.
 */
export type ImprovementTarget = "hook" | "readability" | "cta" | "hashtags";

/** Where the change goes. Decided by the server from the target, not guessed. */
export type ImprovementKind = "lead" | "replace" | "line" | "hashtags";

export interface ImprovementBrief {
  /**
   * Omitted means `brand`. In personal mode the register rule hardens and two
   * targets are refused outright: `readability` would iron out the fragments
   * that make it sound like a person, and `cta` would bolt an ask onto a post
   * that is not asking for anything.
   */
  mode?: CaptionMode;
  target: ImprovementTarget;
  /** The caption as it stands right now, edits included. */
  caption: string;
  hashtags?: string[];
  platforms?: string[];
  audience?: AudienceRegister;
  language?: string;
  hasImage?: boolean;
  imageAnalysis?: ImageAnalysis;
  /** Context for tone only. The song is never changed by a regeneration. */
  music?: string;
  /** What the analysis flagged, so the fix answers that rather than a guess. */
  issue?: string;
  recommendation?: string;
}

export interface TargetedImprovement {
  target: ImprovementTarget;
  kind: ImprovementKind;
  /** For `lead` and `line`. */
  line?: string;
  /** For `replace` — a whole caption, shown before/after and never auto-applied. */
  caption?: string;
  /** For `hashtags`, without the leading `#`. Tags to add, not to replace with. */
  hashtags?: string[];
  /** At most a dozen words on what changed. */
  note: string;
  meta: { provider: string; model: string; durationMs: number };
}

/**
 * The button's subtitle — what pressing Regenerate will actually do.
 *
 * Here rather than in the panel so the promise made by the label and the
 * instruction given to the model stay in the same repository of intent.
 */
export const TARGET_ACTION_LABEL: Record<ImprovementTarget, string> = {
  hook: "Improve the opening line",
  readability: "Make it simpler & more engaging",
  cta: "Make it more engaging",
  hashtags: "Suggest better hashtags",
};

import type { ImageAnalysis } from "./types";
import type { BrandVoice } from "./types";

/**
 * The browser's contract with `POST /api/ai/hashtags`.
 *
 * Mirrored from `server/src/ai/types.ts` rather than shared, which is the same
 * arrangement `caption.ts` and `analysis.ts` document: the two meet at the HTTP
 * boundary and nowhere else, so the composer's shapes can move without dragging
 * the generator with them.
 *
 * ─── Why hashtags are their own request ──────────────────────────────────────
 * A generation already returns `hashtags`, and those are chosen while the model
 * is busy writing three caption variations — which is exactly why they were
 * usually the topic restated with hashes in front. This endpoint chooses them
 * against the *finished* caption, including one the member typed themselves, and
 * can be re-run without touching the copy.
 */

export interface HashtagBrief {
  /** Which brain's rules apply. Personal tagging is a different job. */
  mode: "personal" | "brand";
  /** Scopes the hashtag history that is learned from. Brand mode only. */
  brandId?: string | null;
  /** Networks this will publish to. Decides both the ceiling and the register. */
  platforms: string[];
  /** The caption as it stands in the editor. */
  caption: string;
  /** What the post is about, when the caption alone is thin. */
  topic: string;
  language?: string;
  /**
   * A preferred count. Capped by the network, never through it — a member asking
   * for 30 tags on LinkedIn still gets 3.
   */
  count?: number;
  /** Vision's read, passed back so tags can come from what is in the picture. */
  imageAnalysis?: ImageAnalysis | null;
  brandVoice?: BrandVoice | null;
}

export interface HashtagResult {
  /**
   * Tags to publish, without the leading `#`, already inside the tightest
   * selected network's limit.
   *
   * **May legitimately be empty.** Some posts read worse with hashtags, and the
   * backend is allowed to say so — `note` carries the reason. An empty list is a
   * result, not a failure, and must not be rendered as one.
   */
  primary: string[];
  /** Relevant extras for the member to add by hand. Never auto-applied. */
  secondary: string[];
  /** One line on why these, or why none. Never a reach claim. */
  note: string;
  platforms: string[];
  /**
   * What the selected networks jointly allow. `conflict` is true when they
   * disagree — Instagram wants at least three, X tolerates at most two — in which
   * case `max` is the tighter ceiling and the UI can explain the split.
   */
  budget: { min: number; max: number; conflict: boolean };
  meta: {
    provider: string;
    model: string;
    durationMs: number;
    promptVersion: number;
  };
}

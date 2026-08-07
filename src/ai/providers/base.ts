/**
 * AIProvider interface — the browser's view of where generation happens.
 *
 * There is exactly one implementation and there is meant to be: the Express
 * backend. The browser posts a brief to `/api/ai/caption` and gets captions
 * back; which model wrote them is the backend's business, and swapping Gemini
 * for something else changes nothing on this side.
 *
 * The real provider abstraction — one file per vendor behind one interface —
 * lives in `server/src/ai/providers/`, on the side of the boundary that can
 * hold an API key. This type exists so UI code has a name for the contract,
 * not so the browser can pick a model.
 */

import type { CaptionBrief, CaptionResult } from "@/ai/caption";

export interface AIProvider {
  /** Generate captions for one brief. */
  generateCaption(brief: CaptionBrief): Promise<CaptionResult>;

  /** Human-readable name shown in the UI. */
  readonly name: string;

  /**
   * Whether this provider makes model calls from the browser.
   *
   * Always false, and a new provider that would make it true needs a very good
   * argument: a client-side provider means an API key in the bundle.
   */
  readonly isClientSide: boolean;
}

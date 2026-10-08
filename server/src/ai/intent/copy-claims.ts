import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import { evaluateIntentFidelity } from './claim-match';
import { restoreMissingClaims } from './copy-repair';
import { validateAndBuildRenderableCopy, type RenderableCopy } from './copy-sanitizer';

/**
 * Makes sure the copy that will be set on a creative carries every fact the
 * member insisted on, without failing a render that has not cost an image yet.
 *
 * The writing model sometimes never uses a word the member required. The first
 * answer is to put it back in. The second is subtler: a line added for one claim
 * is ranked "essential" and takes a slot, which can push out another line that
 * was carrying a different claim in looser words. So the number of text blocks
 * is widened one at a time, up to a ceiling, until nothing is missing. A creative
 * with five small blocks is worse than one with three, and better than none.
 */

export const MAX_TEXT_BLOCKS = 5;

export interface EnsuredCopy {
  /** The raw lines to rebuild from later: the repaired set if the repair helped, the original if not. */
  raw: CampaignCopyLine[];
  renderable: RenderableCopy[];
  /** Claims still not carried. Empty is success. */
  missing: string[];
  /** Claims the repair put back. */
  restored: string[];
}

export function ensureRequiredClaims(input: {
  rawCopy: CampaignCopyLine[];
  requiredClaims: string[];
  intent?: { event?: string; offer?: string };
  /** The copy plan's own limit on text blocks. */
  baseBudget: number;
  maxBudget?: number;
}): EnsuredCopy {
  const { rawCopy, requiredClaims, intent, baseBudget, maxBudget = MAX_TEXT_BLOCKS } = input;
  const missingFrom = (rows: RenderableCopy[]) =>
    evaluateIntentFidelity(requiredClaims, rows.map((row) => row.text).join(' ')).missingRequirements;

  const renderable = validateAndBuildRenderableCopy(rawCopy, requiredClaims, baseBudget);
  const missing = missingFrom(renderable);
  const unchanged: EnsuredCopy = { raw: rawCopy, renderable, missing, restored: [] };
  if (missing.length === 0) return unchanged;

  const repairedRaw = restoreMissingClaims(
    rawCopy, missing, intent, (role, text) => ({ role: role as CampaignCopyLine['role'], text }),
  );
  if (repairedRaw === rawCopy) return unchanged;

  const added = Math.max(0, repairedRaw.length - rawCopy.length);
  let best: { renderable: RenderableCopy[]; missing: string[] } | undefined;
  for (let budget = Math.min(maxBudget, baseBudget + added); budget <= maxBudget; budget += 1) {
    const candidate = validateAndBuildRenderableCopy(repairedRaw, requiredClaims, budget);
    const left = missingFrom(candidate);
    if (!best || left.length < best.missing.length) best = { renderable: candidate, missing: left };
    if (left.length === 0) break;
  }

  if (best && best.missing.length < missing.length) {
    return {
      raw: repairedRaw,
      renderable: best.renderable,
      missing: best.missing,
      restored: missing.filter((claim) => !best!.missing.includes(claim)),
    };
  }
  return unchanged;
}

/**
 * How much a pattern drawn from this account's own history is worth saying.
 *
 * ─── The failure this exists to prevent ──────────────────────────────────────
 * "Carousels perform better for you" is a sentence a member will act on for
 * months. Computed from two carousels, it is a coin toss wearing a fact's
 * clothing — and the damage is not that it might be wrong, it is that nothing
 * about how it was presented let the member weigh it.
 *
 * So every learned claim carries its own strength, and the *words change with
 * it*. A pattern seen three times is offered as something noticed; one seen
 * twenty times is offered as something known. Below three it is not offered at
 * all, because "never claim a preference from one post" is only enforceable if
 * there is a floor.
 *
 * ─── Correlation, never cause ────────────────────────────────────────────────
 * Nothing here licenses a causal sentence. A hashtag that appears on strong
 * posts did not *make* them strong — the member may simply use it on their best
 * work. {@link EVIDENCE_PHRASE} is written to keep that distinction in the copy
 * rather than leaving it to whoever assembles the prompt, and the prompt
 * builders are the only consumers.
 *
 * Shared by hashtag learning and brand performance learning because both answer
 * the same question about a count, and two tables of thresholds would drift.
 */

/**
 * `insufficient` is a real answer and the common one on a young account.
 *
 * Three tiers above it rather than a confidence percentage: a percentage
 * implies a calibration nobody has done, where "noticed / emerging / consistent"
 * maps onto how a person would actually hedge the same observation.
 */
export type EvidenceStrength = 'insufficient' | 'early' | 'emerging' | 'strong';

export interface EvidenceGates {
  /** Fewest observations before a pattern may be mentioned at all. */
  early: number;
  /** At or above this, it is an emerging pattern. */
  emerging: number;
  /** At or above this, it is a strong signal. */
  strong: number;
}

/**
 * The defaults.
 *
 * Three is the floor because two of anything is a pair and one is an anecdote.
 * Twenty for `strong` matches `STYLE_CONFIDENT_SAMPLES` in `ai/style/types.ts`
 * — the same account, the same posts, and it would be strange for a style read
 * to call twenty posts confident while a performance read called it provisional.
 */
export const EVIDENCE_GATES: EvidenceGates = {
  early: 3,
  emerging: 8,
  strong: 20,
};

export function evidenceFor(
  observations: number,
  gates: EvidenceGates = EVIDENCE_GATES,
): EvidenceStrength {
  if (observations < gates.early) return 'insufficient';
  if (observations >= gates.strong) return 'strong';
  if (observations >= gates.emerging) return 'emerging';
  return 'early';
}

/** True when a pattern has cleared the floor and may be stated. */
export function isStatable(strength: EvidenceStrength): boolean {
  return strength !== 'insufficient';
}

/** The member-facing name of each tier. */
export const EVIDENCE_LABEL: Record<EvidenceStrength, string> = {
  insufficient: 'Not enough data',
  early: 'Early signal',
  emerging: 'Emerging pattern',
  strong: 'Strong signal',
};

/**
 * How to introduce a claim at each strength, in words a model will follow.
 *
 * Every phrase is correlational. None of them says a format or a tag *caused*
 * anything, and none of them is unqualified — even `strong` says "consistently",
 * which is a claim about the record rather than about the future.
 */
export const EVIDENCE_PHRASE: Record<Exclude<EvidenceStrength, 'insufficient'>, string> = {
  early: 'one early signal, worth noticing and not worth relying on',
  emerging: 'an emerging pattern',
  strong: 'a consistent pattern in this account’s own results',
};

/**
 * One learned claim, ready to render.
 *
 * `detail` is the observation in plain words and carries no percentage the
 * sample cannot support; `observations` is the count behind it, which is quoted
 * every time so a member can weigh the claim rather than take it.
 */
export interface LearnedSignal {
  /** Short machine key, e.g. `media_type:CAROUSEL`. Stable, for the UI. */
  id: string;
  strength: Exclude<EvidenceStrength, 'insufficient'>;
  /** The claim, correlational and already hedged. */
  detail: string;
  observations: number;
}

/** `- an emerging pattern: carousels earn more saves (11 posts)` */
export function renderSignal(signal: LearnedSignal): string {
  return `- ${EVIDENCE_PHRASE[signal.strength]}: ${signal.detail} (${signal.observations} post${
    signal.observations === 1 ? '' : 's'
  })`;
}

import type { MeasuredStyle } from '../style/measure';

/**
 * The Brand Intelligence panel's "current understanding" — where this account's
 * writing actually sits between a few named registers.
 *
 * ─── What this is, precisely ─────────────────────────────────────────────────
 * A **deterministic reading of measured caption shape**, and nothing more. Every
 * input is a rate already counted from real captions by `ai/style/measure.ts` —
 * how often the account writes all-lowercase, ends on a full stop, uses an
 * emoji, writes a fragment, how long its captions run. No model is asked for an
 * opinion, so the numbers cannot drift between two renders of the same profile.
 *
 * ─── What it is not ──────────────────────────────────────────────────────────
 * It is not a personality assessment and it is not a confidence score. "Playful
 * 42%" means *42% of the weight of the observable signals point at the playful
 * register*, not "this brand is 42% playful" and certainly not "we are 42% sure".
 * {@link VoiceMix.basis} exists so the UI can say which of those it is, because a
 * bare percentage next to a word invites the wrong one.
 *
 * The alternative — asking a model to score the brand on eight axes — was
 * rejected for a specific reason: it produces a different answer every time it
 * is asked about the same captions, and a panel whose numbers move when nothing
 * changed teaches members to distrust the whole feature.
 *
 * ponytail: a weighted heuristic over five measured rates. It can separate
 * "clipped, lowercase, emoji-heavy" from "full sentences, punctuated, no emoji",
 * which is the distinction that actually matters, and it cannot tell premium
 * restraint from professional plainness — both are short and properly punctuated.
 * Upgrade to a model-scored mix only if members report the split reading wrong,
 * and only with the score cached on the profile so it stops moving.
 */

/**
 * The registers the mix is expressed in.
 *
 * A deliberate subset of `BrandStyle`: only registers with a *measurable*
 * signature appear. `bold`, `controversial` and `promotional` are properties of
 * what a caption argues, not of its shape — a bold caption and a timid one can
 * be the same length with the same punctuation — so they are offered as overrides
 * a member can choose and never inferred here. Claiming to have measured them
 * would be the panel's one dishonest number.
 */
export const MIXED_REGISTERS = [
  'professional',
  'playful',
  'gen_z',
  'educational',
  'premium',
] as const;

export type MixedRegister = (typeof MIXED_REGISTERS)[number];

export interface VoiceMixEntry {
  register: MixedRegister;
  /** Whole percent. The entries sum to 100. */
  percent: number;
}

export interface VoiceMix {
  /** Strongest first. Registers scoring zero are omitted. */
  entries: VoiceMixEntry[];
  /** How many captions the measurement rests on. */
  sampleCount: number;
  /**
   * Always `measured_caption_shape` today. Present so the UI states what the
   * percentages are a reading *of* rather than implying a judgement.
   */
  basis: 'measured_caption_shape';
}

/** Clamps a signal to 0–1 so one extreme rate cannot dominate the mix. */
function unit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * How strongly each register's signature shows in the measurement.
 *
 * Each expression is a claim about *observable shape*, and each is deliberately
 * built from more than one rate so a single unusual habit cannot elect a
 * register on its own.
 */
function affinities(measured: MeasuredStyle): Record<MixedRegister, number> {
  const {
    medianWords,
    allLowercaseRate,
    lowercaseStartRate,
    terminalPunctuationRate,
    fragmentRate,
    emojiRate,
    oneWordRate,
  } = measured;

  // Longer captions with proper sentence endings and no emoji.
  const professional =
    unit(medianWords / 40) * 0.4 +
    unit(terminalPunctuationRate) * 0.4 +
    unit(1 - emojiRate) * 0.2;

  // Emoji, fragments, a light touch — but not the full lowercase register.
  const playful =
    unit(emojiRate) * 0.5 + unit(fragmentRate) * 0.3 + unit(1 - terminalPunctuationRate) * 0.2;

  // The lowercase, unpunctuated, very short register.
  const genZ =
    unit(allLowercaseRate) * 0.35 +
    unit(lowercaseStartRate) * 0.2 +
    unit(1 - terminalPunctuationRate) * 0.2 +
    unit(oneWordRate) * 0.1 +
    unit(1 - medianWords / 25) * 0.15;

  // Long, punctuated, explains itself. `explainsContextRate` is the one signal
  // that separates this from `professional`, which is otherwise identical.
  const educational =
    unit(medianWords / 60) * 0.45 +
    unit(measured.explainsContextRate) * 0.35 +
    unit(terminalPunctuationRate) * 0.2;

  // Restraint: short, clean, no emoji, no hashtag habit.
  const premium =
    unit(1 - emojiRate) * 0.35 +
    unit(1 - measured.hashtagRate) * 0.25 +
    unit(terminalPunctuationRate) * 0.2 +
    unit(1 - medianWords / 30) * 0.2;

  return { professional, playful, gen_z: genZ, educational, premium };
}

/**
 * The mix, normalised to whole percents summing to 100.
 *
 * Returns no entries at all when there is nothing to measure — a profile with no
 * captions behind it, which the panel renders as "not enough writing yet" rather
 * than as five equal fifths. An even split would look like a finding.
 */
export function voiceMix(
  measured: MeasuredStyle | null,
  sampleCount: number,
): VoiceMix {
  if (!measured || sampleCount === 0) {
    return { entries: [], sampleCount: 0, basis: 'measured_caption_shape' };
  }

  const scores = affinities(measured);
  const total = MIXED_REGISTERS.reduce(
    (sum, register) => sum + scores[register],
    0,
  );

  if (total <= 0) {
    return { entries: [], sampleCount, basis: 'measured_caption_shape' };
  }

  const raw = MIXED_REGISTERS.map((register) => ({
    register,
    exact: (scores[register] / total) * 100,
  }));

  // Largest-remainder rounding, so the displayed percentages actually sum to 100.
  // Naive rounding gives 33/33/33 and a panel that visibly does not add up.
  const floored = raw.map((entry) => ({
    register: entry.register,
    percent: Math.floor(entry.exact),
    remainder: entry.exact - Math.floor(entry.exact),
  }));

  let shortfall =
    100 - floored.reduce((sum, entry) => sum + entry.percent, 0);
  const byRemainder = [...floored].sort((a, b) => b.remainder - a.remainder);
  for (const entry of byRemainder) {
    if (shortfall <= 0) break;
    entry.percent += 1;
    shortfall -= 1;
  }

  return {
    entries: floored
      .filter((entry) => entry.percent > 0)
      .map(({ register, percent }) => ({ register, percent }))
      .sort((a, b) => b.percent - a.percent || a.register.localeCompare(b.register)),
    sampleCount,
    basis: 'measured_caption_shape',
  };
}

/** The member-facing name of each register in the mix. */
export const REGISTER_LABEL: Record<MixedRegister, string> = {
  professional: 'Professional',
  playful: 'Playful',
  gen_z: 'Gen Z',
  educational: 'Educational',
  premium: 'Premium',
};

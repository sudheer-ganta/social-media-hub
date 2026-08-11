import { OTHER_SITUATION, situationOf, type CaptionSignal } from './signals';
import type { ImageAnalysis } from '../types';

/**
 * Which of a member's old captions get shown to the model.
 *
 * ─── Why not all of them ─────────────────────────────────────────────────────
 * Two reasons, and the second is the one that decides output quality.
 *
 * The cheap reason: a hundred captions is a large prompt on every request.
 *
 * The real one: **a model shown a hundred examples starts averaging them.**
 * What comes back is the arithmetic mean of somebody's writing — recognisably
 * theirs, entirely lifeless, and usually a blend of two jokes they made about
 * different things. A short list of captions that are actually relevant to the
 * post in hand produces a new joke in the right voice; a long list produces a
 * remix of old ones.
 *
 * ─── The mix ─────────────────────────────────────────────────────────────────
 * Some from the same situation, some from anywhere. The situational half is
 * what makes a gym photo draw on gym captions; the general half is what stops
 * the voice narrowing to whatever they happen to have posted about the gym.
 * A member with no gym history still gets their voice, just not their gym
 * voice.
 *
 * Rejected captions are never included. They are evidence about this person for
 * the *profile builder*, and putting a caption they turned down in front of the
 * writer as an example of how they write is precisely backwards.
 */

/** From the matching situation. */
const SITUATIONAL_LIMIT = 6;
/** From anywhere, as a voice baseline. */
const GENERAL_LIMIT = 4;
/** Never more than this in one prompt, whatever the mix. */
const TOTAL_LIMIT = 10;

/** Captions this long are a paragraph; one of them crowds out four real ones. */
const MAX_EXAMPLE_LENGTH = 240;

export interface RetrievedExamples {
  /** The captions themselves, for the repetition check. */
  captions: string[];
  /** The rendered prompt section, or null when there is no history. */
  section: string | null;
  /** Which bucket the new post landed in. Logged, not shown. */
  situation: string;
}

/** Which situation a *new* post is, from the fresh vision read plus its title. */
export function situationForRequest(
  analysis: ImageAnalysis | null,
  title?: string,
): string {
  return situationOf({
    subject: analysis?.primarySubject,
    themes: analysis?.themes,
    setting: analysis?.setting,
    title,
  });
}

/**
 * Picks the examples for one generation.
 *
 * Signals arrive already weighted and sorted by `deriveSignals`, so this is
 * selection rather than scoring — take the best of the matching situation,
 * top up from everywhere, and stop.
 */
export function retrieveExamples(
  signals: CaptionSignal[],
  situation: string,
): RetrievedExamples {
  const usable = signals.filter(
    (signal) => signal.weight > 0 && signal.text.length <= MAX_EXAMPLE_LENGTH,
  );

  const situational = usable
    .filter((signal) => signal.situation === situation && situation !== OTHER_SITUATION)
    .slice(0, SITUATIONAL_LIMIT);

  const taken = new Set(situational.map((signal) => signal.text));
  const general = usable
    .filter((signal) => !taken.has(signal.text))
    .slice(0, GENERAL_LIMIT);

  const captions = [...situational, ...general]
    .slice(0, TOTAL_LIMIT)
    .map((signal) => signal.text);

  return { captions, section: renderEvidence(captions), situation };
}

/**
 * The examples, under a heading that says what they are for.
 *
 * The heading is shouted because it is load-bearing. A list of somebody's
 * captions with no framing reads, to a model asked to write a caption, as a
 * list of captions to write — and what comes back is one of them with two words
 * changed. Naming them as evidence and stating the rule twice, once in the
 * heading and once underneath, is the difference between "write like this
 * person" and "write this person's caption again".
 */
function renderEvidence(captions: string[]): string | null {
  if (captions.length === 0) return null;

  return [
    '## STYLE EVIDENCE — DO NOT COPY OR PARAPHRASE',
    'Things this person actually posted. They are here as proof of how they behave, not as material.',
    ...captions.map((caption) => `- ${caption.replace(/\s+/g, ' ')}`),
    'A caption that reuses a phrase, a structure or a joke from that list is wrong — not on-style. Same person, new joke.',
  ].join('\n');
}

import type { MeasuredStyle } from './measure';
import type { StyleProfile } from './types';

/**
 * A style profile, as the writing prompt reads it.
 *
 * ─── Numbers become instructions ─────────────────────────────────────────────
 * `allLowercaseRate: 0.86` is a fact about a JSON object. "They almost never
 * capitalise" is an instruction, and it is the same fact. A model handed the
 * first skims it; handed the second, it writes differently — the same reason
 * `analysis.prompt.ts` renders its measured facts as prose rather than dumping
 * the metrics object, and the same reason Vision's confidence score arrives
 * downstream as "this reading is shaky" instead of as `34`.
 *
 * So nothing here prints a rate. Every line is a sentence about behaviour, with
 * the rate deciding which sentence.
 *
 * ─── What is deliberately not rendered ───────────────────────────────────────
 * Anything that could be a word they use. The profile has no field capable of
 * holding one (see `types.ts`), so this file cannot leak one — but it is worth
 * saying out loud, because the obvious "improvement" to this renderer is to
 * start including examples, and examples are the failure.
 */

/** Picks the sentence for a rate: almost never / sometimes / almost always. */
function howOften(
  rate: number,
  { rarely, sometimes, usually }: { rarely: string; sometimes: string; usually: string },
): string | null {
  if (rate <= 0.15) return rarely;
  if (rate >= 0.7) return usually;
  if (rate >= 0.35) return sometimes;
  return null;
}

/** The length line, which is the one that matters most. */
function lengthLine(measured: MeasuredStyle): string {
  const { medianWords, p90Words, oneWordRate } = measured;

  const base =
    medianWords <= 3
      ? `They write extremely short. Typically ${medianWords} word${medianWords === 1 ? '' : 's'}.`
      : medianWords <= 8
        ? `They write short — usually around ${medianWords} words.`
        : `They write in full thoughts, usually around ${medianWords} words.`;

  const range =
    p90Words > medianWords * 3
      ? ' Occasionally much longer, when they have something to say.'
      : '';

  const single =
    oneWordRate >= 0.15 ? ' A single word is a normal caption for them.' : '';

  return `- ${base}${range}${single}`;
}

function measuredLines(measured: MeasuredStyle): string[] {
  return [
    lengthLine(measured),

    howOften(measured.allLowercaseRate, {
      rarely: '- They capitalise normally.',
      sometimes: '- Sometimes all lowercase, sometimes not.',
      usually: '- Almost always all lowercase, including the first word.',
    }),

    howOften(measured.terminalPunctuationRate, {
      rarely: '- They almost never end on a full stop or an exclamation mark.',
      sometimes: '- Punctuation at the end is optional for them.',
      usually: '- They punctuate the end properly.',
    }),

    howOften(measured.fragmentRate, {
      rarely: '- They write complete sentences.',
      sometimes: '- Fragments and sentences both.',
      usually: '- Fragments, not sentences. Grammar is not the point.',
    }),

    howOften(measured.emojiRate, {
      rarely: '- They do not use emoji. Do not add any.',
      sometimes: '- The odd emoji, never a row of them.',
      usually: '- They use an emoji most of the time — one, doing a job.',
    }),

    // Hashtags are already impossible in personal mode; this only ever reports
    // that they were not part of this person's habit either.
    measured.hashtagRate <= 0.05 ? '- No hashtags. Ever.' : null,

    howOften(measured.scriptMix.romanisedHindi + measured.scriptMix.devanagari, {
      rarely: '- They write in English.',
      sometimes:
        '- They move between English and Hindi depending on the post. Either is normal for them; follow the post, not a ratio.',
      usually:
        '- They mostly write Hinglish — Hindi phrasing in Latin script, mixed with English.',
    }),

    howOften(measured.explainsContextRate, {
      rarely:
        '- They never explain the context. The caption assumes you already know, or that it does not matter.',
      sometimes: '- Sometimes they give the context, sometimes they do not.',
      usually: '- They tend to say what is going on.',
    }),
  ].filter((line): line is string => line !== null);
}

/**
 * Renders the profile, or null when there isn't one worth rendering.
 *
 * Null is the honest answer at cold start, and the personal prompt has a branch
 * for it that says so — a member with four posts is better served by "we don't
 * know yet" than by a personality confidently inferred from four posts, which
 * they would recognise as wrong immediately.
 */
export function renderStyleSection(
  profile: StyleProfile | null,
  /**
   * The heading, so a brand's learned voice is not introduced as a person's.
   *
   * Only the heading changes between the two. Every line below is a statement
   * about observed writing behaviour — how long, how punctuated, how often an
   * emoji — and reads correctly whether the writer is a person or an account.
   * Forking the sentences as well would be two renderers to keep in step for no
   * gain, which is the mistake this file's header warns about.
   */
  heading = '## How this person posts',
): string | null {
  if (!profile || profile.confidence === 'none') return null;

  const behaviour = profile.global.behaviour;
  const situational = profile.situational[0];

  const lines = [
    heading,
    ...measuredLines(profile.global.measured),

    behaviour && `- Brevity: ${behaviour.brevity}`,
    behaviour && `- Humour: ${behaviour.humour}`,
    behaviour && `- Emotionally: ${behaviour.emotionalRange}`,
    behaviour && `- Randomness: ${behaviour.randomness}`,
    behaviour && `- Context: ${behaviour.contextDependence}`,
    behaviour && `- How they come across: ${behaviour.selfPresentation}`,

    // One situation only — the one this post is in. The rest of the profile's
    // situational blocks are not relevant to a gym photo and would be six lines
    // of noise.
    situational &&
      `- On posts like this one specifically: ${situational.behaviour}`,

    profile.references &&
      profile.references.rate >= 0.15 &&
      `- References ${profile.references.kinds.join(', ')} fairly often, and ${profile.references.handling}. Only when one genuinely fits — never as decoration.`,

    profile.references &&
      profile.references.rate < 0.15 &&
      '- They rarely reach for a cultural reference. Do not force one in.',

    profile.avoids.length > 0 && `- They never: ${profile.avoids.join('; ')}.`,

    profile.confidence === 'low'
      ? '- This read is based on very few posts. Follow the length and casing, and hold the rest loosely.'
      : null,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return lines.join('\n');
}

/** The situational block matching this post, moved to the front for rendering. */
export function focusSituation(
  profile: StyleProfile | null,
  situation: string,
): StyleProfile | null {
  if (!profile) return null;
  const match = profile.situational.find((entry) => entry.situation === situation);
  if (!match) return { ...profile, situational: [] };
  return { ...profile, situational: [match] };
}

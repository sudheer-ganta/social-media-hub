import { REFERENCE_KINDS } from '../style/types';
import type { CaptionSignal } from '../style/signals';

/**
 * The one model call in style memory, and the only thing it is asked.
 *
 * Everything countable about how somebody writes — length, casing,
 * punctuation, emoji, script mixing, whether they explain themselves — is
 * already computed by `style/measure.ts` before this prompt runs, and none of
 * it is asked for here. Same division as `analysis.prompt.ts`: the model gets
 * the arithmetic handed to it and spends its whole reply on the part arithmetic
 * cannot reach.
 *
 * What is left is genuinely hard and genuinely qualitative: what is their
 * humour actually like, what do they do with a reference, are they performing
 * being unbothered, what do they never do.
 *
 * ─── The rule this prompt is mostly about ────────────────────────────────────
 * **Describe behaviour, never vocabulary.** A model asked "how does this person
 * write" will, unprompted, answer with their favourite words — it is the most
 * available evidence and it feels like the most specific answer. It is also the
 * one answer that ruins the feature: a profile saying they favour a handful of
 * words produces captions built from those words, which is their greatest hits
 * on a loop rather than a new joke in their voice.
 *
 * So the instruction is explicit, repeated, and — because instructions alone do
 * not hold — enforced afterwards by `sanitiseBehaviour` in `style/types.ts`,
 * which drops any description containing a quoted phrase or a list of words.
 */

export const STYLE_PROFILE_PROMPT_VERSION = 1;

/** More than this and the model starts describing the average of a crowd. */
const MAX_PROFILE_EXAMPLES = 60;

const SYSTEM_INSTRUCTION = `You study how one person writes and describe their behaviour. You are building a profile another writer will use to sound like them.

The rules, in order of importance:
- Describe BEHAVIOUR, never VOCABULARY. Never name, quote or list a word or phrase this person uses. "Jokes at their own expense" is a behaviour. "Says bro and ate" is a word list, and it is the one answer that makes this profile useless — a writer given it will simply repeat those words.
- Do not quote their captions. Do not paraphrase them. Do not give examples.
- Describe what is actually there, not what would make a flattering profile. If their humour is mean, say so. If half their posts are unremarkable, say so.
- Say nothing about length, capitalisation, punctuation, emoji or language mixing. All of that is already measured and you would only be guessing at numbers somebody else has counted.
- Keep every description under twelve words. You are writing labels, not a character study.
- Return only the JSON object described. No commentary, no markdown fences.`;

export function buildStyleProfileResponseSchema(): Record<string, unknown> {
  const behaviour = (description: string) => ({
    type: 'string',
    description: `${description} Under 12 words. Behaviour only — never a word they use.`,
  });

  return {
    type: 'object',
    properties: {
      behaviour: {
        type: 'object',
        properties: {
          brevity: behaviour('How much they say relative to what they mean.'),
          humour: behaviour('What kind of funny they are, if they are.'),
          emotionalRange: behaviour('What they are willing to be sincere about.'),
          randomness: behaviour('How connected their captions are to the picture.'),
          contextDependence: behaviour('Whether they explain what is going on.'),
          selfPresentation: behaviour('The character they play in their own posts.'),
        },
        required: [
          'brevity',
          'humour',
          'emotionalRange',
          'randomness',
          'contextDependence',
          'selfPresentation',
        ],
      },
      references: {
        type: 'object',
        description: 'How they handle culture — songs, films, people, memes.',
        properties: {
          kinds: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', enum: [...REFERENCE_KINDS] },
            description:
              'Categories only. Never the name of a song, film or person — a stored name reappears in captions where it does not belong.',
          },
          handling: behaviour('What they do with a reference when they use one.'),
        },
        required: ['kinds', 'handling'],
      },
      avoids: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'string',
          description:
            'Something they never do, as a behaviour. Under 10 words. Never a word or phrase.',
        },
      },
      situational: {
        type: 'array',
        maxItems: 4,
        description:
          'Only for situations where they are noticeably different from their usual self. Skip the ones where they are not.',
        items: {
          type: 'object',
          properties: {
            situation: { type: 'string', description: 'The label given to you.' },
            behaviour: behaviour('What changes about them on posts like this.'),
          },
          required: ['situation', 'behaviour'],
        },
      },
    },
    required: ['behaviour', 'avoids'],
  };
}

export interface BuiltStyleProfilePrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

/**
 * Builds the profile request.
 *
 * Captions arrive grouped by how much they count — see `style/signals.ts`. The
 * grouping is in the prompt rather than flattened away because the difference
 * genuinely matters: something they published is who they are, and something
 * they were offered and did not use is who they are not. A model shown one
 * undifferentiated list averages the two and describes a person halfway between
 * them, which is nobody.
 */
export function buildStyleProfilePrompt(
  signals: CaptionSignal[],
  situations: string[],
): BuiltStyleProfilePrompt {
  const positive = signals
    .filter((signal) => signal.weight > 0)
    .slice(0, MAX_PROFILE_EXAMPLES);

  const strong = positive.filter((signal) => signal.kind.startsWith('published'));
  const weaker = positive.filter((signal) => !signal.kind.startsWith('published'));
  const rejected = signals.filter((signal) => signal.weight < 0).slice(0, 12);

  const list = (items: CaptionSignal[]) =>
    items.map((item) => `- ${item.text.replace(/\s+/g, ' ')}`).join('\n');

  const prompt = [
    'Read this person’s captions and describe how they behave when they post.',

    strong.length > 0
      ? [
          '## What they actually published',
          'The strongest evidence. These are the ones they stood behind — some written from scratch, some edited from a suggestion until they were right.',
          list(strong),
        ].join('\n')
      : null,

    weaker.length > 0
      ? [
          '## Weaker evidence',
          'Chosen, saved, or offered to them. Treat as a hint, not as proof.',
          list(weaker),
        ].join('\n')
      : null,

    rejected.length > 0
      ? [
          '## What they turned down',
          'They were offered these and did not use them. Evidence about what they are NOT — useful for `avoids`, and never for the behaviour fields.',
          list(rejected),
        ].join('\n')
      : null,

    situations.length > 0
      ? [
          '## Situations they post about',
          situations.join(', '),
          'Only describe the ones where they are noticeably different from their usual self.',
        ].join('\n')
      : null,

    [
      '## What to produce',
      '1. Six behaviour labels: brevity, humour, emotional range, randomness, context dependence, self-presentation.',
      '2. How they handle cultural references — the kinds, and what they do with one. Categories only, never a name.',
      '3. Up to five things they never do, as behaviours.',
      '4. Situational notes, only where they genuinely differ.',
      'Remember: no words of theirs, no quotes, no examples, and nothing about length, casing, punctuation or language — those are already counted.',
    ].join('\n'),

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: buildStyleProfileResponseSchema(),
    // Low. This is observation, the same job Vision does, and it should read
    // the same person the same way twice.
    temperature: 0.3,
    version: STYLE_PROFILE_PROMPT_VERSION,
  };
}

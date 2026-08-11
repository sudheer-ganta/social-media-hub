import type { CaptionRequest, ImageAnalysis } from '../types';

/**
 * The personal brain.
 *
 * Brand's prompt (`caption.prompt.ts`) is a marketing brief: objective, funnel
 * stage, audience register, length band, hook, CTA, hashtags, platform rules.
 * None of that appears here, and none of it is a setting a personal member has
 * turned off — it is absent because it does not apply. A person posting a photo
 * of their own gym session has no funnel stage.
 *
 * ─── Why this file is small ──────────────────────────────────────────────────
 * The temptation with a "write like a human" prompt is to describe humanness at
 * length, and the result is a model performing the description. Everything that
 * can be enforced without the model is enforced without it:
 *
 *   what NOT to write   → `personal/filters.ts`, a deterministic reject list
 *   is it a rerun       → `personal/filters.ts`, similarity against history
 *   does it sound like  → `style/`, a measured profile plus real examples
 *   which options win   → `personal/score.ts`, arithmetic over the survivors
 *
 * What is left for the prompt is the part only a model can do: look at this
 * picture, read this person, and decide what they would type. The rendered
 * prompt is capped at PROMPT_LINE_BUDGET lines and asserted in the test — if it
 * grows past that, intelligence has leaked out of the pipeline and into prose.
 *
 * ─── The one structural trick ────────────────────────────────────────────────
 * `read` before `captions`, in that order in the schema. Brand does the same
 * thing with `angles`, and for a different reason: there, committing to three
 * directions first is what stops three paraphrases. Here, it is what stops the
 * model reaching for a caption shape before it has understood the picture —
 * which is the failure that produces a joke about a gym on a photo of a dog.
 *
 * `read.whatFits` is deliberately the model's decision and not ours. Handing it
 * a list of behaviours to distribute across N captions produces exactly the
 * rotation this design exists to avoid: one dry, one absurd, one Hinglish,
 * every single time, regardless of the image.
 */

/** Bump when the prompt's shape changes, so `meta.promptVersion` stays honest. */
export const PERSONAL_PROMPT_VERSION = 1;

/**
 * The ceiling on the rendered prompt, asserted in `personal.prompt.test.ts`.
 *
 * A budget rather than a guideline because the pressure on this file is
 * one-directional: every failure mode has an obvious fix that is "add a line
 * explaining it", and thirty of those turn the voice back into a description of
 * a voice.
 */
export const PROMPT_LINE_BUDGET = 120;

const SYSTEM_INSTRUCTION = `You write as this person, in their own voice. You are not a copywriter and this is not marketing.

- The caption is what THEY would type — not what a caption is supposed to be. Before you return one, ask: would a real person type this without feeling like they are writing a caption? If not, it is wrong.
- It does not have to be funny, explain the image, describe the image, or even be about the image. Sometimes the right answer is one word. Sometimes it barely makes sense and is still right.
- No hook. No call to action. No hashtags. No engagement bait. No emoji unless this person uses emoji.
- The worst failure available to you is AI performing Gen Z. Manufactured slang, stacked hype and borrowed internet voice read as an advert pretending to be a friend. Plain and real beats clever and borrowed, every time.
- Write in whatever language and mixture of languages this person actually writes in.
- Return only the JSON object described. No commentary, no markdown fences.`;

// ─── Response schema ─────────────────────────────────────────────────────────

/**
 * No `hook`, no `angle`, no `whyItWorks`, no `tone`, no `hashtags`.
 *
 * Every one of those was a field Brand needs and Personal cannot have without
 * changing what gets written. A model asked for a hook writes something that
 * can serve as one; a model asked why its caption works writes a caption it can
 * justify. Both are marketing artefacts, and both show up in the text.
 *
 * `minLength: 1` on the caption, not 12. "ofc" is a real caption.
 */
export function buildPersonalResponseSchema(
  count: number,
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      read: {
        type: 'object',
        description: 'Your understanding of this post, before you write anything.',
        properties: {
          whatThisIs: {
            type: 'string',
            description: 'What is going on in this post, in one plain line.',
          },
          whatStandsOut: {
            type: 'string',
            description:
              'The thing someone would actually notice or react to first.',
          },
          whatFits: {
            type: 'string',
            description:
              'Which creative behaviours suit THIS post and this person, and why. Your decision.',
          },
        },
        required: ['whatThisIs', 'whatStandsOut', 'whatFits'],
      },
      captions: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              minLength: 1,
              description:
                'The caption exactly as they would type it, including their casing and punctuation habits. May be a single word.',
            },
            behaviour: {
              type: 'string',
              description:
                'At most two words naming what this one is doing, for internal logging. Never shown to anyone.',
            },
          },
          required: ['text', 'behaviour'],
        },
      },
    },
    required: ['read', 'captions'],
  };
}

// ─── Prompt assembly ─────────────────────────────────────────────────────────

function section(heading: string, lines: Array<string | null | undefined | false>) {
  const body = lines.filter((line): line is string => Boolean(line && String(line).trim()));
  return body.length > 0 ? `${heading}\n${body.join('\n')}` : null;
}

/**
 * The image, read as a picture rather than as an asset.
 *
 * Deliberately not `imageSection` from the brand prompt. That one renders all
 * twenty-four fields under three headings including symbolism, buyer persona
 * and campaign type — correct for a strategist and actively harmful here, where
 * a model handed "themes: legacy, arrival" starts writing about legacy.
 *
 * The personal fields lead because they are the ones worth writing from. The
 * bytes are attached to the request as well, so this is a summary of something
 * the model can also see, not a substitute for seeing it.
 */
function imageSection(analysis: ImageAnalysis): string | null {
  return section('## The image', [
    analysis.whatSubjectIsDoing && `- ${analysis.whatSubjectIsDoing}`,
    analysis.vibe && `- The energy of it: ${analysis.vibe}`,
    analysis.whatAFriendWouldNotice &&
      `- First thing a friend would notice: ${analysis.whatAFriendWouldNotice}`,
    analysis.recognisableReferences?.length
      ? `- Reads a bit like: ${analysis.recognisableReferences.join('; ')}`
      : null,
    // The observation fields, kept short. Enough to ground a caption in
    // something concrete; not enough to invite a description of the photo.
    analysis.primarySubject && `- In frame: ${analysis.primarySubject}`,
    analysis.setting && `- Where: ${analysis.setting}`,
    analysis.textInImage.length > 0
      ? `- Words visible in the picture: ${analysis.textInImage.join(' / ')}`
      : null,
    analysis.confidenceScore < 50
      ? '- This read is shaky — the picture is ambiguous. Trust what you can see over what is written here.'
      : null,
  ]);
}

export interface BuiltPersonalPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

export interface BuildPersonalPromptOptions {
  /** Vision's read, when there was an image and it worked. */
  imageAnalysis?: ImageAnalysis | null;
  /**
   * How this person posts, rendered by `style/render.ts`. Null until they have
   * enough history to have a style — see the cold-start block below, which is
   * the honest answer and not a placeholder.
   */
  styleSection?: string | null;
  /**
   * Real captions of theirs, already labelled and capped by `style/retrieve.ts`.
   * Null when there is no history to draw on.
   */
  evidenceSection?: string | null;
  /** How many to write. */
  count: number;
}

export function buildPersonalPrompt(
  request: CaptionRequest,
  { imageAnalysis, styleSection, evidenceSection, count }: BuildPersonalPromptOptions,
): BuiltPersonalPrompt {
  const title = request.title?.trim() || request.topic.trim();

  const prompt = [
    imageAnalysis
      ? imageSection(imageAnalysis)
      : request.imageUrl
        ? '## The image\nThere is a picture on this post but it could not be read. Write from the title alone and never describe what you cannot see.'
        : null,

    section('## What they typed', [
      title
        ? `- "${title}"`
        : '- Nothing. They uploaded a picture and pressed generate.',
      title
        ? 'This is theirs, not a brief. It might be the subject, an inside joke, a name, or a word with no explanation. Work out what it means to them before you use it.'
        : null,
    ]),

    // Cold start is a real state, not a degraded one. A model told to invent a
    // personality invents a loud one, and a new member's first caption is
    // exactly the moment a fabricated voice is most obvious to them.
    styleSection ??
      [
        '## How this person posts',
        'Not known yet — there is no history to read. Do not invent a personality for them and do not perform one. Stay plain, stay short, and let the picture carry it. Restraint reads as human; a manufactured character does not.',
      ].join('\n'),

    evidenceSection,

    [
      '## First, understand this post',
      'Fill in `read` before you write a single caption. What is this, what stands out, and which creative behaviours actually suit it.',
      'Some posts want almost nothing. Some want a reference — a song, a film, a person, a meme — named bare and never explained. Some want dry, dramatic, absurd, self-roasting, flirty, dark, emotional, or genuinely beautiful. Some want a mix of languages. Some want something that makes no sense at all except that it fits the picture.',
      'Which of those applies is your call, made from this image, this title and this person. It is not a list to work through. Do not write one of each. If the honest answer is that three of them want the same behaviour, write three of that behaviour and make them different from each other.',
    ].join('\n'),

    [
      `## Then write ${count}`,
      'Each one a separate decision, not a variation of the one before it.',
      'Lengths should differ the way a real feed differs. One word is a complete caption. So is a fragment with no punctuation.',
      'Not all of them have to be funny. If this post is not funny, none of them should be.',
    ].join('\n'),

    [
      '## Never',
      '- Copy, paraphrase, or rebuild a caption from the evidence above. Same person, new joke.',
      '- Reach for "embracing the journey", "living my best life", "making memories", "good vibes", "main character energy", "it\'s giving", "serving looks", "level up", "unlock", "elevate", "POV", or anything else that could sit under any photo on earth.',
      '- Add a hashtag, a call to action, a question fishing for replies, or an emoji doing a job a word should do.',
      '- Explain the joke, explain the reference, or explain the picture.',
      '- Describe what is in the frame. They can see the photo. They took it.',
      '- Write a complete, well-formed marketing sentence when this person writes fragments.',
    ].join('\n'),

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: buildPersonalResponseSchema(count),
    // Higher than Brand's 0.85. Brand is writing to a brief and wants
    // consistency; this is trying to be surprising, and the deterministic
    // filters downstream are what make a high temperature safe to run at.
    temperature: request.previousCaption?.trim() ? 1.15 : 1.0,
    version: PERSONAL_PROMPT_VERSION,
  };
}

/**
 * Alt text: what a screen reader should say about this image.
 *
 * A deliberately small prompt, and a deliberately different one from the vision
 * brief in `vision.prompt.ts`. That prompt asks a strategist what an image is
 * *worth*; this one asks what the image *is*. Accessibility text that editorialises
 * ("a stunning shot capturing the energy of innovation") tells a blind reader
 * nothing about the picture and wastes the one description they get.
 *
 * The rules below are the WCAG conventions that matter in practice: describe
 * content and function, lead with the subject, do not narrate the medium, and
 * stop. LinkedIn's own guidance is under 120 characters, which is the ceiling
 * this asks for — their hard limit is 4,086, but nobody listening to a feed
 * wants four thousand characters of it.
 */

/** Bump when this prompt's shape changes, so provenance stays honest. */
export const ALT_TEXT_PROMPT_VERSION = 1;

/** LinkedIn's recommended length. The hard limit is enforced in the validator. */
export const ALT_TEXT_TARGET_LENGTH = 120;

const SYSTEM_INSTRUCTION = `You write alternative text for images on social media, for people using screen readers.

Rules you never break:
- Describe what is actually visible: the main subject first, then only the context that changes the meaning.
- Write one plain sentence. No more.
- Never begin with "image of", "picture of", "photo showing" — the screen reader already says it is an image.
- Never editorialise, sell, or use marketing adjectives. "Four people at a whiteboard" not "a dynamic team collaborating on breakthrough ideas".
- Never guess at identity, age, ethnicity, job title, brand, or location. Describe what a stranger could see.
- If text is legible and meaningful in the image, quote it — that text is content a screen reader would otherwise lose.
- Return only the JSON object described. No commentary, no markdown fences.`;

export const ALT_TEXT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    altText: {
      type: 'string',
      description: `One plain sentence describing the image, ideally under ${ALT_TEXT_TARGET_LENGTH} characters. Empty string if the image is too unclear to describe honestly.`,
    },
  },
  required: ['altText'],
};

export interface BuildAltTextPromptOptions {
  /**
   * The caption the image is going out with, when there is one.
   *
   * Passed as context for *disambiguation only* — the model is told to describe
   * the picture, not to restate the post. Alt text that parrots the caption is
   * a well-known accessibility failure: the screen reader user hears the same
   * sentence twice and learns nothing about the image.
   */
  caption?: string;
}

export function buildAltTextPrompt(options: BuildAltTextPromptOptions = {}): {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
} {
  const caption = options.caption?.trim().slice(0, 600);

  const prompt = [
    'Write the alternative text for this image.',
    caption
      ? `For context only, the post it accompanies reads: "${caption}". Do not repeat it — describe the picture itself.`
      : null,
    `Aim for under ${ALT_TEXT_TARGET_LENGTH} characters.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: ALT_TEXT_RESPONSE_SCHEMA,
    // Low. This is a description, not a piece of writing — two runs over the
    // same photo should say the same thing.
    temperature: 0.2,
    version: ALT_TEXT_PROMPT_VERSION,
  };
}

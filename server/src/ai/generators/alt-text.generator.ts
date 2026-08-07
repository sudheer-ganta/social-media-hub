import { buildAltTextPrompt } from '../prompts/alt-text.prompt';
import type { AiTextProvider } from '../providers';
import type { InlineImage } from '../types';

/**
 * Describing an image for a screen reader.
 *
 * Most people do not write alt text. Not out of indifference — it is one more
 * field at the moment they are trying to publish, and it gets skipped. Since
 * the image is already going through a vision model on its way out, asking it
 * for a description costs one call and makes every post FlowPost sends more
 * accessible than the one the member would have written by hand.
 *
 * ─── Never throws ────────────────────────────────────────────────────────────
 * Returns null instead. This is an enhancement to a publish that is already
 * happening: an image without alt text is a worse post, an image whose alt text
 * generation threw is *no post at all*. Every failure path — no vision support,
 * a model hiccup, an unusable reply — lands in the same place: log it, return
 * null, publish the image without the attribute.
 *
 * A member who wrote their own alt text never reaches this file. Generated text
 * fills a gap; it does not overrule a person.
 */

/**
 * Prefixes the model was told not to use, checked anyway.
 *
 * A vision model asked not to say "image of" says it perhaps one time in
 * twenty. Stripping it here is cheaper and more reliable than a sterner prompt,
 * and the failure is invisible to everyone except the person listening.
 */
const REDUNDANT_PREFIXES = [
  /^(?:an?\s+)?(?:image|picture|photo|photograph|graphic|illustration|screenshot)\s+(?:of|showing|depicting|that shows)\s+/i,
  /^(?:this\s+)?(?:image|picture|photo)\s+(?:is|shows|depicts)\s+/i,
];

/**
 * Hard ceiling on what we will pass on.
 *
 * Not LinkedIn's limit — theirs is 4,086 and lives in their validator, because
 * it is their rule. This one is ours: a description that runs past a couple of
 * sentences has stopped being alt text and started being an essay, whatever the
 * network would technically accept.
 */
const MAX_GENERATED_LENGTH = 300;

export interface GenerateAltTextOptions {
  /** The image itself, already downloaded. */
  image: InlineImage;
  provider: AiTextProvider;
  /** The post's caption, for disambiguation. See the prompt. */
  caption?: string;
}

/** Trims the model's habits off a description. Returns null if nothing survives. */
function normaliseAltText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let text = value.trim();
  for (const pattern of REDUNDANT_PREFIXES) {
    text = text.replace(pattern, '');
  }

  // Models like to answer a "describe this" prompt with a wrapped sentence.
  text = text.replace(/^["'“”]+|["'“”]+$/g, '').trim();

  if (text.length < 3) return null;

  // Capitalise the first letter, which prefix-stripping often removes.
  text = text[0].toUpperCase() + text.slice(1);

  return text.length > MAX_GENERATED_LENGTH
    ? `${text.slice(0, MAX_GENERATED_LENGTH - 1).trimEnd()}…`
    : text;
}

/**
 * Generates alt text for one image. Returns null if anything at all goes wrong.
 *
 * The provider is asked whether it can see before anything is sent — a model
 * that would be handed the pixels and ignore them would confidently describe an
 * image it never saw, which is worse than no alt text by a wide margin.
 */
export async function generateAltText({
  image,
  provider,
  caption,
}: GenerateAltTextOptions): Promise<string | null> {
  if (!provider.supportsVision) {
    console.info('[ai] skipping alt text — provider cannot see', {
      provider: provider.id,
    });
    return null;
  }

  const startedAt = Date.now();

  try {
    const built = buildAltTextPrompt({ caption });

    const payload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
      images: [{ mimeType: image.mimeType, data: image.data }],
    })) as { altText?: unknown };

    const altText = normaliseAltText(payload.altText);

    if (!altText) {
      console.warn('[ai] alt text generation returned nothing usable');
      return null;
    }

    console.info('[ai] alt text generated', {
      model: provider.model,
      durationMs: Date.now() - startedAt,
      length: altText.length,
    });

    return altText;
  } catch (error) {
    // Deliberately swallowed. See the note at the top of this file: publishing
    // without alt text beats not publishing.
    console.warn('[ai] alt text generation failed, publishing without it', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

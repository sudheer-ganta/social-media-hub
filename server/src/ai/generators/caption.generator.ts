import { buildCaptionPrompt } from '../prompts/caption.prompt';
import { AiProviderError, type AiTextProvider } from '../providers';
import { analyseImage } from './image-analysis.generator';
import type {
  CaptionRequest,
  CaptionResult,
  CaptionVariation,
  CreativeAngle,
  ImageAnalysis,
  InlineImage,
  RawCaptionPayload,
} from '../types';

/**
 * The caption generator.
 *
 * Owns the one flow that matters: brief in → captions out. As of Sprint 4.2
 * that flow has two model calls in it, not one:
 *
 *   image → [stage 1: look]  → analysis ─┐
 *                                        ├→ [stage 2: write] → captions
 *   brief, brand, audience ───────────────┘
 *
 * Stage one is in `image-analysis.generator.ts` and is allowed to fail; stage
 * two runs either way. The old single-call flow is exactly what remains when
 * there is no image, so a text-only post costs the same one call it always did.
 *
 * This is also the only place that treats model output as *untrusted* — a
 * response schema constrains shape, not sense, and a model can still return
 * three empty strings, a hashtag containing a sentence, or four variations when
 * asked for three.
 *
 * Deliberately not a class and deliberately provider-injected: the generator
 * takes whichever `AiTextProvider` it is handed, which is what makes it
 * testable without a network and what makes swapping models a registry edit.
 */

/** Hashtags longer than this are prose the model mislabelled. */
const MAX_HASHTAG_LENGTH = 40;

/** A caption shorter than this is a failure, not a terse option. */
const MIN_CAPTION_LENGTH = 12;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Normalises one hashtag: strips the `#` the model was told not to include,
 * removes whitespace and punctuation, and rejects anything left that is not a
 * plausible tag. Returns null for a value that should be dropped.
 */
function normaliseHashtag(value: unknown): string | null {
  const raw = asString(value).replace(/^#+/, '');
  if (!raw) return null;

  // Keep letters and digits from any script — hashtags are requested in the
  // user's own language, so a Latin-only filter would empty the list.
  const cleaned = raw.replace(/[\s\p{P}\p{S}]+/gu, '');
  if (!cleaned || cleaned.length > MAX_HASHTAG_LENGTH) return null;

  return cleaned;
}

function normaliseAngles(
  payload: RawCaptionPayload,
  request: CaptionRequest,
): CreativeAngle[] {
  const raw = Array.isArray(payload.angles) ? payload.angles : [];

  return raw
    .map((item) => ({
      name: asString(item?.name).slice(0, 80),
      premise: asString(item?.premise).slice(0, 300),
      imageHook: asString(item?.imageHook).slice(0, 300),
    }))
    .filter((angle) => angle.name.length > 0)
    .slice(0, request.variationCount);
}

function normaliseVariations(
  payload: RawCaptionPayload,
  request: CaptionRequest,
): CaptionVariation[] {
  const raw = Array.isArray(payload.variations) ? payload.variations : [];

  const variations = raw
    .map((item, index) => {
      const caption = asString(item?.caption);
      if (caption.length < MIN_CAPTION_LENGTH) return null;

      // A missing hook is recoverable — it is by definition the caption's own
      // first line, so derive it rather than discarding a good caption.
      const hook =
        asString(item?.hook) || caption.split(/\r?\n/)[0].trim().slice(0, 160);

      const angle = asString(item?.angle).slice(0, 80);
      const whyItWorks = asString(item?.whyItWorks).slice(0, 300);

      return {
        tone: asString(item?.tone) || `Option ${index + 1}`,
        caption,
        hook,
        wordCount: countWords(caption),
        // Both are presentation extras. An option missing them is still a
        // perfectly good caption, so they are dropped rather than defaulted —
        // an empty string in the UI is a worse answer than no label at all.
        ...(angle && { angle }),
        ...(whyItWorks && { whyItWorks }),
      };
    })
    .filter((item): item is CaptionVariation => item !== null);

  // Over-delivery is harmless but confusing in the UI; trim to what was asked.
  return variations.slice(0, request.variationCount);
}

function normalisePlatformCaptions(
  payload: RawCaptionPayload,
  request: CaptionRequest,
  fallback: string,
): Record<string, string> {
  const raw = payload.platformCaptions ?? {};

  // Keyed by the platforms *we* asked for, never by the keys the model chose:
  // a hallucinated "twitter" key would otherwise reach the post record.
  return Object.fromEntries(
    request.platforms.map((platform) => [
      platform,
      asString(raw[platform]) || fallback,
    ]),
  );
}

export interface CaptionGeneratorDeps {
  provider: AiTextProvider;
}

/**
 * Generates captions for one brief.
 *
 * Throws {@link AiProviderError} — for a transport failure raised by the
 * provider, and for the one case the provider cannot detect: a well-formed
 * response with nothing usable in it. A failure to analyse the image is *not*
 * one of these; it degrades the result instead of ending it.
 */
export async function generateCaption(
  request: CaptionRequest,
  { provider }: CaptionGeneratorDeps,
): Promise<CaptionResult> {
  const startedAt = Date.now();

  // ── Stage one: look at the image ──────────────────────────────────────────
  let analysis: ImageAnalysis | null = null;
  let image: InlineImage | null = null;

  if (request.imageUrl) {
    const outcome = await analyseImage({
      imageUrl: request.imageUrl,
      provider,
      topic: request.topic,
      brandName: request.brandVoice?.name,
      brandDescription: request.brandVoice?.description,
    });

    if (outcome) {
      analysis = outcome.analysis;
      image = outcome.image;
    }
  }

  // ── Stage two: write from what it saw ─────────────────────────────────────
  const built = buildCaptionPrompt(request, { imageAnalysis: analysis });

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
    // The image rides along a second time. The analysis is the brief, but a
    // model writing while it can still see the picture picks up the specifics
    // — the particular quality of the light, the one detail worth a line —
    // that no structured summary survives.
    ...(image && {
      images: [{ mimeType: image.mimeType, data: image.data }],
    }),
  })) as RawCaptionPayload;

  const durationMs = Date.now() - startedAt;
  const variations = normaliseVariations(payload, request);

  if (variations.length === 0) {
    throw new AiProviderError(
      'The AI did not return a usable caption. Please try again.',
      502,
      true,
      `empty after normalisation: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }

  const hashtags = [
    ...new Set(
      (Array.isArray(payload.hashtags) ? payload.hashtags : [])
        .map(normaliseHashtag)
        .filter((tag): tag is string => tag !== null),
    ),
  ].slice(0, request.hashtagCount);

  const caption = variations[0].caption;
  const angles = normaliseAngles(payload, request);

  return {
    caption,
    variations,
    hashtags,
    platformCaptions: normalisePlatformCaptions(payload, request, caption),
    ...(analysis && { imageAnalysis: analysis }),
    ...(angles.length > 0 && { angles }),
    ...(payload.seo && { seo: payload.seo }),
    ...(payload.campaign && { campaign: payload.campaign }),
    ...(payload.competitor && { competitor: payload.competitor }),
    meta: {
      provider: provider.id,
      model: provider.model,
      // Wall clock for the whole pipeline, both calls included — it is what
      // the user waited, which is the only number worth reporting to them.
      durationMs,
      generatedAt: new Date().toISOString(),
      promptVersion: built.version,
    },
  };
}

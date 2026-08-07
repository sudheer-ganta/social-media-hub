import { buildVisionPrompt } from '../prompts/vision.prompt';
import type { AiTextProvider } from '../providers';
import { fetchInlineImage, ImageFetchError } from '../vision/image-source';
import type {
  ImageAnalysis,
  InlineImage,
  RawImageAnalysisPayload,
} from '../types';

/**
 * Stage one of generation: download the image, show it to the model, and turn
 * what comes back into a brief stage two can trust.
 *
 * ─── Never throws ────────────────────────────────────────────────────────────
 * `analyseImage` returns null instead. A missing analysis costs the caption its
 * best material; a thrown error would cost the user their caption entirely, and
 * an image that 404s is not a reason to refuse to write anything. Every failure
 * path — bad URL, private address, unsupported format, model hiccup — lands in
 * the same place: log it, return null, let the caption be written from the
 * brief the way it was before any of this existed.
 */

/** Hex codes only. A model asked for hex still occasionally answers "gold". */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function asString(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown, maxItems: number, max = 240): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => asString(item, max))
        .filter((item): item is string => item.length > 0),
    ),
  ].slice(0, maxItems);
}

function asColors(value: unknown): string[] {
  return asStringArray(value, 6, 9)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => HEX_COLOR.test(entry));
}

function asScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * Cleans one analysis.
 *
 * Returns null when the reply is too thin to be worth passing on. The bar is
 * deliberately low but real: without a subject or a scene there is nothing for
 * stage two to write from, and handing it an empty brief is worse than handing
 * it none — it would dutifully write about "the image" as though it knew.
 */
function normaliseAnalysis(payload: RawImageAnalysisPayload): ImageAnalysis | null {
  const primarySubject = asString(payload.primarySubject, 160);
  const sceneDescription = asString(payload.sceneDescription, 600);

  if (!primarySubject && !sceneDescription) return null;

  return {
    primarySubject,
    secondarySubjects: asStringArray(payload.secondarySubjects, 6),
    objects: asStringArray(payload.objects, 12),
    sceneDescription,
    setting: asString(payload.setting, 200),
    composition: asString(payload.composition, 300),
    lighting: asString(payload.lighting, 200),
    mood: asString(payload.mood, 120),
    colorPalette: asColors(payload.colorPalette),
    brandStyle: asString(payload.brandStyle, 160),
    textInImage: asStringArray(payload.textInImage, 8, 120),
    emotions: asStringArray(payload.emotions, 6, 80),
    themes: asStringArray(payload.themes, 6, 80),
    symbolism: asStringArray(payload.symbolism, 6, 160),
    storyAngles: asStringArray(payload.storyAngles, 6, 300),
    productCategory: asString(payload.productCategory, 120),
    industry: asString(payload.industry, 120),
    targetAudience: asString(payload.targetAudience, 300),
    suggestedCampaignType: asString(payload.suggestedCampaignType, 160),
    suggestedMarketingObjective: asString(
      payload.suggestedMarketingObjective,
      160,
    ),
    suggestedBuyerPersona: asString(payload.suggestedBuyerPersona, 300),
    confidenceScore: asScore(payload.confidenceScore),
  };
}

export interface AnalyseImageOptions {
  imageUrl: string;
  provider: AiTextProvider;
  /** Passed to the prompt as context for what is worth noticing. */
  topic?: string;
  brandName?: string;
  brandDescription?: string;
}

/** What stage one hands to stage two: the read, and the pixels behind it. */
export interface ImageAnalysisOutcome {
  analysis: ImageAnalysis;
  /** The same image, so stage two can write while looking at it. */
  image: InlineImage;
  durationMs: number;
  promptVersion: number;
}

/**
 * Analyses one image. Returns null if anything at all goes wrong.
 *
 * The provider is asked whether it can see before the image is downloaded —
 * there is no point spending a round trip and six megabytes on a model that
 * would be handed the bytes and ignore them.
 */
export async function analyseImage({
  imageUrl,
  provider,
  topic,
  brandName,
  brandDescription,
}: AnalyseImageOptions): Promise<ImageAnalysisOutcome | null> {
  if (!provider.supportsVision) {
    console.info('[ai] skipping image analysis — provider cannot see', {
      provider: provider.id,
    });
    return null;
  }

  const startedAt = Date.now();

  try {
    const image = await fetchInlineImage(imageUrl);
    const built = buildVisionPrompt({ topic, brandName, brandDescription });

    const payload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
      images: [{ mimeType: image.mimeType, data: image.data }],
    })) as RawImageAnalysisPayload;

    const analysis = normaliseAnalysis(payload);

    if (!analysis) {
      console.warn('[ai] image analysis returned nothing usable', {
        payload: JSON.stringify(payload).slice(0, 300),
      });
      return null;
    }

    const durationMs = Date.now() - startedAt;

    console.info('[ai] image analysed', {
      model: provider.model,
      durationMs,
      sizeBytes: image.sizeBytes,
      confidence: analysis.confidenceScore,
      subject: analysis.primarySubject,
    });

    return { analysis, image, durationMs, promptVersion: built.version };
  } catch (error) {
    // Deliberately swallowed. See the note at the top of this file: no image
    // analysis is a smaller problem than no caption.
    console.warn('[ai] image analysis failed, writing from the brief alone', {
      reason: error instanceof ImageFetchError ? 'fetch' : 'model',
      detail:
        error instanceof ImageFetchError
          ? error.detail
          : error instanceof Error
            ? error.message
            : String(error),
    });
    return null;
  }
}

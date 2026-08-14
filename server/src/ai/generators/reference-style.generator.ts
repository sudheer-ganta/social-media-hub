import { buildReferenceStylePrompt } from '../prompts/reference-style.prompt';
import { normaliseDesignRecipe } from '../render/design-recipe';
import { fetchInlineImage, ImageFetchError } from '../vision/image-source';
import type { AiTextProvider } from '../providers';
import type { InlineImagePart } from '../providers/provider.interface';
import type { RawReferenceStyleProfilePayload, ReferenceStyleInfluence, ReferenceStyleProfile } from '../types';

/**
 * "Show FlowPost what you like" — one Vision call, N reference images in,
 * a structured ReferenceStyleProfile out. Same tolerance as
 * `creative-research.generator.ts`: never throws, degrades to
 * `EMPTY_REFERENCE_STYLE_PROFILE` (analysed: false) on any failure, so a
 * broken reference URL or an unconfigured vision model never blocks
 * generation — it just proceeds without a style lean.
 */

const MAX_REFERENCES = 6;

export const EMPTY_REFERENCE_STYLE_PROFILE: ReferenceStyleProfile = {
  analysed: false,
  referenceCount: 0,
  visualLanguage: '',
  compositionPatterns: [],
  typographyCharacter: '',
  colorRelationships: '',
  textureAndMaterial: '',
  lightingAndMood: '',
  photographicOrIllustrative: '',
  visualDensity: '',
  brandTreatment: '',
  creativeMechanisms: [],
  imperfectionLevel: '',
  interactionPatterns: '',
  doNotCopy: [],
  dominantDirection: '',
  influence: 'low',
};

function asString(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown, maxItems: number, max = 200): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => asString(item, max))
        .filter((item) => item.length > 0),
    ),
  ].slice(0, maxItems);
}

const INFLUENCE_LEVELS: ReferenceStyleInfluence[] = ['low', 'medium', 'high'];

function asInfluence(value: unknown, fallback: ReferenceStyleInfluence): ReferenceStyleInfluence {
  const raw = asString(value, 10);
  return (INFLUENCE_LEVELS as string[]).includes(raw) ? (raw as ReferenceStyleInfluence) : fallback;
}

// A single reference never earns 'high' on its own — not enough evidence
// that what it shows is a considered direction rather than one-off taste.
function capInfluence(value: ReferenceStyleInfluence, referenceCount: number): ReferenceStyleInfluence {
  return referenceCount > 1 || value !== 'high' ? value : 'medium';
}

function normalise(payload: RawReferenceStyleProfilePayload, referenceCount: number): ReferenceStyleProfile {
  return {
    analysed: true,
    referenceCount,
    visualLanguage: asString(payload.visualLanguage, 200),
    compositionPatterns: asStringArray(payload.compositionPatterns, 6),
    typographyCharacter: asString(payload.typographyCharacter, 200),
    colorRelationships: asString(payload.colorRelationships, 200),
    textureAndMaterial: asString(payload.textureAndMaterial, 200),
    lightingAndMood: asString(payload.lightingAndMood, 200),
    photographicOrIllustrative: asString(payload.photographicOrIllustrative, 120),
    visualDensity: asString(payload.visualDensity, 200),
    brandTreatment: asString(payload.brandTreatment, 200),
    creativeMechanisms: asStringArray(payload.creativeMechanisms, 8),
    imperfectionLevel: asString(payload.imperfectionLevel, 150),
    interactionPatterns: asString(payload.interactionPatterns, 200),
    doNotCopy: asStringArray(payload.doNotCopy, 8),
    dominantDirection: asString(payload.dominantDirection, 300),
    influence: capInfluence(asInfluence(payload.influence, 'medium'), referenceCount),
    ...(normaliseDesignRecipe(payload.designRecipe) && { designRecipe: normaliseDesignRecipe(payload.designRecipe) }),
  };
}

export interface GenerateReferenceStyleOptions {
  provider: AiTextProvider;
  /** Public URLs of the member's uploaded reference images — 2-6 expected, capped at 6. */
  referenceUrls: string[];
  /** Optional lightweight labels, same order as referenceUrls — informational only, the model infers the real role either way. */
  labels?: string[];
}

export async function generateReferenceStyleProfile({
  provider,
  referenceUrls,
  labels,
}: GenerateReferenceStyleOptions): Promise<ReferenceStyleProfile> {
  const urls = referenceUrls.slice(0, MAX_REFERENCES);
  if (urls.length === 0) return EMPTY_REFERENCE_STYLE_PROFILE;

  if (!provider.supportsVision) {
    console.info('[creative] skipping reference-style analysis — provider cannot see', { provider: provider.id });
    return EMPTY_REFERENCE_STYLE_PROFILE;
  }

  const startedAt = Date.now();

  const fetched = await Promise.all(
    urls.map(async (url) => {
      try {
        return await fetchInlineImage(url);
      } catch (error) {
        console.warn('[creative] reference image could not be fetched, skipping', {
          url,
          detail: error instanceof ImageFetchError ? error.detail : String(error),
        });
        return null;
      }
    }),
  );
  const images: InlineImagePart[] = fetched
    .filter((image): image is NonNullable<typeof image> => image !== null)
    .map((image) => ({ mimeType: image.mimeType, data: image.data }));

  if (images.length === 0) return EMPTY_REFERENCE_STYLE_PROFILE;

  const built = buildReferenceStylePrompt({ referenceCount: images.length, labels });

  try {
    const payload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
      images,
    })) as RawReferenceStyleProfilePayload;

    const profile = normalise(payload, images.length);

    console.info('[creative] reference style analysed', {
      model: provider.model,
      durationMs: Date.now() - startedAt,
      referenceCount: profile.referenceCount,
      influence: profile.influence,
      mechanisms: profile.creativeMechanisms.length,
    });

    return profile;
  } catch (error) {
    // Same tolerance as creative-research: an enhancement, not a requirement.
    console.warn('[creative] reference-style analysis failed, generating without it', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_REFERENCE_STYLE_PROFILE;
  }
}

/**
 * The "FLOWPOST UNDERSTOOD YOUR STYLE" transparency step (spec §14) — a
 * handful of plain adjectives, never the raw structured profile. Mirrors
 * `summariseCreativeDirection`'s "plain sentences over a JSON object" rule.
 */
export function summariseReferenceStyle(profile: ReferenceStyleProfile): string[] {
  if (!profile.analysed || !profile.visualLanguage) return [];
  return profile.visualLanguage
    .split(/[,/]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 6)
    .map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1));
}

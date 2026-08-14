import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AiProviderError,
  activeImageProvider,
  providerForRole,
  resolveBrandProfile,
} from '../ai';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { generateCreativeDirection, summariseCreativeDirection } from '../ai/generators/creative-direction.generator';
import { generateCreativeConcepts } from '../ai/generators/creative-concepts.generator';
import { generateCreativeResearch } from '../ai/generators/creative-research.generator';
import { generateReferenceStyleProfile } from '../ai/generators/reference-style.generator';
import { normaliseDesignRecipe } from '../ai/render/design-recipe';
import { renderCreative } from '../ai/render/creative-renderer';
import { detectCheckerboard } from '../ai/render/render-validation';
import type { CreativeResearchContext } from '../ai/prompts/creative-research.prompt';
import { analyseImage } from '../ai/generators/image-analysis.generator';
import { fetchInlineImage, ImageFetchError } from '../ai/vision/image-source';
import type {
  AiImageProvider,
  AiTextProvider,
} from '../ai';
import type {
  ArtDirectionFamily,
  BrandProfile,
  BrandProfileInput,
  CreativeConcept,
  CreativeDirection,
  CreativeDnaInput,
  CreativeGenerationRequest,
  CreativeMode,
  CreativeRefinementRequest,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
  ScoredCreativeConcept,
} from '../ai/types';
import {
  readBrandVoice,
  readColors,
  readEnum,
  readImageUrl,
  readPlatforms,
  readString,
} from './ai.service';
import { cloudinaryService, CloudinaryUploadError } from './cloudinary.service';
import * as generatedAssetRepository from '../repositories/generated-asset.repository';
import type { StoredGeneratedAsset } from '../repositories/generated-asset.repository';

/**
 * FlowPost's brand-native creative engine — the application layer over
 * `ai/brand/creative-dna.ts`, `ai/generators/creative-direction.generator.ts`
 * and `ai/providers/gemini-image.provider.ts`.
 *
 * The pipeline, every time:
 *
 *   request + assets → [Vision, per asset] ──┐
 *   saved brand + Creative DNA ───────────────┼→ [resolveBrandProfile /
 *                                                  resolveCreativeDna]
 *                                              │
 *                                              ▼
 *                                   [creative-direction generator]
 *                                              │
 *                                              ▼
 *                             [image prompt] → [AiImageProvider] → [Cloudinary]
 *                                              │
 *                                              ▼
 *                                      GeneratedAsset row
 *
 * Two entry points read only the first half of this: `understand` stops after
 * the direction, for the transparency step, and generates nothing.
 */

export class CreativeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** The vendor's own message, for the log — never returned to the browser. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'CreativeError';
  }
}

const MAX_PROMPT_LENGTH = 2000;
const MIN_PROMPT_LENGTH = 3;
const MAX_ASSET_URLS = 5;
const MAX_REFERENCE_URLS = 6;
const MAX_REFINEMENT_LENGTH = 500;

const GOALS: MarketingGoal[] = [
  'brand_awareness',
  'lead_generation',
  'website_traffic',
  'sales',
  'bookings',
  'product_launch',
  'event_promotion',
  'newsletter',
  'community_building',
  'customer_retention',
];
const FUNNEL_STAGES: FunnelStage[] = ['TOFU', 'MOFU', 'BOFU', 'Retention'];
const MODES = ['personal', 'brand'] as const;

function readAssetUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readImageUrl(item))
    .filter((item): item is string => item !== undefined)
    .slice(0, MAX_ASSET_URLS);
}

function readReferenceImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readImageUrl(item))
    .filter((item): item is string => item !== undefined)
    .slice(0, MAX_REFERENCE_URLS);
}

function readReferenceLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, 40) ?? '')
    .slice(0, MAX_REFERENCE_URLS);
}

/**
 * A previously-analysed/saved style profile the browser sends back as-is
 * (e.g. a "Creative Style Profile" the member reused without re-uploading
 * references) — bounded the same defensive way `readConcept` bounds a
 * model-shaped payload arriving in an ordinary request body.
 */
function readReferenceStyleProfile(value: unknown): ReferenceStyleProfile | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const p = value as Record<string, unknown>;
  if (!p.analysed) return undefined;

  const asStrings = (v: unknown, max: number): string[] =>
    Array.isArray(v)
      ? v.map((item) => readString(item, 200)).filter((item): item is string => !!item).slice(0, max)
      : [];
  const influence = readEnum(p.influence, ['low', 'medium', 'high'] as const, 'low');

  return {
    analysed: true,
    referenceCount: typeof p.referenceCount === 'number' ? Math.max(0, Math.round(p.referenceCount)) : 0,
    visualLanguage: readString(p.visualLanguage, 200) ?? '',
    compositionPatterns: asStrings(p.compositionPatterns, 6),
    typographyCharacter: readString(p.typographyCharacter, 200) ?? '',
    colorRelationships: readString(p.colorRelationships, 200) ?? '',
    textureAndMaterial: readString(p.textureAndMaterial, 200) ?? '',
    lightingAndMood: readString(p.lightingAndMood, 200) ?? '',
    photographicOrIllustrative: readString(p.photographicOrIllustrative, 120) ?? '',
    visualDensity: readString(p.visualDensity, 200) ?? '',
    brandTreatment: readString(p.brandTreatment, 200) ?? '',
    creativeMechanisms: asStrings(p.creativeMechanisms, 8),
    imperfectionLevel: readString(p.imperfectionLevel, 150) ?? '',
    interactionPatterns: readString(p.interactionPatterns, 200) ?? '',
    doNotCopy: asStrings(p.doNotCopy, 8),
    dominantDirection: readString(p.dominantDirection, 300) ?? '',
    influence,
    ...(normaliseDesignRecipe(p.designRecipe) && { designRecipe: normaliseDesignRecipe(p.designRecipe) }),
  };
}

function readCreativeDna(value: unknown): CreativeDnaInput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const d = value as Record<string, unknown>;

  const dna: CreativeDnaInput = {
    ...(readString(d.visualStyle, 200) && { visualStyle: readString(d.visualStyle, 200) }),
    ...(readString(d.photographyStyle, 200) && {
      photographyStyle: readString(d.photographyStyle, 200),
    }),
    ...(readString(d.composition, 200) && { composition: readString(d.composition, 200) }),
    ...(readString(d.lighting, 200) && { lighting: readString(d.lighting, 200) }),
    ...(readString(d.mood, 120) && { mood: readString(d.mood, 120) }),
    ...(readString(d.typographyCharacter, 120) && {
      typographyCharacter: readString(d.typographyCharacter, 120),
    }),
    ...(readString(d.spacing, 120) && { spacing: readString(d.spacing, 120) }),
    ...(readString(d.productTreatment, 200) && {
      productTreatment: readString(d.productTreatment, 200),
    }),
    ...(readString(d.logoTreatment, 200) && { logoTreatment: readString(d.logoTreatment, 200) }),
    ...(readImageUrl(d.logoAssetUrl) && { logoAssetUrl: readImageUrl(d.logoAssetUrl) }),
    preferredElements: Array.isArray(d.preferredElements)
      ? d.preferredElements.map((v) => readString(v, 80)).filter((v): v is string => !!v).slice(0, 12)
      : [],
    avoidedElements: Array.isArray(d.avoidedElements)
      ? d.avoidedElements.map((v) => readString(v, 80)).filter((v): v is string => !!v).slice(0, 12)
      : [],
    brandColors: readColors(d.brandColors),
    referenceAssetUrls: readAssetUrls(d.referenceAssetUrls),
  };

  const meaningful =
    Object.keys(dna).length > 3 ||
    (dna.preferredElements?.length ?? 0) > 0 ||
    (dna.avoidedElements?.length ?? 0) > 0 ||
    (dna.brandColors?.length ?? 0) > 0;

  return meaningful ? dna : undefined;
}

const MODES_LIST: CreativeMode[] = [
  'EDITORIAL', 'PLAYFUL', 'SURREAL', 'INTERACTIVE', 'HUMOROUS', 'MINIMAL', 'CULTURAL', 'STORYTELLING', 'VISUAL_METAPHOR', 'EDUCATIONAL',
];

const ART_DIRECTION_FAMILIES_LIST: ArtDirectionFamily[] = [
  'EDITORIAL_PHOTOGRAPHY', 'SURREAL_EDITORIAL', 'INTERACTIVE_GRAPHIC', 'TYPOGRAPHY_LED', 'PRODUCT_STUDIO',
  'DOCUMENTARY', 'COLLAGE', 'HANDCRAFTED', 'CINEMATIC', 'MINIMAL_ART', 'PLAYFUL_GRAPHIC', 'CULTURAL_EDITORIAL',
  'INFORMATIONAL', 'ILLUSTRATIVE',
];

/**
 * The concept the member picked from `/concepts`, read back off the wire.
 * Trusted only as far as its shape — every field still goes through the same
 * bounds a freshly-generated concept would, since this rides in an ordinary
 * request body.
 */
function readConcept(value: unknown): ScoredCreativeConcept | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as Record<string, unknown>;

  const conceptName = readString(c.conceptName, 80);
  const bigIdea = readString(c.bigIdea, 300);
  const visualMechanism = readString(c.visualMechanism, 120);
  if (!conceptName || !bigIdea || !visualMechanism) return undefined;

  const scoresInput = (c.scores && typeof c.scores === 'object' ? c.scores : {}) as Record<string, unknown>;
  const asScore = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  };

  return {
    conceptName,
    bigIdea,
    visualMechanism,
    ...(readString(c.humanInsight, 300) && { humanInsight: readString(c.humanInsight, 300) }),
    ...(readString(c.visualMetaphor, 300) && { visualMetaphor: readString(c.visualMetaphor, 300) }),
    ...(readString(c.interaction, 300) && { interaction: readString(c.interaction, 300) }),
    ...(readString(c.message, 200) && { message: readString(c.message, 200) }),
    ...(readString(c.productRole, 200) && { productRole: readString(c.productRole, 200) }),
    ...(readString(c.brandConnection, 200) && { brandConnection: readString(c.brandConnection, 200) }),
    ...(readString(c.whyItWouldStopTheScroll, 240) && {
      whyItWouldStopTheScroll: readString(c.whyItWouldStopTheScroll, 240),
    }),
    mode: readEnum(c.mode, MODES_LIST, 'EDITORIAL'),
    artDirectionFamily: readEnum(c.artDirectionFamily, ART_DIRECTION_FAMILIES_LIST, 'EDITORIAL_PHOTOGRAPHY'),
    scores: {
      conceptStrength: asScore(scoresInput.conceptStrength),
      brandSpecificity: asScore(scoresInput.brandSpecificity),
      productRelevance: asScore(scoresInput.productRelevance),
      visualOriginality: asScore(scoresInput.visualOriginality),
      scrollStoppingPotential: asScore(scoresInput.scrollStoppingPotential),
      messageClarity: asScore(scoresInput.messageClarity),
      socialInteractionPotential: asScore(scoresInput.socialInteractionPotential),
      templateRisk: asScore(scoresInput.templateRisk),
    },
  };
}

function parseRequest(body: unknown, { userId }: { userId: string }): CreativeGenerationRequest {
  if (!body || typeof body !== 'object') {
    throw new CreativeError('Send a JSON body describing what to create.');
  }
  const input = body as Record<string, unknown>;

  const prompt = readString(input.prompt, MAX_PROMPT_LENGTH);
  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new CreativeError(
      'Tell us what you want to create — a sentence is enough.',
      422,
    );
  }

  const contextType = readEnum(input.contextType, MODES, 'personal');
  const creativeDna = readCreativeDna(input.creativeDna);
  const brandVoice = readBrandVoice(input.brandVoice) as BrandProfileInput | undefined;
  const referenceImageUrls = readReferenceImageUrls(input.referenceImageUrls);
  const referenceStyleProfile = readReferenceStyleProfile(input.referenceStyleProfile);

  return {
    userId,
    contextType,
    ...(contextType === 'brand' && readString(input.brandId, 64) && {
      brandId: readString(input.brandId, 64),
    }),
    prompt,
    goal: readEnum(input.goal, GOALS, 'brand_awareness'),
    funnelStage: readEnum(input.funnelStage, FUNNEL_STAGES, 'TOFU'),
    platforms: readPlatforms(input.platforms),
    assetUrls: readAssetUrls(input.assetUrls),
    ...(creativeDna && { creativeDna }),
    ...(brandVoice && { brandVoice }),
    ...(referenceImageUrls.length > 0 && { referenceImageUrls }),
    ...(referenceImageUrls.length > 0 && { referenceLabels: readReferenceLabels(input.referenceLabels) }),
    ...(referenceStyleProfile && { referenceStyleProfile }),
    ...(readConcept(input.selectedConcept) && { selectedConcept: readConcept(input.selectedConcept) }),
  };
}

/** Resolves brand + Creative DNA for a request, running Vision on the first asset if one was given. */
async function resolveIdentity(request: CreativeGenerationRequest) {
  const visionProvider = providerForRole('vision');
  const firstAsset = request.assetUrls[0];

  const outcome = firstAsset
    ? await analyseImage({
        imageUrl: firstAsset,
        provider: visionProvider,
        topic: request.prompt,
        brandName: request.brandVoice?.name,
        brandDescription: request.brandVoice?.description,
      })
    : null;

  const brand = resolveBrandProfile({
    brand: request.brandVoice,
    imageAnalysis: outcome?.analysis ?? null,
  });
  const creativeDna = resolveCreativeDna({
    creativeDna: request.creativeDna,
    imageAnalysis: outcome?.analysis ?? null,
  });

  return { brand, creativeDna };
}

/**
 * The full context research is derived from — brand, industry, audience,
 * marketing goal, funnel stage, platform and the member's actual request, per
 * spec: never a generic category search.
 */
function buildResearchContext(
  request: CreativeGenerationRequest,
  brand: BrandProfile,
): CreativeResearchContext {
  return {
    request: request.prompt,
    ...(brand.name && { brandName: brand.name }),
    ...(brand.industry && { industry: brand.industry }),
    ...(brand.audience && { audience: brand.audience }),
    goal: request.goal,
    funnelStage: request.funnelStage,
    platforms: request.platforms,
    ...(brand.products.length && { products: brand.products }),
  };
}

const RECENT_SIGNATURE_LIMIT = 6;

/**
 * A lightweight visual-repetition memory: the last few COMPLETED creatives
 * for this scope, reduced to a compact fingerprint the concepts stage can
 * actively diverge from. Reuses the existing history query — no new
 * repository method, no new storage; the signal already lives in
 * `creativeBrief` on every persisted row.
 */
async function fetchRecentSignatures(request: CreativeGenerationRequest): Promise<RecentCreativeSignature[]> {
  const assets = await generatedAssetRepository.listByScope(
    {
      userId: request.userId,
      contextType: request.contextType,
      brandId: request.contextType === 'brand' ? (request.brandId ?? null) : null,
    },
    RECENT_SIGNATURE_LIMIT,
  );
  return assets
    .filter((asset) => asset.status === 'COMPLETED')
    .map((asset) => ({
      artDirectionFamily: asset.creativeBrief.artDirectionFamily,
      mode: asset.creativeBrief.mode,
      palette: asset.creativeBrief.palette,
      lighting: asset.creativeBrief.lighting,
      background: asset.creativeBrief.background,
    }));
}

/**
 * "Show FlowPost what you like" — resolves whichever the request actually
 * gave: a reused saved profile skips analysis entirely (spec §9/§13, and the
 * cheapest possible path); fresh reference URLs get one Vision call; neither
 * present just means no style lean this time. Never throws — the generator
 * itself already degrades safely on any failure.
 */
async function resolveReferenceStyle(
  request: CreativeGenerationRequest,
): Promise<ReferenceStyleProfile | undefined> {
  if (request.referenceStyleProfile) return request.referenceStyleProfile;
  if (!request.referenceImageUrls?.length) return undefined;

  return generateReferenceStyleProfile({
    provider: providerForRole('vision'),
    referenceUrls: request.referenceImageUrls,
    labels: request.referenceLabels,
  });
}

const HUE_NAMES: Array<[number, string]> = [
  [15, 'red'], [40, 'orange'], [65, 'amber'], [95, 'yellow-green'], [150, 'green'],
  [185, 'teal'], [215, 'blue'], [255, 'indigo'], [290, 'violet'], [330, 'magenta'], [360, 'red'],
];

/**
 * A hex code in the image prompt has been observed rendered INTO the image as
 * literal text ("#2563EEb" written on a prop). Colours are described in plain
 * words instead — the model needs the feeling of the palette, never the code.
 */
export function describePaletteColor(raw: string): string {
  const hex = raw.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return raw;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));

  if (sat < 0.12) {
    return light > 0.9 ? 'white' : light > 0.7 ? 'light grey' : light > 0.4 ? 'grey' : light > 0.15 ? 'charcoal' : 'black';
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  const name = HUE_NAMES.find(([limit]) => hue <= limit)?.[1] ?? 'red';
  const prefix = light > 0.82 ? 'pale ' : light > 0.62 ? 'soft ' : light < 0.28 ? 'deep ' : '';
  const muted = sat < 0.35 ? 'muted ' : '';
  return `${prefix}${muted}${name}`;
}

/**
 * Builds the actual image-model prompt from a structured direction. No model
 * call — deterministic assembly, the same way `renderBrandSection` turns a
 * resolved profile into prompt text rather than asking a model to.
 */
function buildImagePrompt(direction: CreativeDirection, hasAssets: boolean, hasLogo: boolean): string {
  const layout = direction.layoutDirection;
  const needsClearSpace = direction.copyTreatment !== 'none' || Boolean(direction.marketingCreative?.brandMessage);
  const lines = [
    `${direction.concept}. ${direction.visualStory}`,
    // Stated immediately, before any other instruction, so it isn't
    // outweighed by later lines like "concept: anatomy of X" — a concept
    // FRAMED as a diagram/explainer/anatomy still needs to render as a
    // single photographic/illustrated subject, never an actual infographic.
    needsClearSpace &&
      'This is a VISUAL-ONLY generation with no text of any kind: no headline, caption, CTA, logo, labels, callouts, leader lines, or annotation marks — not even if the concept above is framed as an "anatomy", "diagram", "explainer", or "blueprint". Whatever the idea, render it as ONE real, richly-detailed photograph or illustration of the subject itself — never an infographic, spec sheet, UI mockup, or wireframe with labelled parts. A separate step composites the real headline/CTA/logo afterward.',
    `Medium/technique: ${direction.artDirectionFamily.replace(/_/g, ' ').toLowerCase()} — this must actually look like that medium, not a generic photoreal-gradient render regardless of label.`,
    `Subject: ${direction.subject}`,
    direction.environment && `Environment: ${direction.environment}`,
    `Composition: ${direction.composition}`,
    `Lighting: ${direction.lighting}`,
    `Mood: ${direction.mood}`,
    direction.palette.length && `Palette: ${[...new Set(direction.palette.map(describePaletteColor))].join(', ')}`,
    direction.background && `Background: ${direction.background}`,
    direction.productTreatment && `Product treatment: ${direction.productTreatment}`,
    direction.brandConstraints.length && `Brand constraints: ${direction.brandConstraints.join('; ')}`,
    hasAssets
      ? 'Preserve the exact product/subject shown in the attached reference image(s) — do not invent a replacement.'
      : null,
    layout?.layoutType && `Layout: ${layout.layoutType}`,
    layout?.headlinePlacement && `Headline placement: ${layout.headlinePlacement}`,
    layout?.supportingCopyPlacement && `Supporting copy placement: ${layout.supportingCopyPlacement}`,
    layout?.logoPlacement &&
      (hasLogo
        ? `Logo placement (a real logo file is composited there afterward — leave that area visually clear, do not draw any logo/wordmark/badge shape yourself): ${layout.logoPlacement}`
        : 'No logo is used for this creative — do not draw a logo, wordmark, badge, or any placeholder mark anywhere in the image.'),
    layout?.brandTreatment && `Brand treatment across the piece: ${layout.brandTreatment}`,
    layout?.productPlacement && `Product placement: ${layout.productPlacement}`,
    layout?.foregroundElements && `Foreground: ${layout.foregroundElements}`,
    layout?.backgroundElements && `Background elements: ${layout.backgroundElements}`,
    layout?.textureDirection && `Texture: ${layout.textureDirection}`,
    layout?.visualDensity && `Visual density: ${layout.visualDensity}`,
    layout?.ctaPlacement && `CTA placement: ${layout.ctaPlacement}`,
    layout?.secondaryInformation && `Secondary information placement: ${layout.secondaryInformation}`,
    direction.marketingCreative?.requiredElements?.length &&
      `Must also include: ${direction.marketingCreative.requiredElements.join(', ')}`,
    // This is a VISUAL ONLY generation — no headline, CTA, brand message or
    // logo text goes into the pixels here. A separate deterministic design
    // layer (FlowPost's creative renderer) composites the real copy and the
    // real logo file on top afterward. Asking Gemini to also typeset is
    // exactly the "creative director AND graphic designer in one call"
    // mistake this pipeline now avoids. Phrased entirely in photographic
    // terms, never in terms of the placement field names above — naming
    // "headlinePlacement"/"safeAreas" here previously got misread as an
    // instruction to draw a UI wireframe or spec mockup with a labelled box.
    needsClearSpace &&
      'This must look like a real, finished photograph or illustration — never a UI mockup, wireframe, spec diagram, or template with placeholder boxes, dummy labels, or annotation callouts. Do not draw the words "headline", "CTA", "logo", or any other label. Do not draw any leader lines, pointer lines, callout lines, blank labelled boxes, or empty annotation marks — not even when the concept is framed as an "anatomy", "diagram" or "explainer": render that idea as a single richly-detailed subject or scene instead, with no callouts or labels of any kind. Simply leave some open, low-detail negative space in the composition — like empty sky, a plain wall, an out-of-focus area, or bare tabletop — where text will be placed afterward by a separate step. The rest of the frame should be as rich and specific as any other shot.',
    layout?.safeAreas && `Keep completely clear of any graphics: ${layout.safeAreas}`,
    // §8: the visual must SUPPORT the concept — one coherent story, not a
    // prop pile-up or a stock-photo default.
    'Simplify: prefer ONE clear subject and a coherent scene over an inventory of props — drop anything that does not serve the story. Avoid generic stock-photo defaults: no interchangeable corporate models or suited businesspeople, no fake dramatic lighting effects, no floating disconnected objects, no glossy blue-gradient tech backgrounds, no meaningless visual complexity.',
    `Do not include: ${[
      ...direction.negativeVisualConstraints,
      'no rendered words, letterforms, numerals, hex codes, typography, or logos',
      'no UI mockups, wireframes, spec diagrams, placeholder boxes, dummy labels, leader/pointer/callout lines, or annotation marks',
      'no transparency checkerboard or alternating grey-and-white grid pattern anywhere — fill the entire canvas edge to edge with the scene itself',
    ].join(', ')}.`,
  ];
  return lines
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n')
    // Hex codes anywhere in the prompt (the direction embeds them in free text
    // like brandConstraints) have been rendered INTO the image as garbled
    // wordmarks — every one becomes a plain-words colour description.
    .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => describePaletteColor(hex));
}

/** Dev-only QA tap (§16/§18): with CREATIVE_DEBUG_DIR set, every generation drops its raw visual, finished creative and layout plan there for side-by-side review. Never on in production. */
function dumpDebugArtifacts(assetId: string, files: Record<string, Buffer | string>) {
  const dir = process.env.CREATIVE_DEBUG_DIR;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, `${assetId}-${name}`), content);
    }
  } catch (error) {
    console.warn('[creative] debug artifact dump failed', { detail: String(error) });
  }
}

async function fetchReferenceImages(urls: string[]) {
  const images = await Promise.all(
    urls.map(async (url) => {
      try {
        const image = await fetchInlineImage(url);
        return { mimeType: image.mimeType, data: image.data };
      } catch (error) {
        console.warn('[creative] reference asset could not be fetched, skipping', {
          url,
          detail: error instanceof ImageFetchError ? error.detail : String(error),
        });
        return null;
      }
    }),
  );
  return images.filter((image): image is { mimeType: string; data: string } => image !== null);
}

const MAX_CAMPAIGN_VARIATIONS = 6;

/**
 * Common framing conventions per platform — a soft hint folded into the
 * direction request, not a hard override of the model's own `aspectRatio`
 * choice. Mirrors the ratio vocabulary `src/utils/crop.ts` already offers the
 * composer (4:5, 1:1, 16:9, 9:16), so a generated image and a manually
 * cropped one speak the same ratios end to end.
 */
const PLATFORM_FRAMING: Record<string, string> = {
  instagram: 'square (1:1) or portrait (4:5) for feed, vertical (9:16) for Stories/Reels',
  linkedin: 'square (1:1) or landscape (1.91:1)',
  facebook: 'portrait (4:5) for feed, vertical (9:16) for Stories',
  x: 'landscape (16:9)',
  threads: 'square (1:1) or portrait (4:5)',
  youtube: 'landscape (16:9), vertical (9:16) for Shorts',
};

function platformFramingHint(platforms: string[]): string | null {
  const known = platforms
    .map((p) => (PLATFORM_FRAMING[p] ? `${p}: ${PLATFORM_FRAMING[p]}` : null))
    .filter((line): line is string => line !== null);
  if (known.length === 0) return null;
  return `Platform framing conventions — choose aspectRatio accordingly: ${known.join('; ')}.`;
}

function readCampaignLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => readString(item, 60))
        .filter((item): item is string => !!item),
    ),
  ].slice(0, MAX_CAMPAIGN_VARIATIONS);
}

interface RunGenerationOptions {
  userId: string;
  request: CreativeGenerationRequest;
  textProvider: AiTextProvider;
  imageProvider: AiImageProvider;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  /** The idea being executed — same concept across every campaign variation. */
  concept: CreativeConcept;
  mode: CreativeMode;
  artDirectionFamily: ArtDirectionFamily;
  /** Computed once per request/campaign and reused across variations. Absent when a concept was already selected — the research that shaped it already ran in `discoverConcepts`. */
  research?: CreativeResearch;
  referenceStyle?: ReferenceStyleProfile;
  /** Set for one shot of a campaign set — e.g. "Hero", "Product", "Lifestyle". */
  variationLabel?: string;
  campaignId?: string;
  parentAssetId?: string;
}

/**
 * One direction → one image → one persisted asset. The shared core of
 * `generate` and `generateCampaign` — a single request is just a campaign of
 * one, generated the same way.
 */
async function runGeneration({
  userId,
  request,
  textProvider,
  imageProvider,
  brand,
  creativeDna,
  concept,
  mode,
  artDirectionFamily,
  research,
  referenceStyle,
  variationLabel,
  campaignId,
  parentAssetId,
}: RunGenerationOptions): Promise<StoredGeneratedAsset> {
  const hasAssets = request.assetUrls.length > 0;

  // A variation asks for the same campaign — concept, palette, mood — shot
  // differently, not a fresh unrelated creative. Folded into the request text
  // rather than a new prompt-builder parameter, since it is one added
  // constraint, not a different kind of call.
  const framingHint = platformFramingHint(request.platforms);
  const directionRequest = [
    variationLabel
      ? `${request.prompt} — this is the "${variationLabel}" shot of a shared campaign. Keep the same concept, palette and mood; vary composition and environment to suit a ${variationLabel.toLowerCase()} shot.`
      : request.prompt,
    framingHint,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');

  const { direction } = await generateCreativeDirection({
    provider: textProvider,
    request: directionRequest,
    goal: request.goal,
    funnelStage: request.funnelStage,
    platforms: request.platforms,
    hasAssets,
    concept,
    mode,
    artDirectionFamily,
    research,
    referenceStyle,
    brand,
    creativeDna,
  });

  const asset = await generatedAssetRepository.create({
    userId,
    contextType: request.contextType,
    brandId: request.brandId,
    prompt: variationLabel ? `${request.prompt} (${variationLabel})` : request.prompt,
    creativeBrief: direction,
    sourceAssetUrls: request.assetUrls,
    provider: imageProvider.id,
    model: imageProvider.model,
    source: 'AI_GENERATED',
    campaignId,
    parentAssetId,
  });

  return finishGeneration({
    userId,
    asset,
    direction,
    imageProvider,
    referenceUrls: request.assetUrls,
    hasAssets,
    logoAssetUrl: creativeDna.logoAssetUrl || undefined,
    variationLabel,
    creativeDna,
    referenceStyle,
  });
}

interface FinishGenerationOptions {
  userId: string;
  asset: StoredGeneratedAsset;
  direction: CreativeDirection;
  imageProvider: AiImageProvider;
  /** URLs to send as reference images — source assets for a fresh generation, plus the prior output for a refinement. */
  referenceUrls: string[];
  hasAssets: boolean;
  /** The brand's real logo, if any — composited onto the finished creative by the renderer, never sent to the image model. */
  logoAssetUrl?: string;
  variationLabel?: string;
  creativeDna: ResolvedCreativeDna;
  referenceStyle?: ReferenceStyleProfile;
}

/**
 * The half of generation that happens after a row already exists: fetch
 * references, call the image model, upload to Cloudinary, persist. Shared by
 * `runGeneration` and `refine` so both give the same accurate answer when
 * Gemini succeeds but the save fails — see spec's failure-handling rule:
 * "Image created, but FlowPost couldn't save it" is a materially different
 * fact from "image generation failed", and the member should be told which
 * one actually happened.
 */
async function finishGeneration({
  userId,
  asset,
  direction,
  imageProvider,
  referenceUrls,
  hasAssets,
  logoAssetUrl,
  variationLabel,
  creativeDna,
  referenceStyle,
}: FinishGenerationOptions): Promise<StoredGeneratedAsset> {
  let visual: { mimeType: string; data: string };
  let logoImage: { mimeType: string; data: string } | undefined;

  try {
    const referenceImages = await fetchReferenceImages(referenceUrls);

    // Asset safety: a member who attached a required product/reference image
    // and had every one of them fail to fetch gets a clear error, not a
    // silent generic-lookalike generation — see spec §17.
    if (hasAssets && referenceImages.length === 0) {
      throw new CreativeError(
        'The attached image(s) could not be read, so the product/reference could not be preserved. Please try re-uploading.',
        422,
      );
    }

    // The logo is fetched here but never sent to the image model — it's
    // composited pixel-exact by the renderer below (§5: never redraw a logo
    // through Gemini). A failed fetch is never fatal, it just means no logo
    // slot gets filled.
    logoImage = logoAssetUrl ? (await fetchReferenceImages([logoAssetUrl]))[0] : undefined;

    const imagePrompt = buildImagePrompt(direction, hasAssets, Boolean(logoImage));
    [visual] = await imageProvider.generateImage({
      prompt: imagePrompt,
      referenceImages,
      aspectRatio: direction.aspectRatio,
    });

    // Raster QA (§10): a fake transparency checkerboard rendered as pixels is
    // never publishable. One retry with the constraint made unmissable; a
    // second strike fails loudly rather than shipping the artifact.
    let scan = await detectCheckerboard(Buffer.from(visual.data, 'base64'));
    if (scan.detected) {
      console.warn('[creative] visual failed checkerboard scan, regenerating once', { assetId: asset.id, coverage: scan.coverage });
      [visual] = await imageProvider.generateImage({
        prompt: `${imagePrompt}\nCRITICAL: the previous attempt rendered a grey-and-white transparency checkerboard pattern. Fill every part of the canvas with the photographed/illustrated scene itself — no checkerboard, no grid of grey squares, no "transparent" areas of any kind.`,
        referenceImages,
        aspectRatio: direction.aspectRatio,
      });
      scan = await detectCheckerboard(Buffer.from(visual.data, 'base64'));
      if (scan.detected) {
        throw new CreativeError('The generated visual contained a rendering artifact. Please try again.', 502, `checkerboard coverage ${scan.coverage}`);
      }
    }
  } catch (error) {
    await generatedAssetRepository.markFailed(asset.id);
    if (error instanceof AiProviderError || error instanceof CreativeError) throw error;
    throw new CreativeError('Image generation failed. Please try again.', 502);
  }

  let image: { mimeType: string; data: string };
  let structure: string;
  try {
    const rendered = await renderCreative({
      visualImage: visual,
      direction,
      creativeDna,
      referenceStyle,
      logoImage,
    });
    image = { mimeType: rendered.mimeType, data: rendered.data };
    structure = rendered.structure;
    dumpDebugArtifacts(asset.id, {
      '1-visual.png': Buffer.from(visual.data, 'base64'),
      '2-final.png': Buffer.from(rendered.data, 'base64'),
      'plan.json': JSON.stringify(
        { structure: rendered.structure, designRecipe: referenceStyle?.designRecipe ?? 'derived-fallback', plan: rendered.plan },
        null,
        2,
      ),
    });
  } catch (error) {
    // Gemini already succeeded — fall back to the raw visual rather than
    // losing the generation to a compositing bug.
    console.warn('[creative] renderer failed, falling back to the raw visual', {
      detail: error instanceof Error ? error.message : String(error),
    });
    image = visual;
    structure = 'none';
  }

  try {
    const uploaded = await cloudinaryService.uploadImageBuffer(
      Buffer.from(image.data, 'base64'),
      image.mimeType,
    );

    const completed = await generatedAssetRepository.markCompleted(asset.id, {
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
      ...(uploaded.width !== undefined && { width: uploaded.width }),
      ...(uploaded.height !== undefined && { height: uploaded.height }),
      ...(uploaded.format !== undefined && { format: uploaded.format }),
    });

    console.info('[creative] generation complete', {
      userId,
      assetId: asset.id,
      concept: direction.concept,
      hasAssets,
      variationLabel,
      model: imageProvider.model,
      structure,
    });

    return completed;
  } catch (error) {
    // Gemini already succeeded here — the image exists, it just isn't saved.
    // Deliberately NOT "image generation failed": that would send the member
    // to retry a Gemini call that already worked, for a Cloudinary problem.
    await generatedAssetRepository.markFailed(asset.id);
    const detail = error instanceof CloudinaryUploadError ? error.detail : undefined;
    throw new CreativeError("Image created, but FlowPost couldn't save it. Try again.", 502, detail);
  }
}

/** Highest concept-strength-minus-template-risk among the (already gated) concepts. */
function pickTopConcept(concepts: ScoredCreativeConcept[]): ScoredCreativeConcept {
  return [...concepts].sort(
    (a, b) => (b.scores.conceptStrength - b.scores.templateRisk) - (a.scores.conceptStrength - a.scores.templateRisk),
  )[0];
}

/**
 * The concept a generation executes, and the research behind it (if any).
 *
 * A concept the member already picked from `/concepts` carries its own
 * research-informed thinking, so re-running research here would just be a
 * second grounded call paying for the same answer — skipped entirely in that
 * case. Only a caller that skips the picker (passes no `selectedConcept`)
 * triggers a fresh research → concepts → auto-pick round trip.
 */
async function resolveConceptAndResearch(
  request: CreativeGenerationRequest,
  textProvider: AiTextProvider,
  brand: BrandProfile,
  creativeDna: ResolvedCreativeDna,
): Promise<{ concept: ScoredCreativeConcept; research: CreativeResearch | undefined; referenceStyle: ReferenceStyleProfile | undefined }> {
  if (request.selectedConcept) {
    // A concept picked from `/concepts` already carries whatever reference
    // style shaped it — no reason to resolve/analyse it again here.
    return { concept: request.selectedConcept, research: undefined, referenceStyle: undefined };
  }

  const [research, recentSignatures, referenceStyle] = await Promise.all([
    generateCreativeResearch({ provider: textProvider, context: buildResearchContext(request, brand) }),
    fetchRecentSignatures(request),
    resolveReferenceStyle(request),
  ]);
  const { concepts } = await generateCreativeConcepts({
    provider: textProvider,
    request: request.prompt,
    goal: request.goal,
    funnelStage: request.funnelStage,
    platforms: request.platforms,
    hasAssets: request.assetUrls.length > 0,
    brand,
    creativeDna,
    research,
    recentSignatures,
    referenceStyle,
  });

  return { concept: pickTopConcept(concepts), research, referenceStyle };
}

export const creativeGenerationService = {
  /**
   * FlowPost's creative director: "what is the advertising idea?" — 3–5
   * genuinely different, quality-gated concepts, no art direction and no
   * image generated yet. This is what the picker (spec §19) shows.
   */
  async discoverConcepts(userId: string, body: unknown) {
    const request = parseRequest(body, { userId });
    const textProvider = providerForRole('creative');
    if (!textProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    const { brand, creativeDna } = await resolveIdentity(request);
    const [research, recentSignatures, referenceStyle] = await Promise.all([
      generateCreativeResearch({ provider: textProvider, context: buildResearchContext(request, brand) }),
      fetchRecentSignatures(request),
      resolveReferenceStyle(request),
    ]);

    const outcome = await generateCreativeConcepts({
      provider: textProvider,
      request: request.prompt,
      goal: request.goal,
      funnelStage: request.funnelStage,
      platforms: request.platforms,
      hasAssets: request.assetUrls.length > 0,
      brand,
      creativeDna,
      research,
      recentSignatures,
      referenceStyle,
    });

    return { ...outcome, ...(referenceStyle && { referenceStyle }) };
  },

  /**
   * The "FlowPost understood" step, kept for a caller that wants one
   * ready-to-read direction rather than a set of concepts to choose between.
   * Discovers concepts, auto-selects the strongest, then art-directs it.
   * Generates nothing, persists nothing.
   */
  async understand(userId: string, body: unknown) {
    const request = parseRequest(body, { userId });
    const textProvider = providerForRole('creative');
    if (!textProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    const { brand, creativeDna } = await resolveIdentity(request);
    const [research, recentSignatures, referenceStyle] = await Promise.all([
      generateCreativeResearch({ provider: textProvider, context: buildResearchContext(request, brand) }),
      fetchRecentSignatures(request),
      resolveReferenceStyle(request),
    ]);

    const { concepts } = await generateCreativeConcepts({
      provider: textProvider,
      request: request.prompt,
      goal: request.goal,
      funnelStage: request.funnelStage,
      platforms: request.platforms,
      hasAssets: request.assetUrls.length > 0,
      brand,
      creativeDna,
      research,
      recentSignatures,
      referenceStyle,
    });
    const concept = pickTopConcept(concepts);

    const { direction, meta } = await generateCreativeDirection({
      provider: textProvider,
      request: request.prompt,
      goal: request.goal,
      funnelStage: request.funnelStage,
      platforms: request.platforms,
      hasAssets: request.assetUrls.length > 0,
      brand,
      creativeDna,
      concept,
      mode: concept.mode,
      artDirectionFamily: concept.artDirectionFamily,
      research,
      referenceStyle,
    });

    return {
      direction,
      concepts,
      research,
      summary: summariseCreativeDirection(direction, {
        goal: request.goal,
        funnelStage: request.funnelStage,
        platforms: request.platforms,
        brandName: brand.name,
      }),
      meta,
    };
  },

  /** Runs the full pipeline and returns the persisted, completed asset. */
  async generate(userId: string, body: unknown): Promise<StoredGeneratedAsset> {
    const request = parseRequest(body, { userId });
    const textProvider = providerForRole('creative');
    const imageProvider = activeImageProvider();

    if (!textProvider.isConfigured() || !imageProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    const { brand, creativeDna } = await resolveIdentity(request);
    const { concept, research, referenceStyle } = await resolveConceptAndResearch(request, textProvider, brand, creativeDna);

    return runGeneration({
      userId, request, textProvider, imageProvider, brand, creativeDna, concept,
      mode: concept.mode, artDirectionFamily: concept.artDirectionFamily, research, referenceStyle,
    });
  },

  /**
   * One creative direction, several linked outputs sharing a `campaignId` —
   * Hero, Product, Lifestyle, whatever `variationLabels` names (§8). Brand and
   * Creative DNA are resolved once and reused for every variation, so they
   * stay visually consistent while composition and environment vary per label.
   */
  async generateCampaign(userId: string, body: unknown): Promise<StoredGeneratedAsset[]> {
    const request = parseRequest(body, { userId });
    const labels = readCampaignLabels((body as Record<string, unknown> | null)?.variationLabels);
    if (labels.length < 2) {
      throw new CreativeError('A campaign needs at least two variations — e.g. ["Hero", "Product"].');
    }

    const textProvider = providerForRole('creative');
    const imageProvider = activeImageProvider();
    if (!textProvider.isConfigured() || !imageProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    const { brand, creativeDna } = await resolveIdentity(request);
    const { concept, research, referenceStyle } = await resolveConceptAndResearch(request, textProvider, brand, creativeDna);
    const campaignId = randomUUID();

    const first = await runGeneration({
      userId,
      request,
      textProvider,
      imageProvider,
      brand,
      creativeDna,
      concept,
      mode: concept.mode,
      artDirectionFamily: concept.artDirectionFamily,
      research,
      referenceStyle,
      variationLabel: labels[0],
      campaignId,
    });

    const rest: StoredGeneratedAsset[] = [];
    for (const label of labels.slice(1)) {
      rest.push(
        await runGeneration({
          userId,
          request,
          textProvider,
          imageProvider,
          brand,
          creativeDna,
          concept,
          mode: concept.mode,
          artDirectionFamily: concept.artDirectionFamily,
          research,
          referenceStyle,
          variationLabel: label,
          campaignId,
          parentAssetId: first.id,
        }),
      );
    }

    return [first, ...rest];
  },

  /** Natural-language refinement of a previously generated asset. */
  async refine(userId: string, body: unknown): Promise<StoredGeneratedAsset> {
    if (!body || typeof body !== 'object') {
      throw new CreativeError('Send a JSON body naming the asset and the change.');
    }
    const input = body as Record<string, unknown>;
    const assetId = readString(input.assetId, 64);
    const instruction = readString(input.instruction, MAX_REFINEMENT_LENGTH);

    if (!assetId) throw new CreativeError('Which creative should be refined?');
    if (!instruction) throw new CreativeError('Say what should change — a sentence is enough.', 422);

    const parent = await generatedAssetRepository.findById(assetId, userId);
    if (!parent) throw new CreativeError('That creative could not be found.', 404);
    if (!parent.imageUrl) throw new CreativeError('That creative has no image yet.', 422);

    const textProvider = providerForRole('creative');
    const imageProvider = activeImageProvider();
    if (!textProvider.isConfigured() || !imageProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    const brand = resolveBrandProfile({});
    const creativeDna = resolveCreativeDna({});

    const { direction } = await generateCreativeDirection({
      provider: textProvider,
      request: parent.prompt,
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: parent.sourceAssetUrls.length > 0,
      brand,
      creativeDna,
      // A refinement re-executes the prior direction's own idea rather than
      // being handed a fresh concept — mode and family carry over with
      // everything else.
      mode: parent.creativeBrief.mode,
      artDirectionFamily: parent.creativeBrief.artDirectionFamily,
      refinementOf: { priorDirection: parent.creativeBrief, instruction },
    });

    const child = await generatedAssetRepository.create({
      userId,
      contextType: parent.contextType,
      brandId: parent.brandId,
      prompt: `${parent.prompt} — refine: ${instruction}`,
      creativeBrief: direction,
      sourceAssetUrls: parent.sourceAssetUrls,
      provider: imageProvider.id,
      model: imageProvider.model,
      source: 'AI_REFINED',
      parentAssetId: parent.id,
      campaignId: parent.campaignId,
    });

    // The prior output rides as a reference too, so "make it darker" edits
    // the image the member is looking at rather than starting over. `parent`
    // is never touched — regenerate/refine only ever add a new row, so the
    // previous generation stays in history exactly as it was.
    return finishGeneration({
      userId,
      asset: child,
      direction,
      imageProvider,
      referenceUrls: [...parent.sourceAssetUrls, parent.imageUrl],
      hasAssets: true,
      logoAssetUrl: creativeDna.logoAssetUrl || undefined,
      creativeDna,
    });
  },

  async history(userId: string, query: { contextType?: string; brandId?: string }) {
    const contextType = readEnum(query.contextType, MODES, 'personal');
    return generatedAssetRepository.listByScope({
      userId,
      contextType,
      brandId: contextType === 'brand' ? (query.brandId ?? null) : null,
    });
  },
};

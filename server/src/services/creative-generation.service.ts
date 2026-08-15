import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import {
  AiProviderError,
  activeImageProvider,
  providerForRole,
  resolveBrandProfile,
} from '../ai';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { generateCreativeDirection, summariseCreativeDirection } from '../ai/generators/creative-direction.generator';
import { classifyMechanismFamily, generateCreativeConcepts } from '../ai/generators/creative-concepts.generator';
import { generateCreativeIntent, normaliseIntent } from '../ai/generators/creative-intent.generator';
import { generateCreativeResearch } from '../ai/generators/creative-research.generator';
import { generateReferenceStyleProfile } from '../ai/generators/reference-style.generator';
import { normaliseDesignRecipe } from '../ai/render/design-recipe';
import { renderCreative } from '../ai/render/creative-renderer';
import { detectCheckerboard } from '../ai/render/render-validation';
import { describePaletteColor } from '../ai/render/palette-words';
import {
  buildCampaignCreativePrompt,
  buildCampaignQcPrompt,
  collectCampaignCopy,
  CAMPAIGN_QC_RESPONSE_SCHEMA,
} from '../ai/prompts/campaign-creative.prompt';
import { compositeLogo } from '../ai/render/logo-composite';
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
  CreativeIntentBrief,
  CreativeMode,
  CreativeRefinementRequest,
  CreativeRenderContext,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  MechanismFamily,
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

/**
 * The intent brief `/concepts` already extracted, handed back on `/generate`
 * so generation validates against exactly the requirements the chosen concept
 * was gated on — and so a second extraction call isn't paid for. Bounded the
 * same defensive way `readConcept` bounds a model-shaped payload arriving in
 * an ordinary request body.
 */
function readIntent(value: unknown): CreativeIntentBrief | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (!raw.extracted) return undefined;
  return normaliseIntent(raw);
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

const MECHANISM_FAMILIES_LIST: MechanismFamily[] = [
  'VISUAL_METAPHOR', 'HUMAN_OBSERVATIONAL', 'INTERACTIVE_PUZZLE', 'TYPOGRAPHY_WORDPLAY', 'SURPRISING_SCALE',
  'JUXTAPOSITION', 'BEFORE_AFTER', 'TRANSFORMATION', 'STORYTELLING', 'OBJECT_INTERACTION',
  'CULTURAL_OBSERVATION', 'ABSURD_SURREAL', 'PRODUCT_AS_METAPHOR', 'DOCUMENTARY_MOMENT', 'COLLAGE_GRAPHIC',
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
    mechanismFamily: readEnum(
      c.mechanismFamily,
      MECHANISM_FAMILIES_LIST,
      classifyMechanismFamily(`${visualMechanism} ${bigIdea}`),
    ),
    scores: {
      conceptStrength: asScore(scoresInput.conceptStrength),
      brandSpecificity: asScore(scoresInput.brandSpecificity),
      productRelevance: asScore(scoresInput.productRelevance),
      visualOriginality: asScore(scoresInput.visualOriginality),
      scrollStoppingPotential: asScore(scoresInput.scrollStoppingPotential),
      messageClarity: asScore(scoresInput.messageClarity),
      socialInteractionPotential: asScore(scoresInput.socialInteractionPotential),
      templateRisk: asScore(scoresInput.templateRisk),
      mechanismNovelty: asScore(scoresInput.mechanismNovelty),
      similarityToOtherConcepts: asScore(scoresInput.similarityToOtherConcepts),
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
  // `generated_assets_context_brand_check` requires a brand id in brand mode.
  // Caught here so a caller that forgets one gets a sentence it can act on,
  // rather than a 500 from a constraint violation after a paid model call.
  if (contextType === 'brand' && !readString(input.brandId, 64)) {
    throw new CreativeError('Pick which brand this creative is for.', 422);
  }
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
    ...(readIntent(input.intent) && { intent: readIntent(input.intent) }),
  };
}

/**
 * Brand mode requires a real logo before anything is rendered (spec §3).
 *
 * Concept discovery is deliberately still allowed without one — exploring
 * ideas costs nothing and blocking it would be obstructive. What must never
 * happen is a *branded creative* going out carrying a logo FlowPost invented,
 * so the gate sits exactly where pixels start being made.
 */
function assertBrandLogo(request: CreativeGenerationRequest) {
  if (request.contextType !== 'brand') return;
  if (request.creativeDna?.logoAssetUrl) return;
  throw new CreativeError('Add your brand logo to create a branded creative.', 422);
}

/**
 * Per-request latency + spend ledger (§15/§16). Stage durations accumulate by
 * name; the call counters prove whether an optimization actually removed
 * model/upload calls rather than just moving them. Logged once per request by
 * `logMetrics`, so a BEFORE/AFTER comparison is a single grep.
 */
interface CreativeMetrics {
  startedAt: number;
  stages: Record<string, number>;
  imageCalls: number;
  textCalls: number;
  cloudinaryUploads: number;
}

function newMetrics(): CreativeMetrics {
  return { startedAt: Date.now(), stages: {}, imageCalls: 0, textCalls: 0, cloudinaryUploads: 0 };
}

/** Times one stage into the ledger. Durations accumulate, so a stage that runs per-variation reports its total. */
async function timed<T>(
  metrics: CreativeMetrics | undefined,
  stage: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!metrics) return fn();
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    metrics.stages[stage] = (metrics.stages[stage] ?? 0) + (Date.now() - startedAt);
  }
}

function logMetrics(metrics: CreativeMetrics, requestId?: string) {
  const s = metrics.stages;
  console.info('[creative] request timing', {
    requestId,
    intentDurationMs: s.intent ?? 0,
    researchDurationMs: s.research ?? 0,
    conceptDurationMs: s.concepts ?? 0,
    directionDurationMs: s.direction ?? 0,
    imageDurationMs: s.image ?? 0,
    campaignDurationMs: s.campaign ?? 0,
    qcDurationMs: s.qc ?? 0,
    cloudinaryDurationMs: s.cloudinary ?? 0,
    totalDurationMs: Date.now() - metrics.startedAt,
    imageCalls: metrics.imageCalls,
    textCalls: metrics.textCalls,
    cloudinaryUploads: metrics.cloudinaryUploads,
  });
}

/**
 * Latency ceiling for the campaign pass (§11). Past it, the member gets the
 * already-finished Stage A creative instead of a longer wait — the losing
 * promise is abandoned, not cancelled, which is fine for a best-effort stage.
 */
const CAMPAIGN_STAGE_TIMEOUT_MS =
  Number.parseInt(process.env.CREATIVE_CAMPAIGN_TIMEOUT_MS ?? '', 10) || 60_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new CreativeError(`${label} timed out`, 504, `${label} exceeded ${ms}ms`)),
        ms,
      );
    }),
  ]);
}

/**
 * The member's own requirements, resolved once per request: whatever the
 * browser handed back from `/concepts`, or a fresh extraction. Never fatal —
 * `generateCreativeIntent` degrades to an empty brief on failure.
 *
 * Reads brand context straight off the request's own brand voice (not the
 * vision-resolved profile) so it can run CONCURRENTLY with image analysis —
 * extraction parses the member's sentence, and the typed brand description is
 * the same either way; only a vision-inferred one is forgone.
 */
async function resolveIntent(
  request: CreativeGenerationRequest,
  metrics?: CreativeMetrics,
): Promise<CreativeIntentBrief> {
  if (request.intent?.extracted) return request.intent;
  if (metrics) metrics.textCalls += 1;
  return timed(metrics, 'intent', () =>
    generateCreativeIntent({
      provider: providerForRole('fast'),
      request: request.prompt,
      ...(request.brandVoice?.description && { brandDescription: request.brandVoice.description }),
      ...(request.brandVoice?.industry && { industry: request.brandVoice.industry }),
    }),
  );
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

/** Vision QC findings, split by what they cost: only critical defects earn the one regeneration. */
interface CampaignQcResult {
  critical: string[];
  minor: string[];
}

/**
 * Reads the finished campaign image against the exact copy list and the
 * member's hard requirements — the §14 vision quality check. Best-effort by
 * construction: any failure of the QC call itself reads as "no defects found",
 * because a broken proofreader must never block a finished campaign.
 *
 * Findings carry a severity: CRITICAL (wrong offer/copy, invented logo,
 * unreadable headline, missing claim…) justifies the single targeted
 * regeneration; MINOR (tiny prop text, decorative typo, small artifact away
 * from the key content) ships as-is — a second image call costs more latency
 * than a cosmetic nit is worth.
 */
async function inspectCampaignImage(
  image: { mimeType: string; data: string },
  copy: ReturnType<typeof collectCampaignCopy>,
  requiredClaims: string[],
  requestId?: string,
  metrics?: CreativeMetrics,
): Promise<CampaignQcResult> {
  try {
    if (metrics) metrics.textCalls += 1;
    const payload = (await providerForRole('vision').generateJson({
      systemInstruction:
        'You are a meticulous print-production proofreader. You only report real, visible defects — never taste. Return only the JSON object described.',
      prompt: buildCampaignQcPrompt(copy, requiredClaims),
      responseSchema: CAMPAIGN_QC_RESPONSE_SCHEMA,
      temperature: 0.1,
      images: [{ mimeType: image.mimeType, data: image.data }],
    })) as { problems?: unknown };
    const critical: string[] = [];
    const minor: string[] = [];
    for (const raw of (Array.isArray(payload.problems) ? payload.problems : []).slice(0, 8)) {
      // A plain string (the pre-severity shape) is treated as critical — the
      // safe reading for a defect with no rating.
      if (typeof raw === 'string' && raw.trim()) {
        critical.push(raw.trim());
      } else if (raw && typeof raw === 'object') {
        const problem = raw as { severity?: unknown; fix?: unknown };
        const fix = typeof problem.fix === 'string' ? problem.fix.trim() : '';
        if (fix) (problem.severity === 'minor' ? minor : critical).push(fix);
      }
    }
    return { critical, minor };
  } catch (error) {
    console.warn('[creative] campaign vision QC failed, treating as pass', {
      requestId,
      detail: error instanceof Error ? error.message : String(error),
    });
    return { critical: [], minor: [] };
  }
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
  /** The member's hard requirements — validated through direction and carried into the campaign pass. */
  intent?: CreativeIntentBrief;
  /**
   * False for a campaign variation, which is already a finished creative of
   * its own and would only be re-designed into a near-duplicate.
   */
  withCampaignStage?: boolean;
  /** Set for one shot of a campaign set — e.g. "Hero", "Product", "Lifestyle". */
  variationLabel?: string;
  campaignId?: string;
  parentAssetId?: string;
  /** Correlation id from the HTTP layer — ties every stage log to one request. */
  requestId?: string;
  /** The request's latency/spend ledger — shared across variations of one campaign. */
  metrics?: CreativeMetrics;
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
  intent,
  withCampaignStage = true,
  variationLabel,
  campaignId,
  parentAssetId,
  requestId,
  metrics,
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

  const { direction, meta: directionMeta } = await timed(metrics, 'direction', () =>
    generateCreativeDirection({
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
      intent,
      brand,
      creativeDna,
    }),
  );
  if (metrics) metrics.textCalls += directionMeta.attempts ?? 1;

  // Everything a later refinement needs to re-execute this creative as it was
  // actually made — brand, visual identity, the analysed design language and
  // the member's own requirements. See CreativeRenderContext.
  const renderContext: CreativeRenderContext = {
    brand,
    creativeDna,
    ...(referenceStyle && { referenceStyle }),
    ...(intent && { intent }),
    goal: request.goal,
    funnelStage: request.funnelStage,
    platforms: request.platforms,
  };

  const asset = await generatedAssetRepository.create({
    userId,
    contextType: request.contextType,
    brandId: request.brandId,
    prompt: variationLabel ? `${request.prompt} (${variationLabel})` : request.prompt,
    creativeBrief: direction,
    renderContext,
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
    renderContext,
    ...(withCampaignStage && {
      campaign: {
        brand,
        ...(intent && { intent }),
        goal: request.goal,
        platforms: request.platforms,
      },
    }),
    requestId,
    metrics,
  });
}

/**
 * Everything Stage B needs, beyond what Stage A already had. Absent means
 * "stop after the standalone image" — which is what a campaign variation
 * does, since each variation is already its own finished creative.
 */
interface CampaignStageInput {
  brand: BrandProfile;
  intent?: CreativeIntentBrief;
  goal: MarketingGoal;
  platforms: string[];
}

interface FinishGenerationOptions {
  userId: string;
  asset: StoredGeneratedAsset;
  direction: CreativeDirection;
  imageProvider: AiImageProvider;
  /** URLs to send as reference images — source assets for a fresh generation, plus the prior visual for a refinement. */
  referenceUrls: string[];
  hasAssets: boolean;
  /** The brand's real logo, if any — composited pixel-exact, never sent to the image model to draw. */
  logoAssetUrl?: string;
  variationLabel?: string;
  creativeDna: ResolvedCreativeDna;
  referenceStyle?: ReferenceStyleProfile;
  /** Persisted on the row so a later refinement re-executes this creative faithfully. */
  renderContext?: CreativeRenderContext;
  /** Present for a normal generation — runs the automatic campaign pass on top of the visual. */
  campaign?: CampaignStageInput;
  /** Correlation id from the HTTP layer — ties every stage log to one request. */
  requestId?: string;
  /** The request's latency/spend ledger. */
  metrics?: CreativeMetrics;
}

/**
 * The half of generation that happens after a row already exists.
 *
 * Two stages, and the split is the whole design:
 *
 *   Stage A — the image model paints the wordless visual, FlowPost's renderer
 *             composites the copy and the real logo. All in memory — nothing
 *             is uploaded yet, so a successful image never waits on storage.
 *   Stage B — that same visual goes back to the image model with the full
 *             campaign brief, which designs the finished campaign creative
 *             around it. The real logo is composited afterward, never drawn.
 *
 * Storage comes LAST (§13): whichever image survives — the campaign design
 * when Stage B succeeds, the Stage A render when it fails or times out — gets
 * the one Cloudinary upload and completes the one row this generation owns.
 * The wordless foundation's own upload (a refinement's starting point) runs
 * concurrently with Stage B, entirely off the critical path.
 *
 * Stage B is automatic and has no button. It is also entirely optional at
 * runtime: anything that goes wrong in it — including exceeding its latency
 * budget — ships the Stage A creative instead, so a member never loses a
 * generation that already succeeded.
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
  renderContext,
  campaign,
  requestId,
  metrics,
}: FinishGenerationOptions): Promise<StoredGeneratedAsset> {
  let visual: { mimeType: string; data: string };
  let logoImage: { mimeType: string; data: string } | undefined;
  let referenceImages: Array<{ mimeType: string; data: string }> = [];

  // Stage bookkeeping for the failure log: which step was in flight, and for
  // how long, when an error surfaced — the difference between "Gemini failed"
  // and "Cloudinary failed" was previously invisible in the server log.
  let stage = 'reference-fetch';
  let stageStartedAt = Date.now();
  const enterStage = (next: string) => {
    stage = next;
    stageStartedAt = Date.now();
  };
  const stageFailureLog = (error: unknown) => ({
    requestId,
    assetId: asset.id,
    stage,
    durationMs: Date.now() - stageStartedAt,
    errorType: error instanceof Error ? error.name : typeof error,
    status:
      error instanceof AiProviderError || error instanceof CreativeError ? error.status : undefined,
    detail:
      error instanceof AiProviderError || error instanceof CreativeError
        ? error.detail ?? error.message
        : error instanceof Error
          ? error.message
          : String(error),
  });

  try {
    // The member's references and the logo are independent fetches — one
    // round trip, not two. The logo is never sent to the image model; it's
    // composited pixel-exact by the renderer below (§5: never redraw a logo
    // through Gemini), and a failed logo fetch is never fatal.
    const [fetchedReferences, fetchedLogo] = await Promise.all([
      fetchReferenceImages(referenceUrls),
      logoAssetUrl ? fetchReferenceImages([logoAssetUrl]) : Promise.resolve([]),
    ]);
    referenceImages = fetchedReferences;
    logoImage = fetchedLogo[0];

    // Asset safety: a member who attached a required product/reference image
    // and had every one of them fail to fetch gets a clear error, not a
    // silent generic-lookalike generation — see spec §17.
    if (hasAssets && referenceImages.length === 0) {
      throw new CreativeError(
        'The attached image(s) could not be read, so the product/reference could not be preserved. Please try re-uploading.',
        422,
      );
    }

    const imagePrompt = buildImagePrompt(direction, hasAssets, Boolean(logoImage));
    enterStage('image-generation');
    console.info('[creative] image generation started', {
      requestId,
      assetId: asset.id,
      model: imageProvider.model,
      referenceCount: referenceImages.length,
      hasLogo: Boolean(logoImage),
    });
    if (metrics) metrics.imageCalls += 1;
    [visual] = await timed(metrics, 'image', () =>
      imageProvider.generateImage({
        prompt: imagePrompt,
        referenceImages,
        aspectRatio: direction.aspectRatio,
      }),
    );
    console.info('[creative] image generation completed', {
      requestId,
      assetId: asset.id,
      durationMs: Date.now() - stageStartedAt,
      imageGenerated: true,
      mimeType: visual.mimeType,
      byteLength: Buffer.from(visual.data, 'base64').length,
    });

    // Raster QA (§10): a fake transparency checkerboard rendered as pixels is
    // never publishable. One retry with the constraint made unmissable; a
    // second strike fails loudly rather than shipping the artifact.
    let scan = await detectCheckerboard(Buffer.from(visual.data, 'base64'));
    if (scan.detected) {
      console.warn('[creative] visual failed checkerboard scan, regenerating once', { assetId: asset.id, coverage: scan.coverage });
      if (metrics) metrics.imageCalls += 1;
      [visual] = await timed(metrics, 'image', () =>
        imageProvider.generateImage({
          prompt: `${imagePrompt}\nCRITICAL: the previous attempt rendered a grey-and-white transparency checkerboard pattern. Fill every part of the canvas with the photographed/illustrated scene itself — no checkerboard, no grid of grey squares, no "transparent" areas of any kind.`,
          referenceImages,
          aspectRatio: direction.aspectRatio,
        }),
      );
      scan = await detectCheckerboard(Buffer.from(visual.data, 'base64'));
      if (scan.detected) {
        throw new CreativeError('The generated visual contained a rendering artifact. Please try again.', 502, `checkerboard coverage ${scan.coverage}`);
      }
    }
  } catch (error) {
    console.error('[creative] stage failed', stageFailureLog(error));
    await generatedAssetRepository.markFailed(asset.id);
    if (error instanceof AiProviderError || error instanceof CreativeError) throw error;
    throw new CreativeError('Image generation failed. Please try again.', 502);
  }

  let image: { mimeType: string; data: string };
  let structure: string;
  try {
    enterStage('renderer');
    console.info('[creative] renderer started', { requestId, assetId: asset.id });
    const rendered = await renderCreative({
      visualImage: visual,
      direction,
      creativeDna,
      referenceStyle,
      logoImage,
    });
    image = { mimeType: rendered.mimeType, data: rendered.data };
    structure = rendered.structure;
    console.info('[creative] renderer completed', {
      requestId,
      assetId: asset.id,
      durationMs: Date.now() - stageStartedAt,
      structure: rendered.structure,
      byteLength: Buffer.from(rendered.data, 'base64').length,
    });
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
    console.warn('[creative] renderer failed, falling back to the raw visual', stageFailureLog(error));
    image = visual;
    structure = 'none';
  }

  // ── Stage B before storage (§1/§13) ───────────────────────────────────────
  //
  // The wordless foundation's own upload — a future refinement's starting
  // point, kept only in `renderContext` and never shown — starts here and
  // rides CONCURRENTLY with the campaign design. Best-effort by construction:
  // a failure costs a future refinement some fidelity and nothing else.
  const uploadVisualFoundation = (): Promise<string | undefined> => {
    if (metrics) metrics.cloudinaryUploads += 1;
    return cloudinaryService
      .uploadImageBuffer(Buffer.from(visual.data, 'base64'), visual.mimeType)
      .then((uploaded) => uploaded.url)
      .catch((error: unknown) => {
        console.warn('[creative] visual-foundation upload failed, refinements will re-derive it', {
          requestId,
          assetId: asset.id,
          detail: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      });
  };

  let finalImage: { mimeType: string; data: Buffer } = {
    mimeType: image.mimeType,
    data: Buffer.from(image.data, 'base64'),
  };
  let campaignDesigned = false;
  let visualUploadPromise: Promise<string | undefined> | undefined;

  if (campaign) {
    visualUploadPromise = uploadVisualFoundation();

    const designCampaign = async (): Promise<Buffer> => {
      enterStage('campaign-design');
      const campaignPrompt = buildCampaignCreativePrompt({
        direction,
        brand: campaign.brand,
        creativeDna,
        referenceStyle,
        intent: campaign.intent,
        goal: campaign.goal,
        platforms: campaign.platforms,
        hasLogo: Boolean(logoImage),
        hasProductAssets: referenceImages.length > 0,
      });

      console.info('[creative] campaign design started', {
        requestId,
        assetId: asset.id,
        model: imageProvider.model,
        copyLines: [direction.headline, direction.supportingLine, direction.cta].filter(Boolean).length,
        hasLogo: Boolean(logoImage),
      });

      // The visual leads: it is the foundation the campaign is designed over.
      // The member's own product/reference photos ride behind it so the design
      // pass can still see the real product it must not replace. In-memory —
      // the campaign never waits on any storage round trip.
      if (metrics) metrics.imageCalls += 1;
      const [designed] = await timed(metrics, 'campaign', () =>
        imageProvider.generateImage({
          prompt: campaignPrompt,
          referenceImages: [visual, ...referenceImages],
          aspectRatio: direction.aspectRatio,
        }),
      );

      let campaignBuffer: Buffer = Buffer.from(designed.data, 'base64');
      const scan = await detectCheckerboard(campaignBuffer);
      if (scan.detected) {
        throw new CreativeError(
          'The campaign design contained a rendering artifact.',
          502,
          `checkerboard coverage ${scan.coverage}`,
        );
      }

      // Vision QC (§14): read the actual pixels against the exact copy list.
      // Only CRITICAL defects (wrong copy, missing claim, invented logo,
      // unreadable headline…) earn the one targeted regeneration; minor
      // cosmetic nits ship — a second image call costs more latency than
      // they're worth. The QC call itself failing never blocks the campaign.
      enterStage('campaign-qc');
      const qcCopy = collectCampaignCopy(direction);
      const qcClaims = campaign.intent?.requiredClaims ?? [];
      const qc = await timed(metrics, 'qc', () =>
        inspectCampaignImage(designed, qcCopy, qcClaims, requestId, metrics),
      );
      if (qc.minor.length > 0) {
        console.info('[creative] campaign QC minor defects, shipping without regeneration', {
          requestId,
          assetId: asset.id,
          problems: qc.minor,
        });
      }
      if (qc.critical.length > 0) {
        console.warn('[creative] campaign failed vision QC, one targeted regeneration', {
          requestId,
          assetId: asset.id,
          problems: qc.critical,
        });
        try {
          if (metrics) metrics.imageCalls += 1;
          const [redesigned] = await timed(metrics, 'campaign', () =>
            imageProvider.generateImage({
              prompt: `${campaignPrompt}\n\nYOUR PREVIOUS ATTEMPT HAD THESE DEFECTS — fix every one, change nothing else about the design:\n${qc.critical
                .map((problem) => `- ${problem}`)
                .join('\n')}`,
              referenceImages: [visual, ...referenceImages],
              aspectRatio: direction.aspectRatio,
            }),
          );
          const redesignedBuffer = Buffer.from(redesigned.data, 'base64');
          const rescan = await detectCheckerboard(redesignedBuffer);
          const reQc = rescan.detected
            ? null
            : await timed(metrics, 'qc', () =>
                inspectCampaignImage(redesigned, qcCopy, qcClaims, requestId, metrics),
              );
          if (reQc !== null && reQc.critical.length <= qc.critical.length) {
            campaignBuffer = redesignedBuffer;
          }
        } catch (error) {
          console.warn('[creative] targeted regeneration failed, keeping the first campaign attempt', {
            requestId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // The real logo, at real pixels, into the zone the prompt kept clear.
      // A broken logo file is never worth losing a good campaign over.
      if (logoImage) {
        try {
          campaignBuffer = await compositeLogo({
            image: campaignBuffer,
            logo: Buffer.from(logoImage.data, 'base64'),
            placement: direction.layoutDirection?.logoPlacement || creativeDna.logoTreatment || 'bottom-right',
          });
        } catch (error) {
          console.warn('[creative] logo composite failed, campaign kept without the mark', {
            requestId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      dumpDebugArtifacts(asset.id, { '3-campaign.png': campaignBuffer });
      return campaignBuffer;
    };

    try {
      const campaignBuffer = await withTimeout(
        designCampaign(),
        CAMPAIGN_STAGE_TIMEOUT_MS,
        'campaign stage',
      );
      finalImage = { mimeType: 'image/png', data: campaignBuffer };
      campaignDesigned = true;
      console.info('[creative] campaign design complete', {
        requestId,
        assetId: asset.id,
        concept: direction.concept,
      });
    } catch (error) {
      // Spec §11: the standalone creative that already succeeded ships
      // instead of the whole request failing — a timeout or a campaign bug
      // costs the design pass, never the generation. The member can retry
      // the campaign look from the UI via refine.
      console.warn('[creative] campaign stage failed, shipping the standalone creative', stageFailureLog(error));
    }
  }

  // ── Storage last: one upload, for whichever image survived ────────────────
  try {
    enterStage('cloudinary-upload');
    console.info('[creative] cloudinary upload started', {
      requestId,
      assetId: asset.id,
      byteLength: finalImage.data.length,
      campaignDesigned,
      cloudNamePresent: Boolean(env.CLOUDINARY_CLOUD_NAME),
      apiKeyPresent: Boolean(env.CLOUDINARY_API_KEY),
      apiSecretPresent: Boolean(env.CLOUDINARY_API_SECRET),
    });
    if (metrics) metrics.cloudinaryUploads += 1;
    const [uploaded, visualImageUrl] = await Promise.all([
      timed(metrics, 'cloudinary', () =>
        cloudinaryService.uploadImageBuffer(finalImage.data, finalImage.mimeType),
      ),
      // Already in flight when a campaign ran; otherwise it rides alongside
      // the final upload rather than after it.
      visualUploadPromise ?? uploadVisualFoundation(),
    ]);
    console.info('[creative] cloudinary upload completed', {
      requestId,
      assetId: asset.id,
      durationMs: Date.now() - stageStartedAt,
      publicId: uploaded.publicId,
      secureUrlPresent: Boolean(uploaded.url),
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
    });

    enterStage('asset-persistence');
    const completed = await generatedAssetRepository.markCompleted(asset.id, {
      imageUrl: uploaded.url,
      cloudinaryPublicId: uploaded.publicId,
      ...(uploaded.width !== undefined && { width: uploaded.width }),
      ...(uploaded.height !== undefined && { height: uploaded.height }),
      ...(uploaded.format !== undefined && { format: uploaded.format }),
      ...(renderContext && { renderContext: { ...renderContext, ...(visualImageUrl && { visualImageUrl }) } }),
    });

    console.info('[creative] generation complete', {
      requestId,
      userId,
      assetId: asset.id,
      concept: direction.concept,
      hasAssets,
      variationLabel,
      model: imageProvider.model,
      structure,
      campaignDesigned,
    });

    return completed;
  } catch (error) {
    // Gemini already succeeded here — the image exists, it just isn't saved.
    // Deliberately NOT "image generation failed": that would send the member
    // to retry a Gemini call that already worked, for a Cloudinary problem.
    // `stage` tells the log apart: cloudinary-upload vs asset-persistence.
    console.error('[creative] stage failed', stageFailureLog(error));
    await generatedAssetRepository.markFailed(asset.id);
    const detail =
      error instanceof CloudinaryUploadError
        ? error.detail
        : `${stage}: ${error instanceof Error ? error.message : String(error)}`;
    throw new CreativeError("Image created, but FlowPost couldn't save it. Try again.", 502, detail);
  }
}

/**
 * Pre-flight for the pipeline's LAST stage: a server without Cloudinary
 * credentials (the deployed-backend misconfiguration behind the observed
 * 502s) previously paid for a full creative direction AND a real Gemini image
 * on every click, then failed the save and answered an opaque 502. Checked
 * before any model is called, so a misconfigured server answers instantly —
 * and 503, matching the "not set up" answer the AI-provider check gives.
 */
function assertStorageConfigured() {
  if (!cloudinaryService.isConfigured()) {
    throw new CreativeError(
      'Image storage is not configured on this server yet.',
      503,
      'CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET is empty',
    );
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
 * triggers a fresh research → concepts → auto-pick round trip. Exactly ONE
 * research operation ever runs per request, and its result is reused by
 * concepts, direction and the campaign pass alike.
 */
async function resolveConceptAndResearch(
  request: CreativeGenerationRequest,
  brand: BrandProfile,
  creativeDna: ResolvedCreativeDna,
  intent: CreativeIntentBrief,
  referenceStyle: ReferenceStyleProfile | undefined,
  metrics?: CreativeMetrics,
): Promise<{ concept: ScoredCreativeConcept; research: CreativeResearch | undefined }> {
  if (request.selectedConcept) {
    return { concept: request.selectedConcept, research: undefined };
  }

  const [research, recentSignatures] = await Promise.all([
    timed(metrics, 'research', () =>
      generateCreativeResearch({ provider: providerForRole('fast'), context: buildResearchContext(request, brand) }),
    ),
    fetchRecentSignatures(request),
  ]);
  if (metrics) metrics.textCalls += 1;
  const { concepts, meta } = await timed(metrics, 'concepts', () =>
    generateCreativeConcepts({
      provider: providerForRole('fast'),
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
      intent,
    }),
  );
  if (metrics) metrics.textCalls += meta.attempts ?? 1;

  return { concept: pickTopConcept(concepts), research };
}

export const creativeGenerationService = {
  /**
   * FlowPost's creative director: "what is the advertising idea?" — 3–5
   * genuinely different, quality-gated concepts, no art direction and no
   * image generated yet. This is what the picker (spec §19) shows.
   */
  async discoverConcepts(userId: string, body: unknown) {
    const request = parseRequest(body, { userId });
    if (!providerForRole('creative').isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }

    // Identity (vision), intent extraction, the repetition memory and the
    // reference-style analysis are mutually independent — one round of
    // parallel context prep (§2). Research needs only the resolved brand, so
    // it starts the moment identity lands, while intent and reference
    // analysis are still in flight; concepts follow because they read
    // everything.
    const identityPromise = resolveIdentity(request);
    const [{ brand, creativeDna }, intent, recentSignatures, referenceStyle, research] = await Promise.all([
      identityPromise,
      resolveIntent(request),
      fetchRecentSignatures(request),
      resolveReferenceStyle(request),
      identityPromise.then((identity) =>
        generateCreativeResearch({
          provider: providerForRole('fast'),
          context: buildResearchContext(request, identity.brand),
        }),
      ),
    ]);

    const outcome = await generateCreativeConcepts({
      provider: providerForRole('fast'),
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
      intent,
    });

    // The brief travels back to the browser so `/generate` validates against
    // exactly the requirements these concepts were gated on.
    return { ...outcome, intent, ...(referenceStyle && { referenceStyle }) };
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

    const identityPromise = resolveIdentity(request);
    const [{ brand, creativeDna }, intent, recentSignatures, referenceStyle, research] = await Promise.all([
      identityPromise,
      resolveIntent(request),
      fetchRecentSignatures(request),
      resolveReferenceStyle(request),
      identityPromise.then((identity) =>
        generateCreativeResearch({
          provider: providerForRole('fast'),
          context: buildResearchContext(request, identity.brand),
        }),
      ),
    ]);

    const { concepts } = await generateCreativeConcepts({
      provider: providerForRole('fast'),
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
      intent,
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
      intent,
    });

    return {
      direction,
      concepts,
      research,
      intent,
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
  async generate(userId: string, body: unknown, requestId?: string): Promise<StoredGeneratedAsset> {
    const request = parseRequest(body, { userId });
    const textProvider = providerForRole('creative');
    const imageProvider = activeImageProvider();

    if (!textProvider.isConfigured() || !imageProvider.isConfigured()) {
      throw new CreativeError('AI generation is not set up on this server yet.', 503);
    }
    assertStorageConfigured();
    assertBrandLogo(request);

    const metrics = newMetrics();
    try {
      // Identity (vision), intent and reference style are independent — one
      // round of parallel context prep (§2). A concept picked from /concepts
      // skips research entirely; the intent brief handed back skips a second
      // extraction — nothing is recomputed within a request (§12).
      const [{ brand, creativeDna }, intent, referenceStyle] = await Promise.all([
        resolveIdentity(request),
        resolveIntent(request, metrics),
        resolveReferenceStyle(request),
      ]);
      const { concept, research } = await resolveConceptAndResearch(
        request, brand, creativeDna, intent, referenceStyle, metrics,
      );

      return await runGeneration({
        userId, request, textProvider, imageProvider, brand, creativeDna, concept,
        mode: concept.mode, artDirectionFamily: concept.artDirectionFamily, research, referenceStyle, intent,
        requestId, metrics,
      });
    } finally {
      logMetrics(metrics, requestId);
    }
  },

  /**
   * One creative direction, several linked outputs sharing a `campaignId` —
   * Hero, Product, Lifestyle, whatever `variationLabels` names (§8). Brand and
   * Creative DNA are resolved once and reused for every variation, so they
   * stay visually consistent while composition and environment vary per label.
   */
  async generateCampaign(userId: string, body: unknown, requestId?: string): Promise<StoredGeneratedAsset[]> {
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
    assertStorageConfigured();
    assertBrandLogo(request);

    const metrics = newMetrics();
    try {
      const [{ brand, creativeDna }, intent, referenceStyle] = await Promise.all([
        resolveIdentity(request),
        resolveIntent(request, metrics),
        resolveReferenceStyle(request),
      ]);
      const { concept, research } = await resolveConceptAndResearch(
        request, brand, creativeDna, intent, referenceStyle, metrics,
      );
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
        intent,
        // Each labelled variation is already a finished creative in its own
        // right; running the campaign pass over every one would just produce a
        // near-duplicate of it at double the cost.
        withCampaignStage: false,
        variationLabel: labels[0],
        campaignId,
        requestId,
        metrics,
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
            intent,
            withCampaignStage: false,
            variationLabel: label,
            campaignId,
            parentAssetId: first.id,
            requestId,
            metrics,
          }),
        );
      }

      return [first, ...rest];
    } finally {
      logMetrics(metrics, requestId);
    }
  },

  /**
   * Natural-language refinement of a previously generated asset.
   *
   * The whole job here is to change ONLY what the member asked for. That is a
   * question of what the refinement inherits, not of prompt wording: this used
   * to resolve an EMPTY brand and an EMPTY Creative DNA, so every refinement
   * silently lost the real logo, the brand palette and the analysed design
   * recipe, then re-derived a different one — which is why "make it darker"
   * came back looking like a different creative rather than a darker one.
   *
   * Everything now comes from the parent's persisted `renderContext`, and the
   * pass re-executes from the parent's own wordless visual so the scene itself
   * stays put. Rows written before that column existed still work; they simply
   * degrade to the old empty-resolve behaviour.
   */
  async refine(userId: string, body: unknown, requestId?: string): Promise<StoredGeneratedAsset> {
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
    assertStorageConfigured();

    const inherited = parent.renderContext;
    const brand = inherited?.brand ?? resolveBrandProfile({});
    const creativeDna = inherited?.creativeDna ?? resolveCreativeDna({});
    const referenceStyle = inherited?.referenceStyle;
    const intent = inherited?.intent;
    const goal = inherited?.goal ?? 'brand_awareness';
    const funnelStage = inherited?.funnelStage ?? 'TOFU';
    const platforms = inherited?.platforms ?? [];

    console.info('[creative] refine started', {
      requestId,
      parentAssetId: parent.id,
      instruction,
      inheritedContext: Boolean(inherited),
      hasLogo: Boolean(creativeDna.logoAssetUrl),
      hasReferenceStyle: Boolean(referenceStyle?.analysed),
      requiredClaims: intent?.requiredClaims ?? [],
    });

    const metrics = newMetrics();
    const { direction, meta: directionMeta } = await timed(metrics, 'direction', () =>
      generateCreativeDirection({
        provider: textProvider,
        request: parent.prompt,
        goal,
        funnelStage,
        platforms,
        hasAssets: parent.sourceAssetUrls.length > 0,
        brand,
        creativeDna,
        referenceStyle,
        // Carried so an edit can never quietly drop the offer or the event on
        // its way through — the same gate a fresh generation passes.
        intent,
        // A refinement re-executes the prior direction's own idea rather than
        // being handed a fresh concept — mode and family carry over with
        // everything else. No research runs: the parent's already shaped this.
        mode: parent.creativeBrief.mode,
        artDirectionFamily: parent.creativeBrief.artDirectionFamily,
        refinementOf: { priorDirection: parent.creativeBrief, instruction },
      }),
    );
    metrics.textCalls += directionMeta.attempts ?? 1;

    const renderContext: CreativeRenderContext = {
      brand,
      creativeDna,
      ...(referenceStyle && { referenceStyle }),
      ...(intent && { intent }),
      goal,
      funnelStage,
      platforms,
    };

    const child = await generatedAssetRepository.create({
      userId,
      contextType: parent.contextType,
      brandId: parent.brandId,
      prompt: `${parent.prompt} — refine: ${instruction}`,
      creativeBrief: direction,
      renderContext,
      sourceAssetUrls: parent.sourceAssetUrls,
      provider: imageProvider.id,
      model: imageProvider.model,
      source: 'AI_REFINED',
      parentAssetId: parent.id,
      campaignId: parent.campaignId,
    });

    // The parent's WORDLESS visual is the reference, not its finished
    // creative: handing an image model back its own baked-in typography is
    // what garbles text on a refinement. Falling back to the finished image
    // only matters for rows written before the visual was kept.
    const priorVisual = inherited?.visualImageUrl ?? parent.imageUrl;

    // `parent` is never touched — refine only ever adds a new row, so the
    // previous successful creative stays in history exactly as it was and
    // the UI can keep showing it if this fails.
    try {
      return await finishGeneration({
        userId,
        asset: child,
        direction,
        imageProvider,
        referenceUrls: [...parent.sourceAssetUrls, priorVisual],
        hasAssets: true,
        logoAssetUrl: creativeDna.logoAssetUrl || undefined,
        creativeDna,
        referenceStyle,
        renderContext,
        campaign: {
          brand,
          ...(intent && { intent }),
          goal,
          platforms,
        },
        requestId,
        metrics,
      });
    } finally {
      logMetrics(metrics, requestId);
    }
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

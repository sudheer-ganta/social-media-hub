import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import {
  AiProviderError,
  activeImageProvider,
  providerForRole,
  resolveBrandProfile,
} from '../ai';
import { buildCanonicalCreativeBrief, type CreativeBrief, type GraphicDesignConcept } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeStrategy } from '../ai/generators/creative-strategy.generator';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { generateCreativeDirection, summariseCreativeDirection } from '../ai/generators/creative-direction.generator';
import { classifyMechanismFamily, generateCreativeConcepts } from '../ai/generators/creative-concepts.generator';
import { generateCreativeIntent, normaliseIntent } from '../ai/generators/creative-intent.generator';
import { generateCreativeResearch } from '../ai/generators/creative-research.generator';
import { generateReferenceStyleProfile } from '../ai/generators/reference-style.generator';
import { detectMarketingStrategy } from '../ai/strategy/marketing-strategy-detector';
import { normaliseDesignRecipe } from '../ai/render/design-recipe';
import { designCreative } from '../ai/render/designer-composition';
import {
  getStyleDNA,
  resolveStyleDNA,
  styleDnaToRecipe,
  STYLE_DNA_VERSION,
  type ResolvedStyleDNA,
} from '../ai/style-dna/style-dna';
import { creativeConceptRepository, type ConceptScope, type PersistedConcept } from '../repositories/creative-concept.repository';
import { designContextService, type DesignContext } from './design-context.service';
import { brandIntelligenceService, type BrandIntelligenceProfile } from './creative-brand-intelligence.service';
import { creativeAttributionRepository } from '../repositories/creative-attribution.repository';
import { aiUsageRepository } from '../repositories/ai-usage.repository';
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
  CreativeStrategy,
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
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ASSET_URLS) throw new CreativeError('Add up to five product images. Every selected image must be included.', 422);
  const urls = value.map(item => readImageUrl(item));
  if (urls.some(url => !url)) throw new CreativeError('One of the product image URLs is invalid.', 422);
  return urls as string[];
}

function readReferenceImageUrls(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_URLS) throw new CreativeError('Add up to six style references.', 422);
  const urls = value.map(item => readImageUrl(item));
  if (urls.some(url => !url)) throw new CreativeError('One of the style reference URLs is invalid.', 422);
  return urls as string[];
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
    ...((typeof d.logoAssetUrl === 'string' && (d.logoAssetUrl.startsWith('http') || d.logoAssetUrl.startsWith('data:image/'))) && {
      logoAssetUrl: d.logoAssetUrl.trim(),
    }),
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
    ...(readString(c.conceptId, 64) && { conceptId: readString(c.conceptId, 64) }),
    ...(readString(c.styleId, 80) && { styleId: readString(c.styleId, 80) }),
    ...(readString(c.promptVersion, 80) && { promptVersion: readString(c.promptVersion, 80) }),
    ...(readString(c.styleVersion, 80) && { styleVersion: readString(c.styleVersion, 80) }),
    ...(readString(c.contextVersion, 80) && { contextVersion: readString(c.contextVersion, 80) }),
    ...(readString(c.generationVersion, 80) && { generationVersion: readString(c.generationVersion, 80) }),
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
  const rawStyleId = readString(input.styleId, 80);
  const styleId = rawStyleId && rawStyleId !== 'auto' ? rawStyleId : undefined;
  if (styleId && !getStyleDNA(styleId)) {
    throw new CreativeError('That creative style is not available.', 422);
  }

  const detectedStrategy = detectMarketingStrategy(prompt);
  const goal = input.goal && input.goal !== 'auto' ? readEnum(input.goal, GOALS, detectedStrategy.goal) : detectedStrategy.goal;
  const funnelStage = input.funnelStage && input.funnelStage !== 'auto' ? readEnum(input.funnelStage, FUNNEL_STAGES, detectedStrategy.funnelStage) : detectedStrategy.funnelStage;

  return {
    userId,
    contextType,
    ...(contextType === 'brand' && readString(input.brandId, 64) && {
      brandId: readString(input.brandId, 64),
    }),
    prompt,
    ...(styleId && { styleId }),
    goal,
    funnelStage,
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

const CONCEPT_VERSION = 'concept-v1';
const GENERATION_VERSION = 'generation-v2-designer-composition';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function conceptScope(request: CreativeGenerationRequest): ConceptScope {
  return { userId: request.userId, contextType: request.contextType, brandId: request.contextType === 'brand' ? request.brandId : null };
}

function contextVersion(request: CreativeGenerationRequest): string {
  return digest({ mode: request.contextType, brandId: request.brandId ?? null, brandVoice: request.brandVoice ?? null, creativeDna: request.creativeDna ?? null });
}

function promptVersion(request: CreativeGenerationRequest): string {
  return digest({ prompt: request.prompt.trim().replace(/\s+/g, ' '), goal: request.goal, funnelStage: request.funnelStage, platforms: request.platforms });
}

function resolvedStyleFor(request: CreativeGenerationRequest, variationKey?: string, context?: DesignContext): ResolvedStyleDNA | undefined {
  return resolveStyleDNA({
    styleId: request.styleId ?? request.selectedConcept?.styleId,
    prompt: request.prompt,
    variationKey,
    preferredStyleId: context?.preferredStyleId,
  });
}

function enrichConcept(request: CreativeGenerationRequest, concept: ScoredCreativeConcept, styleDna?: ResolvedStyleDNA): Omit<PersistedConcept, 'generatedAsset' | 'generationStatus'> {
  const isExplicit = Boolean(request.styleId && request.styleId !== 'auto');
  const style = isExplicit ? styleDna?.style : undefined;
  const pVersion = promptVersion(request);
  const cVersion = contextVersion(request);
  const conceptId = digest({ userId: request.userId, contextType: request.contextType, brandId: request.brandId ?? null, pVersion, cVersion, style: style?.id ?? null, version: CONCEPT_VERSION, concept });
  return {
    ...concept, conceptId, ...(style && { styleId: style.id }), promptVersion: pVersion,
    styleVersion: STYLE_DNA_VERSION, contextVersion: cVersion, generationVersion: GENERATION_VERSION,
    visualDirection: concept.visualMechanism,
    typographyDirection: style?.typography.displayPersonality.join(', ') ?? '',
    colorDirection: style?.color.relationships.join('; ') ?? '',
    lightingDirection: style?.lighting.atmosphere.join(', ') ?? '',
    imageryDirection: style?.imagery.medium.join(', ') ?? concept.artDirectionFamily,
    layoutDirection: style?.composition.join('; ') ?? '',
  };
}

async function persistConcepts(request: CreativeGenerationRequest, concepts: ScoredCreativeConcept[], styleDna?: ResolvedStyleDNA) {
  return Promise.all(concepts.map((concept) => creativeConceptRepository.saveDiscovered(conceptScope(request), request.prompt, enrichConcept(request, concept, styleDna))));
}

/** Official Style DNA uses the renderer's established ReferenceStyleProfile seam instead of creating a parallel layout path. */
function styleProfileFor(resolved?: ResolvedStyleDNA): ReferenceStyleProfile | undefined {
  if (!resolved) return undefined;
  const { style, variant } = resolved;
  return {
    analysed: true,
    referenceCount: 0,
    visualLanguage: style.visualCharacter.join(', '),
    compositionPatterns: style.composition,
    typographyCharacter: style.typography.displayPersonality.join(', '),
    colorRelationships: style.color.relationships.join('; '),
    textureAndMaterial: style.texture.join(', '),
    lightingAndMood: [...style.lighting.atmosphere, ...style.mood].join(', '),
    photographicOrIllustrative: style.imagery.medium.join(', '),
    visualDensity: style.layout.density,
    brandTreatment: style.description,
    creativeMechanisms: style.graphicElements,
    imperfectionLevel: style.imperfection.level,
    interactionPatterns: '',
    doNotCopy: style.qualityConstraints,
    dominantDirection: style.description,
    influence: 'high',
    designRecipe: styleDnaToRecipe(style, variant),
  };
}

function effectiveStyleProfile(referenceStyle: ReferenceStyleProfile | undefined, resolved?: ResolvedStyleDNA, intelligence?: BrandIntelligenceProfile, performanceEvidence: string[] = []) {
  const base = styleProfileFor(resolved) ?? referenceStyle;
  if (!base) return base;
  const preferences = intelligence ? intelligence.explicit.concat(intelligence.learned.filter((p) => p.strength === 'strong')) : [];
  const positive = preferences.filter((p) => p.polarity === 'positive');
  const negative = preferences.filter((p) =>
    p.polarity === 'negative' && !(
      p.dimension === 'style' && resolved && resolved.source !== 'history' && p.value === resolved.style.id
    ),
  );
  const supportingEvidence = performanceEvidence.filter((line) =>
    !(intelligence?.explicit ?? []).some((preference) => line.toLowerCase().includes(preference.value.toLowerCase())),
  );
  return {
    ...base,
    brandTreatment: [base.brandTreatment, ...positive.map((p) => `Prefer ${p.dimension}: ${p.value}`), ...(supportingEvidence.length ? [`Supporting observed performance evidence (not causality): ${supportingEvidence.join('; ')}`] : [])].filter(Boolean).join('; '),
    doNotCopy: [...base.doNotCopy, ...negative.map((p) => `Avoid ${p.dimension}: ${p.value}`)],
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
  // If logoAssetUrl is provided, it will be rendered. If not provided, the designer layout gracefully renders the headline & brand typography.
  if (request.contextType === 'personal' || request.creativeDna?.logoAssetUrl || request.brandVoice?.name) return;
  // Non-blocking fallback
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
    creativeStrategyDurationMs: s.creativeStrategy ?? 0,
    artDirectorDurationMs: s.artDirector ?? 0,
    copySynthesisDurationMs: s.copySynthesis ?? 0,
    compositionDurationMs: s.composition ?? 0,
    mechanicalRepairDurationMs: s.mechanicalRepair ?? 0,
    renderDurationMs: s.render ?? s.renderer ?? 0,
    criticDurationMs: s.critic ?? 0,
    totalDurationMs: Date.now() - metrics.startedAt,
    imageCalls: metrics.imageCalls,
    textCalls: metrics.textCalls,
    cloudinaryUploads: metrics.cloudinaryUploads,
  });
}

/** Extract this request's requirements before generating concepts or pixels. */
async function resolveIntent(
  request: CreativeGenerationRequest,
  metrics?: CreativeMetrics,
): Promise<CreativeIntentBrief> {
  // Re-extract from this request: a browser-supplied brief can belong to an older prompt.
  if (metrics) metrics.textCalls += 1;
  return timed(metrics, 'intent', () =>
    generateCreativeIntent({
      provider: providerForRole('fast'),
      request: request.prompt,
    }),
  );
}

/** Resolves brand + Creative DNA for a request, running Vision on the first asset if one was given. */
async function resolveIdentity(request: CreativeGenerationRequest) {
  const visionProvider = providerForRole('vision');
  const firstAsset = request.assetUrls[0];

  let brandName = '';
  let dbBrandDescription = '';
  let voicePayloadFromDb: Record<string, any> | null = null;

  if (request.contextType === 'brand' && request.brandId) {
    try {
      const activeBrandRow = await prisma.brand.findFirst({
        where: { id: request.brandId, created_by: request.userId },
      });
      if (!activeBrandRow && !request.brandVoice) throw new CreativeError('That brand is not available.', 404);
      if (activeBrandRow) {
        brandName = activeBrandRow.name;
        dbBrandDescription = activeBrandRow.description;
      }
    } catch (e) {
      if (e instanceof CreativeError) throw e;
      console.warn('[creative] failed to read active brand row', e);
      if (!request.brandVoice) {
        throw new CreativeError('Brand context could not be loaded.', 503);
      }
      brandName = (request.brandVoice.name as string) || brandName;
    }
  }

  // A brand voice belongs to one brand. Names are presentation only and must
  // never cause cross-brand context inheritance.
  if (request.contextType === 'brand' && request.brandId) {
    try {
      const matchingVoice = await prisma.brandVoice.findFirst({
        where: {
          created_by: request.userId,
          brand_id: request.brandId,
        },
      });
      if (matchingVoice && matchingVoice.voice && typeof matchingVoice.voice === 'object') {
        voicePayloadFromDb = matchingVoice.voice as Record<string, any>;
      }
    } catch (e) {
      console.warn('[creative] failed to load brand voice context', e);
      if (!request.brandVoice) {
        throw new CreativeError('Brand voice context could not be loaded.', 503);
      }
    }
  }

  // Personal creation has a dedicated persisted context and never falls back
  // to any brand row, brand voice, brand DNA, or brand-scoped history.
  if (request.contextType === 'personal') {
    try {
      const personalProfile = await prisma.creationProfile.findUnique({
        where: { userId: request.userId },
        select: { personalContext: true },
      });
      if (personalProfile?.personalContext && typeof personalProfile.personalContext === 'object') {
        voicePayloadFromDb = personalProfile.personalContext as Record<string, any>;
      }
    } catch (e) {
      console.warn('[creative] failed to load personal creation context', e);
      if (!request.brandVoice) {
        throw new CreativeError('Personal context could not be loaded.', 503);
      }
    }
  }

  // Construct a merged brand input
  const fallbackVoice = (request.brandVoice as unknown as Record<string, any>) || {};
  const mergedBrandVoice: BrandProfileInput = {
    name: brandName || (fallbackVoice.name as string) || '',
    description: dbBrandDescription || (voicePayloadFromDb?.description as string) || (fallbackVoice.description as string) || '',
    mission: (voicePayloadFromDb?.mission as string) || (fallbackVoice.mission as string) || '',
    industry: (voicePayloadFromDb?.industry as string) || (fallbackVoice.industry as string) || '',
    targetAudience: (voicePayloadFromDb?.targetAudience as string) || (voicePayloadFromDb?.audience as string) || (fallbackVoice.targetAudience as string) || '',
    tone: (voicePayloadFromDb?.tone as string) || (fallbackVoice.tone as string) || '',
    writingStyle: (voicePayloadFromDb?.writingStyle as string) || (fallbackVoice.writingStyle as string) || '',
    personality: (voicePayloadFromDb?.personality as string) || (fallbackVoice.personality as string) || '',
    products: (voicePayloadFromDb?.products as string[]) || (fallbackVoice.products as string[]) || [],
    competitors: (voicePayloadFromDb?.competitors as string[]) || (fallbackVoice.competitors as string[]) || [],
    brandColors: (voicePayloadFromDb?.brandColors as string[]) || (fallbackVoice.brandColors as string[]) || [],
    wordsToUse: (voicePayloadFromDb?.wordsToUse as string[]) || (fallbackVoice.wordsToUse as string[]) || [],
    wordsToAvoid: (voicePayloadFromDb?.wordsToAvoid as string[]) || (fallbackVoice.wordsToAvoid as string[]) || [],
    services: (voicePayloadFromDb?.services as string[]) || (fallbackVoice.services as string[]) || [],
    ctaStyle: (voicePayloadFromDb?.ctaStyle as string) || (fallbackVoice.ctaStyle as string) || '',
    emojiStyle: (voicePayloadFromDb?.emojiStyle as string) || (fallbackVoice.emojiStyle as string) || '',
    usp: (voicePayloadFromDb?.usp as string) || (fallbackVoice.usp as string) || '',
  };

  const outcome = firstAsset
    ? await analyseImage({
        imageUrl: firstAsset,
        provider: visionProvider,
        topic: request.prompt,
        brandName: mergedBrandVoice.name,
        brandDescription: mergedBrandVoice.description,
      })
    : null;

  const brand = resolveBrandProfile({
    brand: mergedBrandVoice,
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
  if (!request.referenceImageUrls?.length) return request.referenceStyleProfile;

  const profile = await generateReferenceStyleProfile({
    provider: providerForRole('vision'),
    referenceUrls: request.referenceImageUrls,
    labels: request.referenceLabels,
  });
  if (!profile.analysed || profile.referenceCount !== request.referenceImageUrls.length) {
    throw new CreativeError('Your reference images could not all be understood. Please re-upload them.', 422);
  }
  return profile;
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

/** One reference that failed to fetch — kept (not just logged) so a caller can surface the degradation rather than only seeing a smaller `referenceCount`. */
interface ReferenceFetchFailure {
  url: string;
  reason?: string;
  detail?: string;
}

interface FetchedReferenceImages {
  images: Array<{ mimeType: string; data: string }>;
  failures: ReferenceFetchFailure[];
}

async function fetchReferenceImages(urls: string[]): Promise<FetchedReferenceImages> {
  const failures: ReferenceFetchFailure[] = [];
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const image = await fetchInlineImage(url);
        return { mimeType: image.mimeType, data: image.data };
      } catch (error) {
        const detail = error instanceof ImageFetchError ? error.detail : String(error);
        const reason = error instanceof ImageFetchError ? error.reason : undefined;
        console.warn('[creative] reference asset could not be fetched, skipping', { url, reason, detail });
        failures.push({ url, reason, detail });
        return null;
      }
    }),
  );
  return { images: results.filter((image): image is { mimeType: string; data: string } => image !== null), failures };
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
  styleDna?: ResolvedStyleDNA;
  /** The member's hard requirements — validated through direction and carried into the campaign pass. */
  intent?: CreativeIntentBrief;
  canonicalBrief?: CreativeBrief;
  graphicConcept?: GraphicDesignConcept;
  /**
   * False for a campaign variation, which is already a finished creative of
   * its own and would only be re-designed into a near-duplicate.
   */
  /** Set for one shot of a campaign set — e.g. "Hero", "Product", "Lifestyle". */
  variationLabel?: string;
  campaignId?: string;
  parentAssetId?: string;
  /** Correlation id from the HTTP layer — ties every stage log to one request. */
  requestId?: string;
  /** The request's latency/spend ledger — shared across variations of one campaign. */
  metrics?: CreativeMetrics;
  /** Discovered concept whose canonical image is completed in the same transaction. */
  canonicalConceptId?: string;
  /** The idea layer, resolved before the brief. Absent only when strategy generation failed. */
  creativeStrategy?: CreativeStrategy;
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
  styleDna,
  intent,
  canonicalBrief: providedBrief,
  graphicConcept: providedConcept,
  creativeStrategy,
  variationLabel,
  campaignId,
  parentAssetId,
  requestId,
  metrics,
  canonicalConceptId,
}: RunGenerationOptions): Promise<StoredGeneratedAsset> {
  const hasAssets = request.assetUrls.length > 0;

  const canonicalBrief = providedBrief || buildCanonicalCreativeBrief({
    userPrompt: request.prompt,
    goal: request.goal,
    funnelStage: request.funnelStage,
    brand,
    creativeDna,
    styleDna,
    referenceStyle,
    intent,
    concept,
    productAssetUrls: request.assetUrls,
    referenceImageUrls: request.referenceImageUrls,
    logoAssetUrl: creativeDna.logoAssetUrl || undefined,
    ...(creativeStrategy && { creativeStrategy }),
  });

  const graphicConcept = providedConcept || (await timed(metrics, 'artDirector', () =>
    generateGraphicDesignConcept({
      provider: textProvider,
      brief: canonicalBrief,
      ...(creativeStrategy && { strategy: creativeStrategy }),
    }),
  ));

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

  const { direction, meta: directionMeta } = await timed(metrics, 'copySynthesis', () =>
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
      // The selected style is now its own mandatory section (selectedStyle),
      // never folded into referenceStyle — referenceStyle here is whatever
      // the caller already resolved as genuine reference-image inspiration
      // (optionally intelligence-enriched), so it stays honest about what it
      // actually is (see effectiveStyleProfile's callers above `generate`).
      selectedStyle: styleDna?.style,
      referenceStyle,
      intent,
      brand,
      creativeDna,
      // Copy synthesis executes the blueprint rather than running beside it.
      // Without this the copy stage never saw the design, so it authored a
      // full marketing kit — headline, support, brand message, details, CTA —
      // and the composition stage then had to find somewhere to put all of it.
      graphicConcept,
      ...(creativeStrategy && { creativeStrategy }),
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
    referenceImageUrls: request.referenceImageUrls ?? [],
    ...(styleDna && { styleDna: { id: styleDna.style.id, variant: styleDna.variant, source: styleDna.source } }),
    ...(intent && { intent }),
    canonicalBrief,
    graphicConcept,
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
    styleReferenceUrls: request.referenceImageUrls ?? [],
    hasAssets,
    logoAssetUrl: creativeDna.logoAssetUrl || undefined,
    variationLabel,
    creativeDna,
    // The renderer now takes styleDna directly (see design-recipe.ts /
    // Phase 4) and only falls back to referenceStyle.designRecipe when no
    // style resolved — passing the real referenceStyle through unwrapped
    // keeps that fallback honest instead of re-conflating it with styleDna.
    referenceStyle,
    styleDna,
    canonicalBrief,
    graphicConcept,
    renderContext,
    requestId,
    metrics,
    canonicalConceptId,
  });
}

interface FinishGenerationOptions {
  userId: string;
  asset: StoredGeneratedAsset;
  direction: CreativeDirection;
  imageProvider: AiImageProvider;
  /** URLs to send as reference images — source assets for a fresh generation, plus the prior visual for a refinement. */
  referenceUrls: string[];
  styleReferenceUrls?: string[];
  priorVisualUrl?: string;
  hasAssets: boolean;
  /** The brand's real logo, if any — composited pixel-exact, never sent to the image model to draw. */
  logoAssetUrl?: string;
  variationLabel?: string;
  creativeDna: ResolvedCreativeDna;
  referenceStyle?: ReferenceStyleProfile;
  styleDna?: ResolvedStyleDNA;
  canonicalBrief?: CreativeBrief;
  graphicConcept?: GraphicDesignConcept;
  /** Persisted on the row so a later refinement re-executes this creative faithfully. */
  renderContext?: CreativeRenderContext;
  /** Correlation id from the HTTP layer — ties every stage log to one request. */
  requestId?: string;
  /** The request's latency/spend ledger. */
  metrics?: CreativeMetrics;
  canonicalConceptId?: string;
}

/** Compose original assets and exact copy, verify the finished pixels, then persist. */
async function finishGeneration({
  userId, asset, direction, imageProvider, referenceUrls, styleReferenceUrls = [], priorVisualUrl,
  logoAssetUrl, creativeDna, referenceStyle, styleDna, canonicalBrief, graphicConcept, renderContext, requestId, metrics, canonicalConceptId,
}: FinishGenerationOptions): Promise<StoredGeneratedAsset> {
  let designVerified = false;
  try {
    const [products, references, logos, previous] = await Promise.all([
      fetchReferenceImages(referenceUrls), fetchReferenceImages(styleReferenceUrls),
      logoAssetUrl ? fetchReferenceImages([logoAssetUrl]) : Promise.resolve({ images: [], failures: [] }),
      priorVisualUrl ? fetchReferenceImages([priorVisualUrl]) : Promise.resolve({ images: [], failures: [] }),
    ]);
    if (products.failures.length || products.images.length !== referenceUrls.length) {
      throw new CreativeError('Every product image must be readable. Re-upload the missing product assets.', 422);
    }
    if (references.failures.length || references.images.length !== styleReferenceUrls.length) {
      throw new CreativeError('Your style references could not all be read. Re-upload the missing references.', 422);
    }
    if (!renderContext) throw new CreativeError('The campaign context is missing. Start a new creative.', 422);
    const result = await timed(metrics, 'render', () => designCreative({
      direction, context: { ...renderContext, creativeDna, referenceStyle }, styleDna,
      canonicalBrief, graphicConcept,
      products: products.images, references: references.images, logo: logos.images[0], priorVisual: previous.images[0],
      textProvider: providerForRole('creative'), imageProvider,
      onCall: kind => { if (metrics) { if (kind === 'text') metrics.textCalls += 1; else metrics.imageCalls += 1; } },
      onStageTiming: (stage, durationMs) => {
        if (metrics) metrics.stages[stage] = (metrics.stages[stage] ?? 0) + durationMs;
      },
    }));
    designVerified = true;
    dumpDebugArtifacts(asset.id, {
      '2-final.png': result.data,
      'plan.json': JSON.stringify({ generationVersion: GENERATION_VERSION, plan: result.plan,
        sourceAssetUrls: referenceUrls, referenceImageUrls: styleReferenceUrls, typography: result.typography }, null, 2),
    });
    if (metrics) metrics.cloudinaryUploads += result.visual ? 2 : 1;
    const [uploaded, visualUpload] = await Promise.all([
      timed(metrics, 'cloudinary', () => cloudinaryService.uploadImageBuffer(result.data, result.mimeType)),
      result.visual ? cloudinaryService.uploadImageBuffer(Buffer.from(result.visual.data, 'base64'), result.visual.mimeType)
        .catch(() => undefined) : Promise.resolve(undefined),
    ]);
    const completion = {
      imageUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId,
      ...(uploaded.width !== undefined && { width: uploaded.width }),
      ...(uploaded.height !== undefined && { height: uploaded.height }),
      ...(uploaded.format !== undefined && { format: uploaded.format }),
      renderContext: { ...renderContext, referenceImageUrls: styleReferenceUrls,
        ...(visualUpload && { visualImageUrl: visualUpload.url }) },
      typography: result.typography,
    };
    const completed = canonicalConceptId
      ? await generatedAssetRepository.markCompletedAndAttachConcept(asset.id, canonicalConceptId, userId, completion)
      : await generatedAssetRepository.markCompleted(asset.id, completion);
    console.info('[creative] verified designer composition complete', { requestId, assetId: asset.id,
      productCount: products.images.length, referenceCount: references.images.length,
      selectedStyleId: styleDna?.style.id, generationVersion: GENERATION_VERSION });
    return completed;
  } catch (error) {
    await generatedAssetRepository.markFailed(asset.id);
    if (error instanceof CreativeError || error instanceof AiProviderError) throw error;
    if (designVerified) throw new CreativeError("Image created, but FlowPost couldn't save it. Try again.", 502);
    console.error('[creative] designer composition failed', { requestId, assetId: asset.id,
      detail: error instanceof Error ? error.message : String(error) });
    throw new CreativeError('FlowPost could not verify this design against your brief, assets and style. Please try again.', 422,
      error instanceof Error ? error.message : String(error));
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

/**
 * Resolves the creative strategy for a request.
 *
 * Failure here is non-fatal by design. A strategy is what makes a creative
 * specific rather than generic; losing it costs quality, but refusing to
 * generate anything would cost the member their creative entirely — and the
 * art director still receives the concept, the brief and the member's own
 * requirements. What it must never do is substitute a default strategy: a
 * house mechanism applied to every request is the template this stage exists
 * to remove.
 */
async function resolveCreativeStrategy(options: {
  request: CreativeGenerationRequest;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  concept: ScoredCreativeConcept;
  intent: CreativeIntentBrief;
  research?: CreativeResearch;
  referenceStyle?: ReferenceStyleProfile;
  textProvider: AiTextProvider;
  metrics?: CreativeMetrics;
}): Promise<CreativeStrategy | undefined> {
  const { request, brand, creativeDna, concept, intent, research, referenceStyle, textProvider, metrics } = options;
  try {
    const { strategy } = await timed(metrics, 'creativeStrategy', () =>
      generateCreativeStrategy({
        provider: textProvider,
        request: request.prompt,
        goal: request.goal,
        funnelStage: request.funnelStage,
        platforms: request.platforms,
        hasAssets: request.assetUrls.length > 0,
        brand,
        creativeDna,
        concept,
        intent,
        ...(research && { research }),
        ...(referenceStyle && { referenceStyle }),
      }),
    );
    if (metrics) metrics.textCalls += 1;
    return strategy;
  } catch (error) {
    console.warn('[creative] creative strategy unavailable; art directing from the concept alone', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
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

    // Deterministic, scope-isolated history read. It runs beside the existing
    // context preparation and never costs an AI call.
    const designContextPromise = designContextService.loadDesignContext(conceptScope(request));

    // Identity (vision), intent extraction, the repetition memory and the
    // reference-style analysis are mutually independent — one round of
    // parallel context prep (§2). Research needs only the resolved brand, so
    // it starts the moment identity lands, while intent and reference
    // analysis are still in flight; concepts follow because they read
    // everything.
    const identityPromise = resolveIdentity(request);
    const [{ brand, creativeDna }, intent, recentSignatures, referenceStyle, research, designContext] = await Promise.all([
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
      designContextPromise,
    ]);
    const styleDna = resolvedStyleFor(request, undefined, designContext);

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
      referenceStyle: effectiveStyleProfile(referenceStyle, styleDna, designContext.brandIntelligence, designContext.performanceEvidence),
      intent,
    });

    // The brief travels back to the browser so `/generate` validates against
    // exactly the requirements these concepts were gated on.
    const concepts = await persistConcepts(request, outcome.concepts, styleDna);
    const scope = conceptScope(request);
    await Promise.all(concepts.map((concept) => creativeAttributionRepository.appendEvent(scope, {
      eventType: 'CONCEPT_VIEWED', conceptId: concept.conceptId,
    })));
    return { ...outcome, concepts, intent, ...(referenceStyle && { referenceStyle }), ...(styleDna && { resolvedStyleId: styleDna.style.id }) };
  },

  /**
   * The "FlowPost understood" step, kept for a caller that wants one
   * ready-to-read direction rather than a set of concepts to choose between.
   * Discovers concepts, auto-selects the strongest, then art-directs it.
   * Generates nothing, persists nothing.
   */
  async understand(userId: string, body: unknown) {
    const request = parseRequest(body, { userId });
    const designContext = await designContextService.loadDesignContext(conceptScope(request));
    const styleDna = resolvedStyleFor(request, undefined, designContext);
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
      referenceStyle: effectiveStyleProfile(referenceStyle, styleDna, designContext.brandIntelligence, designContext.performanceEvidence),
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
      selectedStyle: styleDna?.style,
      referenceStyle: effectiveStyleProfile(referenceStyle, undefined, designContext.brandIntelligence, designContext.performanceEvidence),
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
    const scope = conceptScope(request);
    const conceptId = request.selectedConcept?.conceptId;
    let claimedConceptId: string | undefined;

    // This lookup deliberately precedes provider/storage/logo checks: reopening
    // a completed concept is a database read, not a generation attempt.
    if (conceptId) {
      const persisted = await creativeConceptRepository.findOwned(conceptId, scope);
      if (!persisted) throw new CreativeError('That concept could not be found in this creation context.', 404);
      if (persisted.generatedAsset?.status === 'COMPLETED' && persisted.generatedAsset.imageUrl) {
        await creativeConceptRepository.recordReopen(conceptId, scope);
        await creativeAttributionRepository.recordAssetEvent(userId, persisted.generatedAsset.id, 'CONCEPT_SELECTED', requestId ? `${requestId}:selected:${conceptId}` : undefined).catch(() => undefined);
        console.info('[creative] cache hit — returning existing concept image', { requestId, conceptId, assetId: persisted.generatedAsset.id });
        await aiUsageRepository.recordAiUsage({ ownerId: userId, action: 'generate', provider: persisted.generatedAsset.provider, model: persisted.generatedAsset.model, contextType: persisted.generatedAsset.contextType, ...(persisted.generatedAsset.brandId && { brandId: persisted.generatedAsset.brandId }), ...(requestId && { requestId }), cacheHit: true, success: true, durationMs: 0 });
        return persisted.generatedAsset;
      }
      const claimed = await creativeConceptRepository.claimGeneration(conceptId, scope);
      if (!claimed) throw new CreativeError('That concept is already being generated. Please wait a moment.', 409);
      claimedConceptId = conceptId;
      request.selectedConcept = persisted;
      request.styleId = persisted.styleId;
    }

    const designContext = await designContextService.loadDesignContext(scope);
    const styleDna = resolvedStyleFor(request, undefined, designContext);
    const textProvider = providerForRole('creative');
    const imageProvider = activeImageProvider();

    const metrics = newMetrics();
    let generationSucceeded = false;
    try {
      if (!textProvider.isConfigured() || !imageProvider.isConfigured()) {
        throw new CreativeError('AI generation is not set up on this server yet.', 503);
      }
      assertStorageConfigured();
      assertBrandLogo(request);
      // Identity (vision), intent and reference style are independent — one
      // round of parallel context prep (§2). A concept picked from /concepts
      // skips research entirely; the intent brief handed back skips a second
      // extraction — nothing is recomputed within a request (§12).
      const [{ brand, creativeDna }, intent, referenceStyle] = await Promise.all([
        resolveIdentity(request),
        resolveIntent(request, metrics),
        resolveReferenceStyle(request),
      ]);
      // Concept discovery still benefits from the selected style folded into
      // its "reference style" inspiration channel (out of Phase 3's scope —
      // concept generation just picks the idea, not the visual system).
      const intelligentStyle = effectiveStyleProfile(referenceStyle, styleDna, designContext.brandIntelligence, designContext.performanceEvidence);
      const { concept, research } = await resolveConceptAndResearch(
        request, brand, creativeDna, intent, intelligentStyle, metrics,
      );

      if (claimedConceptId && request.contextType === 'brand' && request.brandId) {
        await brandIntelligenceService.recordConceptSignal(userId, request.brandId, concept as unknown as Record<string, any>, 'selected')
          .catch((error) => console.warn('[creative] intelligence signal skipped', error));
      }

      // The direction/renderer stage gets the REAL reference-style profile
      // (uploaded images + learned intelligence), never the selected style
      // folded in — the selected style is passed explicitly as its own
      // `styleDna` field so it can be a mandatory constraint (creative
      // direction) and the direct recipe source (renderer), not inspiration.
      const directionReferenceStyle = effectiveStyleProfile(referenceStyle, undefined, designContext.brandIntelligence, designContext.performanceEvidence);

      // CREATIVE STRATEGY — the idea, decided before anything visual exists.
      //
      // This stage is the architectural fix: the pipeline previously ran
      // intent -> brief -> art director, so the first question anyone asked
      // was "what composition?" and the occasion became the template. The
      // strategy answers "what is the mechanism?" first, and every stage
      // downstream executes that answer.
      const creativeStrategy = await resolveCreativeStrategy({
        request, brand, creativeDna, concept, intent, research,
        referenceStyle: directionReferenceStyle, textProvider, metrics,
      });

      const canonicalBrief = buildCanonicalCreativeBrief({
        userPrompt: request.prompt,
        goal: request.goal,
        funnelStage: request.funnelStage,
        brand,
        creativeDna,
        styleDna,
        referenceStyle: directionReferenceStyle,
        intent,
        concept,
        productAssetUrls: request.assetUrls,
        referenceImageUrls: request.referenceImageUrls,
        logoAssetUrl: creativeDna.logoAssetUrl || undefined,
        ...(creativeStrategy && { creativeStrategy }),
      });

      const graphicConcept = await timed(metrics, 'artDirector', () =>
        generateGraphicDesignConcept({
          provider: textProvider,
          brief: canonicalBrief,
          ...(creativeStrategy && { strategy: creativeStrategy }),
        }),
      );

      const asset = await runGeneration({
        userId, request, textProvider, imageProvider, brand, creativeDna, concept,
        mode: concept.mode, artDirectionFamily: concept.artDirectionFamily, research, referenceStyle: directionReferenceStyle, styleDna, intent,
        canonicalBrief, graphicConcept, ...(creativeStrategy && { creativeStrategy }),
        requestId, metrics, canonicalConceptId: claimedConceptId,
      });
      await creativeAttributionRepository.recordAssetEvent(userId, asset.id, 'ASSET_GENERATED', requestId ? `${requestId}:generated:${asset.id}` : undefined).catch(() => undefined);
      await creativeAttributionRepository.recordAssetEvent(userId, asset.id, 'CONCEPT_SELECTED', requestId ? `${requestId}:selected:${asset.id}` : undefined).catch(() => undefined);
      generationSucceeded = true;
      return asset;
    } catch (error) {
      if (claimedConceptId) await creativeConceptRepository.markFailed(claimedConceptId, scope);
      throw error;
    } finally {
      logMetrics(metrics, requestId);
      await aiUsageRepository.recordAiUsage({ ownerId: userId, action: 'generate', provider: imageProvider.id, model: imageProvider.model, contextType: request.contextType, ...(request.brandId && { brandId: request.brandId }), ...(requestId && { requestId }), imageCalls: metrics.imageCalls, retryCount: Math.max(0, metrics.imageCalls - 2), success: generationSucceeded, durationMs: Date.now() - metrics.startedAt });
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
      const baseStyleDna = resolvedStyleFor(request, labels[0]);

      const canonicalBrief = buildCanonicalCreativeBrief({
        userPrompt: request.prompt,
        goal: request.goal,
        funnelStage: request.funnelStage,
        brand,
        creativeDna,
        styleDna: baseStyleDna,
        referenceStyle,
        intent,
        concept,
        productAssetUrls: request.assetUrls,
        referenceImageUrls: request.referenceImageUrls,
        logoAssetUrl: creativeDna.logoAssetUrl || undefined,
      });

      const graphicConcept = await timed(metrics, 'artDirector', () =>
        generateGraphicDesignConcept({
          provider: textProvider,
          brief: canonicalBrief,
        }),
      );

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
        styleDna: baseStyleDna,
        intent,
        canonicalBrief,
        graphicConcept,
        // Each labelled variation is already a finished creative in its own
        // right; running the campaign pass over every one would just produce a
        // near-duplicate of it at double the cost.
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
            styleDna: resolvedStyleFor(request, label),
            intent,
            canonicalBrief,
            graphicConcept,
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
    const regeneration = input.regeneration === true;
    const instruction = regeneration
      ? 'Create a fresh visual variation of this concept while preserving its intent, brand constraints and Style DNA.'
      : readString(input.instruction, MAX_REFINEMENT_LENGTH);

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
    if (!creativeDna.logoAssetUrl) throw new CreativeError('This older creative has no saved logo. Start a new creative and add your logo.', 422);
    const referenceStyle = inherited?.referenceStyle;
    const intent = inherited?.intent;
    const goal = inherited?.goal ?? 'brand_awareness';
    const funnelStage = inherited?.funnelStage ?? 'TOFU';
    const platforms = inherited?.platforms ?? [];
    const inheritedStyle = inherited?.styleDna && getStyleDNA(inherited.styleDna.id);
    const styleDna: ResolvedStyleDNA | undefined = inheritedStyle && inherited?.styleDna
      ? { style: inheritedStyle, source: inherited.styleDna.source, variant: inherited.styleDna.variant }
      : resolveStyleDNA({ prompt: parent.prompt });

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
        selectedStyle: styleDna?.style,
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
      referenceImageUrls: inherited?.referenceImageUrls ?? [],
      ...(intent && { intent }),
      goal,
      funnelStage,
      platforms,
      ...(styleDna && { styleDna: { id: styleDna.style.id, variant: styleDna.variant, source: styleDna.source } }),
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
      source: regeneration ? 'AI_REGENERATED' : 'AI_REFINED',
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
      const completed = await finishGeneration({
        userId,
        asset: child,
        direction,
        imageProvider,
        referenceUrls: parent.sourceAssetUrls,
        styleReferenceUrls: inherited?.referenceImageUrls ?? [],
        priorVisualUrl: priorVisual,
        hasAssets: parent.sourceAssetUrls.length > 0,
        logoAssetUrl: creativeDna.logoAssetUrl || undefined,
        creativeDna,
        referenceStyle,
        styleDna,
        renderContext,
        requestId,
        metrics,
      });
      await creativeAttributionRepository.recordAssetEvent(userId, completed.id, regeneration ? 'ASSET_REGENERATED' : 'ASSET_REFINED', requestId ? `${requestId}:${regeneration ? 'regenerated' : 'refined'}:${completed.id}` : undefined).catch(() => undefined);
      return completed;
    } finally {
      logMetrics(metrics, requestId);
    }
  },

  /** Explicitly asks for a new variation. Unlike reopening a concept, this intentionally crosses the generation boundary. */
  async regenerate(userId: string, body: unknown, requestId?: string): Promise<StoredGeneratedAsset> {
    if (!body || typeof body !== 'object') throw new CreativeError('Send a JSON body naming the asset.');
    const asset = await creativeGenerationService.refine(userId, { assetId: (body as Record<string, unknown>).assetId, regeneration: true }, requestId);
    await brandIntelligenceService.recordAssetSignal(userId, asset.id, 'regenerated').catch((error) => console.warn('[creative] intelligence signal skipped', error));
    return asset;
  },

  async recordSignal(userId: string, body: unknown): Promise<{ recorded: boolean }> {
    if (!body || typeof body !== 'object') throw new CreativeError('Send a creative signal.');
    const input = body as Record<string, unknown>;
    const assetId = readString(input.assetId, 64);
    const signal = input.signal === 'saved' || input.signal === 'reused' ? input.signal : undefined;
    if (assetId && signal) {
      const recorded = await creativeConceptRepository.recordAssetSignal(assetId, userId, signal);
      if (recorded) {
        await brandIntelligenceService.recordAssetSignal(userId, assetId, signal)
          .catch((error) => console.warn('[creative] intelligence signal skipped', error));
        await creativeAttributionRepository.recordAssetEvent(userId, assetId, signal === 'saved' ? 'ASSET_SAVED' : 'ASSET_ATTACHED').catch(() => undefined);
      }
      return { recorded };
    }
    if (input.signal === 'rejected') {
      const conceptId = readString(input.conceptId, 80);
      const brandId = readString(input.brandId, 64);
      if (!conceptId || !brandId) throw new CreativeError('Choose a brand concept to reject.', 422);
      const concept = await creativeConceptRepository.findOwned(conceptId, { userId, contextType: 'brand', brandId });
      if (!concept) throw new CreativeError('That concept could not be found.', 404);
      await brandIntelligenceService.recordConceptSignal(userId, brandId, concept as unknown as Record<string, any>, 'rejected');
      await creativeAttributionRepository.appendEvent({ userId, contextType: 'brand', brandId }, { eventType: 'CONCEPT_REJECTED', conceptId }).catch(() => undefined);
      return { recorded: true };
    }
    throw new CreativeError('Choose a creative and a valid signal.', 422);
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

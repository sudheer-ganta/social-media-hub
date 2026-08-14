import { buildCreativeDirectionPrompt } from '../prompts/creative-direction.prompt';
import type { AiTextProvider } from '../providers';
import type {
  ArtDirectionFamily,
  BrandProfile,
  CopyTreatment,
  CreativeConcept,
  CreativeDirection,
  CreativeDirectionOutcome,
  CreativeMode,
  CreativeResearch,
  FunnelStage,
  LayoutDirection,
  MarketingCreative,
  MarketingGoal,
  RawCreativeDirectionPayload,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * Turns a member's plain request (+ resolved brand/visual identity) into the
 * structured {@link CreativeDirection} the image-generation service builds
 * its actual model prompt from. Internal only — never returned to the
 * browser raw; the service derives the friendly "FlowPost understood"
 * summary from it instead.
 */

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

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function asColors(value: unknown): string[] {
  return asStringArray(value, 6, 9)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => HEX_COLOR.test(entry));
}

// The same ratio vocabulary the composer's own crop tool offers
// (src/utils/crop.ts AspectRatioId) minus "original", which has no meaning
// for a freshly generated image — a generated creative and a manually
// cropped one speak the same ratios end to end.
const ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9', '1.91:1'];

function asAspectRatio(value: unknown): string {
  const raw = asString(value, 10);
  return ASPECT_RATIOS.includes(raw) ? raw : '1:1';
}

const COPY_TREATMENTS: CopyTreatment[] = ['none', 'headline', 'headline_support', 'interactive', 'editorial_punchline'];

function asCopyTreatment(value: unknown): CopyTreatment {
  const raw = asString(value, 20);
  return (COPY_TREATMENTS as string[]).includes(raw) ? (raw as CopyTreatment) : 'none';
}

function normaliseMarketingCreative(
  raw: RawCreativeDirectionPayload['marketingCreative'],
): MarketingCreative | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const brandMessage = asString(raw.brandMessage, 200);
  const secondaryInfo = asStringArray(raw.secondaryInfo, 4, 120);
  const logoTreatment = asString(raw.logoTreatment, 200);
  const requiredElements = asStringArray(raw.requiredElements, 6, 120);

  if (!brandMessage && secondaryInfo.length === 0 && !logoTreatment && requiredElements.length === 0) {
    return undefined;
  }

  return {
    ...(brandMessage && { brandMessage }),
    ...(secondaryInfo.length > 0 && { secondaryInfo }),
    ...(logoTreatment && { logoTreatment }),
    ...(requiredElements.length > 0 && { requiredElements }),
  };
}

function normaliseLayoutDirection(
  raw: RawCreativeDirectionPayload['layoutDirection'],
): LayoutDirection | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const fields = {
    layoutType: asString(raw.layoutType, 200),
    textHierarchy: asStringArray(raw.textHierarchy, 6, 160),
    headlinePlacement: asString(raw.headlinePlacement, 120),
    supportingCopyPlacement: asString(raw.supportingCopyPlacement, 120),
    logoPlacement: asString(raw.logoPlacement, 120),
    brandTreatment: asString(raw.brandTreatment, 200),
    secondaryInformation: asString(raw.secondaryInformation, 120),
    ctaPlacement: asString(raw.ctaPlacement, 120),
    productPlacement: asString(raw.productPlacement, 200),
    foregroundElements: asString(raw.foregroundElements, 200),
    backgroundElements: asString(raw.backgroundElements, 200),
    textureDirection: asString(raw.textureDirection, 200),
    typographyDirection: asString(raw.typographyDirection, 200),
    visualDensity: asString(raw.visualDensity, 60),
    safeAreas: asString(raw.safeAreas, 200),
  };

  const hasContent = Object.values(fields).some((value) => (Array.isArray(value) ? value.length > 0 : !!value));
  if (!hasContent) return undefined;

  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : !!value)),
  ) as LayoutDirection;
}

/**
 * Cleans one direction. Unlike vision, this never returns null: a request
 * that reached this far already passed validation, and a thin direction is
 * still an executable one — the image prompt builder just has less to work
 * with, the same tolerance `resolveBrandProfile` has for an empty brand.
 */
function normaliseDirection(
  payload: RawCreativeDirectionPayload,
  mode: CreativeMode,
  artDirectionFamily: ArtDirectionFamily,
): CreativeDirection {
  const marketingCreative = normaliseMarketingCreative(payload.marketingCreative);
  const layoutDirection = normaliseLayoutDirection(payload.layoutDirection);
  return {
    concept: asString(payload.concept, 160) || 'Brand creative',
    visualStory: asString(payload.visualStory, 500),
    subject: asString(payload.subject, 300),
    environment: asString(payload.environment, 300),
    composition: asString(payload.composition, 300),
    lighting: asString(payload.lighting, 200),
    mood: asString(payload.mood, 120),
    palette: asColors(payload.palette),
    brandConstraints: asStringArray(payload.brandConstraints, 8, 200),
    productTreatment: asString(payload.productTreatment, 300),
    background: asString(payload.background, 300),
    negativeVisualConstraints: asStringArray(payload.negativeVisualConstraints, 8, 200),
    aspectRatio: asAspectRatio(payload.aspectRatio),
    platform: asString(payload.platform, 40),
    mode,
    artDirectionFamily,
    copyTreatment: asCopyTreatment(payload.copyTreatment),
    headline: asString(payload.headline, 120),
    supportingLine: asString(payload.supportingLine, 160),
    cta: asString(payload.cta, 60),
    interactionInstructions: asString(payload.interactionInstructions, 160),
    ...(marketingCreative && { marketingCreative }),
    ...(layoutDirection && { layoutDirection }),
  };
}

// Goals where a finished creative needs the viewer to walk away knowing what's
// being sold — a bare visual metaphor with no copy at all under-communicates
// here in a way it wouldn't for pure brand_awareness. Reused as the trigger for
// the one-shot completeness retry below (spec: "regenerate before image model").
const COMMUNICATION_CRITICAL_GOALS: MarketingGoal[] = [
  'sales', 'product_launch', 'event_promotion', 'bookings', 'lead_generation',
];

/** True when a promotional idea shipped with no headline AND no marketingCreative content — a mood board, not a creative. */
function isUncommunicative(direction: CreativeDirection): boolean {
  if (direction.headline) return false;
  const mc = direction.marketingCreative;
  if (mc?.brandMessage || mc?.secondaryInfo?.length) return false;
  return true;
}

export interface GenerateCreativeDirectionOptions {
  provider: AiTextProvider;
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  /** The idea this direction executes. Required unless this is a refinement. */
  concept?: CreativeConcept;
  /** Mode carried from the concept (or from the parent direction on a refinement). */
  mode: CreativeMode;
  /** Medium/technique carried from the concept (or from the parent direction on a refinement) — never re-decided here. */
  artDirectionFamily: ArtDirectionFamily;
  refinementOf?: { priorDirection: CreativeDirection; instruction: string };
  research?: CreativeResearch;
  referenceStyle?: ReferenceStyleProfile;
}

export async function generateCreativeDirection({
  provider,
  request,
  goal,
  funnelStage,
  platforms,
  hasAssets,
  brand,
  creativeDna,
  concept,
  mode,
  artDirectionFamily,
  refinementOf,
  research,
  referenceStyle,
}: GenerateCreativeDirectionOptions): Promise<CreativeDirectionOutcome> {
  const startedAt = Date.now();

  const built = buildCreativeDirectionPrompt({
    request,
    goal,
    funnelStage,
    platforms,
    hasAssets,
    brand,
    creativeDna,
    concept,
    artDirectionFamily,
    refinementOf,
    research,
    referenceStyle,
  });

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as RawCreativeDirectionPayload;

  let direction = normaliseDirection(payload, mode, artDirectionFamily);

  // Spec: "if the brief is effectively empty, don't call the image model —
  // generate another concept." A full re-run back through concept discovery
  // is more machinery than this earns; one bounded retry with an explicit
  // nudge covers the actual failure mode (the model defaulted to 'none' for
  // a request that needed to say what's being sold).
  if (!refinementOf && COMMUNICATION_CRITICAL_GOALS.includes(goal) && isUncommunicative(direction)) {
    const retryPayload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: `${built.prompt}\n\nYour previous attempt at this brief shipped no headline and no brand message — for a ${goal.replace(/_/g, ' ')} request, the viewer needs to know what's being sold. Add a headline, brandMessage, or secondaryInfo — whichever actually fits this idea.`,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as RawCreativeDirectionPayload;
    direction = normaliseDirection(retryPayload, mode, artDirectionFamily);
  }

  const durationMs = Date.now() - startedAt;

  console.info('[ai] creative direction generated', {
    model: provider.model,
    durationMs,
    concept: direction.concept,
    mode: direction.mode,
    copyTreatment: direction.copyTreatment,
    hasAssets,
    refinement: Boolean(refinementOf),
  });

  return {
    direction,
    meta: { provider: provider.id, model: provider.model, durationMs },
  };
}

/**
 * The friendly "FlowPost understood" summary the transparency step shows —
 * never the raw brief. Plain sentences over a structured brief, same
 * reasoning as everywhere else in this module: a member approves what a
 * creative director told them, not a JSON object.
 */
export function summariseCreativeDirection(
  direction: CreativeDirection,
  context: { goal: MarketingGoal; funnelStage: FunnelStage; platforms: string[]; brandName: string },
): string {
  const lines = [
    `Concept: ${direction.concept}`,
    direction.visualStory && `Visual: ${direction.visualStory}`,
    direction.headline && `Headline: "${direction.headline}"`,
    direction.marketingCreative?.brandMessage && `Brand message: "${direction.marketingCreative.brandMessage}"`,
    direction.marketingCreative?.secondaryInfo?.length &&
      `Details: ${direction.marketingCreative.secondaryInfo.join(', ')}`,
    context.brandName && `Brand: ${context.brandName}`,
    `Goal: ${context.goal.replace(/_/g, ' ')} · Funnel: ${context.funnelStage}`,
    context.platforms.length && `Platforms: ${context.platforms.join(', ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return lines.join('\n');
}

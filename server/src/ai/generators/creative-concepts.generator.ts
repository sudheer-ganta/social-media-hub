import { buildCreativeConceptsPrompt } from '../prompts/creative-concepts.prompt';
import type { AiTextProvider } from '../providers';
import type {
  ArtDirectionFamily,
  BrandProfile,
  CreativeConceptScores,
  CreativeConceptsOutcome,
  CreativeMode,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  RawCreativeConceptPayload,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
  ScoredCreativeConcept,
} from '../types';

/**
 * FlowPost's creative director: "what is the advertising idea?", answered
 * with several genuinely different mechanisms before anything is art-
 * directed or rendered. See spec §23 — the image model executes an idea,
 * it does not have one.
 *
 * The quality gate (§18) runs here, in code, not left to the model's word:
 * a concept the model itself scored as weak/generic/off-product is dropped
 * before it ever reaches the user, so the picker only ever shows ideas
 * worth choosing between.
 */

const MODES: CreativeMode[] = [
  'EDITORIAL', 'PLAYFUL', 'SURREAL', 'INTERACTIVE', 'HUMOROUS', 'MINIMAL', 'CULTURAL', 'STORYTELLING', 'VISUAL_METAPHOR', 'EDUCATIONAL',
];

const ART_DIRECTION_FAMILIES: ArtDirectionFamily[] = [
  'EDITORIAL_PHOTOGRAPHY', 'SURREAL_EDITORIAL', 'INTERACTIVE_GRAPHIC', 'TYPOGRAPHY_LED', 'PRODUCT_STUDIO',
  'DOCUMENTARY', 'COLLAGE', 'HANDCRAFTED', 'CINEMATIC', 'MINIMAL_ART', 'PLAYFUL_GRAPHIC', 'CULTURAL_EDITORIAL',
  'INFORMATIONAL', 'ILLUSTRATIVE',
];

function asString(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asMode(value: unknown): CreativeMode {
  const raw = asString(value, 20);
  return (MODES as string[]).includes(raw) ? (raw as CreativeMode) : 'EDITORIAL';
}

// Last-resort fallback for a missing/invalid value only — the real choice
// happens per concept in the model's own response, guided by the prompt's
// mechanism-to-family examples, never by a hardcoded lookup here.
function asArtDirectionFamily(value: unknown): ArtDirectionFamily {
  const raw = asString(value, 30);
  return (ART_DIRECTION_FAMILIES as string[]).includes(raw) ? (raw as ArtDirectionFamily) : 'EDITORIAL_PHOTOGRAPHY';
}

function asScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normaliseScores(raw: RawCreativeConceptPayload['scores']): CreativeConceptScores {
  const s = raw ?? {};
  return {
    conceptStrength: asScore(s.conceptStrength),
    brandSpecificity: asScore(s.brandSpecificity),
    productRelevance: asScore(s.productRelevance),
    visualOriginality: asScore(s.visualOriginality),
    scrollStoppingPotential: asScore(s.scrollStoppingPotential),
    messageClarity: asScore(s.messageClarity),
    socialInteractionPotential: asScore(s.socialInteractionPotential),
    templateRisk: asScore(s.templateRisk),
  };
}

function normaliseConcept(raw: RawCreativeConceptPayload): ScoredCreativeConcept | null {
  const conceptName = asString(raw.conceptName, 80);
  const bigIdea = asString(raw.bigIdea, 300);
  const visualMechanism = asString(raw.visualMechanism, 120);
  if (!conceptName || !bigIdea || !visualMechanism) return null;

  return {
    conceptName,
    bigIdea,
    visualMechanism,
    ...(asString(raw.humanInsight) && { humanInsight: asString(raw.humanInsight) }),
    ...(asString(raw.visualMetaphor) && { visualMetaphor: asString(raw.visualMetaphor) }),
    ...(asString(raw.interaction) && { interaction: asString(raw.interaction) }),
    ...(asString(raw.message, 200) && { message: asString(raw.message, 200) }),
    ...(asString(raw.productRole) && { productRole: asString(raw.productRole) }),
    ...(asString(raw.brandConnection) && { brandConnection: asString(raw.brandConnection) }),
    ...(asString(raw.whyItWouldStopTheScroll, 240) && {
      whyItWouldStopTheScroll: asString(raw.whyItWouldStopTheScroll, 240),
    }),
    mode: asMode(raw.mode),
    artDirectionFamily: asArtDirectionFamily(raw.artDirectionFamily),
    scores: normaliseScores(raw.scores),
  };
}

// Thresholds for spec §18's reject rule. Deliberately in code, not left to
// the model's own judgement about whether ITS scores are good enough —
// a model that just wrote "conceptStrength: 35" should not also decide 35
// passes.
const WEAK_CONCEPT_STRENGTH = 40;
const WEAK_PRODUCT_RELEVANCE = 40;
const HIGH_TEMPLATE_RISK = 70;
const LOW_MESSAGE_CLARITY = 35;

function passesQualityGate(concept: ScoredCreativeConcept): boolean {
  const s = concept.scores;
  if (s.conceptStrength < WEAK_CONCEPT_STRENGTH) return false;
  if (s.productRelevance < WEAK_PRODUCT_RELEVANCE) return false;
  if (s.templateRisk > HIGH_TEMPLATE_RISK) return false;
  if (s.messageClarity < LOW_MESSAGE_CLARITY) return false;
  return true;
}

/** Composite so a single "keep the best one" fallback has one number to sort by. */
function overallScore(concept: ScoredCreativeConcept): number {
  const s = concept.scores;
  return (
    s.conceptStrength +
    s.brandSpecificity +
    s.productRelevance +
    s.visualOriginality +
    s.scrollStoppingPotential +
    s.messageClarity +
    s.socialInteractionPotential +
    (100 - s.templateRisk)
  );
}

export interface GenerateCreativeConceptsOptions {
  provider: AiTextProvider;
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  research?: CreativeResearch;
  /** This brand's last few completed creatives, so the model has something concrete to diverge from instead of "be different" with nothing to compare against. */
  recentSignatures?: RecentCreativeSignature[];
  /** "Show FlowPost what you like" — analysed visual taste from uploaded references, inspiration only. */
  referenceStyle?: ReferenceStyleProfile;
}

function normaliseConcepts(rawConcepts: unknown): ScoredCreativeConcept[] {
  const list = Array.isArray(rawConcepts) ? rawConcepts : [];
  return list
    .map((c) => normaliseConcept(c as RawCreativeConceptPayload))
    .filter((c): c is ScoredCreativeConcept => c !== null);
}

function gateConcepts(normalised: ScoredCreativeConcept[]): ScoredCreativeConcept[] {
  const gated = normalised.filter(passesQualityGate);
  // The gate exists to protect the user from weak ideas, not to leave them
  // with nothing — if every proposal happened to score under the bar, the
  // strongest of a bad batch still beats no batch at all.
  if (gated.length === 0 && normalised.length > 0) {
    return [[...normalised].sort((a, b) => overallScore(b) - overallScore(a))[0]];
  }
  return gated;
}

/** True when 3+ concepts came back but every one picked the same art-direction family — the exact failure mode this feature exists to catch (a set of "different ideas" that would still render as one repeated visual template). */
function isDegenerateFamilySpread(concepts: ScoredCreativeConcept[]): boolean {
  if (concepts.length < 3) return false;
  return new Set(concepts.map((c) => c.artDirectionFamily)).size === 1;
}

export async function generateCreativeConcepts({
  provider,
  request,
  goal,
  funnelStage,
  platforms,
  hasAssets,
  brand,
  creativeDna,
  research,
  recentSignatures,
  referenceStyle,
}: GenerateCreativeConceptsOptions): Promise<CreativeConceptsOutcome> {
  const startedAt = Date.now();

  const built = buildCreativeConceptsPrompt({
    request, goal, funnelStage, platforms, hasAssets, brand, creativeDna, research, recentSignatures, referenceStyle,
  });

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as { concepts?: unknown };

  const normalised = normaliseConcepts(payload.concepts);
  const proposedCount = normalised.length;
  let concepts = gateConcepts(normalised);

  // Concepts can genuinely differ in mechanism and still all get rendered in
  // the same visual language if every one lands in the same art-direction
  // family — the actual bug this feature fixes. One bounded retry with a
  // concrete nudge, same pattern as the direction generator's own retry.
  if (isDegenerateFamilySpread(concepts)) {
    const retryPayload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: `${built.prompt}\n\nYour previous attempt put every concept in the same art-direction family (${concepts[0].artDirectionFamily}) — that renders as one repeated visual template even though the ideas differ. Keep the mechanisms strong, but spread the concepts across genuinely different art-direction families this time.`,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as { concepts?: unknown };
    const retryConcepts = gateConcepts(normaliseConcepts(retryPayload.concepts));
    if (retryConcepts.length > 0) concepts = retryConcepts;
  }

  const durationMs = Date.now() - startedAt;

  console.info('[creative] concepts generated', {
    model: provider.model,
    durationMs,
    proposedCount,
    keptCount: concepts.length,
    mechanisms: concepts.map((c) => c.visualMechanism),
    artDirectionFamilies: concepts.map((c) => c.artDirectionFamily),
  });

  return {
    concepts,
    proposedCount,
    meta: { provider: provider.id, model: provider.model, durationMs },
  };
}

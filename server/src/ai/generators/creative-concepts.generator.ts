import { buildCreativeConceptsPrompt, MECHANISM_FAMILIES } from '../prompts/creative-concepts.prompt';
import { conceptText, evaluateConceptIntentAffordance, claimSatisfied } from '../intent/claim-match';
import { evaluateConceptRealizability, isAbstractOccasionOrTheme, synthesizePhysicalDominantObject } from '../intent/concept-realizability-gate';
import type { AiTextProvider } from '../providers';
import type {
  ArtDirectionFamily,
  BrandProfile,
  ConceptIntent,
  CreativeConceptScores,
  CreativeConceptsOutcome,
  CreativeIntentBrief,
  CreativeMode,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  MechanismFamily,
  RawCreativeConceptPayload,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
  ScoredCreativeConcept,
  VisualRealizationIntent,
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

// Keyword → family, checked in order of specificity. Only ever consulted when
// the model didn't declare a valid mechanismFamily (older wire payloads, a
// dropped field) — the model's own declaration always wins.
const FAMILY_KEYWORDS: Array<[RegExp, MechanismFamily]> = [
  [/puzzle|game|quiz|riddle|spot the|find the|guess|interactiv|solve|optical illusion/, 'INTERACTIVE_PUZZLE'],
  [/wordplay|typograph|letter|pun\b|double meaning|word play/, 'TYPOGRAPHY_WORDPLAY'],
  [/\bscale\b|giant|miniature|oversiz|tiny/, 'SURPRISING_SCALE'],
  [/before.?after|before\/after/, 'BEFORE_AFTER'],
  [/transform/, 'TRANSFORMATION'],
  [/juxtapos|contrast|clash/, 'JUXTAPOSITION'],
  [/surreal|absurd|impossible|dreamlike/, 'ABSURD_SURREAL'],
  [/collage|graphic idea|pattern interrupt|negative space/, 'COLLAGE_GRAPHIC'],
  [/cultural|tradition|festival|local custom/, 'CULTURAL_OBSERVATION'],
  [/documentary|candid|unposed|caught moment/, 'DOCUMENTARY_MOMENT'],
  [/story|narrative|editorial storytelling/, 'STORYTELLING'],
  [/object (substitution|interaction)|prop\b|becomes the/, 'OBJECT_INTERACTION'],
  [/human|observation|relatable|everyday moment|people/, 'HUMAN_OBSERVATIONAL'],
  [/product.as.metaphor|product is the/, 'PRODUCT_AS_METAPHOR'],
  [/metaphor|symboli/, 'VISUAL_METAPHOR'],
];

/** Deterministic fallback classifier — used only when the model didn't declare a family. */
export function classifyMechanismFamily(text: string): MechanismFamily {
  const prose = text.toLowerCase();
  for (const [pattern, family] of FAMILY_KEYWORDS) {
    if (pattern.test(prose)) return family;
  }
  return 'VISUAL_METAPHOR';
}

function asMechanismFamily(value: unknown, fallbackText: string): MechanismFamily {
  const raw = asString(value, 30);
  return (MECHANISM_FAMILIES as readonly string[]).includes(raw)
    ? (raw as MechanismFamily)
    : classifyMechanismFamily(fallbackText);
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
    mechanismNovelty: asScore(s.mechanismNovelty),
    similarityToOtherConcepts: asScore(s.similarityToOtherConcepts),
  };
}

/**
 * Authoritative Canonical Normalization Boundary for concept candidates.
 * Separates ConceptIntent from VisualRealizationIntent and guarantees
 * no occasion contamination of dominantVisualObject.
 */
export function normalizeConceptCandidate(
  raw: RawCreativeConceptPayload | any,
  context?: { occasion?: string; subject?: string; prompt?: string },
): ScoredCreativeConcept | null {
  if (!raw || typeof raw !== 'object') return null;

  const conceptName = asString(raw.conceptName, 80);
  const bigIdea = asString(raw.communicationIdea || raw.bigIdea, 300);
  const visualMechanism = asString(raw.visualMechanism || raw.creativeMechanism, 200);
  if (!conceptName || !bigIdea || !visualMechanism) return null;

  const communicationIdea = bigIdea;
  const creativePremise = asString(raw.creativePremise || raw.bigIdea || raw.humanInsight, 300);
  const creativeMechanism = asString(raw.creativeMechanism || raw.visualMechanism, 200);
  const occasion = asString(raw.occasion || raw.conceptIntent?.occasion || context?.occasion, 100) || undefined;

  // Resolve physical dominantVisualObject:
  // INVARIANT: Never let occasion contaminate dominantVisualObject
  let dominantVisualObject = asString(
    raw.dominantVisualObject ||
    raw.visualRealizationIntent?.dominantVisualObject ||
    raw.heroObject ||
    '',
    200,
  );

  if (!dominantVisualObject) {
    if (conceptName && conceptName.length > 2 && !isAbstractOccasionOrTheme(conceptName)) {
      dominantVisualObject = conceptName;
    } else if (bigIdea && !isAbstractOccasionOrTheme(bigIdea)) {
      dominantVisualObject = bigIdea.slice(0, 100);
    }
  }

  if (dominantVisualObject && isAbstractOccasionOrTheme(dominantVisualObject)) {
    dominantVisualObject = synthesizePhysicalDominantObject(
      dominantVisualObject,
      context?.subject || context?.prompt,
    );
  }

  const hero = raw.hero || raw.visualRealizationIntent?.hero || 'image';
  const imageRole = raw.imageRole || raw.visualRealizationIntent?.imageRole || 'full-bleed';
  const mechanismOwner = raw.mechanismOwner;
  const visualWorld = asString(raw.visualWorld || raw.visualRealizationIntent?.visualWorld, 300);
  const physicalArtifactsSource = raw.physicalArtifacts || raw.visualRealizationIntent?.physicalArtifacts;
  const physicalArtifacts = Array.isArray(physicalArtifactsSource)
    ? physicalArtifactsSource.filter((p: any) => typeof p === 'string')
    : [];
  const compositionMechanism = asString(raw.compositionMechanism || raw.visualRealizationIntent?.compositionMechanism, 200);
  const copyAngle = asString(raw.copyAngle || raw.conceptIntent?.copyAngle, 300);
  const textImageRelationship = asString(raw.textImageRelationship, 100);
  const referenceInsight = asString(raw.referenceInsight || raw.referenceInsights || raw.conceptIntent?.referenceInsight, 200);
  const requiredVisualElementsSource = raw.requiredVisualElements || raw.visualRealizationIntent?.requiredVisualElements;
  const requiredVisualElements = Array.isArray(requiredVisualElementsSource)
    ? requiredVisualElementsSource.filter((p: any) => typeof p === 'string')
    : [];
  const rawProof = raw.requiredVisualProof || raw.visualRealizationIntent?.requiredVisualProof;
  const requiredVisualProof = Array.isArray(rawProof) && rawProof.length > 0
    ? rawProof.filter((p: any) => typeof p === 'string')
    : dominantVisualObject
      ? [dominantVisualObject]
      : [];
  const prohibitedVisualInterpretationsSource =
    raw.prohibitedVisualInterpretations ||
    raw.prohibitedInterpretations ||
    raw.visualRealizationIntent?.prohibitedInterpretations;
  const prohibitedVisualInterpretations = Array.isArray(prohibitedVisualInterpretationsSource)
    ? prohibitedVisualInterpretationsSource.filter((p: any) => typeof p === 'string')
    : [];
  const styleDirection = asString(raw.styleDirection || raw.artDirectionFamily, 100);
  const conceptSpecificity = asScore(raw.conceptSpecificity || raw.conceptIntent?.conceptSpecificity || raw.scores?.conceptStrength);
  const occasionSpecificity = asScore(raw.occasionSpecificity || raw.scores?.brandSpecificity);
  const realizability = asScore(raw.realizability || (100 - (raw.scores?.templateRisk || 0)));

  const conceptIntent: ConceptIntent = {
    ...(occasion ? { occasion } : {}),
    communicationIdea,
    creativePremise,
    creativeMechanism,
    visualMechanism,
    ...(copyAngle ? { copyAngle } : {}),
    ...(referenceInsight ? { referenceInsight } : {}),
    ...(conceptSpecificity ? { conceptSpecificity } : {}),
  };

  const visualRealizationIntent: VisualRealizationIntent = {
    dominantVisualObject,
    hero,
    imageRole,
    visualWorld,
    requiredVisualElements,
    requiredVisualProof,
    prohibitedInterpretations: prohibitedVisualInterpretations,
    physicalArtifacts,
    ...(compositionMechanism ? { compositionMechanism } : {}),
  };

  return {
    conceptName,
    bigIdea,
    communicationIdea,
    creativePremise,
    creativeMechanism,
    visualMechanism,
    mechanismOwner,
    dominantVisualObject,
    hero,
    imageRole,
    visualWorld,
    physicalArtifacts,
    compositionMechanism,
    copyAngle,
    textImageRelationship,
    referenceInsight,
    requiredVisualElements,
    requiredVisualProof,
    prohibitedVisualInterpretations,
    prohibitedInterpretations: prohibitedVisualInterpretations,
    styleDirection,
    conceptSpecificity,
    occasionSpecificity,
    realizability,
    conceptIntent,
    visualRealizationIntent,
    ...(asString(raw.personality) && { personality: asString(raw.personality) as any }),
    ...(raw.referenceInsights && typeof raw.referenceInsights === 'object' && { referenceInsights: raw.referenceInsights }),
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
    mechanismFamily: asMechanismFamily(raw.mechanismFamily, `${visualMechanism} ${bigIdea}`),
    scores: normaliseScores(raw.scores),
  };
}

export const normaliseConcept = normalizeConceptCandidate;

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

/**
 * Scores every concept against the member's hard requirements and drops the
 * ones that lost any of them (spec §1.3) — a clever concept that misses the
 * offer is a bad concept, and must never reach the picker or the image model.
 *
 * Never returns nothing: if every proposal fails, the best-covering ones are
 * kept and their `missingRequirements` travel with them, so the direction
 * stage's repair still guarantees the finished creative carries the claims.
 */
export function gateByIntent(
  concepts: ScoredCreativeConcept[],
  intent?: CreativeIntentBrief,
): ScoredCreativeConcept[] {
  if (!intent?.requiredClaims?.length || concepts.length === 0) return concepts;

  const scored = concepts.map((concept) => {
    const affordance = evaluateConceptIntentAffordance(concept, intent);
    return {
      ...concept,
      intentFidelity: {
        score: affordance.score,
        requiredElementsPresent: (intent.requiredClaims ?? []).filter((c) => claimSatisfied(c, conceptText(concept))),
        missingRequirements: affordance.missingDomainEntities,
      },
    };
  });
  return scored.filter((c) => c.intentFidelity.missingRequirements.length === 0);
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
  /** The member's own hard requirements — every concept is gated against these. */
  intent?: CreativeIntentBrief;
}

function normaliseConcepts(rawConcepts: unknown, context?: { occasion?: string; subject?: string; prompt?: string }): ScoredCreativeConcept[] {
  const list = Array.isArray(rawConcepts) ? rawConcepts : [];
  return list
    .map((c) => normalizeConceptCandidate(c as RawCreativeConceptPayload, context))
    .filter((c): c is ScoredCreativeConcept => c !== null);
}

function gateConcepts(normalised: ScoredCreativeConcept[], intent?: CreativeIntentBrief, prompt?: string): ScoredCreativeConcept[] {
  return normalised
    .filter(passesQualityGate)
    .filter((c) => {
      const assessment = evaluateConceptRealizability({ concept: c, intent, userPrompt: prompt });
      if (assessment.overallDecision === 'REJECT') {
        console.warn('[creative-concepts] concept-rejected-by-realizability-gate', {
          conceptName: c.conceptName,
          failures: assessment.failures,
        });
        return false;
      }
      return true;
    });
}

/** True when 3+ concepts came back but every one picked the same art-direction family — the exact failure mode this feature exists to catch (a set of "different ideas" that would still render as one repeated visual template). */
function isDegenerateFamilySpread(concepts: ScoredCreativeConcept[]): boolean {
  if (concepts.length < 3) return false;
  return new Set(concepts.map((c) => c.artDirectionFamily)).size === 1;
}

// ─── Mechanism diversity ─────────────────────────────────────────────────────
//
// The set-level failure the multi-client tests exposed: three "different"
// concepts that are all the same central device styled three ways (calendar
// metaphor / calendar composition / calendar transformation). Diversity is
// judged on the IDEA axis — mechanismFamily plus a text-overlap check —
// never on palette/typography/layout, which are cosmetic.

/** Two concepts whose distinctive vocabulary overlaps past this are one idea styled twice. */
const TEXT_SIMILARITY_LIMIT = 0.34;
/** A concept that self-reports sitting this close to its set-mates fails the gate. */
const SELF_SIMILARITY_LIMIT = 60;

const SIMILARITY_STOPWORDS = new Set([
  'that', 'with', 'this', 'from', 'into', 'their', 'your', 'over', 'when', 'what', 'then', 'than',
  'they', 'them', 'will', 'each', 'every', 'more', 'most', 'some', 'very', 'just', 'like', 'been',
  'have', 'does', 'where', 'while', 'through', 'about', 'against', 'between', 'becomes', 'because',
  // Campaign-generic vocabulary — shared by every concept for the same brief.
  'campaign', 'product', 'brand', 'concept', 'visual', 'image', 'creative', 'audience', 'viewer',
]);

function distinctiveTokens(concept: ScoredCreativeConcept): Set<string> {
  const text = [concept.conceptName, concept.bigIdea, concept.visualMechanism, concept.visualMetaphor ?? '']
    .join(' ')
    .toLowerCase();
  return new Set(
    (text.match(/[a-z]{4,}/g) ?? []).filter((word) => !SIMILARITY_STOPWORDS.has(word)),
  );
}

/** Jaccard overlap of the two concepts' distinctive vocabulary — 0 (nothing shared) to 1 (same idea). */
export function conceptSimilarity(a: ScoredCreativeConcept, b: ScoredCreativeConcept): number {
  const tokensA = distinctiveTokens(a);
  const tokensB = distinctiveTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / (tokensA.size + tokensB.size - shared);
}

export interface ConceptDiversityReport {
  /** Mechanism families used by more than one concept in the set. */
  duplicatedFamilies: MechanismFamily[];
  /** Pairs whose distinctive vocabulary overlaps past the limit — one idea styled twice. */
  similarPairs: Array<{ a: string; b: string; similarity: number }>;
  /** Concepts that self-reported sitting too close to their set-mates. */
  selfReportedDuplicates: string[];
  /** Everything above plus a degenerate art-direction spread, as one number the retry can compare. */
  violationCount: number;
}

export function evaluateConceptDiversity(concepts: ScoredCreativeConcept[]): ConceptDiversityReport {
  const familyCounts = new Map<MechanismFamily, number>();
  for (const concept of concepts) {
    familyCounts.set(concept.mechanismFamily, (familyCounts.get(concept.mechanismFamily) ?? 0) + 1);
  }
  const duplicatedFamilies = [...familyCounts.entries()].filter(([, n]) => n > 1).map(([f]) => f);

  const similarPairs: ConceptDiversityReport['similarPairs'] = [];
  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = i + 1; j < concepts.length; j += 1) {
      const similarity = conceptSimilarity(concepts[i], concepts[j]);
      if (similarity > TEXT_SIMILARITY_LIMIT) {
        similarPairs.push({ a: concepts[i].conceptName, b: concepts[j].conceptName, similarity: Math.round(similarity * 100) / 100 });
      }
    }
  }

  const selfReportedDuplicates = concepts
    .filter((c) => c.scores.similarityToOtherConcepts > SELF_SIMILARITY_LIMIT)
    .map((c) => c.conceptName);

  return {
    duplicatedFamilies,
    similarPairs,
    selfReportedDuplicates,
    violationCount:
      duplicatedFamilies.length +
      similarPairs.length +
      selfReportedDuplicates.length +
      (isDegenerateFamilySpread(concepts) ? 1 : 0),
  };
}

/**
 * Deterministic last resort after the bounded retry: while MORE than three
 * concepts remain, drop the weakest of any mechanism-family duplicates and of
 * any too-similar pair. Never trims below three — per the priority order,
 * having three quality concepts outranks perfect diversity, so a stubborn
 * three-with-a-duplicate ships (logged) rather than shrinking the set.
 */
export function trimDuplicateMechanisms(concepts: ScoredCreativeConcept[]): ScoredCreativeConcept[] {
  let kept = [...concepts];
  const weakestOf = (a: ScoredCreativeConcept, b: ScoredCreativeConcept) =>
    overallScore(a) <= overallScore(b) ? a : b;

  let changed = true;
  while (changed && kept.length > 3) {
    changed = false;
    const report = evaluateConceptDiversity(kept);
    const duplicatedFamily = report.duplicatedFamilies[0];
    if (duplicatedFamily) {
      const duplicates = kept.filter((c) => c.mechanismFamily === duplicatedFamily);
      const weakest = duplicates.reduce(weakestOf);
      kept = kept.filter((c) => c !== weakest);
      changed = true;
      continue;
    }
    const pair = report.similarPairs[0];
    if (pair) {
      const a = kept.find((c) => c.conceptName === pair.a);
      const b = kept.find((c) => c.conceptName === pair.b);
      if (a && b) {
        const weakest = weakestOf(a, b);
        kept = kept.filter((c) => c !== weakest);
        changed = true;
      }
    }
  }
  return kept;
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
  intent,
}: GenerateCreativeConceptsOptions): Promise<CreativeConceptsOutcome> {
  const startedAt = Date.now();

  const built = buildCreativeConceptsPrompt({
    request, goal, funnelStage, platforms, hasAssets, brand, creativeDna, research, recentSignatures, referenceStyle, intent,
  });

  const occasion = intent?.event || intent?.culturalContext;
  const normContext = { occasion, prompt: request };

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as { concepts?: unknown };
  let attempts = 1;

  const normalised = normaliseConcepts(payload.concepts, normContext);
  const proposedCount = normalised.length;
  let concepts = gateConcepts(normalised, intent, built.prompt);

  // ── Set-diversity gate ── two failure modes, one bounded retry (latency
  // budget: concepts ≤ 3 calls total, same as before this gate existed):
  //  1. every concept in the same art-direction family → one repeated visual
  //     template even when the ideas differ;
  //  2. duplicated mechanism families or one central device styled several
  //     ways ("calendar metaphor / calendar composition / calendar
  //     transformation") → cosmetic variation, not three ideas.
  let diversity = evaluateConceptDiversity(concepts);
  if (concepts.length === 0 || diversity.violationCount > 0) {
    const problems = [
      concepts.length === 0 && 'every proposal failed the quality gate; propose clear, relevant alternatives',
      isDegenerateFamilySpread(concepts) &&
      `every concept picked the same art-direction family (${concepts[0].artDirectionFamily}) — that renders as one repeated visual template`,
      diversity.duplicatedFamilies.length > 0 &&
      `more than one concept uses the ${diversity.duplicatedFamilies.join(' and ')} mechanism family`,
      diversity.similarPairs.length > 0 &&
      `these concepts are one idea styled differently, not different ideas: ${diversity.similarPairs
        .map((pair) => `"${pair.a}" and "${pair.b}"`)
        .join('; ')}`,
      diversity.selfReportedDuplicates.length > 0 &&
      `you scored ${diversity.selfReportedDuplicates.map((name) => `"${name}"`).join(', ')} as sitting too close to the other concepts`,
    ].filter((problem): problem is string => typeof problem === 'string');

    attempts += 1;
    const retryPayload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: `${built.prompt}\n\nYour previous attempt lacked genuine set diversity: ${problems.join('; ')}. Keep the single strongest idea as it is. Replace the overlapping ones with concepts built on genuinely DIFFERENT mechanism families that still fit this brand and brief — different central devices and subjects, not the same device recomposed. The brief's obvious surface image may drive at most ONE concept.`,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as { concepts?: unknown };
    const retryConcepts = gateConcepts(normaliseConcepts(retryPayload.concepts, normContext), intent, built.prompt);
    const retryDiversity = evaluateConceptDiversity(retryConcepts);
    if (retryConcepts.length > 0 && (concepts.length === 0 || retryDiversity.violationCount < diversity.violationCount)) {
      concepts = retryConcepts;
      diversity = retryDiversity;
    }
  }

  // Intent fidelity (spec §1.3): a concept that lost the member's offer/event/
  // product never reaches the picker. One retry, then whatever covers the
  // most — the direction stage repairs the remainder. The retry fires in two
  // cases: kept concepts still MISS a requirement, or the gate silently
  // SHRANK the set below three because most proposals skipped a claim's exact
  // wording — the member should still get a full set of covered ideas.
  const beforeIntentGate = concepts.length;
  concepts = gateByIntent(concepts, intent);
  const dropped = concepts.some((c) => (c.intentFidelity?.missingRequirements.length ?? 0) > 0);
  const shrankBelowThree = concepts.length < Math.min(3, beforeIntentGate);
  if ((concepts.length === 0 || dropped || shrankBelowThree) && intent?.requiredClaims?.length) {
    attempts += 1;
    const keptMissing = [...new Set(concepts.flatMap((c) => c.intentFidelity?.missingRequirements ?? []))];
    const stillMissing = keptMissing.length > 0 ? keptMissing : (intent.requiredClaims ?? []);
    const retryPayload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: `${built.prompt}\n\nYour previous attempt produced concepts that drop requirements the member explicitly stated: ${stillMissing
        .map((claim) => `"${claim}"`)
        .join(', ')}. Ensure every concept provides a compelling, creative vehicle to feature and celebrate the subject matter, while remaining clearly differentiated across communication idea, creative mechanism, and visual world.`,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as { concepts?: unknown };
    const retried = gateByIntent(gateConcepts(normaliseConcepts(retryPayload.concepts, normContext), intent, built.prompt), intent);
    const bestRetried = Math.max(0, ...retried.map((c) => c.intentFidelity?.score ?? 0));
    const bestCurrent = Math.max(0, ...concepts.map((c) => c.intentFidelity?.score ?? 0));
    // A retry wins by covering requirements at least as well — and, when the
    // first pass shrank the set, by actually restoring its size.
    if (retried.length > 0 && bestRetried >= bestCurrent && (!shrankBelowThree || retried.length > concepts.length || bestRetried > bestCurrent)) {
      concepts = retried;
    }
  }

  // Deterministic last resort, AFTER the intent gate so requirement coverage
  // is never traded for diversity (priority: hard requirements > quality >
  // mechanism diversity): with more than three concepts standing, the weaker
  // of any mechanism duplicates is dropped rather than shown.
  concepts = trimDuplicateMechanisms(concepts);
  if (!concepts.length) throw new Error('No concept met the campaign requirements. Please try again.');
  const finalDiversity = evaluateConceptDiversity(concepts);

  const durationMs = Date.now() - startedAt;

  console.info('[creative] concepts generated', {
    model: provider.model,
    durationMs,
    proposedCount,
    keptCount: concepts.length,
    mechanisms: concepts.map((c) => c.visualMechanism),
    mechanismFamilies: concepts.map((c) => c.mechanismFamily),
    artDirectionFamilies: concepts.map((c) => c.artDirectionFamily),
    diversityViolations: finalDiversity.violationCount,
    requiredClaims: intent?.requiredClaims ?? [],
    intentFidelity: concepts.map((c) => c.intentFidelity?.score ?? null),
  });

  return {
    concepts,
    proposedCount,
    meta: { provider: provider.id, model: provider.model, durationMs, attempts },
  };
}

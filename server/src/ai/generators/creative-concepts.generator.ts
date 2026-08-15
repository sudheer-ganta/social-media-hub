import { buildCreativeConceptsPrompt, MECHANISM_FAMILIES } from '../prompts/creative-concepts.prompt';
import { conceptText, evaluateIntentFidelity } from '../intent/claim-match';
import type { AiTextProvider } from '../providers';
import type {
  ArtDirectionFamily,
  BrandProfile,
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
    // Missing self-report reads as 0 ("nothing in common") — absence of the
    // field must never fail a set on its own; the text check below still runs.
    similarityToOtherConcepts: asScore(s.similarityToOtherConcepts),
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
    mechanismFamily: asMechanismFamily(raw.mechanismFamily, `${visualMechanism} ${bigIdea}`),
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
  if (!intent?.requiredClaims.length || concepts.length === 0) return concepts;

  const scored = concepts.map((concept) => ({
    ...concept,
    intentFidelity: evaluateIntentFidelity(intent.requiredClaims, conceptText(concept)),
  }));
  const complete = scored.filter((c) => c.intentFidelity.missingRequirements.length === 0);
  if (complete.length > 0) return complete;

  const best = Math.max(...scored.map((c) => c.intentFidelity.score));
  return scored.filter((c) => c.intentFidelity.score === best);
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

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as { concepts?: unknown };
  let attempts = 1;

  const normalised = normaliseConcepts(payload.concepts);
  const proposedCount = normalised.length;
  let concepts = gateConcepts(normalised);

  // ── Set-diversity gate ── two failure modes, one bounded retry (latency
  // budget: concepts ≤ 3 calls total, same as before this gate existed):
  //  1. every concept in the same art-direction family → one repeated visual
  //     template even when the ideas differ;
  //  2. duplicated mechanism families or one central device styled several
  //     ways ("calendar metaphor / calendar composition / calendar
  //     transformation") → cosmetic variation, not three ideas.
  let diversity = evaluateConceptDiversity(concepts);
  if (diversity.violationCount > 0) {
    const problems = [
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
    const retryConcepts = gateConcepts(normaliseConcepts(retryPayload.concepts));
    const retryDiversity = evaluateConceptDiversity(retryConcepts);
    if (retryConcepts.length > 0 && retryDiversity.violationCount < diversity.violationCount) {
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
  if ((dropped || shrankBelowThree) && intent?.requiredClaims.length) {
    attempts += 1;
    const keptMissing = [...new Set(concepts.flatMap((c) => c.intentFidelity?.missingRequirements ?? []))];
    const stillMissing = keptMissing.length > 0 ? keptMissing : intent.requiredClaims;
    const retryPayload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: `${built.prompt}\n\nYour previous attempt produced concepts that drop requirements the member explicitly stated: ${stillMissing
        .map((claim) => `"${claim}"`)
        .join(', ')}. Every concept must carry ALL of ${intent.requiredClaims
        .map((claim) => `"${claim}"`)
        .join(', ')} — through its bigIdea, message or productRole, in the member's own words. Be as creative as you like about HOW; you have no licence to drop, generalise or substitute any of them. Keep the concepts' mechanisms as different from each other as before.`,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as { concepts?: unknown };
    const retried = gateByIntent(gateConcepts(normaliseConcepts(retryPayload.concepts)), intent);
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

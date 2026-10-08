import type { GraphicDesignConcept, CreativeConcept, ScoredCreativeConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeIntentBrief } from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';

// ---------------------------------------------------------------------------
// 1. Types & Interfaces
// ---------------------------------------------------------------------------

export type MechanismLayerOwner = 'IMAGE' | 'DDE' | 'COPY' | 'HYBRID';

export interface ConceptRealizationAssessment {
  conceptName: string;
  semanticRelevance: number; // 0..100
  occasionFit: boolean;
  dominantVisualValidity: boolean;
  creativeMechanismValidity: boolean;
  mechanismLayerOwner: MechanismLayerOwner;
  mechanismLayerCompatibility: boolean;
  visualProofValidity: boolean;
  imageRealizability: boolean;
  textRelationshipCompatibility: boolean;
  styleCompatibility: boolean;
  distinctiveness: number; // 0..100
  campaignSpecificity: number; // 0..100
  overallDecision: 'PASS' | 'REJECT' | 'REPAIR';
  failures: string[];
  repairedDominantVisualObject?: string;
  repairedRequiredVisualProof?: string[];
  repairedMechanismOwner?: MechanismLayerOwner;
}

export class ConceptRealizationError extends Error {
  constructor(
    message: string,
    public readonly failures: string[] = [],
    public readonly assessment?: ConceptRealizationAssessment,
  ) {
    super(message);
    this.name = 'ConceptRealizationError';
  }
}

// ---------------------------------------------------------------------------
// 2. Semantic Token Taxonomies
// ---------------------------------------------------------------------------

/**
 * Known abstract occasions, cultural holidays, emotional states, and promotional events.
 * These are NEVER valid physical dominant visual objects by themselves.
 */
const OCCASION_AND_ABSTRACT_KEYWORDS = new Set([
  'diwali',
  'deepavali',
  'christmas',
  'xmas',
  'halloween',
  'thanksgiving',
  'ramadan',
  'eid',
  'ganesh chaturthi',
  'ganpati',
  'navratri',
  'durga puja',
  'holi',
  'new year',
  'new year eve',
  'valentine',
  'valentines day',
  'easter',
  'hanukkah',
  'lunar new year',
  'chinese new year',
  'black friday',
  'cyber monday',
  'summer',
  'winter',
  'autumn',
  'fall',
  'spring',
  'monsoon',
  'festive',
  'festivity',
  'celebration',
  'celebratory',
  'holiday',
  'luxury',
  'elegance',
  'happiness',
  'joy',
  'excitement',
  'discount',
  'sale',
  'promotion',
  'brand awareness',
  'special offer',
  'bogo',
]);

/**
 * Concrete physical words that anchor a description in the real world.
 */
const PHYSICAL_OBJECT_ANCHORS = [
  'table', 'dish', 'bowl', 'plate', 'feast', 'food', 'meal', 'spread', 'platter',
  'lamp', 'diya', 'light', 'candle', 'lantern', 'flame', 'oil',
  'fabric', 'silk', 'linen', 'garment', 'dress', 'apparel', 'textile', 'clothing',
  'hands', 'person', 'chef', 'artisan', 'model', 'portrait', 'face',
  'bottle', 'cup', 'glass', 'box', 'package', 'container', 'specimen',
  'paper', 'card', 'cutout', 'texture', 'stone', 'wood', 'ceramic', 'metal',
  'room', 'interior', 'kitchen', 'restaurant', 'dining', 'studio', 'scene',
];

// ---------------------------------------------------------------------------
// 3. Evaluation Helpers
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a string represents an abstract occasion rather than a physical object.
 */
export function isAbstractOccasionOrTheme(text: string): boolean {
  if (!text || typeof text !== 'string' || !text.trim()) return false;
  const clean = text.trim().toLowerCase().replace(/['’]/g, '');
  if (OCCASION_AND_ABSTRACT_KEYWORDS.has(clean)) return true;

  // Multi-word matches (e.g. "Diwali celebration", "Christmas festival", "Valentine's Day")
  const tokens = clean.split(/\s+/);
  if (tokens.length <= 3 && tokens.every((t) => OCCASION_AND_ABSTRACT_KEYWORDS.has(t))) {
    return true;
  }
  // If all tokens are abstract keywords or connectors
  if (tokens.every((t) => OCCASION_AND_ABSTRACT_KEYWORDS.has(t) || ['and', '&', 'of', 'the', 'for', 'day'].includes(t))) {
    return true;
  }
  return false;
}

/**
 * Checks if a string contains concrete physical anchors.
 */
export function containsPhysicalVisualAnchor(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const clean = text.toLowerCase();
  return PHYSICAL_OBJECT_ANCHORS.some((anchor) => clean.includes(anchor));
}

/**
 * Classifies the layer owner of a creative mechanism.
 */
export function classifyMechanismOwner(
  mechanism: string,
  hero?: string,
  typeBehavior?: string,
): MechanismLayerOwner {
  const m = (mechanism || '').toLowerCase();
  const tb = (typeBehavior || '').toLowerCase();
  const h = (hero || '').toLowerCase();

  const isTypoDde =
    m.includes('typography') ||
    m.includes('typographic') ||
    m.includes('letterform') ||
    m.includes('headline scale') ||
    m.includes('scale contrast') ||
    m.includes('editorial hierarchy') ||
    m.includes('wordplay') ||
    tb.includes('editorial anchor') ||
    tb.includes('typography led') ||
    h === 'typography';

  const isImagePhysical =
    m.includes('specimen') ||
    m.includes('botanical') ||
    m.includes('macro') ||
    m.includes('light') ||
    m.includes('shadow') ||
    m.includes('boundary') ||
    m.includes('paper-cutout') ||
    m.includes('collage') ||
    m.includes('feast') ||
    m.includes('food') ||
    m.includes('photographic') ||
    m.includes('material') ||
    m.includes('tactile') ||
    m.includes('texture') ||
    m.includes('silk') ||
    m.includes('imagery') ||
    m.includes('inside') ||
    m.includes('documentary');

  const isCopyMechanism =
    m.includes('headline transformation') ||
    m.includes('unexpected copy') ||
    m.includes('rhyme') ||
    m.includes('pun') ||
    m.includes('copy punchline');

  if (isTypoDde && isImagePhysical) return 'HYBRID';
  if (isTypoDde) return 'DDE';
  if (isCopyMechanism) return 'COPY';
  return 'IMAGE';
}

/**
 * Repairs an abstract dominant visual object into a concrete, observable physical scene.
 */
export function synthesizePhysicalDominantObject(
  occasionOrSubject: string,
  briefSubjectOrBrief?: string | any,
  brandCategory?: string,
): string {
  const occ = (occasionOrSubject || '').toLowerCase();
  let subj = '';
  if (typeof briefSubjectOrBrief === 'string') {
    subj = briefSubjectOrBrief.toLowerCase();
  } else if (briefSubjectOrBrief && typeof briefSubjectOrBrief === 'object') {
    subj = `${briefSubjectOrBrief.subject || ''} ${briefSubjectOrBrief.businessType || ''} ${briefSubjectOrBrief.topic || ''} ${briefSubjectOrBrief.industry || ''}`.toLowerCase();
  }
  const cat = (brandCategory || '').toLowerCase();

  if (occ.includes('diwali') || occ.includes('deepavali')) {
    if (subj.includes('food') || subj.includes('restaurant') || cat.includes('restaurant') || cat.includes('food') || subj.includes('dining')) {
      return 'warm lamp-lit Asian dining spread surrounded by glowing traditional oil lamps';
    }
    if (subj.includes('fashion') || subj.includes('jewelry') || cat.includes('fashion')) {
      return 'festive celebratory portrait with rich silk textures and warm ambient candlelight';
    }
    return 'festively staged celebratory setting illuminated by warm glowing oil lamps and traditional decorations';
  }

  if (occ.includes('ganesh') || occ.includes('ganpati')) {
    if (subj.includes('fashion') || cat.includes('fashion')) {
      return 'traditional festive garment styling staged with marigold floral accents and warm ceremonial lighting';
    }
    return 'festive celebratory feast with traditional brass thalis and floral accents';
  }

  if (occ.includes('christmas') || occ.includes('xmas')) {
    return 'festive celebratory table setting with pine, warm candlelight, and seasonal culinary spread';
  }

  if (typeof briefSubjectOrBrief === 'string' && briefSubjectOrBrief.trim() && !isAbstractOccasionOrTheme(briefSubjectOrBrief)) {
    return `${briefSubjectOrBrief.trim()} staged in an authentic physical composition`;
  } else if (briefSubjectOrBrief && typeof briefSubjectOrBrief === 'object' && briefSubjectOrBrief.subject && !isAbstractOccasionOrTheme(briefSubjectOrBrief.subject)) {
    return `${String(briefSubjectOrBrief.subject).trim()} staged in an authentic physical composition`;
  }

  return 'authentic physical subject staged in clear, balanced lighting';
}

/**
 * Normalizes and verifies that visual proof statements describe observable physical phenomena.
 */
export function normalizeVisualProofStatement(
  proof: string,
  occasion?: string,
  subject?: string,
): { valid: boolean; normalized: string; rejectionReason?: string } {
  const p = proof.trim();
  if (!p) {
    return { valid: false, normalized: '', rejectionReason: 'Empty visual proof item' };
  }

  if (isAbstractOccasionOrTheme(p)) {
    // Convert abstract keyword to observable proof
    if (p.toLowerCase().includes('diwali')) {
      return {
        valid: true,
        normalized: 'warm oil lamps and festive celebratory lighting visibly illuminating the scene',
      };
    }
    if (p.toLowerCase().includes('festiv')) {
      return {
        valid: true,
        normalized: 'visible festive celebratory details and atmospheric ambient illumination',
      };
    }
    return {
      valid: false,
      normalized: p,
      rejectionReason: `Abstract non-observable term "${p}" cannot serve as physical visual proof.`,
    };
  }

  return { valid: true, normalized: p };
}

/**
 * Known pure visual style or descriptive lighting patterns.
 * Concepts must be creative premises, never pure style descriptors.
 */
const PURE_STYLE_OR_DESCRIPTIVE_PATTERNS: RegExp[] = [
  /^(architecture of )?golden light$/i,
  /^dramatic lighting$/i,
  /^cinematic( luxury)?$/i,
  /^minimal( editorial)?$/i,
  /^warm festive (food )?photography$/i,
  /^premium [a-z0-9\s]+ dining$/i,
  /^luxury [a-z0-9\s]+$/i,
  /^editorial photography$/i,
  /^cinematic lighting$/i,
  /^moody lighting$/i,
  /^festive food photography$/i,
];

/**
 * Known pure DDE layout/typography technique patterns.
 * Concepts must exist independently of typography.
 */
const PURE_DDE_TECHNIQUE_PATTERNS: RegExp[] = [
  /^luminous typography$/i,
  /^typographic scale contrast$/i,
  /^font pairing/i,
  /^asymmetric( layout| grid)?$/i,
  /^typographic contrast$/i,
  /^scrim (overlay|treatment)$/i,
];

export function isPureStyleConcept(name: string, mechanism: string = ''): boolean {
  const n = (name || '').trim();
  const m = (mechanism || '').trim();
  for (const pattern of PURE_STYLE_OR_DESCRIPTIVE_PATTERNS) {
    if (pattern.test(n) || pattern.test(m)) return true;
  }
  return false;
}

export function isPureDdeTechniqueConcept(name: string, mechanism: string = ''): boolean {
  const n = (name || '').trim().toLowerCase();
  const m = (mechanism || '').trim().toLowerCase();
  for (const pattern of PURE_DDE_TECHNIQUE_PATTERNS) {
    if (pattern.test(n) || pattern.test(m)) return true;
  }
  if (n === 'luminous typography' || m === 'typographic scale contrast') return true;
  return false;
}

// ---------------------------------------------------------------------------
// 4. Canonical Concept Realizability Evaluator
// ---------------------------------------------------------------------------

export interface EvaluateConceptRealizabilityOptions {
  concept: GraphicDesignConcept | ScoredCreativeConcept | CreativeConcept | any;
  brief?: CreativeBrief | any;
  intent?: CreativeIntentBrief | any;
  styleDna?: ResolvedStyleDNA;
  brandCategory?: string;
  userPrompt?: string;
}

const COMMON_WORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'will', 'into', 'about', 'their', 'there', 'where', 'which',
  'would', 'could', 'should', 'being', 'been', 'than', 'then', 'them', 'they', 'what', 'when', 'more', 'most',
  'some', 'such', 'only', 'also', 'over', 'under', 'every', 'each', 'other', 'these', 'those', 'while', 'after',
  'before', 'between', 'around', 'through', 'create', 'post', 'promote', 'announce', 'announcing', 'campaign',
]);

/** The words of a text that say something: four letters or more, and not an everyday connective. */
function distinctiveWords(text: string): string[] {
  return [...new Set(
    text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4 && !COMMON_WORDS.has(word)),
  )];
}

/** The same word allowing for plurals and endings: "shoes" and "shoe", "launching" and "launch". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const stem = (word: string) => word.replace(/(?:ing|ed|es|s)$/, '');
  const [x, y] = [stem(a), stem(b)];
  return x.length >= 3 && y.length >= 3 && (x === y || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5)));
}

export function evaluateConceptRealizability(
  optionsOrConcept: EvaluateConceptRealizabilityOptions | GraphicDesignConcept | ScoredCreativeConcept | CreativeConcept | any,
  maybeBrief?: any,
  maybeIntent?: any,
  maybeUserPrompt?: string,
): ConceptRealizationAssessment {
  let concept: any;
  let brief: any;
  let intent: any;
  let styleDna: any;
  let brandCategory: string | undefined;
  let userPrompt: string | undefined;

  if (optionsOrConcept && typeof optionsOrConcept === 'object' && 'concept' in optionsOrConcept) {
    concept = optionsOrConcept.concept;
    brief = optionsOrConcept.brief;
    intent = optionsOrConcept.intent;
    styleDna = optionsOrConcept.styleDna;
    brandCategory = optionsOrConcept.brandCategory;
    userPrompt = optionsOrConcept.userPrompt;
  } else {
    concept = optionsOrConcept;
    brief = maybeBrief;
    intent = maybeIntent;
    userPrompt = maybeUserPrompt;
  }

  const conceptName = (concept as any)?.conceptName || (concept as any)?.name || 'Unnamed Concept';
  const creativeMechanism = (concept as any)?.creativeMechanism || (concept as any)?.visualMechanism || (concept as any)?.bigIdea || '';
  const effectiveMechanism =
    creativeMechanism ||
    (concept as any)?.visualIdea ||
    (concept as any)?.typographyStrategy ||
    conceptName ||
    '';
  let dominantVisualObject =
    (concept as any)?.dominantVisualObject ||
    (concept as any)?.visualRealizationIntent?.dominantVisualObject ||
    (concept as any)?.subject ||
    '';

  if (!dominantVisualObject && (brief as any)?.chosenConcept?.dominantVisualObject) {
    dominantVisualObject = (brief as any).chosenConcept.dominantVisualObject;
  }
  if (!dominantVisualObject && (brief as any)?.chosenConcept?.visualRealizationIntent?.dominantVisualObject) {
    dominantVisualObject = (brief as any).chosenConcept.visualRealizationIntent.dominantVisualObject;
  }
  if (!dominantVisualObject && brief?.subject && !isAbstractOccasionOrTheme(brief.subject)) {
    dominantVisualObject = brief.subject;
  }

  if (!dominantVisualObject && conceptName && conceptName.length > 2 && conceptName !== 'Unnamed Concept' && !isAbstractOccasionOrTheme(conceptName)) {
    dominantVisualObject = conceptName;
  }
  if (!dominantVisualObject && (concept as any)?.bigIdea && !isAbstractOccasionOrTheme((concept as any).bigIdea)) {
    dominantVisualObject = (concept as any).bigIdea;
  }
  if (!dominantVisualObject && (concept as any)?.creativePremise && !isAbstractOccasionOrTheme((concept as any).creativePremise)) {
    dominantVisualObject = (concept as any).creativePremise;
  }
  if (!dominantVisualObject && (concept as any)?.communicationIdea && !isAbstractOccasionOrTheme((concept as any).communicationIdea)) {
    dominantVisualObject = (concept as any).communicationIdea;
  }

  const hero = (concept as any)?.hero || 'image';
  const typeBehavior = (concept as any)?.typeBehavior || '';
  const declaredOwner = (concept as any)?.mechanismOwner as MechanismLayerOwner | undefined;

  const imageRole = (concept as any)?.imageRole || '';
  const isNoImage =
    imageRole === 'no-image' ||
    imageRole === 'omitted' ||
    imageRole === 'none' ||
    (concept as any)?.visualPlacement === 'none';

  const failures: string[] = [];
  let repairedDominantVisualObject: string | undefined;
  let repairedMechanismOwner: MechanismLayerOwner | undefined;
  const repairedRequiredVisualProof: string[] = [];

  // Extract occasion and domain context across all brief formats
  const occasionName =
    intent?.event ||
    intent?.culturalContext ||
    brief?.event ||
    brief?.occasion ||
    (brief as any)?.topic ||
    '';

  const combinedBriefContext = `${userPrompt || ''} ${brief?.userPrompt || ''} ${brief?.subject || ''} ${brief?.businessType || ''} ${brief?.industry || ''} ${(brief as any)?.topic || ''} ${occasionName}`.toLowerCase();

  // 1. Dominant visual object validation (Invariant: NEVER treat occasion as physical object)
  const isDominantOccasion = !isNoImage && isAbstractOccasionOrTheme(dominantVisualObject);
  let dominantVisualValidity = isNoImage || (!isDominantOccasion && dominantVisualObject.trim().length > 2);

  if (!isNoImage && (isDominantOccasion || !dominantVisualObject.trim())) {
    if (isDominantOccasion) {
      failures.push(
        `DOMINANT_OBJECT_OCCASION_VIOLATION: Dominant visual object "${dominantVisualObject}" is an abstract occasion/event, not a physical renderable object.`
      );
    }
    repairedDominantVisualObject = synthesizePhysicalDominantObject(
      dominantVisualObject || occasionName || 'festive',
      brief?.subject || (brief as any)?.businessType || userPrompt || (brief as any)?.topic,
      brandCategory || brief?.brandVoice?.tone || (brief as any)?.brandTone
    );
  }

  const effectiveDominantVisualObject = repairedDominantVisualObject || dominantVisualObject;
  if (!isNoImage && !effectiveDominantVisualObject) {
    failures.push(`DOMINANT_OBJECT_MISSING: Concept lacks a concrete physical dominantVisualObject.`);
    dominantVisualValidity = false;
  }

  // 2. Mechanism Layer Ownership & Compatibility
  const classifiedOwner = isNoImage ? 'DDE' : classifyMechanismOwner(effectiveMechanism, hero, typeBehavior);
  const mechanismOwner = declaredOwner || classifiedOwner;
  repairedMechanismOwner = mechanismOwner;
  let mechanismLayerCompatibility = true;

  // Invariant 4 & 14: Base image generation is wordless. Typography mechanisms cannot be owned by IMAGE
  if (mechanismOwner === 'IMAGE') {
    const isTypoMechanism =
      effectiveMechanism.toLowerCase().includes('typo') ||
      effectiveMechanism.toLowerCase().includes('scale contrast') ||
      effectiveMechanism.toLowerCase().includes('typeset') ||
      effectiveMechanism.toLowerCase().includes('headline transformation') ||
      effectiveMechanism.toLowerCase().includes('text elements');

    if (isTypoMechanism) {
      mechanismLayerCompatibility = false;
      failures.push(
        `MECHANISM_LAYER_CONTRADICTION: Concept demands typographic mechanism from wordless base image generator. Mechanism must be owned by DDE or HYBRID.`
      );
      repairedMechanismOwner = 'DDE';
    }
  }

  // Invariant 24.1: CONCEPT ≠ STYLE
  const isStyleOnly = isPureStyleConcept(conceptName, effectiveMechanism);
  if (isStyleOnly) {
    failures.push(
      `CONCEPT_IS_MERE_STYLE: Concept "${conceptName}" is a visual style or lighting treatment, not a distinct creative premise.`
    );
  }

  // Invariant 24.2: CONCEPT ≠ DDE TECHNIQUE
  const isDdeOnly = isPureDdeTechniqueConcept(conceptName, effectiveMechanism);
  if (isDdeOnly) {
    failures.push(
      `CONCEPT_IS_DDE_TECHNIQUE: Concept "${conceptName}" is a downstream typography/layout technique, not an independent creative premise.`
    );
  }

  const creativeMechanismValidity = effectiveMechanism.trim().length > 3 && mechanismLayerCompatibility && !isStyleOnly && !isDdeOnly;
  if (effectiveMechanism.trim().length <= 3) {
    failures.push(`CREATIVE_MECHANISM_INVALID: Creative mechanism "${effectiveMechanism}" is too vague or missing.`);
  }

  // 3. Visual Proof Validity
  const rawProofs: string[] = Array.isArray((concept as any)?.requiredVisualProof)
    ? (concept as any).requiredVisualProof
    : [];
  let visualProofValidity = true;

  if (isNoImage) {
    visualProofValidity = true;
  } else if (rawProofs.length === 0) {
    if (effectiveDominantVisualObject && effectiveDominantVisualObject.trim().length > 2) {
      repairedRequiredVisualProof.push(effectiveDominantVisualObject.trim());
      visualProofValidity = true;
    } else {
      failures.push(`VISUAL_PROOF_MISSING: Concept must specify at least one observable required visual proof item.`);
      visualProofValidity = false;
    }
  } else {
    for (const rawProof of rawProofs) {
      const proofEval = normalizeVisualProofStatement(
        rawProof,
        occasionName,
        brief?.subject || (brief as any)?.businessType || userPrompt
      );
      if (!proofEval.valid) {
        visualProofValidity = false;
        failures.push(`UNVERIFIABLE_VISUAL_PROOF: ${proofEval.rejectionReason}`);
      } else {
        repairedRequiredVisualProof.push(proofEval.normalized);
      }
    }
  }

  if (!isNoImage && repairedDominantVisualObject && !repairedRequiredVisualProof.length) {
    repairedRequiredVisualProof.push(repairedDominantVisualObject);
  }

  // 4. Semantic Relevance & Campaign Domain Fit
  const conceptProse = `${conceptName} ${creativeMechanism} ${(concept as any)?.bigIdea || ''} ${(concept as any)?.visualWorld || ''} ${dominantVisualObject}`.toLowerCase();

  let semanticRelevance = 80;
  if (
    combinedBriefContext.includes('restaurant') ||
    combinedBriefContext.includes('food') ||
    combinedBriefContext.includes('dining')
  ) {
    const mentionsFood =
      conceptProse.includes('food') ||
      conceptProse.includes('dish') ||
      conceptProse.includes('dining') ||
      conceptProse.includes('meal') ||
      conceptProse.includes('table') ||
      conceptProse.includes('culinary') ||
      conceptProse.includes('kitchen') ||
      conceptProse.includes('noodle') ||
      conceptProse.includes('feast') ||
      conceptProse.includes('plate') ||
      conceptProse.includes('bowl') ||
      conceptProse.includes('spice') ||
      conceptProse.includes('ramen') ||
      conceptProse.includes('restaurant');

    // A concept that picks up the member's own words is on-brief whatever it is about. A
    // launch party at a cafe with live acoustic music is rightly about the music, and a fixed
    // list of food words rejected every such concept ("no semantic connection to food").
    const briefWords = distinctiveWords(`${combinedBriefContext} ${(intent?.requiredClaims ?? []).join(' ')}`);
    const conceptWords = distinctiveWords(conceptProse);
    const usesTheirWords = briefWords.some((word) => conceptWords.some((other) => sameWord(word, other)));

    if (!mentionsFood && !usesTheirWords) {
      semanticRelevance = 20;
      failures.push(
        `DOMAIN_RELEVANCE_MISMATCH: Concept has no semantic connection to food, dining, or restaurant domain requested in brief.`
      );
    }
  }

  // 5. Occasion Fit
  let occasionFit = true;
  if (occasionName) {
    const occLower = occasionName.toLowerCase();
    if (occLower.includes('diwali')) {
      const hasDiwaliResonance =
        conceptProse.includes('diwali') ||
        conceptProse.includes('lamp') ||
        conceptProse.includes('light') ||
        conceptProse.includes('diya') ||
        conceptProse.includes('festiv') ||
        conceptProse.includes('celebrat') ||
        conceptProse.includes('warm') ||
        conceptProse.includes('lantern') ||
        conceptProse.includes('golden') ||
        conceptProse.includes('illum');
      if (!hasDiwaliResonance) {
        occasionFit = false;
        failures.push(`OCCASION_FIT_FAILURE: Concept does not reflect the cultural occasion "${occasionName}".`);
      }
    } else if (occLower.includes('ganesh')) {
      const hasGaneshResonance =
        conceptProse.includes('ganesh') ||
        conceptProse.includes('modak') ||
        conceptProse.includes('festiv') ||
        conceptProse.includes('celebrat') ||
        conceptProse.includes('traditional') ||
        conceptProse.includes('devotion') ||
        conceptProse.includes('marigold') ||
        conceptProse.includes('auspicious');
      if (!hasGaneshResonance) {
        occasionFit = false;
        failures.push(`OCCASION_FIT_FAILURE: Concept does not reflect the cultural occasion "${occasionName}".`);
      }
    }
  }

  // 6. Distinctiveness & Campaign Specificity
  const distinctiveness = Math.min(100, Math.max(20, (concept as any)?.scores?.visualOriginality || 85));
  const campaignSpecificity = Math.min(100, Math.max(20, semanticRelevance));

  // 7. Image Realizability & Text Relationship Compatibility
  const imageRealizability = dominantVisualValidity && creativeMechanismValidity && visualProofValidity;
  const textRelationshipCompatibility = true;
  const styleCompatibility = true;

  // Hard failures force REJECT
  const hasHardFailure =
    !dominantVisualValidity ||
    !mechanismLayerCompatibility ||
    !creativeMechanismValidity ||
    !visualProofValidity ||
    semanticRelevance < 40 ||
    !occasionFit;

  const overallDecision =
    failures.length === 0
      ? 'PASS'
      : hasHardFailure
        ? 'REJECT'
        : 'REPAIR';

  return {
    conceptName,
    semanticRelevance,
    occasionFit,
    dominantVisualValidity,
    creativeMechanismValidity,
    mechanismLayerOwner: mechanismOwner,
    mechanismLayerCompatibility,
    visualProofValidity,
    imageRealizability,
    textRelationshipCompatibility,
    styleCompatibility,
    distinctiveness,
    campaignSpecificity,
    overallDecision,
    failures,
    repairedDominantVisualObject,
    repairedRequiredVisualProof: repairedRequiredVisualProof.length ? repairedRequiredVisualProof : undefined,
    repairedMechanismOwner,
  };
}

// ---------------------------------------------------------------------------
// 5. Assertions & Fallback Revalidation
// ---------------------------------------------------------------------------

/**
 * Asserts that a concept is physically and semantically realizable before image generation.
 * Fails closed if hard contradictions exist.
 */
export function assertConceptRealizable(
  optionsOrConcept: EvaluateConceptRealizabilityOptions | GraphicDesignConcept | ScoredCreativeConcept | CreativeConcept | any,
  maybeBrief?: CreativeBrief | any,
  maybeIntent?: CreativeIntentBrief | any,
  maybeUserPrompt?: string,
): void {
  const assessment = evaluateConceptRealizability(optionsOrConcept, maybeBrief, maybeIntent, maybeUserPrompt);

  if (assessment.overallDecision === 'REJECT') {
    throw new ConceptRealizationError(
      `Concept "${assessment.conceptName}" failed realizability gate: ${assessment.failures.join('; ')}`,
      assessment.failures,
      assessment,
    );
  }
}

/**
 * Revalidates a fallback concept candidate against current brief and realization constraints.
 * Never allows shallow fallbacks (e.g. unrelated concepts) to enter generation.
 */
export function isEligibleFallback(
  optionsOrCandidate: EvaluateConceptRealizabilityOptions | GraphicDesignConcept | ScoredCreativeConcept | CreativeConcept | any,
  maybeBrief?: CreativeBrief | any,
  maybeIntent?: CreativeIntentBrief | any,
  maybeUserPrompt?: string,
): { eligible: boolean; assessment: ConceptRealizationAssessment; rejectionReason?: string } {
  const assessment = evaluateConceptRealizability(
    optionsOrCandidate,
    maybeBrief,
    maybeIntent,
    maybeUserPrompt,
  );

  if (assessment.overallDecision === 'REJECT' || assessment.semanticRelevance < 50 || !assessment.occasionFit) {
    const reason = assessment.failures.join('; ') || 'Concept does not satisfy campaign domain or occasion relevance.';
    return { eligible: false, assessment, rejectionReason: reason };
  }

  return { eligible: true, assessment };
}

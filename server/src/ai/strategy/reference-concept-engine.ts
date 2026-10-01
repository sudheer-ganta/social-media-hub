import type {
  ReferenceAwareConcept,
  ReferenceDeviceAbstraction,
  ReferenceSourceType,
  CreativePersonality,
  CreativeRealizationPlan,
} from '../types';
import type { CreativeBrief } from '../brand/creative-brief';

/**
 * Reference-Aware Concept Engine & Multi-Dimensional Differentiation Tester.
 *
 * Implements the Reference Abstraction Model:
 *   REFERENCE -> ABSTRACT CREATIVE DEVICE -> ADAPT TO BRAND -> ORIGINAL CONCEPT
 *
 * Never copies source works (no exact poster layouts, copyrighted taglines, or living artist styles).
 * Guarantees that sibling concepts differ materially across ideas, mechanisms, visual worlds, heroes, and copy angles.
 */

export interface ConceptDifferentiationPairReport {
  conceptA: string;
  conceptB: string;
  similarityScore: number; // 0.0 to 1.0
  isDifferentiated: boolean;
  convergedDimensions: string[];
  divergentDimensions: string[];
  rationale: string;
}

export interface ConceptDifferentiationReport {
  overallDivergenceScore: number; // 0.0 to 1.0 (1.0 = highly distinct)
  isPoolDifferentiated: boolean;
  pairReports: ConceptDifferentiationPairReport[];
  convergenceWarnings: string[];
  mustRegenerate: boolean;
}

export interface ConceptCopyPackage {
  communicationAngle: string;
  hook: string;
  headline: string;
  support: string;
  cta: string;
  creativePersonality?: CreativePersonality;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'their', 'about',
  'into', 'over', 'more', 'most', 'some', 'very', 'just', 'like', 'been', 'have',
  'does', 'where', 'while', 'through', 'brand', 'product', 'campaign', 'visual', 'image',
]);

function extractKeywords(text: string): Set<string> {
  const words = (text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Abstract a cultural, cinematic, meme, or editorial reference into a reusable creative device.
 */
export function abstractReferenceDevice(input: {
  referenceName?: string;
  sourceType?: ReferenceSourceType;
  rawText?: string;
  targetBrand?: string;
  productCategory?: string;
}): ReferenceDeviceAbstraction {
  const text = `${input.referenceName || ''} ${input.rawText || ''}`.toLowerCase();
  let sourceType: ReferenceSourceType = input.sourceType || 'cultural-moment';

  if (text.includes('movie') || text.includes('film') || text.includes('cinema') || text.includes('wes anderson') || text.includes('tarantino')) {
    sourceType = 'film-cinematic';
  } else if (text.includes('meme') || text.includes('viral') || text.includes('tiktok') || text.includes('tweet') || text.includes('internet')) {
    sourceType = 'internet-culture';
  } else if (text.includes('documentary') || text.includes('candid') || text.includes('archive') || text.includes('specimen') || text.includes('botanical')) {
    sourceType = 'documentary-format';
  } else if (text.includes('comedy') || text.includes('satire') || text.includes('humor') || text.includes('irony') || text.includes('deadpan')) {
    sourceType = 'observational-comedy';
  } else if (text.includes('editorial') || text.includes('vogue') || text.includes('magazine') || text.includes('poster')) {
    sourceType = 'tv-editorial';
  }

  let creativeDevice = 'Tactile material contrast';
  let narrativeDevice = 'Comparative moment-to-moment transformation';
  let visualMechanism = 'Physical material layering and dimensional depth';
  let compositionMechanism = 'Asymmetric editorial tension with generous negative space';
  let copyMechanism = 'Deadpan observation leading to concise conviction';
  let emotionalEffect = 'Genuine human curiosity and authentic delight';
  let culturalSignal = 'Discerning appreciation for craft and heritage';

  if (sourceType === 'film-cinematic') {
    creativeDevice = 'Cinematic environmental threshold';
    narrativeDevice = 'Unresolved cinematic tension awaiting resolution';
    visualMechanism = 'Directional chiaroscuro lighting across architectural surfaces';
    compositionMechanism = 'Wide anamorphic framing with deep spatial perspective';
    copyMechanism = 'Single atmospheric line carrying narrative weight';
    emotionalEffect = 'Immersive cinematic transport';
    culturalSignal = 'Auteur film framing';
  } else if (sourceType === 'internet-culture') {
    creativeDevice = 'Self-aware observational hook';
    narrativeDevice = 'Subverted expectation';
    visualMechanism = 'High-contrast graphic specimen focus';
    compositionMechanism = 'Immediate focal punch with clean breathing margins';
    copyMechanism = 'Punchy observational truth';
    emotionalEffect = 'Instant scroll-stopping recognition and shareability';
    culturalSignal = 'Native digital literacy';
  } else if (sourceType === 'documentary-format') {
    creativeDevice = 'Archival specimen documentation';
    narrativeDevice = 'Uncovered historical artifact / botanical catalogue';
    visualMechanism = 'Physical paper substrate with pressed botanical specimens and catalog label';
    compositionMechanism = 'Herbarium-inspired specimen arrangement on linen ground';
    copyMechanism = 'Curator accession notes and verified provenance';
    emotionalEffect = 'Authentic archival reverence and tactile memory';
    culturalSignal = 'Heritage artisanal scholarship';
  } else if (sourceType === 'observational-comedy') {
    creativeDevice = 'Deadpan literalism';
    narrativeDevice = 'Understated irony contrasting with high visual craft';
    visualMechanism = 'Immaculately composed object juxtaposition';
    compositionMechanism = 'Rigorous photographic precision framing an unexpected subject';
    copyMechanism = 'Understated punchline with zero marketing hype';
    emotionalEffect = 'Intellectual wit and genuine smirk';
    culturalSignal = 'Self-confident comedic restraint';
  }

  return {
    sourceType,
    creativeDevice,
    narrativeDevice,
    visualMechanism,
    compositionMechanism,
    copyMechanism,
    emotionalEffect,
    culturalSignal,
    freshness: 92,
    brandApplicability: `Seamlessly grounds ${input.targetBrand || 'the brand'} within authentic ${sourceType} grammar without parody.`,
  };
}

/**
 * Builds a ReferenceAwareConcept from standard concept properties.
 */
export function buildReferenceAwareConcept(options: {
  conceptId?: string;
  conceptName: string;
  communicationIdea: string;
  creativeMechanism: string;
  visualMechanism: string;
  hero?: 'typography' | 'image' | 'graphic-element' | 'whitespace' | 'texture';
  imageRole?: string;
  visualWorld?: string;
  copyAngle?: string;
  referenceInsights?: ReferenceDeviceAbstraction;
  textImageRelationship?: string;
  requiredVisualProof?: string[];
  prohibitedInterpretations?: string[];
  styleDirection?: string;
  creativePersonality?: CreativePersonality;
  mode?: any;
  artDirectionFamily?: any;
  mechanismFamily?: any;
  scores?: any;
}): ReferenceAwareConcept {
  const visualMechanism = options.visualMechanism || options.creativeMechanism || 'Visual hero expression';
  const hero = options.hero || 'image';
  const visualWorld = options.visualWorld || `${options.conceptName} visual world with authentic material texture`;
  const copyAngle = options.copyAngle || options.communicationIdea;

  return {
    conceptId: options.conceptId || `concept-${Math.random().toString(36).slice(2, 9)}`,
    conceptName: options.conceptName,
    bigIdea: options.communicationIdea,
    communicationIdea: options.communicationIdea,
    creativeMechanism: options.creativeMechanism,
    visualMechanism,
    hero,
    imageRole: options.imageRole || 'full-bleed',
    visualWorld,
    copyAngle,
    referenceInsights: options.referenceInsights,
    textImageRelationship: options.textImageRelationship || 'OVERLAY_INTENTIONAL',
    requiredVisualProof: options.requiredVisualProof || [
      'Authentic physical material surfaces with believable light interaction',
      'Focal subject rendered with crisp structural clarity',
      'Tactile depth continuity across foreground and background',
    ],
    prohibitedInterpretations: options.prohibitedInterpretations || [
      'Generic AI 3D floating render',
      'Stock commercial template layout',
      'Artificial glowing gradients without physical source',
    ],
    styleDirection: options.styleDirection || 'Editorial Art Direction',
    creativePersonality: options.creativePersonality || 'editorial',
    mode: options.mode || 'EDITORIAL',
    artDirectionFamily: options.artDirectionFamily || 'EDITORIAL_PHOTOGRAPHY',
    mechanismFamily: options.mechanismFamily || 'VISUAL_METAPHOR',
    scores: options.scores || {
      conceptStrength: 90,
      brandSpecificity: 88,
      productRelevance: 85,
      visualOriginality: 92,
      scrollStoppingPotential: 90,
      messageClarity: 88,
      socialInteractionPotential: 86,
      templateRisk: 10,
      mechanismNovelty: 90,
      similarityToOtherConcepts: 10,
    },
  };
}

/**
 * Evaluates semantic differentiation between two concepts across 7 core dimensions.
 */
export function evaluateConceptPairDifferentiation(
  a: ReferenceAwareConcept,
  b: ReferenceAwareConcept
): ConceptDifferentiationPairReport {
  const dimensions = [
    { name: 'communicationIdea', valA: a.communicationIdea || a.bigIdea, valB: b.communicationIdea || b.bigIdea, weight: 0.25 },
    { name: 'creativeMechanism', valA: a.creativeMechanism, valB: b.creativeMechanism, weight: 0.20 },
    { name: 'visualMechanism', valA: a.visualMechanism, valB: b.visualMechanism, weight: 0.20 },
    { name: 'hero', valA: a.hero, valB: b.hero, weight: 0.10 },
    { name: 'visualWorld', valA: a.visualWorld, valB: b.visualWorld, weight: 0.10 },
    { name: 'copyAngle', valA: a.copyAngle, valB: b.copyAngle, weight: 0.10 },
    { name: 'referenceDevice', valA: a.referenceInsights?.creativeDevice || '', valB: b.referenceInsights?.creativeDevice || '', weight: 0.05 },
  ];

  const convergedDimensions: string[] = [];
  const divergentDimensions: string[] = [];
  let weightedSimilarity = 0;

  for (const dim of dimensions) {
    const tokensA = extractKeywords(dim.valA);
    const tokensB = extractKeywords(dim.valB);
    const sim = jaccardSimilarity(tokensA, tokensB);

    if (sim > 0.40 || (dim.valA && dim.valB && dim.valA.toLowerCase() === dim.valB.toLowerCase())) {
      convergedDimensions.push(dim.name);
      weightedSimilarity += sim * dim.weight;
    } else {
      divergentDimensions.push(dim.name);
      weightedSimilarity += sim * dim.weight;
    }
  }

  const similarityScore = Number(weightedSimilarity.toFixed(3));
  const isDifferentiated = similarityScore < 0.38 && convergedDimensions.length <= 2;

  let rationale = `Divergent across ${divergentDimensions.join(', ')}.`;
  if (!isDifferentiated) {
    rationale = `Concepts "${a.conceptName}" and "${b.conceptName}" converged on: ${convergedDimensions.join(', ')}.`;
  }

  return {
    conceptA: a.conceptName,
    conceptB: b.conceptName,
    similarityScore,
    isDifferentiated,
    convergedDimensions,
    divergentDimensions,
    rationale,
  };
}

/**
 * Concept Differentiation Test for an entire pool of concepts.
 * Returns actionable report and triggers regeneration flag if concepts are cosmetic variations.
 */
export function evaluateConceptDifferentiation(
  concepts: ReferenceAwareConcept[]
): ConceptDifferentiationReport {
  if (concepts.length <= 1) {
    return {
      overallDivergenceScore: 1.0,
      isPoolDifferentiated: true,
      pairReports: [],
      convergenceWarnings: [],
      mustRegenerate: false,
    };
  }

  const pairReports: ConceptDifferentiationPairReport[] = [];
  const convergenceWarnings: string[] = [];
  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const pair = evaluateConceptPairDifferentiation(concepts[i], concepts[j]);
      pairReports.push(pair);
      totalSimilarity += pair.similarityScore;
      comparisons++;

      if (!pair.isDifferentiated) {
        convergenceWarnings.push(pair.rationale);
      }
    }
  }

  const averageSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
  const overallDivergenceScore = Number((1.0 - averageSimilarity).toFixed(3));
  const hasConvergence = pairReports.some((p) => !p.isDifferentiated);

  return {
    overallDivergenceScore,
    isPoolDifferentiated: !hasConvergence && overallDivergenceScore >= 0.62,
    pairReports,
    convergenceWarnings,
    mustRegenerate: hasConvergence,
  };
}

/**
 * Compiles a CreativeRealizationPlan into a production image prompt.
 * Strictly preserves physical visual mechanisms while preventing typography/DDE coordinate leakage.
 */
export function compileRealizationPrompt(plan: CreativeRealizationPlan): string {
  return [
    `PHYSICAL SCENE & ENVIRONMENT: ${plan.environment}`,
    `DOMINANT HERO & OBJECTS: ${plan.hero} - ${plan.objects.join(', ')}`,
    `PHYSICAL MECHANISM: ${plan.physicalMechanism}`,
    `MATERIALS & TEXTURES: ${plan.materials.join(', ')}`,
    `LIGHTING & ATMOSPHERE: ${plan.lightingIntent}`,
    `CAMERA & OPTICS: ${plan.cameraIntent}`,
    `COMPOSITION AFFORDANCE: ${plan.compositionAffordance}`,
    `REQUIRED VISUAL PROOF (MUST BE VISIBLE): ${(plan.requiredVisualProof || []).join(', ')}`,
    `PROHIBITED VISUAL CLICHES (DO NOT RENDER): ${(plan.prohibitedInterpretations || []).join(', ')}`,
    `NATURALNESS MANDATE: ${(plan.naturalnessRequirements || []).join(', ')}`,
  ].join('\n\n');
}

/**
 * Derives a Concept-Aware Copy Package from the concept.
 * Pipeline: Concept -> communication angle -> hook -> headline -> support -> CTA.
 */
export function deriveConceptAwareCopy(
  inputOrConcept: ReferenceAwareConcept | { concept: ReferenceAwareConcept; brief?: CreativeBrief; requiredClaims?: string[] },
  maybeBrief?: CreativeBrief,
  maybeClaims: string[] = []
): ConceptCopyPackage {
  const isOptionsObj = Boolean(inputOrConcept && typeof inputOrConcept === 'object' && 'concept' in inputOrConcept);
  const concept: ReferenceAwareConcept = isOptionsObj ? (inputOrConcept as any).concept : inputOrConcept;
  const brief: CreativeBrief = isOptionsObj ? ((inputOrConcept as any).brief || { subject: 'Product', primaryMessage: '' }) : (maybeBrief || { subject: 'Product', primaryMessage: '' } as any);
  const requiredClaims: string[] = isOptionsObj ? ((inputOrConcept as any).requiredClaims || []) : (maybeClaims || []);

  const personality = (concept as any)?.personality || concept.creativePersonality || 'editorial';
  const subject = brief.subject || 'Product';
  const communicationAngle = concept.copyAngle || concept.communicationIdea || subject;

  let hook = `${subject} Reimagined`;
  let headline = subject.toUpperCase();
  let support = concept.communicationIdea || brief.primaryMessage || subject;
  let cta = 'DISCOVER NOW';

  if (requiredClaims.length > 0) {
    const offerClaim = requiredClaims.find((c) => /%|off|free|entry|save|sale|spcl|special/i.test(c));
    const statusClaim = requiredClaims.find((c) => /new|launch|exclusive|limited|fresh|daily/i.test(c));
    const subjectClaim = requiredClaims.find((c) => c !== offerClaim && c !== statusClaim) || requiredClaims[0];

    if (subjectClaim) {
      headline = subjectClaim.toUpperCase();
    }

    const nonHeadlineClaims = requiredClaims.filter((c) => !headline.toLowerCase().includes(c.toLowerCase()));
    if (nonHeadlineClaims.length > 0) {
      const claimPrefix = nonHeadlineClaims.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' • ');
      support = `${claimPrefix} — ${concept.communicationIdea || brief.primaryMessage || subject}`;
    }
  }

  switch (personality) {
    case 'deadpan':
    case 'witty':
      hook = `Naturally, ${subject}.`;
      cta = 'SEE PROOF';
      break;
    case 'nostalgic':
      hook = 'Recovered from the archive.';
      cta = 'EXPLORE COLLECTION';
      break;
    case 'playful':
    case 'clever':
      hook = `Guess what just arrived for ${subject}?`;
      cta = 'CLAIM YOURS';
      break;
    case 'cinematic':
      hook = 'In every frame, perfection.';
      cta = 'EXPERIENCE';
      break;
    case 'editorial':
    default:
      hook = `The definitive ${subject}.`;
      cta = 'EXPLORE';
      break;
  }

  return {
    communicationAngle,
    hook,
    headline,
    support,
    cta,
    creativePersonality: personality,
  };
}

/**
 * Builds a comprehensive CreativeRealizationPlan from the concept and brief.
 */
export function buildCreativeRealizationPlan(options: {
  concept: ReferenceAwareConcept;
  brief: CreativeBrief;
  direction?: any;
  referenceInsights?: ReferenceDeviceAbstraction;
}): CreativeRealizationPlan & { compiledImagePrompt: string } {
  const { concept, brief, direction, referenceInsights } = options;
  const visualWorld = concept.visualWorld || `${brief.subject} architectural studio`;

  const materials: string[] = [
    'Heavy textured cotton paper substrate',
    'Tactile dimensional specimens',
    'Fine pigment ink with letterpress impression',
    'Natural translucent mounting strips',
  ];

  const objects: string[] = [
    concept.dominantVisualObject || brief.subject,
    'Physical archival labels and catalog markings',
    'Tangible specimen fragments',
  ];

  const naturalnessRequirements = [
    'Physical material continuity across paper grain and specimen edges',
    'Credible optical geometry with authentic depth of field',
    'Natural cast shadows and realistic ambient occlusion',
    'Controlled asymmetry and purposeful editorial irregularity',
    'Zero plastic smoothing or synthetic HDR glow',
    'Zero AI-generated hallucinated text or fake logos in the image',
  ];

  const referenceInsightStrings: string[] = referenceInsights
    ? [
        `Device: ${referenceInsights.creativeDevice}`,
        `Mechanism: ${referenceInsights.visualMechanism}`,
        `Cultural Signal: ${referenceInsights.culturalSignal}`,
      ]
    : [];

  const plan: CreativeRealizationPlan = {
    concept: concept.conceptName,
    visualWorld,
    hero: concept.hero,
    materials,
    objects,
    environment: visualWorld,
    cameraIntent: 'Macro editorial lens with authentic optical depth and sharp tactile focus',
    lightingIntent: 'Natural directional window light with soft fill and organic contrast',
    physicalMechanism: concept.visualMechanism,
    imageRole: concept.imageRole,
    compositionAffordance: 'Organized specimen hierarchy leaving calm negative space for FlowPost typography',
    naturalnessRequirements,
    referenceInsights: referenceInsightStrings,
    prohibitedInterpretations: concept.prohibitedInterpretations || [],
    requiredVisualProof: concept.requiredVisualProof || [],
  };

  const compiledImagePrompt = compileRealizationPrompt(plan);

  return {
    ...plan,
    compiledImagePrompt,
  };
}

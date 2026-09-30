import type { FieldRect } from '../render/image-field';
import type { DesignField } from '../render/design-representation';
import type { GraphicDesignConcept } from '../types';
import type { CreativeRealizationContext } from '../render/composition-evaluation';
import { SPATIAL_OCCUPANCY_CALIBRATION } from '../render/image-field';

// ---------------------------------------------------------------------------
// 1. Types & Models
// ---------------------------------------------------------------------------

export type TextImageRelationshipMode =
  | 'SEPARATED'
  | 'OVERLAY_INTENTIONAL'
  | 'MATERIAL_INTERACTION'
  | 'BOUNDARY_INTERACTION'
  | 'EMBEDDED'
  | 'CONTAINED'
  | 'JUXTAPOSED';

export interface ElementImageInteraction {
  elementId: string;
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'logo' | string;
  rect: FieldRect;
  occupancy: number;
  detailEnergy: number;
  luminance: number;
  stdDev: number;
  focalDistance: number;
  overlapClassification: 'none' | 'peripheral' | 'textured-field' | 'focal-core';
  isIntentional: boolean;
  isCollision: boolean;
  legibilityScore: number;
}

export interface TextImageRelationshipEvidence {
  conceptMechanism: string;
  imageRole: string;
  observedOverlapRatio: number;
  subjectOcclusionRatio: number;
  focalCentroidDistance: number;
  localDetailEnergy: number;
  localLuminance: number;
  hasIntentionalOverlap: boolean;
  isAccidentalCollision: boolean;
  elements: ElementImageInteraction[];
}

export interface VisualHierarchyImpact {
  primaryFocalElement: string;
  hierarchyClarityScore: number;
  readingOrderCoherence: number;
}

export interface TextImageRelationshipState {
  relationshipMode: TextImageRelationshipMode;
  confidence: number;
  evidence: TextImageRelationshipEvidence;
  textElementIds: string[];
  preferredInteractionRegion?: FieldRect;
  occlusionTolerance: number;
  intentionalOverlap: boolean;
  legibilityRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  semanticJustification: string;
  visualHierarchyImpact: VisualHierarchyImpact;
  relationshipHarmonyScore: number; // Holistic interaction score in [0.0 .. 1.0]
}

// ---------------------------------------------------------------------------
// 2. Authoritative Calibration
// ---------------------------------------------------------------------------

export interface TextImageRelationshipCalibration {
  readonly safetyInvariants: {
    readonly maxAccidentalCoreOcclusion: number;
    readonly minHeadlineContrastFloor: number;
    readonly maxSecondaryCopySubjectCollision: number;
  };
  readonly modeTolerances: Record<TextImageRelationshipMode, number>;
  readonly scoringWeights: {
    readonly legibilityWeight: number;
    readonly subjectHarmonyWeight: number;
    readonly hierarchyWeight: number;
    readonly readingOrderWeight: number;
  };
}

export const TEXT_IMAGE_RELATIONSHIP_CALIBRATION: TextImageRelationshipCalibration = {
  safetyInvariants: {
    maxAccidentalCoreOcclusion: 0.25,
    minHeadlineContrastFloor: 0.35,
    maxSecondaryCopySubjectCollision: 0.15,
  },
  modeTolerances: {
    SEPARATED: 0.05,
    OVERLAY_INTENTIONAL: 0.20,
    MATERIAL_INTERACTION: 0.65,
    BOUNDARY_INTERACTION: 0.45,
    EMBEDDED: 0.80,
    CONTAINED: 0.50,
    JUXTAPOSED: 0.15,
  },
  scoringWeights: {
    legibilityWeight: 0.35,
    subjectHarmonyWeight: 0.30,
    hierarchyWeight: 0.20,
    readingOrderWeight: 0.15,
  },
} as const;

// ---------------------------------------------------------------------------
// 3. Mode Derivation
// ---------------------------------------------------------------------------

export function resolveTextImageRelationshipMode(
  concept?: GraphicDesignConcept,
  realizationContext?: CreativeRealizationContext
): { mode: TextImageRelationshipMode; justification: string } {
  const mechanism = `${concept?.creativeMechanism || ''} ${realizationContext?.creativeMechanism || ''}`.toLowerCase();
  const imageRole = (concept?.imageRole || realizationContext?.imageRole || 'full-bleed').toLowerCase();
  const hero = (concept?.hero || realizationContext?.hero || 'image').toLowerCase();
  const spatial = `${concept?.spatialRelationship || ''} ${realizationContext?.spatialRelationship || ''}`.toLowerCase();

  if (mechanism.includes('inside') || mechanism.includes('contained') || mechanism.includes('mask') || imageRole === 'contained-image') {
    return {
      mode: 'CONTAINED',
      justification: 'Concept requires imagery contained or masked within geometric or typographic apertures.',
    };
  }
  if (mechanism.includes('fabric') || mechanism.includes('cross') || mechanism.includes('overlap') || mechanism.includes('material')) {
    return {
      mode: 'MATERIAL_INTERACTION',
      justification: 'Concept requires physical material or shadow to tangibly interact and cross typographic planes.',
    };
  }
  if (mechanism.includes('split') || mechanism.includes('boundary') || mechanism.includes('threshold') || mechanism.includes('straddle')) {
    return {
      mode: 'BOUNDARY_INTERACTION',
      justification: 'Concept establishes a deliberate threshold crossing between image and content field.',
    };
  }
  if (mechanism.includes('embed') || mechanism.includes('diegetic') || mechanism.includes('engraved') || mechanism.includes('printed on')) {
    return {
      mode: 'EMBEDDED',
      justification: 'Concept requires in-scene embedded physical typography.',
    };
  }
  if (mechanism.includes('juxtaposition') || mechanism.includes('dual') || mechanism.includes('contrast')) {
    return {
      mode: 'JUXTAPOSED',
      justification: 'Concept uses side-by-side or contrasting dual spatial dialogue.',
    };
  }
  if (hero === 'typography' || imageRole === 'small-tactile-object' || imageRole === 'offset-crop') {
    return {
      mode: 'SEPARATED',
      justification: 'Typography is hero or imagery is a discrete tactile object in separate space.',
    };
  }

  return {
    mode: 'OVERLAY_INTENTIONAL',
    justification: 'Editorial overlay positioning content over naturally quiet ground.',
  };
}

// ---------------------------------------------------------------------------
// 4. Holistic Evaluator
// ---------------------------------------------------------------------------

export interface EvaluateTextImageRelationshipInput {
  elements: Array<{
    id: string;
    role: string;
    rect: FieldRect;
    fontScale?: number;
  }>;
  field: DesignField;
  concept?: GraphicDesignConcept;
  realizationContext?: CreativeRealizationContext;
}

/**
 * Evaluates the complete, relational Text-Image interaction state across all
 * text and graphic elements against the image field and creative concept.
 */
export function evaluateTextImageRelationship(
  input: EvaluateTextImageRelationshipInput
): TextImageRelationshipState {
  const { elements, field, concept, realizationContext } = input;
  const cal = TEXT_IMAGE_RELATIONSHIP_CALIBRATION;

  const { mode: relationshipMode, justification: semanticJustification } = resolveTextImageRelationshipMode(
    concept,
    realizationContext
  );

  const occlusionTolerance = cal.modeTolerances[relationshipMode] ?? 0.20;
  const isIntentionalInteractionExpected =
    relationshipMode === 'MATERIAL_INTERACTION' ||
    relationshipMode === 'BOUNDARY_INTERACTION' ||
    relationshipMode === 'CONTAINED' ||
    relationshipMode === 'EMBEDDED';

  const elementInteractions: ElementImageInteraction[] = [];
  let maxObservedOverlap = 0;
  let maxSubjectOcclusion = 0;
  let minLegibility = 1.0;
  let totalLegibility = 0;
  let totalDetailEnergy = 0;
  let totalLuminance = 0;
  let hasAccidentalCollision = false;

  const focalCentroid = field.focalCentroid || { x: 0.5, y: 0.5 };

  for (const elem of elements) {
    const reg = field.evaluateRegion(elem.rect);
    const occupancy = field.occupancyAt ? field.occupancyAt(elem.rect) : (reg.subjectOcclusion || 0);
    const busyness = field.busynessAt ? field.busynessAt(elem.rect) : (reg.detailEnergy || 0);
    const tone = field.toneAt ? field.toneAt(elem.rect) : { meanLuminance: reg.meanLuminance || 0.5, stdDev: reg.localVariance || 0.05, verdict: 'light' as const };

    const dx = (elem.rect.x + elem.rect.width / 2) - focalCentroid.x;
    const dy = (elem.rect.y + elem.rect.height / 2) - focalCentroid.y;
    const focalDistance = Math.hypot(dx, dy);

    // Classify overlap using calibrated spatial thresholds
    let overlapClassification: ElementImageInteraction['overlapClassification'] = 'none';
    if (occupancy >= SPATIAL_OCCUPANCY_CALIBRATION.classification.focalCoreOverlap) {
      overlapClassification = 'focal-core';
    } else if (occupancy >= SPATIAL_OCCUPANCY_CALIBRATION.classification.texturedFieldOverlap) {
      overlapClassification = 'textured-field';
    } else if (occupancy >= SPATIAL_OCCUPANCY_CALIBRATION.classification.peripheralOverlap) {
      overlapClassification = 'peripheral';
    }

    const isElementIntentional = isIntentionalInteractionExpected && (
      elem.role === 'headline' || elem.role === 'subheadline'
    );

    const isCollision = !isElementIntentional && (
      overlapClassification === 'focal-core' ||
      (elem.role !== 'headline' && overlapClassification === 'textured-field' && occupancy > cal.safetyInvariants.maxSecondaryCopySubjectCollision)
    );

    if (isCollision) {
      hasAccidentalCollision = true;
    }

    maxObservedOverlap = Math.max(maxObservedOverlap, occupancy);
    maxSubjectOcclusion = Math.max(maxSubjectOcclusion, reg.subjectOcclusion || 0);

    const legibilityScore = Math.max(
      0,
      1.0 - (occupancy * 0.45 + busyness * 0.40 + tone.stdDev * 0.15)
    );

    minLegibility = Math.min(minLegibility, legibilityScore);
    totalLegibility += legibilityScore;
    totalDetailEnergy += busyness;
    totalLuminance += tone.meanLuminance;

    elementInteractions.push({
      elementId: elem.id,
      role: elem.role,
      rect: elem.rect,
      occupancy,
      detailEnergy: busyness,
      luminance: tone.meanLuminance,
      stdDev: tone.stdDev,
      focalDistance,
      overlapClassification,
      isIntentional: isElementIntentional,
      isCollision,
      legibilityScore: Number(legibilityScore.toFixed(3)),
    });
  }

  const elCount = Math.max(1, elements.length);
  const avgLegibility = totalLegibility / elCount;
  const avgDetailEnergy = totalDetailEnergy / elCount;
  const avgLuminance = totalLuminance / elCount;

  // Evaluate Visual Hierarchy & Reading Order
  const headlineElem = elements.find((e) => e.role === 'headline');
  const supportElem = elements.find((e) => e.role === 'subheadline' || e.role === 'offer' || e.role === 'body');
  const ctaElem = elements.find((e) => e.role === 'cta' || e.id.includes('cta'));
  const logoElem = elements.find((e) => e.role === 'logo' || e.id.includes('logo'));

  let hierarchyClarityScore = 1.0;
  let readingOrderCoherence = 1.0;

  if (headlineElem && supportElem) {
    // Headline should have greater visual presence than support
    const headlineScale = headlineElem.fontScale ?? (headlineElem.rect.height * 0.8);
    const supportScale = supportElem.fontScale ?? (supportElem.rect.height * 0.8);
    if (headlineScale <= supportScale) {
      hierarchyClarityScore -= 0.35;
    }

    // Support should naturally follow headline in reading order (below or right)
    const isBelow = supportElem.rect.y >= headlineElem.rect.y - 0.02;
    if (!isBelow) {
      readingOrderCoherence -= 0.25;
    }

    // Secondary text must not collide with focal core
    const supportInteraction = elementInteractions.find((i) => i.elementId === supportElem.id);
    if (supportInteraction?.overlapClassification === 'focal-core') {
      hierarchyClarityScore -= 0.40;
    }
  }

  if (ctaElem && headlineElem) {
    const ctaScale = ctaElem.fontScale ?? (ctaElem.rect.height * 0.8);
    const headlineScale = headlineElem.fontScale ?? (headlineElem.rect.height * 0.8);
    if (ctaScale >= headlineScale) {
      hierarchyClarityScore -= 0.30;
    }
  }

  if (logoElem) {
    const logoInteraction = elementInteractions.find((i) => i.elementId === logoElem.id);
    if (logoInteraction?.overlapClassification === 'focal-core') {
      hierarchyClarityScore -= 0.30;
    }
  }

  hierarchyClarityScore = Math.max(0.1, Math.min(1.0, hierarchyClarityScore));
  readingOrderCoherence = Math.max(0.1, Math.min(1.0, readingOrderCoherence));

  // Determine Legibility Risk
  let legibilityRisk: TextImageRelationshipState['legibilityRisk'] = 'LOW';
  if (minLegibility < 0.30 || (hasAccidentalCollision && maxObservedOverlap > 0.60)) {
    legibilityRisk = 'CRITICAL';
  } else if (minLegibility < 0.50 || hasAccidentalCollision) {
    legibilityRisk = 'HIGH';
  } else if (minLegibility < 0.65) {
    legibilityRisk = 'MODERATE';
  }

  // Calculate Subject Harmony Score
  let subjectHarmonyScore = 1.0;
  if (isIntentionalInteractionExpected) {
    // Rewards successful intentional overlap within tolerance
    subjectHarmonyScore = maxObservedOverlap <= occlusionTolerance ? 0.95 : 0.70;
  } else {
    // Penalizes accidental overlap proportionally to severity
    if (hasAccidentalCollision) {
      subjectHarmonyScore = Math.max(0.1, 1.0 - maxObservedOverlap * 1.2);
    } else {
      subjectHarmonyScore = Math.max(0.6, 1.0 - maxObservedOverlap * 0.4);
    }
  }

  // Composite Relationship Harmony Score
  const w = cal.scoringWeights;
  const relationshipHarmonyScore = Number((
    avgLegibility * w.legibilityWeight +
    subjectHarmonyScore * w.subjectHarmonyWeight +
    hierarchyClarityScore * w.hierarchyWeight +
    readingOrderCoherence * w.readingOrderWeight
  ).toFixed(3));

  const primaryFocal = headlineElem?.id || elements[0]?.id || 'hero-visual';

  return {
    relationshipMode,
    confidence: Number((avgLegibility * 0.5 + subjectHarmonyScore * 0.5).toFixed(2)),
    evidence: {
      conceptMechanism: concept?.creativeMechanism || realizationContext?.creativeMechanism || 'Direct visual placement',
      imageRole: concept?.imageRole || realizationContext?.imageRole || 'full-bleed',
      observedOverlapRatio: Number(maxObservedOverlap.toFixed(3)),
      subjectOcclusionRatio: Number(maxSubjectOcclusion.toFixed(3)),
      focalCentroidDistance: Number((elementInteractions[0]?.focalDistance ?? 0).toFixed(3)),
      localDetailEnergy: Number(avgDetailEnergy.toFixed(3)),
      localLuminance: Number(avgLuminance.toFixed(3)),
      hasIntentionalOverlap: isIntentionalInteractionExpected && maxObservedOverlap > 0.05,
      isAccidentalCollision: hasAccidentalCollision,
      elements: elementInteractions,
    },
    textElementIds: elements.map((e) => e.id),
    preferredInteractionRegion: field.quietRects?.[0],
    occlusionTolerance,
    intentionalOverlap: isIntentionalInteractionExpected,
    legibilityRisk,
    semanticJustification,
    visualHierarchyImpact: {
      primaryFocalElement: primaryFocal,
      hierarchyClarityScore: Number(hierarchyClarityScore.toFixed(3)),
      readingOrderCoherence: Number(readingOrderCoherence.toFixed(3)),
    },
    relationshipHarmonyScore,
  };
}

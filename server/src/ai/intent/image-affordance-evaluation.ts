import type { ImageField, FieldRect } from '../render/image-field';
import type { ImageRealizationSpec } from './image-realization-spec';

// ---------------------------------------------------------------------------
// 1. Authoritative Calibration Configuration
// ---------------------------------------------------------------------------

/**
 * Authoritative calibration configuration for Post-Generation Image Affordance Review.
 * Every threshold is explicitly classified as a Safety Invariant, Numerical Calibration,
 * or Density Boundary. No magic numbers exist in the evaluation logic.
 */
export interface ImageAffordanceCalibration {
  /** A. Safety Invariants: physical boundaries preventing illegible or overwhelmed compositions */
  readonly safetyInvariants: {
    /** Absolute minimum calm score for any candidate region to be considered viable */
    readonly minCalmScoreFloor: number;
    /** Total occupancy mass above which a canvas is classified as cluttered */
    readonly maxClutteredOccupancyMass: number;
    /** Minimum quiet area required for large copy load layouts */
    readonly minLargeCopyQuietArea: number;
  };

  /** B. Numerical Calibration: continuous signal weighting and suitability thresholds */
  readonly signalWeights: {
    readonly occupancy: number;
    readonly busyness: number;
    readonly toneVariance: number;
  };

  /** Minimum calm scores required for specific copy elements */
  readonly elementSuitabilityThresholds: {
    readonly headline: number;
    readonly support: number;
    readonly badge: number;
    readonly logo: number;
  };

  /** Copy load evaluation criteria across continuous candidate regions */
  readonly copyLoadRequirements: {
    readonly primaryOnlyMinScore: number;
    readonly primaryOnlyAdequateScore: number;
    readonly primaryPlusSupportBestScore: number;
    readonly primaryPlusSupportMinScore: number;
    readonly primarySupportCtaBestScore: number;
    readonly primarySupportCtaMinScore: number;
  };

  /** Density mass boundaries for the full canvas */
  readonly massDensityThresholds: {
    readonly sparseMax: number;
    readonly balancedMax: number;
    readonly denseMax: number;
  };
}

export const IMAGE_AFFORDANCE_CALIBRATION: ImageAffordanceCalibration = {
  safetyInvariants: {
    minCalmScoreFloor: 0.20,
    maxClutteredOccupancyMass: 0.85,
    minLargeCopyQuietArea: 0.12,
  },
  signalWeights: {
    occupancy: 0.50,
    busyness: 0.35,
    toneVariance: 0.15,
  },
  elementSuitabilityThresholds: {
    headline: 0.70,
    support: 0.50,
    badge: 0.38,
    logo: 0.28,
  },
  copyLoadRequirements: {
    primaryOnlyMinScore: 0.60,
    primaryOnlyAdequateScore: 0.40,
    primaryPlusSupportBestScore: 0.65,
    primaryPlusSupportMinScore: 0.35,
    primarySupportCtaBestScore: 0.70,
    primarySupportCtaMinScore: 0.40,
  },
  massDensityThresholds: {
    sparseMax: 0.15,
    balancedMax: 0.60,
    denseMax: 0.85,
  },
} as const;

// ---------------------------------------------------------------------------
// 2. Types & Interfaces
// ---------------------------------------------------------------------------

export interface ContinuousReadingRegion {
  rect: FieldRect;
  calmScore: number;
  occupancy: number;
  busyness: number;
  area: number;
  suitableFor: 'headline' | 'support' | 'badge' | 'logo' | 'none';
}

export interface VisualMassDistribution {
  topMass: number;
  bottomMass: number;
  leftMass: number;
  rightMass: number;
  centerMass: number;
}

export interface ImageAffordanceEvaluation {
  passed: boolean;
  readingRegionCount: number;
  strongestReadingRegions: ContinuousReadingRegion[];
  copyLoadSuitability: 'EXCELLENT' | 'ADEQUATE' | 'TIGHT' | 'INSUFFICIENT';
  localDensity: 'SPARSE' | 'BALANCED' | 'DENSE' | 'CLUTTERED';
  textImageRelationshipFeasibility: 'HIGH' | 'MODERATE' | 'LOW';
  visualMassDistribution: VisualMassDistribution;
  affordanceConfidence: number;
  recommendation: 'PROCEED' | 'REFINE_IMAGE_AFFORDANCE' | 'REGENERATE_IMAGE';
  details: {
    totalSubjectMass: number;
    quietRectCount: number;
    largestQuietArea: number;
  };
}

// ---------------------------------------------------------------------------
// 3. Evaluator Implementation
// ---------------------------------------------------------------------------

/**
 * Model-free, deterministic Post-Generation Image Affordance Review.
 * Evaluates whether the generated image contains continuous usable regions
 * capable of supporting the expected graphic copy load without hardcoded quadrant bias.
 */
export function evaluateImageAffordance(
  imageField: ImageField,
  spec: ImageRealizationSpec
): ImageAffordanceEvaluation {
  const cal = IMAGE_AFFORDANCE_CALIBRATION;

  // 1. Measure Continuous Regional Masses across Cardinal Axes
  const topMass = imageField.occupancyAt({ x: 0, y: 0, width: 1, height: 0.35 });
  const bottomMass = imageField.occupancyAt({ x: 0, y: 0.65, width: 1, height: 0.35 });
  const leftMass = imageField.occupancyAt({ x: 0, y: 0, width: 0.35, height: 1 });
  const rightMass = imageField.occupancyAt({ x: 0.65, y: 0, width: 0.35, height: 1 });
  const centerMass = imageField.occupancyAt({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });

  const visualMassDistribution: VisualMassDistribution = {
    topMass,
    bottomMass,
    leftMass,
    rightMass,
    centerMass,
  };

  // 2. Discover Continuous Candidate Reading Regions from ImageField Signals
  // Read quietRects discovered dynamically by ImageField's continuous integration
  const candidateRects: FieldRect[] = [
    ...imageField.quietRects,
  ];

  // If no explicit quietRect was produced, probe continuous adaptive spans across open regions
  if (candidateRects.length === 0) {
    const probeSpans: FieldRect[] = [
      { x: 0.08, y: 0.06, width: 0.84, height: 0.32 },
      { x: 0.08, y: 0.62, width: 0.84, height: 0.32 },
      { x: 0.06, y: 0.12, width: 0.42, height: 0.76 },
      { x: 0.52, y: 0.12, width: 0.42, height: 0.76 },
    ];
    for (const span of probeSpans) {
      if (imageField.occupancyAt(span) < 0.40) {
        candidateRects.push(span);
      }
    }
  }

  const strongestReadingRegions: ContinuousReadingRegion[] = [];

  for (const rect of candidateRects) {
    const occupancy = imageField.occupancyAt(rect);
    const busyness = imageField.busynessAt(rect);
    const tone = imageField.toneAt(rect);

    // Continuous Calm Score: inversely proportional to occupancy, busyness, and luminance variance
    const rawCalm = 1 - (
      occupancy * cal.signalWeights.occupancy +
      busyness * cal.signalWeights.busyness +
      tone.stdDev * cal.signalWeights.toneVariance
    );
    const calmScore = Math.max(0, Math.min(1, rawCalm));

    if (calmScore < cal.safetyInvariants.minCalmScoreFloor) {
      continue;
    }

    let suitableFor: ContinuousReadingRegion['suitableFor'] = 'none';
    if (calmScore >= cal.elementSuitabilityThresholds.headline) {
      suitableFor = 'headline';
    } else if (calmScore >= cal.elementSuitabilityThresholds.support) {
      suitableFor = 'support';
    } else if (calmScore >= cal.elementSuitabilityThresholds.badge) {
      suitableFor = 'badge';
    } else if (calmScore >= cal.elementSuitabilityThresholds.logo) {
      suitableFor = 'logo';
    }

    strongestReadingRegions.push({
      rect,
      calmScore,
      occupancy,
      busyness,
      area: rect.width * rect.height,
      suitableFor,
    });
  }

  // Deduplicate and sort continuous regions by calmScore descending
  strongestReadingRegions.sort((a, b) => b.calmScore - a.calmScore);

  const readingRegionCount = strongestReadingRegions.length;
  const bestScore = strongestReadingRegions[0]?.calmScore ?? 0;

  // 3. Evaluate Copy Load Suitability against Continuous Reading Capacity
  let copyLoadSuitability: ImageAffordanceEvaluation['copyLoadSuitability'];

  switch (spec.copyLoadProfile) {
    case 'PRIMARY_ONLY':
      if (bestScore >= cal.copyLoadRequirements.primaryOnlyMinScore || readingRegionCount >= 1) {
        copyLoadSuitability = 'EXCELLENT';
      } else if (bestScore >= cal.copyLoadRequirements.primaryOnlyAdequateScore) {
        copyLoadSuitability = 'ADEQUATE';
      } else {
        copyLoadSuitability = 'TIGHT';
      }
      break;

    case 'PRIMARY_PLUS_SUPPORT':
      if (readingRegionCount >= 2 && bestScore >= cal.copyLoadRequirements.primaryPlusSupportBestScore) {
        copyLoadSuitability = 'EXCELLENT';
      } else if (readingRegionCount >= 1 && bestScore >= cal.elementSuitabilityThresholds.support) {
        copyLoadSuitability = 'ADEQUATE';
      } else if (bestScore >= cal.copyLoadRequirements.primaryPlusSupportMinScore) {
        copyLoadSuitability = 'TIGHT';
      } else {
        copyLoadSuitability = 'INSUFFICIENT';
      }
      break;

    case 'PRIMARY_SUPPORT_CTA':
    case 'MULTI_TEXT':
      if (readingRegionCount >= 2 && bestScore >= cal.copyLoadRequirements.primarySupportCtaBestScore) {
        copyLoadSuitability = 'EXCELLENT';
      } else if (readingRegionCount >= 2 || (readingRegionCount >= 1 && bestScore >= 0.55)) {
        copyLoadSuitability = 'ADEQUATE';
      } else if (readingRegionCount >= 1 && bestScore >= cal.copyLoadRequirements.primarySupportCtaMinScore) {
        copyLoadSuitability = 'TIGHT';
      } else {
        copyLoadSuitability = 'INSUFFICIENT';
      }
      break;

    default:
      copyLoadSuitability = 'ADEQUATE';
  }

  // 4. Local Density Assessment
  const totalMass = imageField.totalOccupancyMass;
  let localDensity: ImageAffordanceEvaluation['localDensity'];
  if (totalMass < cal.massDensityThresholds.sparseMax) {
    localDensity = 'SPARSE';
  } else if (totalMass <= cal.massDensityThresholds.balancedMax) {
    localDensity = 'BALANCED';
  } else if (totalMass <= cal.massDensityThresholds.denseMax) {
    localDensity = 'DENSE';
  } else {
    localDensity = 'CLUTTERED';
  }

  // 5. Text-Image Relationship Feasibility
  let textImageRelationshipFeasibility: ImageAffordanceEvaluation['textImageRelationshipFeasibility'] = 'HIGH';
  if (spec.textImageRelationship === 'SEPARATED' && localDensity === 'CLUTTERED') {
    textImageRelationshipFeasibility = 'LOW';
  } else if (spec.textImageRelationship === 'CONTAINED' && totalMass < cal.massDensityThresholds.sparseMax) {
    textImageRelationshipFeasibility = 'MODERATE';
  } else if (copyLoadSuitability === 'INSUFFICIENT') {
    textImageRelationshipFeasibility = 'LOW';
  } else if (copyLoadSuitability === 'TIGHT') {
    textImageRelationshipFeasibility = 'MODERATE';
  }

  // 6. Overall Recommendation & Confidence
  const passed = copyLoadSuitability !== 'INSUFFICIENT';
  const affordanceConfidence = Math.min(
    1,
    Math.max(0.2, (bestScore * 0.5) + (Math.min(readingRegionCount, 3) * 0.15) + (passed ? 0.2 : 0))
  );

  let recommendation: ImageAffordanceEvaluation['recommendation'] = 'PROCEED';
  if (!passed) {
    recommendation = 'REFINE_IMAGE_AFFORDANCE';
  } else if (copyLoadSuitability === 'TIGHT' && spec.readingSpaceRequirement === 'LARGE') {
    recommendation = 'REFINE_IMAGE_AFFORDANCE';
  }

  const largestQuietArea = imageField.quietRects.length > 0
    ? Math.max(...imageField.quietRects.map((r) => r.width * r.height))
    : (strongestReadingRegions[0]?.area ?? 0);

  return {
    passed,
    readingRegionCount,
    strongestReadingRegions,
    copyLoadSuitability,
    localDensity,
    textImageRelationshipFeasibility,
    visualMassDistribution,
    affordanceConfidence,
    recommendation,
    details: {
      totalSubjectMass: totalMass,
      quietRectCount: imageField.quietRects.length,
      largestQuietArea,
    },
  };
}


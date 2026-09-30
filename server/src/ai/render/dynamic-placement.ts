/**
 * FLOWPOST DYNAMIC PLACEMENT ENGINE — PHASE 5
 *
 * Replaces fixed coordinate templates and post-hoc repair with continuous
 * spatial placement discovery across the Dynamic Design Field.
 *
 * Architecture Principles:
 *   1. CONTINUOUS PLACEMENT DISCOVERY (NO TEMPLATES / NO PRESETS):
 *      - Zero hardcoded coordinates (no fixed x: 0.08, y: 0.12, width: 0.84).
 *      - Zero quadrant presets (TOP_LEFT, TOP_RIGHT, CENTER).
 *      - Placement is continuous in normalized (0..1) and physical pixel space.
 *
 *   2. EXACT TYPOGRAPHY FOOTPRINT AWARENESS:
 *      - Consumes exact physical bounding boxes from LineStructureState / DynamicTypeStep
 *        backed by real TrueType glyph advances.
 *      - Sizing and line geometry directly determine spatial possibilities.
 *
 *   3. CONTINUOUS IMAGE INTERACTION SIGNALS:
 *      - Local luminance, texture/detail energy, quietness, and contrast potential.
 *      - Continuous subject overlap and focal distance evaluation (not binary invalid/valid).
 *      - Observable, configurable spatial scoring.
 *
 *   4. MULTI-ELEMENT & LOGO COMPOSITION AWARENESS:
 *      - Discovers placement for primary headlines, supporting copy, CTAs, and logos
 *        with awareness of existing placed elements.
 */

import type {
  CanvasRepresentation,
  DynamicDesignContext,
  BrandDesignRepresentation,
  DesignField,
} from './design-representation';
import type { FieldRect } from './image-field';
import { SPATIAL_OCCUPANCY_CALIBRATION } from './image-field';
import type { LineStructureState } from '../typography/dynamic-line-structure';
import type { DynamicTypeStep } from '../typography/dynamic-typography';
import type { TextImageRelationshipMode } from '../intent/text-image-relationship';

// ─── Spatial Interaction Signals & Scores ───────────────────────────────────

export interface SubjectOverlapSignal {
  /** Fraction of text area intersecting the subject region (0..1) */
  overlapRatio: number;
  /** Fraction of the total subject area occluded by text (0..1) */
  subjectOcclusionRatio: number;
  /** Texture/detail energy of the specific intersecting region */
  overlapDetailEnergy: number;
  /** Qualitative classification of the overlap */
  classification: 'none' | 'peripheral' | 'textured-field' | 'focal-core';
}

export interface SpatialInteractionSignals {
  /** Average background luminance under candidate rect (0..1) */
  localLuminance: number;
  /** Texture variation / high-frequency detail under candidate rect (0..1) */
  detailEnergy: number;
  /** Inverse of detail energy (1.0 = smooth/quiet field, 0.0 = busy/noisy) */
  quietness: number;
  /** Continuous subject overlap analysis */
  subjectOverlap: SubjectOverlapSignal;
  /** Normalized Euclidean distance from candidate center to focal centroid (0..√2) */
  focalDistance: number;
  /** Spatial relationship to the focal center */
  focalRelationship: 'adjacent' | 'offset' | 'containing' | 'distant';
  /** Normalized margins to canvas boundaries { top, bottom, left, right, minMargin } */
  edgeMargins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    minMargin: number;
  };
  /** Penalty if text is cramped against canvas bounds (0..1) */
  canvasBoundaryPressure: number;
  /** Contrast viability score: can light or dark text achieve >= 4.5:1 contrast? (0..1) */
  contrastPotential: number;
  /** Collision / overlap ratio with already placed design elements (0..1) */
  elementCollision: number;
}

export interface PlacementScores {
  /** Legibility potential from quietness and clear contrast backdrop (0..1) */
  legibilityScore: number;
  /** Visual balance and edge clearance (0..1) */
  spatialBalanceScore: number;
  /** Subject interaction score: rewards clean avoidance or intentional low-energy overlap (0..1) */
  subjectHarmonyScore: number;
  /** Composite ranking score (0..1) */
  compositeScore: number;
}

export interface PlacementScoringWeights {
  legibilityWeight: number;
  spatialBalanceWeight: number;
  subjectHarmonyWeight: number;
  /** Penalty multiplier for colliding with already placed elements */
  collisionPenaltyWeight: number;
  /** Penalty multiplier for exceeding safe canvas margins */
  boundaryPressureWeight: number;
}

export const DEFAULT_PLACEMENT_WEIGHTS: PlacementScoringWeights = {
  legibilityWeight: 0.40,
  spatialBalanceWeight: 0.30,
  subjectHarmonyWeight: 0.30,
  collisionPenaltyWeight: 1.50,
  boundaryPressureWeight: 1.00,
};

// ─── Placement Candidate State ───────────────────────────────────────────────

export interface PlacementCandidate {
  /** Continuous normalized coordinates on canvas (0..1) */
  rect: FieldRect;
  /** Physical pixel coordinates on canvas */
  pixelBounds: {
    xPx: number;
    yPx: number;
    widthPx: number;
    heightPx: number;
  };
  /** Optional copy ID if associated with a copy model */
  copyId?: string;
  /** Exact typography state placed in this position */
  typographyState?: LineStructureState | DynamicTypeStep;
  /** Granular observable spatial interaction signals */
  signals: SpatialInteractionSignals;
  /** Observable scoring breakdown */
  scores: PlacementScores;
  reasons: string[];
}

export interface PlacementDiscoveryOptions {
  preferredRegion?: 'upper' | 'top' | 'lower' | 'bottom' | 'center';
  relationshipMode?: TextImageRelationshipMode;
  typographyState: LineStructureState | DynamicTypeStep | { copyId?: string; id?: string; widthNormalized: number; heightNormalized: number; widthPx?: number; heightPx?: number };
  field: DesignField;
  canvas: CanvasRepresentation;
  context?: DynamicDesignContext;
  brand?: BrandDesignRepresentation;
  /** Already placed elements to avoid collision with */
  existingElements?: FieldRect[];
  /** Minimum safe margin from canvas boundary (default 0.04) */
  safeMargin?: number;
  /** Custom scoring weights for placement evaluation */
  customWeights?: Partial<PlacementScoringWeights>;
  /** Maximum candidate positions to return (sorted by compositeScore) */
  maxCandidates?: number;
  /** Enable continuous coarse-to-fine local refinement (default true) */
  refineContinuous?: boolean;
  /** Configurable sampling grid resolution */
  samplingResolution?: { xSteps?: number; ySteps?: number };
}

// ─── Continuous Spatial Evaluation Helper ────────────────────────────────────

/**
 * Evaluates a specific continuous bounding box against the DesignField,
 * extracting all spatial interaction signals.
 */
export function evaluatePlacementRegion(params: {
  rect: FieldRect;
  field: DesignField;
  canvas: CanvasRepresentation;
  existingElements?: FieldRect[];
  safeMargin?: number;
  weights?: PlacementScoringWeights;
  preferredRegion?: 'upper' | 'top' | 'lower' | 'bottom' | 'center';
  relationshipMode?: TextImageRelationshipMode;
}): { signals: SpatialInteractionSignals; scores: PlacementScores; reasons: string[] } {
  const {
    rect,
    field,
    canvas,
    existingElements = [],
    safeMargin = canvas.safeBounds ? canvas.safeBounds.x : 0.04,
    weights = DEFAULT_PLACEMENT_WEIGHTS,
    preferredRegion,
    relationshipMode,
  } = params;

  // 1. ImageField Regional Evaluation (O(1) SAT backend)
  const regionEval = field.evaluateRegion(rect);
  const localLuminance = Number(regionEval.meanLuminance.toFixed(3));
  const detailEnergy = Number(regionEval.detailEnergy.toFixed(3));
  const quietness = Number((1.0 - Math.min(1.0, detailEnergy * 2.2)).toFixed(3));

  // 2. Continuous Spatial Occupancy & Subject Overlap Analysis
  const rawImage = field.rawImageField;
  const occupancy = regionEval.occupancy !== undefined ? regionEval.occupancy : (rawImage.occupancyAt ? rawImage.occupancyAt(rect) : regionEval.subjectOcclusion);
  const totalMass = rawImage.totalOccupancyMass ?? 1.0;
  const rectMass = regionEval.occupancyMass !== undefined ? regionEval.occupancyMass : (rawImage.occupancyMass ? rawImage.occupancyMass(rect) : 0);

  const { noiseFloor, classification: clsThresholds } = SPATIAL_OCCUPANCY_CALIBRATION;
  const overlapRatio = occupancy < noiseFloor ? 0 : Number(Math.min(1.0, occupancy).toFixed(3));
  const subjectOcclusionRatio = rectMass < 0.001 || overlapRatio === 0 ? 0 : Number((rectMass / Math.max(0.001, totalMass)).toFixed(3));
  const overlapDetailEnergy = Number(detailEnergy.toFixed(3));

  let classification: SubjectOverlapSignal['classification'] = 'none';
  if (subjectOcclusionRatio > clsThresholds.focalCoreOcclusion || overlapRatio > clsThresholds.focalCoreOverlap) {
    classification = 'focal-core';
  } else if (
    overlapDetailEnergy > clsThresholds.texturedFieldDetailEnergy ||
    overlapRatio > clsThresholds.texturedFieldOverlap ||
    subjectOcclusionRatio > clsThresholds.texturedFieldOcclusion
  ) {
    classification = 'textured-field';
  } else if (overlapRatio > clsThresholds.peripheralOverlap) {
    classification = 'peripheral';
  }

  const subjectOverlap: SubjectOverlapSignal = {
    overlapRatio,
    subjectOcclusionRatio,
    overlapDetailEnergy,
    classification,
  };

  // 3. Focal Distance & Relationship
  const textCenterX = rect.x + rect.width / 2;
  const textCenterY = rect.y + rect.height / 2;
  const dx = textCenterX - field.focalCentroid.x;
  const dy = textCenterY - field.focalCentroid.y;
  const focalDistance = Number(Math.sqrt(dx * dx + dy * dy).toFixed(3));

  let focalRelationship: SpatialInteractionSignals['focalRelationship'] = 'distant';
  if (focalDistance < 0.20) focalRelationship = 'containing';
  else if (focalDistance < 0.40) focalRelationship = 'adjacent';
  else if (focalDistance < 0.65) focalRelationship = 'offset';

  // 4. Edge Margins & Canvas Boundary Pressure
  const topMargin = rect.y;
  const bottomMargin = 1.0 - (rect.y + rect.height);
  const leftMargin = rect.x;
  const rightMargin = 1.0 - (rect.x + rect.width);
  const minMargin = Math.min(topMargin, bottomMargin, leftMargin, rightMargin);

  let boundaryPressure = 0;
  if (minMargin < safeMargin) {
    boundaryPressure = Number(((safeMargin - minMargin) / safeMargin).toFixed(3));
  }

  // 5. Contrast Potential
  const darkDiff = Math.abs(localLuminance - 0.05);
  const lightDiff = Math.abs(localLuminance - 0.95);
  const maxPolarDiff = Math.max(darkDiff, lightDiff);
  const contrastPotential = Number(Math.min(1.0, maxPolarDiff * (1.1 - detailEnergy * 0.4)).toFixed(3));

  // 6. Element Collisions (with already placed elements)
  let elementCollision = 0;
  for (const elem of existingElements) {
    const ox = Math.max(0, Math.min(rect.x + rect.width, elem.x + elem.width) - Math.max(rect.x, elem.x));
    const oy = Math.max(0, Math.min(rect.y + rect.height, elem.y + elem.height) - Math.max(rect.y, elem.y));
    const colArea = ox * oy;
    if (colArea > 0) {
      const colRatio = colArea / Math.max(0.0001, rect.width * rect.height);
      elementCollision = Math.max(elementCollision, colRatio);
    }
  }

  // 7. Spatial Scoring
  const legibilityScore = Number((quietness * 0.55 + contrastPotential * 0.45).toFixed(3));
  const referenceMargin = canvas.safeBounds ? canvas.safeBounds.x : (safeMargin || 0.04);
  const spatialBalanceScore = Number((Math.min(1.0, minMargin / Math.max(0.01, referenceMargin)) * (1.0 - boundaryPressure)).toFixed(3));

  // Subject Harmony: gentle penalty for peripheral overlap, strong penalty for core occlusion
  const maxOverlapSignal = Math.max(overlapRatio, subjectOcclusionRatio);
  const isIntentionalMaterial =
    relationshipMode === 'MATERIAL_INTERACTION' ||
    relationshipMode === 'BOUNDARY_INTERACTION' ||
    relationshipMode === 'CONTAINED' ||
    relationshipMode === 'EMBEDDED';

  let subjectPenalty = 0;
  if (classification === 'focal-core') {
    subjectPenalty = (isIntentionalMaterial ? 0.35 : 0.85) * maxOverlapSignal;
  } else if (classification === 'textured-field') {
    subjectPenalty = (isIntentionalMaterial ? 0.08 : 0.30) * maxOverlapSignal;
  } else if (classification === 'peripheral') {
    subjectPenalty = (isIntentionalMaterial ? 0.02 : 0.12) * maxOverlapSignal;
  }
  const subjectHarmonyScore = Number(Math.max(0, 1.0 - subjectPenalty).toFixed(3));

  // Art Director Spatial Sanctuary Guidance (gentle guidance, allowing natural image field discovery)
  let spatialSanctuaryScore = 0;
  if (preferredRegion) {
    const isUpper = preferredRegion === 'upper' || preferredRegion === 'top';
    const isLower = preferredRegion === 'lower' || preferredRegion === 'bottom';
    if (isUpper && rect.y + rect.height <= 0.52) {
      spatialSanctuaryScore = 0.06;
    } else if (isLower && rect.y >= 0.42) {
      spatialSanctuaryScore = 0.06;
    }
  }

  const totalW = weights.legibilityWeight + weights.spatialBalanceWeight + weights.subjectHarmonyWeight;
  const rawComposite =
    (legibilityScore * weights.legibilityWeight +
      spatialBalanceScore * weights.spatialBalanceWeight +
      subjectHarmonyScore * weights.subjectHarmonyWeight) /
    totalW + spatialSanctuaryScore;

  const penalizedComposite = Math.max(
    0.05,
    rawComposite -
      elementCollision * weights.collisionPenaltyWeight -
      boundaryPressure * weights.boundaryPressureWeight
  );

  const compositeScore = Number(penalizedComposite.toFixed(3));

  const signals: SpatialInteractionSignals = {
    localLuminance,
    detailEnergy,
    quietness,
    subjectOverlap,
    focalDistance,
    focalRelationship,
    edgeMargins: {
      top: Number(topMargin.toFixed(3)),
      bottom: Number(bottomMargin.toFixed(3)),
      left: Number(leftMargin.toFixed(3)),
      right: Number(rightMargin.toFixed(3)),
      minMargin: Number(minMargin.toFixed(3)),
    },
    canvasBoundaryPressure: boundaryPressure,
    contrastPotential,
    elementCollision: Number(elementCollision.toFixed(3)),
  };

  const scores: PlacementScores = {
    legibilityScore,
    spatialBalanceScore,
    subjectHarmonyScore,
    compositeScore,
  };

  const reasons: string[] = [
    `Quietness: ${(quietness * 100).toFixed(0)}% (detail energy: ${detailEnergy})`,
    `Luminance: ${localLuminance} | Contrast potential: ${(contrastPotential * 100).toFixed(0)}%`,
    `Subject overlap: ${classification} (${(overlapRatio * 100).toFixed(0)}% text area)`,
    `Edge clearance min margin: ${(minMargin * 100).toFixed(1)}%`,
  ];

  return { signals, scores, reasons };
}

// ─── Continuous Placement Discovery Engine ──────────────────────────────────

/**
 * Explores continuous 2D space to discover viable placement positions for a
 * given typography state across the Dynamic Design Field.
 */
export function discoverPlacementCandidates(
  options: PlacementDiscoveryOptions
): PlacementCandidate[] {
  const {
    typographyState,
    field,
    canvas,
    existingElements = [],
    safeMargin = options.safeMargin ?? (canvas.safeBounds ? canvas.safeBounds.x : 0.04),
    customWeights,
    maxCandidates = 8,
    refineContinuous = true,
    samplingResolution,
    preferredRegion,
    relationshipMode = options.relationshipMode,
  } = options;

  const weights: PlacementScoringWeights = {
    ...DEFAULT_PLACEMENT_WEIGHTS,
    ...customWeights,
  };

  // 1. Resolve Normalized Width and Height of the Typography State
  let widthNorm = 0.5;
  let heightNorm = 0.15;
  let copyId: string | undefined;

  if ('boundingBox' in typographyState) {
    widthNorm = typographyState.boundingBox.widthNormalized;
    heightNorm = typographyState.boundingBox.heightNormalized;
    copyId = (typographyState as any).copyId;
  } else if ('estimatedBoundingBox' in typographyState) {
    widthNorm = typographyState.estimatedBoundingBox.widthNormalized;
    heightNorm = typographyState.estimatedBoundingBox.heightNormalized;
    copyId = (typographyState as any).copyId;
  } else {
    widthNorm = typographyState.widthNormalized;
    heightNorm = typographyState.heightNormalized;
    copyId = typographyState.copyId ?? (typographyState as any).id;
  }

  // Ensure dimensions stay within canvas boundaries
  widthNorm = Math.min(1.0 - safeMargin * 2, Math.max(0.1, widthNorm));
  heightNorm = Math.min(1.0 - safeMargin * 2, Math.max(0.03, heightNorm));

  const maxStartX = Math.max(safeMargin, 1.0 - safeMargin - widthNorm);
  const maxStartY = Math.max(safeMargin, 1.0 - safeMargin - heightNorm);

  // 2. Multi-Point Continuous Spatial Sampling
  const initialSamples: Array<{ x: number; y: number }> = [];

  const xSteps = samplingResolution?.xSteps ?? (maxStartX > safeMargin + 0.02 ? 8 : 1);
  const ySteps = samplingResolution?.ySteps ?? (maxStartY > safeMargin + 0.02 ? 10 : 1);
  const xSpan = maxStartX - safeMargin;
  const ySpan = maxStartY - safeMargin;

  for (let ix = 0; ix <= xSteps; ix++) {
    const x = safeMargin + (xSpan > 0 ? (ix / xSteps) * xSpan : 0);
    for (let iy = 0; iy <= ySteps; iy++) {
      const y = safeMargin + (ySpan > 0 ? (iy / ySteps) * ySpan : 0);
      initialSamples.push({ x, y });
    }
  }

  // 3. Evaluate Initial Sample Candidates
  const evaluatedSeeds: Array<{
    x: number;
    y: number;
    rect: FieldRect;
    signals: SpatialInteractionSignals;
    scores: PlacementScores;
    reasons: string[];
  }> = [];

  for (const sample of initialSamples) {
    const rect: FieldRect = {
      x: sample.x,
      y: sample.y,
      width: widthNorm,
      height: heightNorm,
    };

    const evalResult = evaluatePlacementRegion({
      rect,
      field,
      canvas,
      existingElements,
      safeMargin,
      weights,
      preferredRegion,
      relationshipMode,
    });

    evaluatedSeeds.push({
      x: sample.x,
      y: sample.y,
      rect,
      ...evalResult,
    });
  }

  // Sort seeds by score
  evaluatedSeeds.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);

  // 4. Continuous Local Refinement (Coarse-to-Fine Gradient Step)
  const refinedCandidates: PlacementCandidate[] = [];
  const topSeeds = evaluatedSeeds.slice(0, Math.max(48, maxCandidates * 4));

  for (const seed of topSeeds) {
    let bestX = seed.x;
    let bestY = seed.y;
    let bestScore = seed.scores.compositeScore;
    let bestResult = { signals: seed.signals, scores: seed.scores, reasons: seed.reasons };

    if (refineContinuous && (xSpan > 0.02 || ySpan > 0.02)) {
      const microSteps = [0.015, 0.0075, -0.015, -0.0075];

      for (const dx of microSteps) {
        for (const dy of microSteps) {
          const testX = Math.max(safeMargin, Math.min(maxStartX, bestX + dx));
          const testY = Math.max(safeMargin, Math.min(maxStartY, bestY + dy));

          const testRect: FieldRect = {
            x: testX,
            y: testY,
            width: widthNorm,
            height: heightNorm,
          };

          const testEval = evaluatePlacementRegion({
            rect: testRect,
            field,
            canvas,
            existingElements,
            safeMargin,
            weights,
            preferredRegion,
            relationshipMode,
          });

          if (testEval.scores.compositeScore > bestScore) {
            bestScore = testEval.scores.compositeScore;
            bestX = testX;
            bestY = testY;
            bestResult = testEval;
          }
        }
      }
    }

    const finalRect: FieldRect = {
      x: Number(bestX.toFixed(4)),
      y: Number(bestY.toFixed(4)),
      width: Number(widthNorm.toFixed(4)),
      height: Number(heightNorm.toFixed(4)),
    };

    const pixelBounds = {
      xPx: Math.round(finalRect.x * canvas.width),
      yPx: Math.round(finalRect.y * canvas.height),
      widthPx: Math.round(finalRect.width * canvas.width),
      heightPx: Math.round(finalRect.height * canvas.height),
    };

    refinedCandidates.push({
      rect: finalRect,
      pixelBounds,
      copyId,
      typographyState: 'hypothesis' in typographyState ? (typographyState as LineStructureState) : undefined,
      signals: bestResult.signals,
      scores: bestResult.scores,
      reasons: bestResult.reasons,
    });
  }

  // 5. Spatial Diversity Filtering (Preserve distinct clusters: top, center, bottom, left, right)
  refinedCandidates.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);

  const diverseCandidates: PlacementCandidate[] = [];
  const minSpatialDistance = 0.12;

  for (const cand of refinedCandidates) {
    const isTooClose = diverseCandidates.some((existing) => {
      const cdx = cand.rect.x - existing.rect.x;
      const cdy = cand.rect.y - existing.rect.y;
      return Math.sqrt(cdx * cdx + cdy * cdy) < minSpatialDistance;
    });

    if (!isTooClose) {
      diverseCandidates.push(cand);
      if (diverseCandidates.length >= maxCandidates) break;
    }
  }

  // If diversity filter is too strict, fill remaining slots
  if (diverseCandidates.length < maxCandidates) {
    for (const cand of refinedCandidates) {
      if (!diverseCandidates.includes(cand)) {
        diverseCandidates.push(cand);
        if (diverseCandidates.length >= maxCandidates) break;
      }
    }
  }

  return diverseCandidates.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
}

// ─── Multi-Element Placement Assistant ──────────────────────────────────────

export interface MultiElementPlacementInput {
  primaryState: LineStructureState | DynamicTypeStep | { copyId?: string; id?: string; widthNormalized: number; heightNormalized: number; widthPx?: number; heightPx?: number };
  secondaryStates?: Array<LineStructureState | DynamicTypeStep | { copyId?: string; id?: string; widthNormalized: number; heightNormalized: number; widthPx?: number; heightPx?: number }>;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<PlacementScoringWeights>;
}

export interface MultiElementCompositionState {
  primaryPlacement: PlacementCandidate;
  secondaryPlacements: Record<string, PlacementCandidate>;
  placedRects: FieldRect[];
  overallBalanceScore: number;
}

/**
 * Discovers coherent continuous placements for multiple related text elements
 * (Headline, Secondary Hook, CTA).
 */
export function discoverMultiElementPlacements(
  input: MultiElementPlacementInput
): MultiElementCompositionState[] {
  const { primaryState, secondaryStates = [], field, canvas, brand, customWeights } = input;

  // 1. Discover primary placements across the continuous field
  const primaryCandidates = discoverPlacementCandidates({
    typographyState: primaryState,
    field,
    canvas,
    brand,
    customWeights,
    maxCandidates: 4,
  });

  const compositionStates: MultiElementCompositionState[] = [];

  for (const primary of primaryCandidates) {
    const placedRects: FieldRect[] = [primary.rect];
    const secondaryPlacements: Record<string, PlacementCandidate> = {};
    let totalScore = primary.scores.compositeScore;

    // 2. Discover harmonious placements for secondary elements
    for (let i = 0; i < secondaryStates.length; i++) {
      const secState = secondaryStates[i];
      const secKey =
        (secState as any).copyId ??
        (secState as any).id ??
        `sec-${i}`;

      const secCandidates = discoverPlacementCandidates({
        typographyState: secState,
        field,
        canvas,
        brand,
        existingElements: placedRects,
        customWeights,
        maxCandidates: 1,
      });

      if (secCandidates.length > 0) {
        const topSec = secCandidates[0];
        secondaryPlacements[secKey] = topSec;
        placedRects.push(topSec.rect);
        totalScore += topSec.scores.compositeScore;
      }
    }

    const avgScore = Number((totalScore / (1 + secondaryStates.length)).toFixed(3));

    compositionStates.push({
      primaryPlacement: primary,
      secondaryPlacements,
      placedRects,
      overallBalanceScore: avgScore,
    });
  }

  return compositionStates.sort((a, b) => b.overallBalanceScore - a.overallBalanceScore);
}

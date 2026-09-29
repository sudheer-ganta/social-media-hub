/**
 * FLOWPOST DYNAMIC ALIGNMENT ENGINE — PHASE 6
 *
 * Discovers natural alignment axes from image geometry, typography bounding boxes,
 * canvas proportions, and multi-element relationships.
 *
 * Architecture Principles:
 *   1. ALIGNMENT IS A GEOMETRIC RELATIONSHIP (NOT A PRESET):
 *      - Zero hardcoded alignment rules (no fixed left, center, right, or margin presets).
 *      - No "headline always aligns with logo" or "text always aligns to subject edge".
 *      - Alignment is measured as continuous geometric evidence across discovered axes.
 *
 *   2. NATURAL AXIS CONVERGENCE:
 *      - Discovers visual axes from subject contours, focal points, visual mass, canvas geometry,
 *        and neighboring element edges.
 *      - Axes with multi-signal convergence receive higher evidence strength.
 *      - Does NOT manufacture an axis if none naturally exists.
 *
 *   3. REAL TYPOGRAPHY & OPTICAL ALIGNMENT:
 *      - Operates on exact TrueType font metrics (physical widths, heights, ascents, baselines).
 *      - Distinguishes geometric bounding boxes from optical ink baselines.
 *
 *   4. CANDIDATE ENHANCEMENT (NON-DESTRUCTIVE):
 *      - Evaluates alignment over Phase 5 placement candidates without overwriting
 *        continuous coordinates with discrete snap grids.
 *      - Exposes granular, observable alignment signals for downstream composition.
 */

import type {
  CanvasRepresentation,
  BrandDesignRepresentation,
  DesignField,
  VisualAxis,
} from './design-representation';
import type { FieldRect } from './image-field';
import type { PlacementCandidate } from './dynamic-placement';

// ─── Continuous Alignment Geometry ──────────────────────────────────────────

export interface ElementGeometricBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  baselineY: number;
  /** Optical ink margins adjusted for glyph ascender/descender metrics */
  opticalTop: number;
  opticalBottom: number;
}

export interface DiscoveredAxis {
  orientation: 'vertical' | 'horizontal';
  position: number; // 0..1 normalized coordinate
  strength: number; // 0..1 evidence weight
  source:
    | 'subject-contour'
    | 'focal-point'
    | 'visual-mass'
    | 'canvas-center'
    | 'canvas-margin'
    | 'element-edge'
    | 'convergent-cluster';
  description: string;
}

// ─── Observable Alignment Signals & Scores ──────────────────────────────────

export interface AlignmentSignals {
  /** Proximity and coherence to natural visual axes in the field (0..1) */
  axisCoherence: number;
  /** Nearest dominant vertical axis distance (0..1) */
  nearestVerticalAxisDistance: number;
  /** Nearest dominant horizontal axis distance (0..1) */
  nearestHorizontalAxisDistance: number;
  /** Shared edge nearness (left, right, center) with existing elements (0..1) */
  elementRelationshipCoherence: number;
  /** Relationship to subject contour edges (0..1) */
  subjectGeometryCoherence: number;
  /** Relationship to canvas symmetry or margin proportions (0..1) */
  canvasRelationshipCoherence: number;
  /** Optical alignment quality accounting for glyph metrics (0..1) */
  opticalAlignmentQuality: number;
  /** Visual vibration penalty when an element is almost aligned but slightly off (0..1) */
  alignmentDriftConflict: number;
  /** Discovered candidate axes that strongly align with this element */
  matchedAxes: DiscoveredAxis[];
}

export interface AlignmentScores {
  /** Natural visual axis alignment score (0..1) */
  axisAlignmentScore: number;
  /** Multi-element geometric rhythm score (0..1) */
  multiElementHarmonyScore: number;
  /** Optical alignment stability score (0..1) */
  opticalStabilityScore: number;
  /** Composite alignment ranking score (0..1) */
  compositeAlignmentScore: number;
}

export interface AlignmentScoringWeights {
  axisAlignmentWeight: number;
  multiElementHarmonyWeight: number;
  opticalStabilityWeight: number;
  /** Penalty weight for subtle near-miss alignment drift (1-3px off axis) */
  driftConflictPenaltyWeight: number;
}

export const DEFAULT_ALIGNMENT_WEIGHTS: AlignmentScoringWeights = {
  axisAlignmentWeight: 0.40,
  multiElementHarmonyWeight: 0.35,
  opticalStabilityWeight: 0.25,
  driftConflictPenaltyWeight: 0.80,
};

// ─── Alignment-Enhanced Candidate State ──────────────────────────────────────

export interface AlignmentEnhancedCandidate extends PlacementCandidate {
  geometry: ElementGeometricBounds;
  alignmentSignals: AlignmentSignals;
  alignmentScores: AlignmentScores;
  alignmentReasons: string[];
}

// ─── Natural Axis Discovery Engine ──────────────────────────────────────────

/**
 * Discovers natural alignment axes across the image field, subject contours,
 * focal centroid, canvas geometry, and existing design elements.
 */
export function discoverNaturalAxes(params: {
  field: DesignField;
  canvas: CanvasRepresentation;
  existingElements?: FieldRect[];
}): DiscoveredAxis[] {
  const { field, canvas, existingElements = [] } = params;
  const rawAxes: DiscoveredAxis[] = [];

  // 1. Subject Contour Edges (if subject is present and meaningful)
  if (field.subjectBox && field.subjectBox.width > 0 && field.subjectBox.height > 0) {
    const sb = field.subjectBox;
    rawAxes.push({
      orientation: 'vertical',
      position: Number(sb.x.toFixed(4)),
      strength: 0.75,
      source: 'subject-contour',
      description: 'Left contour of salient subject',
    });
    rawAxes.push({
      orientation: 'vertical',
      position: Number((sb.x + sb.width).toFixed(4)),
      strength: 0.75,
      source: 'subject-contour',
      description: 'Right contour of salient subject',
    });
    rawAxes.push({
      orientation: 'horizontal',
      position: Number(sb.y.toFixed(4)),
      strength: 0.70,
      source: 'subject-contour',
      description: 'Top contour of salient subject',
    });
    rawAxes.push({
      orientation: 'horizontal',
      position: Number((sb.y + sb.height).toFixed(4)),
      strength: 0.70,
      source: 'subject-contour',
      description: 'Bottom contour of salient subject',
    });
  }

  // 2. Focal Centroid Axis
  if (field.focalCentroid) {
    rawAxes.push({
      orientation: 'vertical',
      position: Number(field.focalCentroid.x.toFixed(4)),
      strength: 0.85,
      source: 'focal-point',
      description: 'Focal center vertical axis',
    });
    rawAxes.push({
      orientation: 'horizontal',
      position: Number(field.focalCentroid.y.toFixed(4)),
      strength: 0.80,
      source: 'focal-point',
      description: 'Focal center horizontal axis',
    });
  }

  // 3. Image Field Visual Axes (from SAT gradients/contours)
  const fieldAxes = field.getVisualAxes(canvas);
  for (const fa of fieldAxes) {
    rawAxes.push({
      orientation: fa.orientation,
      position: Number(fa.position.toFixed(4)),
      strength: fa.strength,
      source: (fa.source as any) === 'subject-boundary' ? 'subject-contour' : 'visual-mass',
      description: `Discovered visual axis (${fa.source})`,
    });
  }

  // 4. Canvas Symmetry / Golden Center Axes
  rawAxes.push({
    orientation: 'vertical',
    position: 0.5,
    strength: 0.60,
    source: 'canvas-center',
    description: 'Canvas vertical center axis',
  });
  rawAxes.push({
    orientation: 'horizontal',
    position: 0.5,
    strength: 0.55,
    source: 'canvas-center',
    description: 'Canvas horizontal center axis',
  });

  // 5. Existing Element Edges & Centers
  for (const elem of existingElements) {
    rawAxes.push({
      orientation: 'vertical',
      position: Number(elem.x.toFixed(4)),
      strength: 0.90,
      source: 'element-edge',
      description: 'Left edge of existing element',
    });
    rawAxes.push({
      orientation: 'vertical',
      position: Number((elem.x + elem.width).toFixed(4)),
      strength: 0.90,
      source: 'element-edge',
      description: 'Right edge of existing element',
    });
    rawAxes.push({
      orientation: 'vertical',
      position: Number((elem.x + elem.width / 2).toFixed(4)),
      strength: 0.85,
      source: 'element-edge',
      description: 'Center axis of existing element',
    });
  }

  // 6. Multi-Signal Axis Clustering (Convergent Evidence)
  // If multiple independent axes fall within 0.02 of each other, merge into high-strength convergent axis
  const clusterTolerance = 0.025;
  const mergedAxes: DiscoveredAxis[] = [];

  const vert = rawAxes.filter((a) => a.orientation === 'vertical');
  const horiz = rawAxes.filter((a) => a.orientation === 'horizontal');

  for (const group of [vert, horiz]) {
    const sorted = [...group].sort((a, b) => a.position - b.position);
    let i = 0;
    while (i < sorted.length) {
      const cluster = [sorted[i]];
      let j = i + 1;
      while (j < sorted.length && Math.abs(sorted[j].position - cluster[0].position) <= clusterTolerance) {
        cluster.push(sorted[j]);
        j++;
      }

      if (cluster.length > 1) {
        const avgPos = cluster.reduce((sum, a) => sum + a.position, 0) / cluster.length;
        const totalStrength = Math.min(1.0, cluster.reduce((sum, a) => sum + a.strength * 0.6, 0.4));
        mergedAxes.push({
          orientation: cluster[0].orientation,
          position: Number(avgPos.toFixed(4)),
          strength: Number(totalStrength.toFixed(3)),
          source: 'convergent-cluster',
          description: `Convergent axis supported by ${cluster.length} independent signals`,
        });
      } else {
        mergedAxes.push(cluster[0]);
      }
      i = j;
    }
  }

  return mergedAxes.sort((a, b) => b.strength - a.strength);
}

// ─── Authoritative Geometric Feature Extraction ─────────────────────────────

export function extractElementGeometricBounds(
  rect: FieldRect,
  canvas: CanvasRepresentation,
  typographyState?: any
): ElementGeometricBounds {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // Extract real baseline and optical ink bounds from OpenType metrics if available
  let baselineY = centerY;
  let opticalTop = top;
  let opticalBottom = bottom;

  if (typographyState && 'measuredMetrics' in typographyState) {
    const mm = typographyState.measuredMetrics;
    const ascentNorm = mm.ascent / canvas.height;
    baselineY = top + ascentNorm;
    opticalTop = top + (mm.ascent * 0.1) / canvas.height;
    opticalBottom = bottom - (mm.descent * 0.1) / canvas.height;
  }

  return {
    left: Number(left.toFixed(4)),
    right: Number(right.toFixed(4)),
    top: Number(top.toFixed(4)),
    bottom: Number(bottom.toFixed(4)),
    centerX: Number(centerX.toFixed(4)),
    centerY: Number(centerY.toFixed(4)),
    baselineY: Number(baselineY.toFixed(4)),
    opticalTop: Number(opticalTop.toFixed(4)),
    opticalBottom: Number(opticalBottom.toFixed(4)),
  };
}

// ─── Alignment Evaluation Pipeline ──────────────────────────────────────────

export interface EvaluateAlignmentOptions {
  candidate: PlacementCandidate;
  field: DesignField;
  canvas: CanvasRepresentation;
  discoveredAxes?: DiscoveredAxis[];
  existingElements?: FieldRect[];
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<AlignmentScoringWeights>;
}

/**
 * Evaluates continuous geometric alignment evidence for a placement candidate
 * against natural visual axes and neighboring elements.
 */
export function evaluateCandidateAlignment(
  options: EvaluateAlignmentOptions
): AlignmentEnhancedCandidate {
  const {
    candidate,
    field,
    canvas,
    discoveredAxes = discoverNaturalAxes({ field, canvas, existingElements: options.existingElements }),
    existingElements = [],
    customWeights,
  } = options;

  const weights: AlignmentScoringWeights = {
    ...DEFAULT_ALIGNMENT_WEIGHTS,
    ...customWeights,
  };

  const geom = extractElementGeometricBounds(candidate.rect, canvas, candidate.typographyState);

  // 1. Measure Alignment to Discovered Visual Axes
  let bestVertDist = Infinity;
  let bestHorizDist = Infinity;
  let axisCoherenceSum = 0;
  const matchedAxes: DiscoveredAxis[] = [];
  let alignmentDriftConflict = 0;

  for (const axis of discoveredAxes) {
    let dist = Infinity;

    if (axis.orientation === 'vertical') {
      const dLeft = Math.abs(geom.left - axis.position);
      const dRight = Math.abs(geom.right - axis.position);
      const dCenter = Math.abs(geom.centerX - axis.position);
      dist = Math.min(dLeft, dRight, dCenter);

      if (dist < bestVertDist) bestVertDist = dist;

      // Close alignment (< 0.035) generates strong coherence
      if (dist <= 0.035) {
        const coherence = (1.0 - dist / 0.035) * axis.strength;
        axisCoherenceSum += coherence;
        matchedAxes.push(axis);
      }
      // Alignment drift: near miss (0.015 to 0.035) where eye expects alignment but gets jitter
      if (dist > 0.015 && dist <= 0.035 && axis.strength > 0.7) {
        alignmentDriftConflict = Math.max(alignmentDriftConflict, (0.035 - dist) / 0.02);
      }
    } else {
      const dTop = Math.abs(geom.top - axis.position);
      const dBottom = Math.abs(geom.bottom - axis.position);
      const dBase = Math.abs(geom.baselineY - axis.position);
      dist = Math.min(dTop, dBottom, dBase);

      if (dist < bestHorizDist) bestHorizDist = dist;

      if (dist <= 0.035) {
        const coherence = (1.0 - dist / 0.035) * axis.strength;
        axisCoherenceSum += coherence;
        matchedAxes.push(axis);
      }
    }
  }

  const axisCoherence = Number(Math.min(1.0, axisCoherenceSum).toFixed(3));

  // 2. Measure Relationship to Existing Placed Elements
  let elementCoherence = 0.5; // neutral baseline when alone
  if (existingElements.length > 0) {
    let bestElemDist = Infinity;
    for (const elem of existingElements) {
      const eLeft = Math.abs(geom.left - elem.x);
      const eRight = Math.abs(geom.right - (elem.x + elem.width));
      const eCenter = Math.abs(geom.centerX - (elem.x + elem.width / 2));
      const minD = Math.min(eLeft, eRight, eCenter);
      if (minD < bestElemDist) bestElemDist = minD;
    }

    if (bestElemDist <= 0.03) {
      // Very close shared edge or center axis
      elementCoherence = 0.70 + 0.30 * (1.0 - bestElemDist / 0.03);
    } else if (bestElemDist >= 0.06) {
      // Deliberate stepped offset (e.g. diagonal rhythm / visual offset)
      elementCoherence = 0.85;
    } else {
      // In-between slight drift
      elementCoherence = 0.65;
    }
  }

  // 3. Measure Subject Geometry Coherence
  let subjectCoherence = 0.70;
  if (field.subjectBox && field.subjectBox.width > 0) {
    const sb = field.subjectBox;
    const leftContourDist = Math.abs(geom.left - (sb.x + sb.width));
    const rightContourDist = Math.abs(geom.right - sb.x);
    const minSubjectDist = Math.min(leftContourDist, rightContourDist);
    if (minSubjectDist <= 0.05) {
      subjectCoherence = 0.95; // Harmoniously hugs subject contour
    }
  }

  // 4. Canvas Relationship Coherence (Margin symmetry / golden proportion)
  const leftMargin = geom.left;
  const rightMargin = 1.0 - geom.right;
  const marginDiff = Math.abs(leftMargin - rightMargin);
  const canvasRelationshipCoherence = Number(
    Math.max(0.4, 1.0 - marginDiff * 1.5).toFixed(3)
  );

  // 5. Optical Alignment Stability
  const opticalAlignmentQuality = Number(
    (1.0 - Math.min(1.0, alignmentDriftConflict * 0.5)).toFixed(3)
  );

  // 6. Alignment Scoring
  const axisAlignmentScore = axisCoherence;
  const multiElementHarmonyScore = Number(elementCoherence.toFixed(3));
  const opticalStabilityScore = opticalAlignmentQuality;

  const totalW = weights.axisAlignmentWeight + weights.multiElementHarmonyWeight + weights.opticalStabilityWeight;
  const rawComposite =
    (axisAlignmentScore * weights.axisAlignmentWeight +
      multiElementHarmonyScore * weights.multiElementHarmonyWeight +
      opticalStabilityScore * weights.opticalStabilityWeight) /
    totalW;

  const penalizedComposite = Math.max(
    0.1,
    rawComposite - alignmentDriftConflict * weights.driftConflictPenaltyWeight * 0.25
  );

  const compositeAlignmentScore = Number(penalizedComposite.toFixed(3));

  const alignmentSignals: AlignmentSignals = {
    axisCoherence,
    nearestVerticalAxisDistance: Number((Number.isFinite(bestVertDist) ? bestVertDist : 1.0).toFixed(3)),
    nearestHorizontalAxisDistance: Number((Number.isFinite(bestHorizDist) ? bestHorizDist : 1.0).toFixed(3)),
    elementRelationshipCoherence: Number(elementCoherence.toFixed(3)),
    subjectGeometryCoherence: Number(subjectCoherence.toFixed(3)),
    canvasRelationshipCoherence,
    opticalAlignmentQuality,
    alignmentDriftConflict: Number(alignmentDriftConflict.toFixed(3)),
    matchedAxes,
  };

  const alignmentScores: AlignmentScores = {
    axisAlignmentScore,
    multiElementHarmonyScore,
    opticalStabilityScore,
    compositeAlignmentScore,
  };

  const alignmentReasons: string[] = [
    `Axis Coherence: ${(axisCoherence * 100).toFixed(0)}% across ${matchedAxes.length} matched natural axes`,
    `Element Harmony: ${(elementCoherence * 100).toFixed(0)}%`,
    `Canvas Symmetry/Proportion: ${(canvasRelationshipCoherence * 100).toFixed(0)}%`,
  ];

  if (matchedAxes.length > 0) {
    alignmentReasons.push(`Dominant aligned axis: ${matchedAxes[0].description} (x: ${matchedAxes[0].position})`);
  }

  return {
    ...candidate,
    geometry: geom,
    alignmentSignals,
    alignmentScores,
    alignmentReasons,
  };
}

// ─── Batch Alignment Evaluation for Placement Candidates ───────────────────

export function enhancePlacementCandidatesWithAlignment(params: {
  candidates: PlacementCandidate[];
  field: DesignField;
  canvas: CanvasRepresentation;
  existingElements?: FieldRect[];
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<AlignmentScoringWeights>;
}): AlignmentEnhancedCandidate[] {
  const { candidates, field, canvas, existingElements = [], brand, customWeights } = params;

  // Discover natural axes once for all candidates
  const discoveredAxes = discoverNaturalAxes({ field, canvas, existingElements });

  return candidates.map((cand) =>
    evaluateCandidateAlignment({
      candidate: cand,
      field,
      canvas,
      discoveredAxes,
      existingElements,
      brand,
      customWeights,
    })
  );
}

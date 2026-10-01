/**
 * FLOWPOST DYNAMIC ALIGNMENT ENGINE — PHASE 6 (RESEARCH-BACKED RELATIONAL ALIGNMENT MODEL)
 *
 * Discovers natural alignment axes, derives per-composition design substrates,
 * builds relational alignment graphs across elements and image/canvas anchors,
 * evaluates optical metrics, and computes continuous alignment evidence.
 *
 * Grounded in Graphic Design Layout Research:
 *   1. BEYOND GRIDS:
 *      - Spatial layout structure is derived dynamically from concept, content, and context.
 *      - Zero hardcoded layout archetypes, quadrant presets, corner systems, or fixed margin rules.
 *
 *   2. NEURAL DESIGN NETWORK & CONTENT-AWARE COMPOSITION:
 *      - Mutual geometric and semantic relationships between layout elements are explicitly modeled.
 *      - Compositions are represented as a Relational Alignment Graph.
 *
 *   3. LADECO (SEMANTIC LAYERS & HIERARCHICAL COMPOSITION):
 *      - Distinguishes semantic element roles (headline, support, CTA, logo, annotations).
 *      - Determines whether elements should share an axis, form a group, use an independent anchor,
 *        or maintain an intentional asymmetric offset.
 *
 *   4. AESTHETIQ & OPTICAL TYPOGRAPHY:
 *      - Evaluates physical TrueType glyph/ink bounds, ascents, descenders, and baselines.
 *      - Rewards optical flushness and penalizes unintentional near-miss visual vibration.
 *      - Preserves intentional asymmetry and staggered rhythms without bias toward center or single axes.
 */

import type {
  CanvasRepresentation,
  BrandDesignRepresentation,
  DesignField,
} from './design-representation';
import type { FieldRect } from './image-field';
import type { PlacementCandidate } from './dynamic-placement';

// ─── 1. Continuous Alignment Geometry ──────────────────────────────────────────

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

// ─── 2. Relational Alignment Graph Model ────────────────────────────────────

export type AlignmentRelationshipType =
  | 'SHARES_LEFT_AXIS'
  | 'SHARES_RIGHT_AXIS'
  | 'SHARES_CENTER_AXIS'
  | 'SHARES_TOP_AXIS'
  | 'SHARES_BOTTOM_AXIS'
  | 'SHARES_BASELINE_AXIS'
  | 'IMAGE_AXIS_RELATION'
  | 'SUBJECT_CONTOUR_RELATION'
  | 'FOCAL_POINT_RELATION'
  | 'CANVAS_ANCHOR'
  | 'GROUPED_WITH'
  | 'INTENTIONAL_OFFSET'
  | 'INDEPENDENT_ANCHOR'
  | 'SEPARATED_FROM';

export interface AlignmentGraphNode {
  id: string;
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo' | 'visual-anchor' | 'canvas-anchor' | 'annotation' | 'decoration';
  bounds: ElementGeometricBounds;
  isAnchor?: boolean;
}

export interface AlignmentGraphEdge {
  sourceId: string;
  targetId: string;
  relationship: AlignmentRelationshipType;
  coherence: number; // 0..1 continuous quality
  offsetDelta: number; // physical / normalized coordinate delta
  strength: number; // 0..1 relationship importance
  description: string;
  evidence: {
    axisPosition?: number;
    axisOrientation?: 'vertical' | 'horizontal';
    sourceMetric?: string;
    targetMetric?: string;
    separationQuality?: number;
    isIntentionalAsymmetry?: boolean;
    offsetDelta?: number;
  };
}

export interface RejectedAlignmentAlternative {
  sourceId: string;
  targetId: string;
  candidateRelationship: AlignmentRelationshipType;
  score: number;
  rejectionReason: string;
}

export interface RelationalAlignmentGraph {
  nodes: AlignmentGraphNode[];
  edges: AlignmentGraphEdge[];
  pairwiseRelationshipScores: Record<string, number>;
  rejectedAlternatives: RejectedAlignmentAlternative[];
  overallGraphCoherence: number;
}

// ─── 3. Design Substrate Model ──────────────────────────────────────────────

export interface RelationalAnchor {
  id: string;
  type: 'focal-point' | 'subject-edge' | 'canvas-margin' | 'canvas-center' | 'visual-mass-centroid' | 'quiet-field-center';
  position: { x: number; y: number };
  strength: number;
  description: string;
}

export interface SemanticAlignmentGroup {
  id: string;
  roles: string[];
  elementIds: string[];
  primaryAxis?: DiscoveredAxis;
  groupAlignmentType: 'flush-left' | 'flush-right' | 'centered' | 'staggered-offset' | 'independent';
  internalCoherence: number; // 0..1
}

export interface IndependentAlignmentStructure {
  elementId: string;
  role: string;
  anchor: RelationalAnchor;
  separationFromMainGroup: number;
  justification: string;
}

export interface DesignSubstrate {
  id: string;
  candidateAxes: DiscoveredAxis[];
  selectedAxes: DiscoveredAxis[];
  relationalAnchors: RelationalAnchor[];
  semanticGroups: SemanticAlignmentGroup[];
  structuralHierarchy: Array<{ role: string; priorityLevel: number; assignedGroupOrAnchorId: string }>;
  repeatedAlignments: Array<{ axisPosition: number; orientation: 'vertical' | 'horizontal'; elementIds: string[] }>;
  independentAnchors: IndependentAlignmentStructure[];
  asymmetryRhythm: {
    hasIntentionalOffset: boolean;
    offsetDelta: number;
    coherence: number;
    description: string;
  };
  substrateCoherence: number;
}

// ─── 4. Observable Alignment Signals & Scores ──────────────────────────────────

export interface OpticalAlignmentEvidence {
  elementId: string;
  baselineY: number;
  opticalTop: number;
  opticalBottom: number;
  inkMarginDelta: number;
  opticalFlushnessScore: number;
}

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

export interface AlignmentScoreContributions {
  relationalCoherence: number;
  graphConsistency: number;
  substrateCoherence: number;
  imageAwareAxisRelationship: number;
  semanticGroupingConsistency: number;
  opticalCoherence: number;
  intentionalAsymmetryPreservation: number;
  driftPenalty: number;
}

export interface AlignmentScoringWeights {
  relationalCoherenceWeight: number;
  graphConsistencyWeight: number;
  substrateCoherenceWeight: number;
  imageAwareAxisWeight: number;
  semanticGroupingWeight: number;
  opticalCoherenceWeight: number;
  intentionalAsymmetryWeight: number;
  driftConflictPenaltyWeight: number;
  // Backward compatibility alias weights
  axisAlignmentWeight: number;
  multiElementHarmonyWeight: number;
  opticalStabilityWeight: number;
}

export const DEFAULT_ALIGNMENT_WEIGHTS: AlignmentScoringWeights = {
  relationalCoherenceWeight: 0.25,
  graphConsistencyWeight: 0.15,
  substrateCoherenceWeight: 0.15,
  imageAwareAxisWeight: 0.15,
  semanticGroupingWeight: 0.15,
  opticalCoherenceWeight: 0.10,
  intentionalAsymmetryWeight: 0.05,
  driftConflictPenaltyWeight: 0.80,
  // Backward compatibility aliases
  axisAlignmentWeight: 0.40,
  multiElementHarmonyWeight: 0.35,
  opticalStabilityWeight: 0.25,
};

// ─── 5. Complete Composition Alignment Observability Report ─────────────────

export interface CompositionAlignmentEvaluation {
  substrate: DesignSubstrate;
  graph: RelationalAlignmentGraph;
  semanticGroups: SemanticAlignmentGroup[];
  independentAnchors: IndependentAlignmentStructure[];
  opticalAlignmentEvidence: OpticalAlignmentEvidence[];
  pairwiseRelationshipScores: Record<string, number>;
  alignmentScoreContributions: AlignmentScoreContributions;
  compositeScore: number;
  rejectedAlternatives: RejectedAlignmentAlternative[];
  alignmentSummary: string[];
}

// ─── 6. Alignment-Enhanced Candidate State ──────────────────────────────────

export interface AlignmentEnhancedCandidate extends PlacementCandidate {
  geometry: ElementGeometricBounds;
  alignmentSignals: AlignmentSignals;
  alignmentScores: AlignmentScores;
  alignmentReasons: string[];
  substrate?: DesignSubstrate;
  relationalGraph?: RelationalAlignmentGraph;
}

// ─── 7. Natural Axis Discovery Engine ──────────────────────────────────────

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
      source: fa.source === 'subject-edge' ? 'subject-contour' : 'visual-mass',
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

// ─── 8. Authoritative Geometric Feature Extraction ──────────────────────────

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

// ─── 9. Design Substrate Derivation Engine ──────────────────────────────────

export interface ElementInput {
  id: string;
  role: string;
  rect: FieldRect;
  typographyState?: any;
}

/**
 * Derives the per-composition Design Substrate from concept, content, image structure,
 * and element geometry.
 */
export function deriveDesignSubstrate(params: {
  elements: ElementInput[];
  field: DesignField;
  canvas: CanvasRepresentation;
  concept?: any;
  brand?: BrandDesignRepresentation;
}): DesignSubstrate {
  const { elements, field, canvas } = params;

  // 1. Discover all natural candidate axes
  const candidateAxes = discoverNaturalAxes({
    field,
    canvas,
    existingElements: elements.map((e) => e.rect),
  });

  // 2. Derive Relational Anchors
  const relationalAnchors: RelationalAnchor[] = [];

  if (field.focalCentroid) {
    relationalAnchors.push({
      id: 'focal-point-anchor',
      type: 'focal-point',
      position: { x: field.focalCentroid.x, y: field.focalCentroid.y },
      strength: 0.85,
      description: 'Primary focal centroid anchor',
    });
  }

  if (field.subjectBox && field.subjectBox.width > 0) {
    const sb = field.subjectBox;
    relationalAnchors.push({
      id: 'subject-contour-anchor',
      type: 'subject-edge',
      position: { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 },
      strength: 0.80,
      description: 'Salient subject boundary anchor',
    });
  }

  const safeMargin = canvas.safeBounds ? canvas.safeBounds.x : 0.04;
  relationalAnchors.push({
    id: 'canvas-margin-anchor',
    type: 'canvas-margin',
    position: { x: safeMargin, y: safeMargin },
    strength: 0.70,
    description: 'Canvas safe perimeter anchor',
  });

  // 3. Discover Semantic Groups and Shared Axes
  const elementBounds = elements.map((el) => ({
    id: el.id,
    role: el.role,
    bounds: extractElementGeometricBounds(el.rect, canvas, el.typographyState),
  }));

  const semanticGroups: SemanticAlignmentGroup[] = [];
  const textElements = elementBounds.filter((e) => e.role !== 'logo');
  const logoElements = elementBounds.filter((e) => e.role === 'logo');

  if (textElements.length > 0) {
    // Check dominant alignment axis among text elements
    let isLeftFlush = true;
    let isRightFlush = true;
    let isCentered = true;

    for (let i = 0; i < textElements.length - 1; i++) {
      const e1 = textElements[i].bounds;
      const e2 = textElements[i + 1].bounds;
      if (Math.abs(e1.left - e2.left) > 0.025) isLeftFlush = false;
      if (Math.abs(e1.right - e2.right) > 0.025) isRightFlush = false;
      if (Math.abs(e1.centerX - e2.centerX) > 0.025) isCentered = false;
    }

    const groupType = isLeftFlush
      ? 'flush-left'
      : isCentered
      ? 'centered'
      : isRightFlush
      ? 'flush-right'
      : textElements.length > 1 && Math.abs(textElements[0].bounds.left - textElements[1].bounds.left) >= 0.04
      ? 'staggered-offset'
      : 'independent';

    // Find nearest matching candidate axis for the primary group
    const refPos = groupType === 'centered' ? textElements[0].bounds.centerX : textElements[0].bounds.left;
    const matchingAxis = candidateAxes.find(
      (a) => a.orientation === 'vertical' && Math.abs(a.position - refPos) <= 0.035
    );

    semanticGroups.push({
      id: 'primary-typography-group',
      roles: textElements.map((e) => e.role),
      elementIds: textElements.map((e) => e.id),
      primaryAxis: matchingAxis,
      groupAlignmentType: groupType,
      internalCoherence: isLeftFlush || isCentered || isRightFlush ? 0.95 : groupType === 'staggered-offset' ? 0.88 : 0.70,
    });
  }

  // 4. Discover Independent Alignment Structures (e.g. Logo anchored to margin / quiet corner)
  const independentAnchors: IndependentAlignmentStructure[] = [];
  for (const logo of logoElements) {
    const mainGroup = semanticGroups[0];
    const mainLeft = mainGroup && textElements.length > 0 ? textElements[0].bounds.left : 0.5;
    const sep = Math.abs(logo.bounds.left - mainLeft);

    independentAnchors.push({
      elementId: logo.id,
      role: logo.role,
      anchor: {
        id: `logo-anchor-${logo.id}`,
        type: 'canvas-margin',
        position: { x: logo.bounds.left, y: logo.bounds.top },
        strength: 0.75,
        description: 'Brand mark independent canvas/field anchor',
      },
      separationFromMainGroup: Number(sep.toFixed(3)),
      justification: 'Brand mark intentionally anchored independently to preserve brand clarity',
    });
  }

  // 5. Discover Repeated Alignments
  const repeatedAlignments: Array<{ axisPosition: number; orientation: 'vertical' | 'horizontal'; elementIds: string[] }> = [];
  for (let i = 0; i < elementBounds.length; i++) {
    const shared: string[] = [elementBounds[i].id];
    for (let j = i + 1; j < elementBounds.length; j++) {
      if (Math.abs(elementBounds[i].bounds.left - elementBounds[j].bounds.left) <= 0.025) {
        shared.push(elementBounds[j].id);
      }
    }
    if (shared.length > 1) {
      repeatedAlignments.push({
        axisPosition: elementBounds[i].bounds.left,
        orientation: 'vertical',
        elementIds: shared,
      });
    }
  }

  // 6. Selected Axes (axes actively bonded to element edges or centers)
  const selectedAxes = candidateAxes.filter((axis) =>
    elementBounds.some((eb) => {
      if (axis.orientation === 'vertical') {
        return (
          Math.abs(eb.bounds.left - axis.position) <= 0.03 ||
          Math.abs(eb.bounds.centerX - axis.position) <= 0.03 ||
          Math.abs(eb.bounds.right - axis.position) <= 0.03
        );
      } else {
        return (
          Math.abs(eb.bounds.top - axis.position) <= 0.03 ||
          Math.abs(eb.bounds.baselineY - axis.position) <= 0.03 ||
          Math.abs(eb.bounds.bottom - axis.position) <= 0.03
        );
      }
    })
  );

  // 7. Intentional Asymmetry Rhythm
  let hasIntentionalOffset = false;
  let offsetDelta = 0;
  if (textElements.length > 1) {
    const delta = Math.abs(textElements[0].bounds.left - textElements[1].bounds.left);
    if (delta >= 0.045 && delta <= 0.35) {
      hasIntentionalOffset = true;
      offsetDelta = Number(delta.toFixed(3));
    }
  }

  const substrateCoherence = Number(
    (
      (semanticGroups.length > 0 ? semanticGroups[0].internalCoherence : 0.8) * 0.5 +
      (selectedAxes.length > 0 ? 0.9 : 0.7) * 0.3 +
      (hasIntentionalOffset ? 0.9 : 0.85) * 0.2
    ).toFixed(3)
  );

  return {
    id: `substrate-${Date.now().toString(36)}`,
    candidateAxes,
    selectedAxes,
    relationalAnchors,
    semanticGroups,
    structuralHierarchy: elements.map((e, idx) => ({
      role: e.role,
      priorityLevel: idx + 1,
      assignedGroupOrAnchorId: e.role === 'logo' ? `logo-anchor-${e.id}` : 'primary-typography-group',
    })),
    repeatedAlignments,
    independentAnchors,
    asymmetryRhythm: {
      hasIntentionalOffset,
      offsetDelta,
      coherence: hasIntentionalOffset ? 0.90 : 1.0,
      description: hasIntentionalOffset
        ? `Intentional asymmetric step (${(offsetDelta * 100).toFixed(1)}% offset)`
        : 'Aligned or independent composition rhythm',
    },
    substrateCoherence,
  };
}

// ─── 10. Relational Alignment Graph Builder ─────────────────────────────────

/**
 * Constructs the Relational Alignment Graph representing explicit pairwise relationships,
 * image/canvas anchor bindings, and rejected alternatives.
 */
export function buildRelationalAlignmentGraph(params: {
  elements: ElementInput[];
  substrate: DesignSubstrate;
  field: DesignField;
  canvas: CanvasRepresentation;
}): RelationalAlignmentGraph {
  const { elements, substrate, field, canvas } = params;
  const nodes: AlignmentGraphNode[] = [];
  const edges: AlignmentGraphEdge[] = [];
  const pairwiseRelationshipScores: Record<string, number> = {};
  const rejectedAlternatives: RejectedAlignmentAlternative[] = [];

  // 1. Build Element Nodes
  for (const el of elements) {
    const bounds = extractElementGeometricBounds(el.rect, canvas, el.typographyState);
    nodes.push({
      id: el.id,
      role: el.role as any,
      bounds,
    });
  }

  // 2. Build Element-to-Element Relational Edges
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const n1 = nodes[i];
      const n2 = nodes[j];
      const pairKey = `${n1.id}->${n2.id}`;

      // A. Check Shared Left Edge
      const leftDiff = Math.abs(n1.bounds.left - n2.bounds.left);
      // B. Check Shared Center Axis
      const centerDiff = Math.abs(n1.bounds.centerX - n2.bounds.centerX);
      // C. Check Shared Right Edge
      const rightDiff = Math.abs(n1.bounds.right - n2.bounds.right);
      // D. Check Intentional Offset / Stagger
      const isOffset = leftDiff >= 0.045 && leftDiff <= 0.35;
      // E. Check Logo / Support Independent Separation
      const isIndependentRole = n1.role === 'logo' || n2.role === 'logo';

      if (leftDiff <= 0.025) {
        const coherence = Number((1.0 - leftDiff / 0.025).toFixed(3));
        edges.push({
          sourceId: n1.id,
          targetId: n2.id,
          relationship: 'SHARES_LEFT_AXIS',
          coherence,
          offsetDelta: Number(leftDiff.toFixed(4)),
          strength: 0.95,
          description: `Shares left alignment axis with ${n2.id} (delta: ${leftDiff.toFixed(3)})`,
          evidence: {
            axisPosition: n1.bounds.left,
            axisOrientation: 'vertical',
            sourceMetric: 'left',
            targetMetric: 'left',
          },
        });
        pairwiseRelationshipScores[pairKey] = coherence;

        rejectedAlternatives.push({
          sourceId: n1.id,
          targetId: n2.id,
          candidateRelationship: 'SHARES_CENTER_AXIS',
          score: Number(Math.max(0, 1.0 - centerDiff / 0.05).toFixed(3)),
          rejectionReason: `Left axis alignment strongly preferred (delta: ${leftDiff.toFixed(3)} vs center delta: ${centerDiff.toFixed(3)})`,
        });
      } else if (centerDiff <= 0.025) {
        const coherence = Number((1.0 - centerDiff / 0.025).toFixed(3));
        edges.push({
          sourceId: n1.id,
          targetId: n2.id,
          relationship: 'SHARES_CENTER_AXIS',
          coherence,
          offsetDelta: Number(centerDiff.toFixed(4)),
          strength: 0.90,
          description: `Shares vertical center axis with ${n2.id}`,
          evidence: {
            axisPosition: n1.bounds.centerX,
            axisOrientation: 'vertical',
            sourceMetric: 'centerX',
            targetMetric: 'centerX',
          },
        });
        pairwiseRelationshipScores[pairKey] = coherence;
      } else if (rightDiff <= 0.025) {
        const coherence = Number((1.0 - rightDiff / 0.025).toFixed(3));
        edges.push({
          sourceId: n1.id,
          targetId: n2.id,
          relationship: 'SHARES_RIGHT_AXIS',
          coherence,
          offsetDelta: Number(rightDiff.toFixed(4)),
          strength: 0.88,
          description: `Shares right alignment edge with ${n2.id}`,
          evidence: {
            axisPosition: n1.bounds.right,
            axisOrientation: 'vertical',
            sourceMetric: 'right',
            targetMetric: 'right',
          },
        });
        pairwiseRelationshipScores[pairKey] = coherence;
      } else if (isOffset && !isIndependentRole) {
        // Intentional Asymmetric Offset
        const coherence = 0.88;
        edges.push({
          sourceId: n1.id,
          targetId: n2.id,
          relationship: 'INTENTIONAL_OFFSET',
          coherence,
          offsetDelta: Number(leftDiff.toFixed(4)),
          strength: 0.80,
          description: `Intentional asymmetric offset with ${n2.id} (${(leftDiff * 100).toFixed(1)}% step)`,
          evidence: {
            offsetDelta: leftDiff,
            isIntentionalAsymmetry: true,
          },
        });
        pairwiseRelationshipScores[pairKey] = coherence;
      } else if (isIndependentRole) {
        const sepDist = Math.hypot(n1.bounds.centerX - n2.bounds.centerX, n1.bounds.centerY - n2.bounds.centerY);
        const sepQuality = Number(Math.min(1.0, sepDist / 0.20).toFixed(3));
        edges.push({
          sourceId: n1.id,
          targetId: n2.id,
          relationship: 'SEPARATED_FROM',
          coherence: sepQuality,
          offsetDelta: Number(sepDist.toFixed(4)),
          strength: 0.75,
          description: `Independent brand separation from ${n2.id} (distance: ${sepDist.toFixed(2)})`,
          evidence: {
            separationQuality: sepQuality,
          },
        });
        pairwiseRelationshipScores[pairKey] = sepQuality;
      } else {
        pairwiseRelationshipScores[pairKey] = 0.60;
      }
    }
  }

  // 3. Build Element-to-Image / Canvas Anchor Edges
  for (const n of nodes) {
    // Check relationship with Discovered Image Axes
    for (const axis of substrate.selectedAxes) {
      if (axis.orientation === 'vertical') {
        const d = Math.min(
          Math.abs(n.bounds.left - axis.position),
          Math.abs(n.bounds.centerX - axis.position),
          Math.abs(n.bounds.right - axis.position)
        );
        if (d <= 0.035) {
          edges.push({
            sourceId: n.id,
            targetId: `image-axis-${axis.source}-${axis.position}`,
            relationship: axis.source === 'focal-point' ? 'FOCAL_POINT_RELATION' : axis.source === 'subject-contour' ? 'SUBJECT_CONTOUR_RELATION' : 'IMAGE_AXIS_RELATION',
            coherence: Number((1.0 - d / 0.035).toFixed(3)),
            offsetDelta: Number(d.toFixed(4)),
            strength: axis.strength,
            description: `Relates to ${axis.description} at x=${axis.position}`,
            evidence: {
              axisPosition: axis.position,
              axisOrientation: 'vertical',
            },
          });
        }
      }
    }

    // Logo / Canvas Anchor Edge
    if (n.role === 'logo') {
      edges.push({
        sourceId: n.id,
        targetId: 'canvas-margin-anchor',
        relationship: 'CANVAS_ANCHOR',
        coherence: 0.90,
        offsetDelta: 0,
        strength: 0.85,
        description: 'Brand mark relates to canvas perimeter anchor',
        evidence: {
          isIntentionalAsymmetry: true,
        },
      });
    }
  }

  const overallGraphCoherence = edges.length > 0
    ? Number((edges.reduce((sum, e) => sum + e.coherence * e.strength, 0) / edges.reduce((sum, e) => sum + e.strength, 0)).toFixed(3))
    : 0.80;

  return {
    nodes,
    edges,
    pairwiseRelationshipScores,
    rejectedAlternatives,
    overallGraphCoherence,
  };
}

// ─── 11. Complete Composition Alignment Evaluation Engine ───────────────────

/**
 * Evaluates comprehensive continuous alignment evidence across all composition elements,
 * image visual axes, semantic groups, and substrate structures.
 */
export function evaluateCompositionAlignment(params: {
  elements: ElementInput[];
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  concept?: any;
  customWeights?: Partial<AlignmentScoringWeights>;
}): CompositionAlignmentEvaluation {
  const { elements, field, canvas, brand, concept, customWeights } = params;
  const weights: AlignmentScoringWeights = { ...DEFAULT_ALIGNMENT_WEIGHTS, ...customWeights };

  // 1. Derive Per-Composition Design Substrate
  const substrate = deriveDesignSubstrate({ elements, field, canvas, concept, brand });

  // 2. Build Relational Alignment Graph
  const graph = buildRelationalAlignmentGraph({ elements, substrate, field, canvas });

  // 3. Compute Optical Alignment Evidence per Element
  const opticalAlignmentEvidence: OpticalAlignmentEvidence[] = elements.map((el) => {
    const b = extractElementGeometricBounds(el.rect, canvas, el.typographyState);
    const inkDelta = Math.abs((b.top - b.opticalTop) - (b.opticalBottom - b.bottom));
    const flushness = Number(Math.max(0.5, 1.0 - inkDelta * 10).toFixed(3));
    return {
      elementId: el.id,
      baselineY: b.baselineY,
      opticalTop: b.opticalTop,
      opticalBottom: b.opticalBottom,
      inkMarginDelta: Number(inkDelta.toFixed(4)),
      opticalFlushnessScore: flushness,
    };
  });

  // 4. Calculate Research-Backed Alignment Score Contributions
  const relationalCoherence = graph.overallGraphCoherence;
  const graphConsistency = Number(
    (1.0 - Math.min(0.5, (graph.rejectedAlternatives.length * 0.05))).toFixed(3)
  );
  const substrateCoherence = substrate.substrateCoherence;

  // Image-aware axis coherence
  const imageAxisEdges = graph.edges.filter(
    (e) => e.relationship === 'IMAGE_AXIS_RELATION' || e.relationship === 'FOCAL_POINT_RELATION' || e.relationship === 'SUBJECT_CONTOUR_RELATION'
  );
  const imageAwareAxisRelationship = imageAxisEdges.length > 0
    ? Number((imageAxisEdges.reduce((sum, e) => sum + e.coherence, 0) / imageAxisEdges.length).toFixed(3))
    : 0.80;

  // Semantic grouping consistency
  const semanticGroupingConsistency = substrate.semanticGroups.length > 0
    ? Number((substrate.semanticGroups.reduce((sum, g) => sum + g.internalCoherence, 0) / substrate.semanticGroups.length).toFixed(3))
    : 0.85;

  // Optical coherence
  const opticalCoherence = opticalAlignmentEvidence.length > 0
    ? Number((opticalAlignmentEvidence.reduce((sum, o) => sum + o.opticalFlushnessScore, 0) / opticalAlignmentEvidence.length).toFixed(3))
    : 0.85;

  // Intentional asymmetry preservation
  const intentionalAsymmetryPreservation = substrate.asymmetryRhythm.coherence;

  // Detect subtle near-miss drift (unintentional 1-3% jitter)
  let driftPenalty = 0;
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const e1 = elements[i].rect;
      const e2 = elements[j].rect;
      const dLeft = Math.abs(e1.x - e2.x);
      // If slightly off (0.015 to 0.035) and not an intentional offset (>= 0.045)
      if (dLeft > 0.012 && dLeft < 0.040 && elements[i].role !== 'logo' && elements[j].role !== 'logo') {
        driftPenalty = Math.max(driftPenalty, (0.040 - dLeft) / 0.028);
      }
    }
  }

  const rawComposite =
    relationalCoherence * weights.relationalCoherenceWeight +
    graphConsistency * weights.graphConsistencyWeight +
    substrateCoherence * weights.substrateCoherenceWeight +
    imageAwareAxisRelationship * weights.imageAwareAxisWeight +
    semanticGroupingConsistency * weights.semanticGroupingWeight +
    opticalCoherence * weights.opticalCoherenceWeight +
    intentionalAsymmetryPreservation * weights.intentionalAsymmetryWeight;

  const totalWeight =
    weights.relationalCoherenceWeight +
    weights.graphConsistencyWeight +
    weights.substrateCoherenceWeight +
    weights.imageAwareAxisWeight +
    weights.semanticGroupingWeight +
    weights.opticalCoherenceWeight +
    weights.intentionalAsymmetryWeight;

  const normalizedComposite = rawComposite / (totalWeight || 1.0);
  const penalizedScore = Math.max(0.1, normalizedComposite - driftPenalty * weights.driftConflictPenaltyWeight * 0.20);
  const compositeScore = Number(penalizedScore.toFixed(3));

  const alignmentScoreContributions: AlignmentScoreContributions = {
    relationalCoherence,
    graphConsistency,
    substrateCoherence,
    imageAwareAxisRelationship,
    semanticGroupingConsistency,
    opticalCoherence,
    intentionalAsymmetryPreservation,
    driftPenalty: Number(driftPenalty.toFixed(3)),
  };

  const alignmentSummary: string[] = [
    `Relational Graph Coherence: ${(relationalCoherence * 100).toFixed(0)}% across ${graph.edges.length} edges`,
    `Substrate Coherence: ${(substrateCoherence * 100).toFixed(0)}% (${substrate.semanticGroups.length} semantic groups, ${substrate.selectedAxes.length} active visual axes)`,
    `Image-Aware Axis Relationship: ${(imageAwareAxisRelationship * 100).toFixed(0)}%`,
    `Optical Coherence: ${(opticalCoherence * 100).toFixed(0)}%`,
  ];

  if (substrate.independentAnchors.length > 0) {
    alignmentSummary.push(`Independent Anchors: ${substrate.independentAnchors.map((ia) => `${ia.role} (${ia.justification})`).join(', ')}`);
  }

  return {
    substrate,
    graph,
    semanticGroups: substrate.semanticGroups,
    independentAnchors: substrate.independentAnchors,
    opticalAlignmentEvidence,
    pairwiseRelationshipScores: graph.pairwiseRelationshipScores,
    alignmentScoreContributions,
    compositeScore,
    rejectedAlternatives: graph.rejectedAlternatives,
    alignmentSummary,
  };
}

// ─── 12. Candidate Alignment Evaluation Pipeline ────────────────────────────

export interface EvaluateAlignmentOptions {
  candidate: PlacementCandidate;
  field: DesignField;
  canvas: CanvasRepresentation;
  discoveredAxes?: DiscoveredAxis[];
  existingElements?: FieldRect[];
  brand?: BrandDesignRepresentation;
  concept?: any;
  customWeights?: Partial<AlignmentScoringWeights>;
}

/**
 * Evaluates continuous geometric alignment evidence for a placement candidate
 * against natural visual axes, design substrate, and neighboring elements.
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
    } else if (bestElemDist >= 0.045) {
      // Deliberate stepped offset (e.g. diagonal rhythm / intentional offset)
      elementCoherence = 0.88;
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

// ─── 13. Batch Alignment Evaluation for Placement Candidates ────────────────

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

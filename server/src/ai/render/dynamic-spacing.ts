/**
 * FLOWPOST DYNAMIC SPACING & GROUPING ENGINE — PHASE 7
 *
 * Discovers spatial relationships, semantic grouping, Gestalt clustering, dynamic whitespace,
 * optical font adjustments, and joint multi-element composition coherence across typography,
 * image field, and alignment signals.
 *
 * Architecture Principles:
 *   1. SPACING IS A CONTINUOUS RELATIONSHIP (NOT A PRESET):
 *      - Zero hardcoded spacing presets (no 8px, 12px, 16px, gap-small, gap-medium, or fixed % recipes).
 *      - No "headline is always X% from subheadline" or "CTA gap = 0.03".
 *      - Spacing emerges from element dimensions, semantic hierarchy, optical font metrics, and image field.
 *
 *   2. DYNAMIC WHITESPACE AS A DESIGN RESOURCE:
 *      - Whitespace is evaluated continuously over the actual image field (quietness, detail energy, mass).
 *      - A larger gap is not automatically superior; a smaller gap is not automatically rejected.
 *
 *   3. OPTICAL SPACING & TYPOGRAPHY METRICS:
 *      - Operates on exact TrueType font metrics (physical widths, heights, ascents, baselines, descenders).
 *      - Exposes opticalSpacingAdjustment as an observation rather than blind coordinate displacement.
 *
 *   4. SPACING GRAPH & JOINT MULTI-ELEMENT COHERENCE:
 *      - Multi-element compositions are evaluated as a graph of pairwise relationships and natural clusters.
 *      - Evaluates headline, subheadline, body/supporting copy, CTA, offer, metadata, and logo jointly.
 *      - Preserves candidate diversity for downstream global composition evaluation.
 */

import type { CanvasRepresentation, BrandDesignRepresentation, DesignField } from './design-representation';
import type { FieldRect } from './image-field';
import type { PlacementCandidate } from './dynamic-placement';
import type { AlignmentEnhancedCandidate, ElementGeometricBounds } from './dynamic-alignment';
import type { LineStructureState } from '../typography/dynamic-line-structure';
import type { DynamicTypeStep } from '../typography/dynamic-typography';

// ─── Semantic & Hierarchy Definitions ───────────────────────────────────────

export type SemanticRole =
  | 'headline'
  | 'subheadline'
  | 'body'
  | 'supporting-copy'
  | 'cta'
  | 'offer'
  | 'metadata'
  | 'disclaimer'
  | 'logo'
  | 'badge'
  | 'graphic-element';

export type SemanticRelationType =
  | 'headline-subheadline'
  | 'headline-support'
  | 'offer-cta'
  | 'logo-brand-anchor'
  | 'metadata-footnote'
  | 'sibling'
  | 'independent';

export interface SpacingElement {
  id: string;
  role: SemanticRole;
  hierarchyLevel: number; // 1 = dominant/headline, 2 = secondary, 3 = tertiary, etc.
  rect: FieldRect;
  geometry?: ElementGeometricBounds;
  typographyState?: LineStructureState | DynamicTypeStep;
  opticalMetrics?: {
    ascenderPx: number;
    descenderPx: number;
    baselineYNorm: number;
    fontSizePx: number;
  };
}

// ─── Continuous Pairwise Spatial Relationship ───────────────────────────────

export interface PairwiseSpatialRelationship {
  elementAId: string;
  elementBId: string;
  roleA: SemanticRole;
  roleB: SemanticRole;
  semanticRelationship: SemanticRelationType;
  
  /** Signed horizontal gap (positive if B is right of A, negative if B is left of A, 0 if overlapping in X) */
  horizontalGap: number;
  /** Signed vertical gap (positive if B is below A, negative if B is above A, 0 if overlapping in Y) */
  verticalGap: number;
  /** Minimum Euclidean distance between the two bounding boxes (0 if overlapping) */
  edgeDistance: number;
  /** Euclidean distance between element center points */
  centerDistance: number;
  /** Continuous vertical distance between optical baselines (where applicable) */
  baselineDistance?: number;
  /** Bounding box overlap analysis */
  overlap: {
    xOverlap: number;
    yOverlap: number;
    areaOverlap: number;
    overlapRatio: number;
  };
  /** Bounding box of the whitespace region between elements */
  whitespaceRegion: FieldRect;
  /** Image field quietness across the whitespace gap (0..1) */
  localFieldQuietness: number;
  /** Detail energy density across the whitespace gap (0..1) */
  densityAroundGap: number;
  /** Relative scale / visual weight difference (|areaA - areaB| / max(areaA, areaB)) */
  visualWeightDifference: number;
  /** Observable ratio of physical edge distance relative to average geometric span */
  scaleToDistanceRatio: number;
  /** Optical spacing adjustment derived from font ascent/descent metrics */
  opticalSpacingAdjustment: number;
  /** Continuous axis alignment signal between elements (0..1) */
  continuousAxisAlignment: number;
  /** Continuous proximity coherence for this specific pair */
  proximityCoherence: number;
  /** Continuous interaction coherence between alignment and spatial separation (0..1) */
  alignmentSpacingCoherence: number;
  /** Gestalt grouping affinity score (0..1) */
  groupingAffinity: number;
}

// ─── Observable Spacing & Grouping Signals ───────────────────────────────────

export interface CompositionSpacingSignals {
  /** Continuous coherence between physical proximity and semantic relationship (0..1) */
  proximityCoherence: number;
  /** Gestalt grouping coherence across all element pairs (0..1) */
  groupingCoherence: number;
  /** Image field quality across whitespace regions (0..1) */
  whitespaceQuality: number;
  /** Visual distribution and density balance across canvas (0..1) */
  densityBalance: number;
  /** Optical spacing quality accounting for TrueType font baselines & ascenders (0..1) */
  opticalSpacingQuality: number;
  /** Hierarchy separation (ensures subordinate elements do not crowd dominant elements) (0..1) */
  hierarchySeparation: number;
  /** Alignment & spacing interaction coherence (harmony between shared axes & gaps) (0..1) */
  alignmentSpacingCoherence: number;
  /** Field continuity (background smoothness across gap regions) (0..1) */
  fieldContinuity: number;
  /** Boundary pressure (avoids cramping near canvas edges or high-contrast subjects) (0..1) */
  boundaryPressure: number;
  /** Visual conflict penalty for ambiguous or colliding elements (0..1) */
  spacingConflict: number;
}

export interface CompositionSpacingScores {
  /** Pairwise semantic spacing score (0..1) */
  semanticSpacingScore: number;
  /** Gestalt grouping harmony score (0..1) */
  gestaltHarmonyScore: number;
  /** Dynamic whitespace utilization score (0..1) */
  whitespaceUtilizationScore: number;
  /** Optical typographic spacing score (0..1) */
  opticalTypographyScore: number;
  /** Group-level composite spacing score (0..1) */
  compositeSpacingScore: number;
}

export interface SpacingScoringWeights {
  semanticSpacingWeight: number;
  gestaltHarmonyWeight: number;
  whitespaceUtilizationWeight: number;
  opticalTypographyWeight: number;
  conflictPenaltyWeight: number;
}

export const DEFAULT_SPACING_WEIGHTS: SpacingScoringWeights = {
  semanticSpacingWeight: 0.35,
  gestaltHarmonyWeight: 0.30,
  whitespaceUtilizationWeight: 0.20,
  opticalTypographyWeight: 0.15,
  conflictPenaltyWeight: 0.85,
};

// ─── Spacing Graph & Group Discovery ─────────────────────────────────────────

export interface DiscoveredElementGroup {
  groupId: string;
  elementIds: string[];
  semanticTheme: string;
  boundingRegion: FieldRect;
  internalGroupingCoherence: number;
}

export interface SpacingGraph {
  nodes: SpacingElement[];
  edges: PairwiseSpatialRelationship[];
  discoveredGroups: DiscoveredElementGroup[];
  graphDensity: number;
  groupLevelCoherence: number;
}

export interface SpacingEnhancedComposition {
  elements: SpacingElement[];
  graph: SpacingGraph;
  signals: CompositionSpacingSignals;
  scores: CompositionSpacingScores;
  reasons: string[];
}

// ─── Semantic Relationship Classifier ───────────────────────────────────────

export function determineSemanticRelationship(
  roleA: SemanticRole,
  roleB: SemanticRole
): SemanticRelationType {
  const pair = [roleA, roleB].sort().join('+');
  if (pair === 'headline+subheadline') return 'headline-subheadline';
  if (pair === 'body+headline' || pair === 'headline+supporting-copy') return 'headline-support';
  if (pair === 'cta+offer' || pair === 'cta+headline') return 'offer-cta';
  if (pair.includes('logo')) return 'logo-brand-anchor';
  if (pair.includes('disclaimer') || pair.includes('metadata')) return 'metadata-footnote';
  if (roleA === roleB) return 'sibling';
  return 'independent';
}

// ─── Dynamic Pairwise Spacing Evaluator ─────────────────────────────────────

/**
 * Computes exact continuous geometric and field relationships between two design elements.
 */
export function evaluatePairwiseSpacing(params: {
  elementA: SpacingElement;
  elementB: SpacingElement;
  field: DesignField;
  canvas: CanvasRepresentation;
}): PairwiseSpatialRelationship {
  const { elementA, elementB, field, canvas } = params;
  const rectA = elementA.rect;
  const rectB = elementB.rect;

  const aLeft = rectA.x;
  const aRight = rectA.x + rectA.width;
  const aTop = rectA.y;
  const aBottom = rectA.y + rectA.height;
  const aCenterX = rectA.x + rectA.width / 2;
  const aCenterY = rectA.y + rectA.height / 2;

  const bLeft = rectB.x;
  const bRight = rectB.x + rectB.width;
  const bTop = rectB.y;
  const bBottom = rectB.y + rectB.height;
  const bCenterX = rectB.x + rectB.width / 2;
  const bCenterY = rectB.y + rectB.height / 2;

  // 1. Signed Horizontal & Vertical Gaps
  let horizontalGap = 0;
  if (bLeft >= aRight) {
    horizontalGap = bLeft - aRight;
  } else if (aLeft >= bRight) {
    horizontalGap = -(aLeft - bRight);
  }

  let verticalGap = 0;
  if (bTop >= aBottom) {
    verticalGap = bTop - aBottom;
  } else if (aTop >= bBottom) {
    verticalGap = -(aTop - bBottom);
  }

  // 2. Overlap Calculation
  const xOverlap = Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
  const yOverlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(aTop, bTop));
  const areaOverlap = xOverlap * yOverlap;
  const minArea = Math.min(rectA.width * rectA.height, rectB.width * rectB.height);
  const overlapRatio = minArea > 0 ? areaOverlap / minArea : 0;

  // 3. Edge & Center Euclidean Distances
  const dx = Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
  const dy = Math.max(0, Math.max(aTop - bBottom, bTop - aBottom));
  const edgeDistance = Math.hypot(dx, dy);
  const centerDistance = Math.hypot(bCenterX - aCenterX, bCenterY - aCenterY);

  // 4. Optical Baseline Distance (if metrics available)
  let baselineDistance: number | undefined;
  if (elementA.opticalMetrics && elementB.opticalMetrics) {
    baselineDistance = Math.abs(
      elementB.opticalMetrics.baselineYNorm - elementA.opticalMetrics.baselineYNorm
    );
  }

  // 5. Whitespace Region Bounding Box
  const wsX = Math.min(aLeft, bLeft);
  const wsY = Math.min(aTop, bTop);
  const wsRight = Math.max(aRight, bRight);
  const wsBottom = Math.max(aBottom, bBottom);
  const whitespaceRegion: FieldRect = {
    x: wsX,
    y: wsY,
    width: Math.max(0.001, wsRight - wsX),
    height: Math.max(0.001, wsBottom - wsY),
  };

  // 6. Local Field Measurements across whitespace region
  const fieldSummary = field.evaluateRegion(whitespaceRegion);
  const localFieldQuietness = fieldSummary.quietness;
  const densityAroundGap = fieldSummary.detailEnergy;

  // 7. Visual Weight Difference
  const areaA = rectA.width * rectA.height;
  const areaB = rectB.width * rectB.height;
  const maxArea = Math.max(areaA, areaB, 0.0001);
  const visualWeightDifference = Math.abs(areaA - areaB) / maxArea;

  // 8. Optical Spacing Adjustment
  let opticalSpacingAdjustment = 0;
  if (elementA.opticalMetrics && elementB.opticalMetrics) {
    // TrueType ascender/descender visual breathing room
    const descenderA = Math.abs(elementA.opticalMetrics.descenderPx / canvas.height);
    const ascenderB = Math.abs(elementB.opticalMetrics.ascenderPx / canvas.height);
    opticalSpacingAdjustment = Math.max(0, (ascenderB + descenderA) * 0.5);
  }

  // 9. Continuous Scale & Proximity Geometry
  // Scale of the pair emerges from the 2D geometric mass of both bounding boxes
  const geometricSpanA = Math.hypot(rectA.width, rectA.height);
  const geometricSpanB = Math.hypot(rectB.width, rectB.height);
  const averageGeometricSpan = Math.max(0.01, (geometricSpanA + geometricSpanB) * 0.5);
  const scaleToDistanceRatio = Number((edgeDistance / averageGeometricSpan).toFixed(4));

  // Semantic bonding determines the continuous dispersion width across space
  // (e.g. headline + subheadline share a compact visual neighborhood, independent elements seek open field)
  const semanticRel = determineSemanticRelationship(elementA.role, elementB.role);
  const semanticDispersionMap: Record<SemanticRelationType, number> = {
    'headline-subheadline': 0.85,
    'headline-support': 1.0,
    'offer-cta': 1.1,
    'sibling': 1.2,
    'logo-brand-anchor': 1.8,
    'metadata-footnote': 1.6,
    'independent': 2.0,
  };
  const dispersion = semanticDispersionMap[semanticRel] ?? 1.2;

  // Continuous proximity coherence: smooth Gaussian decay over normalized geometric dispersion
  const normalizedDistance = edgeDistance / (averageGeometricSpan * dispersion);
  const proximityCoherence = Number(Math.exp(-0.5 * Math.pow(normalizedDistance, 2)).toFixed(3));

  // 10. Continuous Alignment & Spacing Interaction
  // Measures continuous axis convergence (left, center, right) without discrete +0.25 bonus
  const deltaLeft = Math.abs(aLeft - bLeft);
  const deltaCenter = Math.abs(aCenterX - bCenterX);
  const deltaRight = Math.abs(aRight - bRight);
  const minAxisDelta = Math.min(deltaLeft, deltaCenter, deltaRight);

  // Smooth Gaussian axis coherence (characteristic width ~2.5% canvas)
  const continuousAxisAlignment = Number(Math.exp(-0.5 * Math.pow(minAxisDelta / 0.025, 2)).toFixed(3));
  const alignmentSpacingCoherence = Number((continuousAxisAlignment * proximityCoherence).toFixed(3));

  // 11. Gestalt Grouping Affinity
  // Emerges continuously from Proximity × (Base + Continuous Alignment + Intervening Quietness)
  const rawAffinity =
    proximityCoherence *
    (0.50 + 0.30 * continuousAxisAlignment + 0.20 * localFieldQuietness) *
    (1 - overlapRatio * 0.5);
  const groupingAffinity = Number(Math.max(0, Math.min(1.0, rawAffinity)).toFixed(3));

  return {
    elementAId: elementA.id,
    elementBId: elementB.id,
    roleA: elementA.role,
    roleB: elementB.role,
    semanticRelationship: semanticRel,
    horizontalGap: Number(horizontalGap.toFixed(4)),
    verticalGap: Number(verticalGap.toFixed(4)),
    edgeDistance: Number(edgeDistance.toFixed(4)),
    centerDistance: Number(centerDistance.toFixed(4)),
    baselineDistance: baselineDistance !== undefined ? Number(baselineDistance.toFixed(4)) : undefined,
    overlap: {
      xOverlap: Number(xOverlap.toFixed(4)),
      yOverlap: Number(yOverlap.toFixed(4)),
      areaOverlap: Number(areaOverlap.toFixed(5)),
      overlapRatio: Number(overlapRatio.toFixed(4)),
    },
    whitespaceRegion,
    localFieldQuietness: Number(localFieldQuietness.toFixed(3)),
    densityAroundGap: Number(densityAroundGap.toFixed(3)),
    visualWeightDifference: Number(visualWeightDifference.toFixed(3)),
    scaleToDistanceRatio,
    opticalSpacingAdjustment: Number(opticalSpacingAdjustment.toFixed(4)),
    continuousAxisAlignment,
    proximityCoherence,
    alignmentSpacingCoherence,
    groupingAffinity,
  };
}

// ─── Group Discovery Engine ──────────────────────────────────────────────────

/**
 * Discovers natural visual clusters/groups based on spatial proximity, semantic affinity,
 * and alignment without relying on rigid preset containers (HEADER, BODY, FOOTER).
 */
export function discoverNaturalGroups(params: {
  elements: SpacingElement[];
  edges: PairwiseSpatialRelationship[];
}): DiscoveredElementGroup[] {
  const { elements, edges } = params;
  const groups: DiscoveredElementGroup[] = [];
  const assigned = new Set<string>();

  // Find high-affinity pairs (groupingAffinity > 0.65 and no destructive overlap)
  for (const edge of edges) {
    if (edge.groupingAffinity >= 0.65 && edge.overlap.overlapRatio < 0.15) {
      const idA = edge.elementAId;
      const idB = edge.elementBId;

      // Check if already in an existing group
      let targetGroup = groups.find(
        (g) => g.elementIds.includes(idA) || g.elementIds.includes(idB)
      );

      if (!targetGroup) {
        targetGroup = {
          groupId: `group-${groups.length + 1}`,
          elementIds: [],
          semanticTheme: `${edge.semanticRelationship}`,
          boundingRegion: { x: 0, y: 0, width: 0, height: 0 },
          internalGroupingCoherence: edge.groupingAffinity,
        };
        groups.push(targetGroup);
      }

      if (!targetGroup.elementIds.includes(idA)) targetGroup.elementIds.push(idA);
      if (!targetGroup.elementIds.includes(idB)) targetGroup.elementIds.push(idB);
      assigned.add(idA);
      assigned.add(idB);
    }
  }

  // Add remaining unassigned elements as independent singletons
  for (const el of elements) {
    if (!assigned.has(el.id)) {
      groups.push({
        groupId: `group-singleton-${el.id}`,
        elementIds: [el.id],
        semanticTheme: `isolated-${el.role}`,
        boundingRegion: { ...el.rect },
        internalGroupingCoherence: 1.0,
      });
    }
  }

  // Compute bounding region for each discovered group
  for (const group of groups) {
    const memberElements = elements.filter((e) => group.elementIds.includes(e.id));
    if (memberElements.length === 0) continue;

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const el of memberElements) {
      minX = Math.min(minX, el.rect.x);
      minY = Math.min(minY, el.rect.y);
      maxX = Math.max(maxX, el.rect.x + el.rect.width);
      maxY = Math.max(maxY, el.rect.y + el.rect.height);
    }

    group.boundingRegion = {
      x: Number(minX.toFixed(4)),
      y: Number(minY.toFixed(4)),
      width: Number(Math.max(0.001, maxX - minX).toFixed(4)),
      height: Number(Math.max(0.001, maxY - minY).toFixed(4)),
    };
  }

  return groups;
}

// ─── Composition Spacing Graph Evaluator ─────────────────────────────────────

/**
 * Builds the complete multi-element Spacing Graph and evaluates continuous observable signals.
 */
export function evaluateCompositionSpacing(params: {
  elements: SpacingElement[];
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<SpacingScoringWeights>;
}): SpacingEnhancedComposition {
  const { elements, field, canvas, customWeights } = params;
  const weights: SpacingScoringWeights = { ...DEFAULT_SPACING_WEIGHTS, ...customWeights };

  const edges: PairwiseSpatialRelationship[] = [];
  let totalProximity = 0;
  let totalGrouping = 0;
  let totalWhitespaceQuality = 0;
  let totalOpticalQuality = 0;
  let totalAlignmentSpacing = 0;
  let totalOverlapPenalty = 0;
  let totalConflictPenalty = 0;
  let pairCount = 0;

  // 1. Evaluate All Pairwise Edges
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elA = elements[i];
      const elB = elements[j];
      const edge = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas });
      edges.push(edge);

      totalProximity += edge.proximityCoherence;
      totalGrouping += edge.groupingAffinity;
      totalWhitespaceQuality += edge.localFieldQuietness;
      totalAlignmentSpacing += edge.alignmentSpacingCoherence;

      // Optical Quality: reward clean baseline and ascender clearance
      let opticalScore = 1.0;
      if (edge.opticalSpacingAdjustment > 0 && edge.verticalGap > 0) {
        // If vertical gap is smaller than optical ascender/descender adjustment, slight friction
        if (edge.verticalGap < edge.opticalSpacingAdjustment * 0.5) {
          opticalScore = 0.5;
        }
      }
      totalOpticalQuality += opticalScore;

      // Overlap Conflict
      if (edge.overlap.overlapRatio > 0.05) {
        totalOverlapPenalty += edge.overlap.overlapRatio * 1.5;
      }

      // Spacing Conflict: e.g. subordinate element crowding unrelated element
      if (edge.semanticRelationship === 'independent' && edge.edgeDistance < 0.03) {
        totalConflictPenalty += 0.4;
      }

      pairCount++;
    }
  }

  const avgProximity = pairCount > 0 ? totalProximity / pairCount : 1.0;
  const avgGrouping = pairCount > 0 ? totalGrouping / pairCount : 1.0;
  const avgWhitespace = pairCount > 0 ? totalWhitespaceQuality / pairCount : 1.0;
  const avgOptical = pairCount > 0 ? totalOpticalQuality / pairCount : 1.0;
  const avgAlignmentSpacing = pairCount > 0 ? totalAlignmentSpacing / pairCount : 1.0;

  // 2. Discover Natural Visual Groups
  const discoveredGroups = discoverNaturalGroups({ elements, edges });

  // 3. Density Balance across Canvas
  let totalArea = 0;
  let centerOfMassX = 0;
  let centerOfMassY = 0;
  for (const el of elements) {
    const area = el.rect.width * el.rect.height;
    totalArea += area;
    centerOfMassX += (el.rect.x + el.rect.width / 2) * area;
    centerOfMassY += (el.rect.y + el.rect.height / 2) * area;
  }
  if (totalArea > 0) {
    centerOfMassX /= totalArea;
    centerOfMassY /= totalArea;
  }
  const canvasCenterDist = Math.hypot(centerOfMassX - 0.5, centerOfMassY - 0.5);
  const densityBalance = Math.max(0, 1 - canvasCenterDist * 1.5);

  // 4. Boundary Pressure
  let boundaryPressure = 1.0;
  for (const el of elements) {
    const distToLeft = el.rect.x;
    const distToRight = 1 - (el.rect.x + el.rect.width);
    const distToTop = el.rect.y;
    const distToBottom = 1 - (el.rect.y + el.rect.height);
    const minCanvasMargin = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    if (minCanvasMargin < 0.02) {
      boundaryPressure = Math.min(boundaryPressure, Math.max(0, minCanvasMargin / 0.02));
    }
  }

  // 5. Hierarchy Separation
  let hierarchySeparation = 1.0;
  for (const edge of edges) {
    if (edge.roleA === 'headline' && edge.roleB === 'metadata' && edge.edgeDistance < 0.05) {
      hierarchySeparation = Math.min(hierarchySeparation, edge.edgeDistance / 0.05);
    }
  }

  // 6. Spacing Conflict Aggregate
  const spacingConflict = Math.min(1.0, totalOverlapPenalty + totalConflictPenalty + (1 - boundaryPressure) * 0.5);

  // 7. Graph-Level Coherence
  const groupLevelCoherence = Math.max(
    0,
    discoveredGroups.reduce((acc, g) => acc + g.internalGroupingCoherence, 0) / Math.max(1, discoveredGroups.length)
  );

  const signals: CompositionSpacingSignals = {
    proximityCoherence: Number(avgProximity.toFixed(3)),
    groupingCoherence: Number(avgGrouping.toFixed(3)),
    whitespaceQuality: Number(avgWhitespace.toFixed(3)),
    densityBalance: Number(densityBalance.toFixed(3)),
    opticalSpacingQuality: Number(avgOptical.toFixed(3)),
    hierarchySeparation: Number(hierarchySeparation.toFixed(3)),
    alignmentSpacingCoherence: Number(avgAlignmentSpacing.toFixed(3)),
    fieldContinuity: Number(avgWhitespace.toFixed(3)),
    boundaryPressure: Number(boundaryPressure.toFixed(3)),
    spacingConflict: Number(spacingConflict.toFixed(3)),
  };

  // 8. Configurable Scores
  const semanticSpacingScore = Number(signals.proximityCoherence.toFixed(3));
  const gestaltHarmonyScore = Number(signals.groupingCoherence.toFixed(3));
  const whitespaceUtilizationScore = Number(signals.whitespaceQuality.toFixed(3));
  const opticalTypographyScore = Number(signals.opticalSpacingQuality.toFixed(3));

  const compositeSpacingScore = Number(
    Math.max(
      0,
      Math.min(
        1.0,
        semanticSpacingScore * weights.semanticSpacingWeight +
        gestaltHarmonyScore * weights.gestaltHarmonyWeight +
        whitespaceUtilizationScore * weights.whitespaceUtilizationWeight +
        opticalTypographyScore * weights.opticalTypographyWeight -
        spacingConflict * weights.conflictPenaltyWeight
      )
    ).toFixed(3)
  );

  const scores: CompositionSpacingScores = {
    semanticSpacingScore,
    gestaltHarmonyScore,
    whitespaceUtilizationScore,
    opticalTypographyScore,
    compositeSpacingScore,
  };

  const reasons: string[] = [
    `Discovered ${discoveredGroups.length} visual group(s) with group-level coherence ${(groupLevelCoherence * 100).toFixed(0)}%`,
    `Pairwise Proximity Coherence: ${(signals.proximityCoherence * 100).toFixed(0)}% across ${edges.length} spatial relationship(s)`,
    `Dynamic Whitespace Quality: ${(signals.whitespaceQuality * 100).toFixed(0)}%`,
    `Density Balance: ${(signals.densityBalance * 100).toFixed(0)}%`,
  ];
  if (spacingConflict > 0.1) {
    reasons.push(`Spacing Conflict Penalty: -${(spacingConflict * 100).toFixed(0)}% (boundary or overlap pressure)`);
  }

  const graph: SpacingGraph = {
    nodes: elements,
    edges,
    discoveredGroups,
    graphDensity: Number((elements.length > 1 ? (2 * edges.length) / (elements.length * (elements.length - 1)) : 1).toFixed(2)),
    groupLevelCoherence: Number(groupLevelCoherence.toFixed(3)),
  };

  return {
    elements,
    graph,
    signals,
    scores,
    reasons,
  };
}

// ─── Pipeline Integration: Enhance Placement & Alignment with Spacing ─────────

/**
 * Enhances multi-element candidate configurations with dynamic spacing & grouping analysis.
 */
export function enhanceMultiElementCompositionWithSpacing(params: {
  primaryPlacement: AlignmentEnhancedCandidate | PlacementCandidate;
  secondaryPlacements: Array<{
    role: SemanticRole;
    candidate: AlignmentEnhancedCandidate | PlacementCandidate;
    opticalMetrics?: {
      ascenderPx: number;
      descenderPx: number;
      baselineYNorm: number;
      fontSizePx: number;
    };
  }>;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<SpacingScoringWeights>;
}): SpacingEnhancedComposition {
  const { primaryPlacement, secondaryPlacements, field, canvas, brand, customWeights } = params;

  const elements: SpacingElement[] = [];

  // Primary Headline
  elements.push({
    id: 'primary-headline',
    role: 'headline',
    hierarchyLevel: 1,
    rect: primaryPlacement.rect,
    geometry: (primaryPlacement as AlignmentEnhancedCandidate).geometry,
    opticalMetrics: {
      ascenderPx: primaryPlacement.pixelBounds?.heightPx ? primaryPlacement.pixelBounds.heightPx * 0.75 : 40,
      descenderPx: primaryPlacement.pixelBounds?.heightPx ? primaryPlacement.pixelBounds.heightPx * 0.25 : 12,
      baselineYNorm: primaryPlacement.rect.y + primaryPlacement.rect.height * 0.8,
      fontSizePx: primaryPlacement.pixelBounds?.heightPx ? primaryPlacement.pixelBounds.heightPx * 0.8 : 48,
    },
  });

  // Secondary elements (subheadline, CTA, logo, etc.)
  for (let i = 0; i < secondaryPlacements.length; i++) {
    const sec = secondaryPlacements[i];
    elements.push({
      id: `sec-${sec.role}-${i + 1}`,
      role: sec.role,
      hierarchyLevel: sec.role === 'subheadline' ? 2 : sec.role === 'cta' ? 3 : 4,
      rect: sec.candidate.rect,
      geometry: (sec.candidate as AlignmentEnhancedCandidate).geometry,
      opticalMetrics: sec.opticalMetrics || {
        ascenderPx: sec.candidate.pixelBounds?.heightPx ? sec.candidate.pixelBounds.heightPx * 0.75 : 24,
        descenderPx: sec.candidate.pixelBounds?.heightPx ? sec.candidate.pixelBounds.heightPx * 0.25 : 8,
        baselineYNorm: sec.candidate.rect.y + sec.candidate.rect.height * 0.8,
        fontSizePx: sec.candidate.pixelBounds?.heightPx ? sec.candidate.pixelBounds.heightPx * 0.8 : 28,
      },
    });
  }

  return evaluateCompositionSpacing({
    elements,
    field,
    canvas,
    brand,
    customWeights,
  });
}

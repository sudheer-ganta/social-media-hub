/**
 * FLOWPOST GLOBAL COMPOSITION EVALUATION ENGINE — PHASE 9 (PART B)
 *
 * Evaluates complete, multi-element candidate composition states holistically across:
 *   - Spatial coherence & visual balance
 *   - Typography hierarchy & rag rhythm
 *   - Alignment axes adherence
 *   - Spacing & Gestalt grouping coherence
 *   - Color & continuous contrast quality
 *   - Dynamic surface intervention & image preservation
 *   - Higher-order cross-subsystem interactions
 *
 * Architectural Guardrails:
 *   1. DEPENDENCY-AWARE EXPLORATION (NO CARTESIAN EXPLOSION):
 *      - Line-structure hypotheses -> Placements -> Alignments -> Spacing -> Colors -> Surfaces
 *      - Bounded by configurable exploration parameters (reproducible and deterministic).
 *   2. PRESERVED SIGNAL VECTORS & TRADEOFF PROFILES:
 *      - Never collapses raw measurements into an opaque score.
 *      - Preserves individual signals and multi-objective tradeoff profiles.
 *   3. REAL INTERACTION SIGNAL MEASUREMENTS:
 *      - Type × Image, Color × Surface, Placement × Alignment, Spacing × Hierarchy,
 *        Subject × Type, Logo × Type derived from exact geometric and field data.
 *   4. AUTHORITY INVARIANCE:
 *      - Phase 9 evaluates and selects among complete states without mutating Phase 5 coordinates,
 *        Phase 6 alignments, Phase 7 spacing, or Phase 8 colors.
 *   5. PURE RENDERER CONSUMPTION:
 *      - Emits OptimizedCompositionState consumed by renderer with zero post-render repairs.
 */

import type { CanvasRepresentation, BrandDesignRepresentation, DesignField } from './design-representation';
import type { GraphicDesignConcept } from '../types';
import type { FieldRect } from './image-field';
import { createDynamicCopyModel, type DynamicCopyVisualObject } from './copy-model';
import { exploreLineStructures, type LineStructureState } from '../typography/dynamic-line-structure';
import { evaluateFontCandidates, evaluateFontFit } from '../typography/dynamic-typography';
import { getFontDefinition, nearestAvailableWeight } from '../typography/font-catalog';
import { discoverPlacementCandidates, type PlacementCandidate } from './dynamic-placement';
import { discoverNaturalAxes, enhancePlacementCandidatesWithAlignment, type AlignmentEnhancedCandidate } from './dynamic-alignment';
import { enhanceMultiElementCompositionWithSpacing, type SpacingElement, type SpacingEnhancedComposition } from './dynamic-spacing';
import { discoverInkCandidates, type InkStateCandidate, type ColorDescriptor } from './dynamic-color';
import { discoverSurfaceCandidates, type SurfaceField, type SurfaceCandidate } from './dynamic-surface';
import type { CompositionRecoveryContext } from './critic-recovery';

// ─── 1. Composition State Data Models ───────────────────────────────────────

export interface CompositionElementState {
  id: string;
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo';
  copy?: DynamicCopyVisualObject;
  typographyState: LineStructureState;
  rect: FieldRect;                     // Exact bounding box [x, y, w, h] from Phase 5/6/7
  alignmentAxisId?: string;
  ink: InkStateCandidate;
  surface: SurfaceCandidate;           // Chosen surface candidate (may be no-surface)
}

export interface CompositionSignalVector {
  // Spatial Coherence
  occupiedArea: number;                // Total fraction of canvas occupied [0.0 .. 1.0]
  whitespaceDistribution: number;      // Balance of unoccupied breathing room [0.0 .. 1.0]
  densityDistribution: number;         // Visual mass dispersion index [0.0 .. 1.0]
  edgePressure: number;                // Margin comfort vs edge pinch penalty [0.0 .. 1.0]
  spatialBalance: number;              // Center of mass equilibrium [0.0 .. 1.0]
  visualMassDistribution: number;      // Distribution symmetry across quadrants [0.0 .. 1.0]

  // Typography
  hierarchyClarity: number;            // Scale and weight distinction between roles [0.0 .. 1.0]
  typographicDensity: number;          // Optical density of glyph blocks [0.0 .. 1.0]
  lineRhythm: number;                  // Leading and vertical rhythm quality [0.0 .. 1.0]
  ragQuality: number;                  // Contour smoothness of multi-line blocks [0.0 .. 1.0]
  opticalScale: number;                // Readability at canvas shortEdge [0.0 .. 1.0]
  typeImageInteraction: number;        // Text placement relative to image focal flow [0.0 .. 1.0]

  // Alignment
  axisCoherence: number;               // Alignment adherence to natural axes [0.0 .. 1.0]
  relationshipCoherence: number;       // Inter-element alignment consistency [0.0 .. 1.0]
  opticalAlignment: number;            // Visual flushness of glyph edges [0.0 .. 1.0]
  alignmentConflict: number;           // Competing misaligned edge penalty [0.0 .. 1.0]

  // Spacing
  groupingCoherence: number;           // Gestalt proximity and semantic unity [0.0 .. 1.0]
  proximityQuality: number;            // Natural gap spacing without collision [0.0 .. 1.0]
  whitespaceQuality: number;           // Distribution of open negative space [0.0 .. 1.0]
  spacingConflict: number;             // Inconsistent gap rhythm penalty [0.0 .. 1.0]
  gestaltContinuity: number;           // Visual flow continuation [0.0 .. 1.0]

  // Color & Contrast
  localContrast: number;               // Mean WCAG contrast ratio score [0.0 .. 1.0]
  apcaEstimatedLc: number;             // Mean APCA Lightness Contrast magnitude
  wcagRatio: number;                   // Minimum WCAG ratio across all elements
  colorHarmony: number;                // Temperature and chromatic alignment [0.0 .. 1.0]
  brandCompatibility: number;          // Brand color adherence score [0.0 .. 1.0]
  perceivedInkMass: number;            // Combined optical weight of text elements
  chromaticConflict: number;           // Dissonant vibration penalty [0.0 .. 1.0]

  // Image & Subject Interaction
  subjectInterference: number;         // Overlap with primary image subject [0.0 .. 1.0] (0 = none)
  focalInteraction: number;             // Placement relative to focal anchor [0.0 .. 1.0]
  detailInterference: number;          // High-frequency texture collision [0.0 .. 1.0]
  imagePreservation: number;           // Retention of original background identity [0.0 .. 1.0]
  visualFlowInteraction: number;       // Alignment with natural visual scan path [0.0 .. 1.0]

  // Surface Intervention
  contrastGain: number;                // Total contrast boost from surfaces
  surfaceDisruption: number;           // Total visual intrusion penalty [0.0 .. 1.0]
  surfaceComplexity: number;           // Total surface parameter complexity [0.0 .. 1.0]
  surfaceNecessity: number;            // Combined backdrop difficulty index [0.0 .. 1.0]

  // Hierarchy
  semanticPriorityExpression: number;  // Headline > Subheadline > CTA dominance [0.0 .. 1.0]
  scaleDifferentiation: number;        // Font size differential [0.0 .. 1.0]
  weightDifferentiation: number;       // Font weight differential [0.0 .. 1.0]
  attentionDistribution: number;       // Focus trajectory clarity [0.0 .. 1.0]
}

export interface CompositionInteractions {
  /** Typography × Image: Footprint overlap with local detail energy, luminance variance, and subject */
  typeImage: number;
  /** Typography × Placement: Spatial stability, margin breathing room, and aspect capacity */
  typePlacement: number;
  /** Color × Surface: Post-surface contrast delta, chromatic unity, and image preservation */
  colorSurface: number;
  /** Placement × Alignment: Geometric match against discovered natural axes */
  placementAlignment: number;
  /** Spacing × Hierarchy: Semantic priority scale differential vs geometric spacing */
  spacingHierarchy: number;
  /** Subject × Typography: Subject boundary clearance and non-interference */
  subjectType: number;
  /** Logo × Typography: Alignment axis match and scale hierarchy balance */
  logoType: number;
  /** Creative Mechanism Realization: Extent to which physical composition expresses the stated creative mechanism */
  conceptRealization?: number;
}

export interface CreativeRealizationContext {
  conceptName: string;
  creativeMechanism: string;
  dominantVisualObject: string;
  hero: 'typography' | 'image' | 'graphic-element' | 'whitespace' | 'texture';
  imageRole:
    | 'hero'
    | 'small-tactile-object'
    | 'full-bleed'
    | 'offset-crop'
    | 'floating-fragment'
    | 'subordinate-texture'
    | 'omitted';
  spatialRelationship: string;
  typeBehavior: string;
  imageBehavior: string;
  compositionFamily: string;
  requiredVisualMechanics: string[];
  prohibitedVisualInterpretations: string[];
  requiredClaims: string[];
}

export interface CompositionTradeoffProfile {
  legibilityScore: number;             // Readability across all text [0.0 .. 1.0]
  imagePreservationScore: number;      // Image integrity retention [0.0 .. 1.0]
  imageIntegrityScore: number;         // Primary alias for image preservation & integrity [0.0 .. 1.0]
  brandAdherenceScore: number;         // Brand color & typography fidelity [0.0 .. 1.0]
  spatialHarmonyScore: number;         // Whitespace & alignment elegance [0.0 .. 1.0]
  hierarchyClarityScore: number;       // Dominance and semantic flow clarity [0.0 .. 1.0]
  conceptExpressionScore?: number;     // Physical realization of creative mechanism [0.0 .. 1.0]
}

export interface OptimizedCompositionState {
  id: string;
  canvas: CanvasRepresentation;
  elements: CompositionElementState[];
  surfaces: SurfaceField[];            // Non-null active surfaces
  signals: CompositionSignalVector;
  interactionSignals: CompositionInteractions;
  tradeoffProfile: CompositionTradeoffProfile;
  evaluation: {
    aggregateScore: number;
    reasons: string[];
  };
}

// ─── 2. Configurable Composition Evaluation Weights ─────────────────────────

export interface CompositionEvaluationWeights {
  spatialCoherenceWeight: number;
  typographyWeight: number;
  alignmentWeight: number;
  spacingWeight: number;
  colorContrastWeight: number;
  imagePreservationWeight: number;
  surfaceEfficiencyWeight: number;
  hierarchyWeight: number;
  interactionWeight: number;
}

export const DEFAULT_COMPOSITION_WEIGHTS: CompositionEvaluationWeights = {
  spatialCoherenceWeight: 0.15,
  typographyWeight: 0.15,
  alignmentWeight: 0.15,
  spacingWeight: 0.10,
  colorContrastWeight: 0.15,
  imagePreservationWeight: 0.10,
  surfaceEfficiencyWeight: 0.05,
  hierarchyWeight: 0.05,
  interactionWeight: 0.10,
};

export interface CompositionExplorationConfig {
  maxTypographyStates: number;         // e.g. 2 per copy item
  maxPlacementsPerType: number;        // e.g. 2
  maxColorsPerPlacement: number;       // e.g. 2
  maxSurfacesPerState: number;         // e.g. 2
  maxEvaluatedStates: number;          // e.g. 12
  diversityThresholdDeltaE: number;    // e.g. 0.08
}

export const DEFAULT_EXPLORATION_CONFIG: CompositionExplorationConfig = {
  maxTypographyStates: 2,
  maxPlacementsPerType: 2,
  maxColorsPerPlacement: 2,
  maxSurfacesPerState: 2,
  maxEvaluatedStates: 12,
  diversityThresholdDeltaE: 0.08,
};

// ─── 3. Holistic State Evaluator ────────────────────────────────────────────

export interface StateEvaluationInput {
  canvas: CanvasRepresentation;
  elements: CompositionElementState[];
  field: DesignField;
  brand?: BrandDesignRepresentation;
  concept?: GraphicDesignConcept;
  realizationContext?: CreativeRealizationContext;
  weights?: Partial<CompositionEvaluationWeights>;
  recoveryContext?: CompositionRecoveryContext;
}

/**
 * Evaluates an individual complete candidate composition state holistically.
 */
export function evaluateCompositionState(input: StateEvaluationInput): {
  signals: CompositionSignalVector;
  interactionSignals: CompositionInteractions;
  tradeoffProfile: CompositionTradeoffProfile;
  aggregateScore: number;
  reasons: string[];
} {
  const { canvas, elements, field, brand, weights, realizationContext, concept } = input;
  const w = { ...DEFAULT_COMPOSITION_WEIGHTS, ...weights };

  // 1. Spatial Coherence Measurements
  let totalOccupiedArea = 0;
  let minMarginLeft = 1.0;
  let minMarginTop = 1.0;
  let minMarginRight = 1.0;
  let minMarginBottom = 1.0;
  let massCenterX = 0;
  let massCenterY = 0;
  let totalMass = 0;

  for (const el of elements) {
    const area = el.rect.width * el.rect.height;
    totalOccupiedArea += area;
    minMarginLeft = Math.min(minMarginLeft, el.rect.x);
    minMarginTop = Math.min(minMarginTop, el.rect.y);
    minMarginRight = Math.min(minMarginRight, 1.0 - (el.rect.x + el.rect.width));
    minMarginBottom = Math.min(minMarginBottom, 1.0 - (el.rect.y + el.rect.height));

    const mass = area * (el.ink.signals.perceivedInkMass || 1.0);
    massCenterX += (el.rect.x + el.rect.width / 2) * mass;
    massCenterY += (el.rect.y + el.rect.height / 2) * mass;
    totalMass += mass;
  }

  const occupiedArea = Number(Math.min(1.0, totalOccupiedArea).toFixed(3));
  const whitespaceDistribution = Number(Math.max(0, 1.0 - occupiedArea).toFixed(3));
  const minMargin = Math.min(minMarginLeft, minMarginTop, minMarginRight, minMarginBottom);
  const refMargin = canvas.safeBounds ? canvas.safeBounds.x : 0.04;
  const edgePressure = Number(Math.min(1.0, minMargin / Math.max(0.01, refMargin)).toFixed(3));

  const avgCenterX = totalMass > 0 ? massCenterX / totalMass : 0.5;
  const avgCenterY = totalMass > 0 ? massCenterY / totalMass : 0.5;
  const balanceDelta = Math.hypot(avgCenterX - 0.5, avgCenterY - 0.5);
  const spatialBalance = Number(Math.max(0, 1.0 - balanceDelta * 1.5).toFixed(3));
  const visualMassDistribution = Number((spatialBalance * 0.7 + edgePressure * 0.3).toFixed(3));
  const densityDistribution = Number((occupiedArea / Math.max(0.1, elements.length * 0.15)).toFixed(3));

  // 2. Typography Signals
  let headlineState = elements.find((e) => e.role === 'headline');
  let subState = elements.find((e) => e.role === 'subheadline');
  let ctaState = elements.find((e) => e.role === 'cta');
  let logoState = elements.find((e) => e.role === 'logo' || e.id.includes('logo') || e.id.includes('brand-mark'));

  let scaleDiff = 0.8;
  let weightDiff = 0.8;
  let massDiff = 0.8;
  let hierarchyClarity = 0.85;

  if (headlineState && subState) {
    const hScale = headlineState.typographyState.fontScale;
    const sScale = subState.typographyState.fontScale;
    scaleDiff = Math.min(1.0, Math.max(0, (hScale - sScale) / Math.max(0.01, hScale * 0.55)));

    // Empirical Typographic Mass Proxy distinction (separated from contrast)
    const hMass = headlineState.typographyState.typographicMass?.massProxy ?? (hScale * 100);
    const sMass = subState.typographyState.typographicMass?.massProxy ?? (sScale * 100);
    massDiff = Math.min(1.0, Math.max(0, (hMass - sMass) / Math.max(1, hMass * 0.55)));

    // Continuous weight separation
    weightDiff = Math.min(1.0, Math.max(0, (headlineState.typographyState.weight - subState.typographyState.weight + 200) / 600));

    // Continuous pairwise hierarchy clarity
    hierarchyClarity = Number(((scaleDiff * 0.45 + massDiff * 0.35 + weightDiff * 0.20)).toFixed(3));
  } else if (headlineState) {
    hierarchyClarity = 0.90;
  }

  const ragQuality = Number(
    (elements.reduce((acc, el) => acc + (el.typographyState.scores?.linguisticScore || 0.8), 0) / Math.max(1, elements.length)).toFixed(3)
  );
  const opticalScale = Number((elements.reduce((acc, el) => acc + (el.ink.contrast.opticalScaleMultiplier >= 0.8 ? 0.9 : 0.7), 0) / Math.max(1, elements.length)).toFixed(3));
  
  // Calculate line rhythm from typography scores and line count consistency
  const avgLineScore = elements.reduce((acc, el) => acc + (el.typographyState.scores?.compositeScore || 0.85), 0) / Math.max(1, elements.length);
  const lineRhythm = Number(avgLineScore.toFixed(3));
  const typographicDensity = Number(Math.min(1.0, occupiedArea * 2.5).toFixed(3));

  // 3. Alignment Signals
  let alignedCount = 0;
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const e1 = elements[i];
      const e2 = elements[j];
      const leftDiff = Math.abs(e1.rect.x - e2.rect.x);
      const centerDiff = Math.abs((e1.rect.x + e1.rect.width / 2) - (e2.rect.x + e2.rect.width / 2));
      if (leftDiff < 0.02 || centerDiff < 0.02) alignedCount++;
    }
  }
  const maxPairs = (elements.length * (elements.length - 1)) / 2;
  const axisCoherence = Number(Math.min(1.0, (alignedCount + 1) / Math.max(1, maxPairs + 1)).toFixed(3));
  const relationshipCoherence = axisCoherence;
  const opticalAlignment = Number((axisCoherence * 0.8 + edgePressure * 0.2).toFixed(3));
  const alignmentConflict = Number(Math.max(0, 1.0 - axisCoherence).toFixed(3));

  // 4. Spacing Signals (Measured from actual inter-element geometry)
  let groupingCoherence = 1.0;
  let proximityQuality = 1.0;
  if (elements.length > 1) {
    let totalProximity = 0;
    let pairsCount = 0;
    for (let i = 0; i < elements.length - 1; i++) {
      const e1 = elements[i];
      const e2 = elements[i + 1];
      const gapY = e2.rect.y - (e1.rect.y + e1.rect.height);
      const idealGap = Math.max(0.015, e1.rect.height * 0.30);
      const gapDiff = Math.abs(gapY - idealGap);
      const prox = Math.max(0, 1.0 - (gapDiff / Math.max(0.02, idealGap)) * 0.5);
      totalProximity += prox;
      pairsCount++;
    }
    proximityQuality = Number((totalProximity / Math.max(1, pairsCount)).toFixed(3));
    groupingCoherence = proximityQuality;
  }
  const whitespaceQuality = whitespaceDistribution;
  const spacingConflict = Number(Math.max(0, 1.0 - proximityQuality).toFixed(3));
  const gestaltContinuity = Number((axisCoherence * 0.5 + groupingCoherence * 0.5).toFixed(3));

  // 5. Color & Contrast Signals (Crediting Effective Post-Surface State)
  let minWcag = 21.0;
  let totalWcag = 0;
  let totalApca = 0;
  let totalBrand = 0;
  let totalHarmony = 0;

  for (const el of elements) {
    const effectiveWcag = el.surface.signals.postSurfaceWcag ?? (el.ink.contrast.wcagRatio + (el.surface.signals.contrastGain || 0));
    const effectiveApca = el.surface.signals.postSurfaceApca ?? el.ink.contrast.apcaEstimatedLc;

    minWcag = Math.min(minWcag, effectiveWcag);
    totalWcag += effectiveWcag;
    totalApca += Math.abs(effectiveApca);
    totalBrand += el.ink.provenance.brandCompatibilityScore !== undefined ? el.ink.provenance.brandCompatibilityScore : (1 / (1 + el.ink.provenance.deltaEOklab * 4));
    totalHarmony += el.ink.signals.imageHarmonyScore;
  }

  const elCount = Math.max(1, elements.length);
  const wcagRatio = Number(minWcag.toFixed(2));
  const localContrast = Number(Math.min(1.0, (totalWcag / elCount) / 8.0).toFixed(3));
  const apcaEstimatedLc = Number((totalApca / elCount).toFixed(1));
  const brandCompatibility = Number((totalBrand / elCount).toFixed(3));
  const colorHarmony = Number((totalHarmony / elCount).toFixed(3));
  const perceivedInkMass = Number((elements.reduce((acc, el) => acc + (el.ink.signals.perceivedInkMass || 1.0), 0) / elCount).toFixed(3));
  const chromaticConflict = Number(Math.max(0, 1.0 - colorHarmony).toFixed(3));

  // 6. Image & Subject Interaction Signals
  let maxSubjectInterference = 0;
  let maxDetailInterference = 0;
  let avgImagePreservation = 0;
  let totalContrastGain = 0;
  let totalDisruption = 0;
  let totalSurfaceComplexity = 0;
  let totalSurfaceNecessity = 0;

  for (const el of elements) {
    const reg = field.evaluateRegion(el.rect);
    let elemSubjOverlap = 0;
    if (field.subjectBox && field.subjectBox.width > 0 && field.subjectBox.height > 0) {
      const sb = field.subjectBox;
      const ox = Math.max(0, Math.min(el.rect.x + el.rect.width, sb.x + sb.width) - Math.max(el.rect.x, sb.x));
      const oy = Math.max(0, Math.min(el.rect.y + el.rect.height, sb.y + sb.height) - Math.max(el.rect.y, sb.y));
      if (ox > 0 && oy > 0) {
        elemSubjOverlap = (ox * oy) / Math.max(0.0001, el.rect.width * el.rect.height);
      }
    }
    const regSubj = typeof reg.subjectOcclusion === 'number' ? reg.subjectOcclusion : (typeof (reg as any).subjectOverlapFraction === 'number' ? (reg as any).subjectOverlapFraction : 0);
    const subj = Math.max(regSubj, elemSubjOverlap);
    maxSubjectInterference = Math.max(maxSubjectInterference, subj);
    maxDetailInterference = Math.max(maxDetailInterference, reg.detailEnergy || 0);

    avgImagePreservation += el.surface.signals.imagePreservation || 0;
    totalContrastGain += el.surface.signals.contrastGain || 0;
    totalDisruption += el.surface.signals.visualDisruption || 0;
    totalSurfaceComplexity += el.surface.signals.surfaceComplexity || 0;
    totalSurfaceNecessity += el.surface.scores.necessityScore || 0;
  }

  const subjectInterference = Number(maxSubjectInterference.toFixed(3));
  const detailInterference = Number(maxDetailInterference.toFixed(3));
  const imagePreservation = Number((avgImagePreservation / elCount).toFixed(3));
  const focalInteraction = Number(Math.max(0, 1.0 - subjectInterference).toFixed(3));
  const visualFlowInteraction = Number((focalInteraction * 0.6 + spatialBalance * 0.4).toFixed(3));
  const typeImageInteraction = Number(Math.max(0, 1.0 - (detailInterference * 0.5 + subjectInterference * 0.5)).toFixed(3));

  // 7. Surface Signals (Symmetrical Efficiency Evaluation)
  const contrastGain = Number((totalContrastGain / elCount).toFixed(2));
  const surfaceDisruption = Number((totalDisruption / elCount).toFixed(3));
  const surfaceComplexity = Number((totalSurfaceComplexity / elCount).toFixed(3));
  const surfaceNecessity = Number((totalSurfaceNecessity / elCount).toFixed(3));

  // 8. Hierarchy Signals
  const semanticPriorityExpression = hierarchyClarity;
  const scaleDifferentiation = Number(scaleDiff.toFixed(3));
  const weightDifferentiation = Number(weightDiff.toFixed(3));
  const attentionDistribution = Number((hierarchyClarity * 0.6 + spatialBalance * 0.4).toFixed(3));

  // ─── 9. Real Higher-Order Interaction Derivations ────────────────────────

  // Type × Image: Direct overlap with detail energy, luminance variance, and subject
  const typeImage = Number(Math.max(0, 1.0 - (detailInterference * 0.5 + subjectInterference * 0.5)).toFixed(3));

  // Type × Placement: Margin breathability and whitespace balance
  const typePlacement = Number((edgePressure * 0.5 + whitespaceDistribution * 0.5).toFixed(3));

  // Color × Surface: Post-surface contrast boost relative to image preservation
  const colorSurface = Number(Math.min(1.0, localContrast * 0.6 + imagePreservation * 0.4).toFixed(3));

  // Placement × Alignment: Geometric adherence to natural discovered axes
  const placementAlignment = axisCoherence;

  // Spacing × Hierarchy: Semantic scale separation supported by proximity coherence
  const spacingHierarchy = Number((hierarchyClarity * 0.6 + groupingCoherence * 0.4).toFixed(3));

  // Subject × Type: Clearance from primary subject visual mass
  const subjectType = Number(Math.max(0, 1.0 - subjectInterference * 1.5).toFixed(3));

  // Logo × Type: Calculated from real logo presence, alignment, quietness, and physical contrast
  let logoType = 1.0;
  if (logoState && headlineState) {
    const logoAligned = Math.abs(logoState.rect.x - headlineState.rect.x) < 0.03 ||
      Math.abs((logoState.rect.x + logoState.rect.width) - (headlineState.rect.x + headlineState.rect.width)) < 0.03;
    const logoSubject = field.evaluateRegion(logoState.rect);
    let logoSubjOcc = logoSubject.subjectOcclusion || 0;
    if (field.subjectBox && field.subjectBox.width > 0 && field.subjectBox.height > 0) {
      const sb = field.subjectBox;
      const ox = Math.max(0, Math.min(logoState.rect.x + logoState.rect.width, sb.x + sb.width) - Math.max(logoState.rect.x, sb.x));
      const oy = Math.max(0, Math.min(logoState.rect.y + logoState.rect.height, sb.y + sb.height) - Math.max(logoState.rect.y, sb.y));
      if (ox > 0 && oy > 0) {
        logoSubjOcc = Math.max(logoSubjOcc, (ox * oy) / Math.max(0.0001, logoState.rect.width * logoState.rect.height));
      }
    }
    const logoQuiet = Math.max(0, 1.0 - Math.min(1.0, (logoSubject.detailEnergy || 0) * 2.0));
    const logoClean = Math.max(0, 1.0 - logoSubjOcc * 1.5) * 0.6 + logoQuiet * 0.4;
    const logoEffectiveWcag = logoState.surface.signals.postSurfaceWcag ?? (logoState.ink.contrast.wcagRatio + (logoState.surface.signals.contrastGain || 0));
    const logoContrastQuality = Math.min(1.0, logoEffectiveWcag / 4.5);
    logoType = Number(( (logoAligned ? 0.95 : 0.85) * 0.3 + logoClean * 0.4 + logoContrastQuality * 0.3 ).toFixed(3));
  }

  // ─── 9. Creative Mechanism & Realization Evaluation ───────────────────────
  let conceptRealization = 0.85; // Default neutral-high when no specific mechanism is constrained
  let genericCompositionPenalty = 0;

  const mechanism = (realizationContext?.creativeMechanism || concept?.creativeMechanism || (concept as any)?.mechanism || '').toLowerCase();
  const spatialRel = (realizationContext?.spatialRelationship || concept?.spatialRelationship || '').toLowerCase();
  const heroRole = realizationContext?.hero || concept?.hero || 'image';
  const imgRole = realizationContext?.imageRole || concept?.imageRole || 'full-bleed';
  const compFamily = (realizationContext?.compositionFamily || concept?.compositionFamily || '').toLowerCase();

  const hasSpecificMechanism = Boolean(
    mechanism.length > 5 ||
    spatialRel.length > 5 ||
    heroRole === 'whitespace' ||
    heroRole === 'typography' ||
    imgRole === 'small-tactile-object' ||
    imgRole === 'floating-fragment' ||
    compFamily.includes('editorial') ||
    compFamily.includes('poster')
  );

  if (hasSpecificMechanism) {
    let realizationScore = 0.80;

    const requiresBoundary =
      mechanism.includes('boundary') ||
      mechanism.includes('threshold') ||
      mechanism.includes('straddle') ||
      mechanism.includes('light/shadow') ||
      mechanism.includes('geometry of light') ||
      spatialRel.includes('boundary') ||
      spatialRel.includes('straddle') ||
      spatialRel.includes('light/shadow');

    // 1. Boundary / Straddle / Threshold Mechanism
    if (requiresBoundary) {
      if (headlineState) {
        const hRect = headlineState.rect;
        const reg = field.evaluateRegion(hRect);

        // Measure gradient across headline bounding box (horizontal and vertical)
        const leftSample = field.sample(hRect.x + 0.02, hRect.y + hRect.height / 2);
        const rightSample = field.sample(hRect.x + hRect.width - 0.02, hRect.y + hRect.height / 2);
        const horizGradient = Math.abs(leftSample.luminance - rightSample.luminance);

        const topSample = field.sample(hRect.x + hRect.width / 2, hRect.y + 0.02);
        const bottomSample = field.sample(hRect.x + hRect.width / 2, hRect.y + hRect.height - 0.02);
        const vertGradient = Math.abs(topSample.luminance - bottomSample.luminance);

        const boundaryGradient = Math.max(horizGradient, vertGradient, reg.luminanceStdDev * 2.5);

        // Does the headline actually straddle or interact with the field's structural boundary?
        if (boundaryGradient >= 0.05 || reg.luminanceStdDev >= 0.035) {
          // Visibly straddles the structural light/shadow boundary
          realizationScore = Math.min(1.0, 0.85 + (boundaryGradient / 0.20) * 0.15);
        } else {
          // Flat/isolated placement fails to express the boundary/threshold mechanism
          realizationScore = Math.max(0.05, 0.30 - (0.05 - boundaryGradient) * 6.0);
        }
      }
    }

    // 2. Whitespace / Negative-Space Hero Realization
    if ((heroRole === 'whitespace' || spatialRel.includes('whitespace') || spatialRel.includes('void')) && !requiresBoundary) {
      const whitespaceClarity = whitespaceDistribution >= 0.45 ? 0.90 : Math.max(0.2, whitespaceDistribution / 0.45);
      const subjectClearance = Math.max(0, 1.0 - subjectInterference * 2.0);
      const wsScore = whitespaceClarity * 0.6 + subjectClearance * 0.4;
      realizationScore = Math.min(realizationScore, wsScore);
    }

    // 3. Typographic Hero / Editorial Realization
    if ((heroRole === 'typography' || compFamily.includes('typographic-poster') || compFamily.includes('editorial')) && !requiresBoundary) {
      const typoProminence = headlineState ? Math.min(1.0, headlineState.typographyState.fontScale / 0.055) : 0.5;
      const typoScore = hierarchyClarity * 0.5 + typoProminence * 0.5;
      realizationScore = (realizationScore * 0.5) + (typoScore * 0.5);
    }

    // 4. Tactile Object / Floating Fragment Realization
    if (imgRole === 'small-tactile-object' || imgRole === 'floating-fragment') {
      const nonOcclusion = Math.max(0, 1.0 - subjectInterference * 3.0);
      realizationScore = Math.min(realizationScore, nonOcclusion);
    }

    conceptRealization = Number(Math.max(0.05, Math.min(1.0, realizationScore)).toFixed(3));

    // Penalty for failing to express the required mechanism (generic / disconnected layout)
    if (conceptRealization < 0.50) {
      genericCompositionPenalty = Number(((0.50 - conceptRealization) * 0.60).toFixed(3));
    }
  }

  const interactionSignals: CompositionInteractions = {
    typeImage,
    typePlacement,
    colorSurface,
    placementAlignment,
    spacingHierarchy,
    subjectType,
    logoType,
    conceptRealization,
  };

  // ─── 10. Multi-Objective Tradeoff Profile ─────────────────────────────────

  const wcagQuality = wcagRatio >= 4.5 ? 1.0 : Math.max(0, wcagRatio / 4.5);
  const tradeoffProfile: CompositionTradeoffProfile = {
    legibilityScore: Number(((localContrast * 0.5 + wcagQuality * 0.5) * 0.7 + (Math.min(100, apcaEstimatedLc) / 100) * 0.3).toFixed(3)),
    imagePreservationScore: Number(((imagePreservation * 0.6 + (1 - subjectInterference) * 0.4)).toFixed(3)),
    imageIntegrityScore: Number(((imagePreservation * 0.6 + (1 - subjectInterference) * 0.4)).toFixed(3)),
    brandAdherenceScore: Number(((brandCompatibility * 0.7 + colorHarmony * 0.3)).toFixed(3)),
    spatialHarmonyScore: Number(((spatialBalance * 0.4 + axisCoherence * 0.3 + whitespaceDistribution * 0.3)).toFixed(3)),
    hierarchyClarityScore: hierarchyClarity,
    conceptExpressionScore: conceptRealization,
  };

  // ─── 11. Observable Signal Vector ────────────────────────────────────────

  const signals: CompositionSignalVector = {
    occupiedArea,
    whitespaceDistribution,
    densityDistribution,
    edgePressure,
    spatialBalance,
    visualMassDistribution,
    hierarchyClarity,
    typographicDensity,
    lineRhythm,
    ragQuality,
    opticalScale,
    typeImageInteraction,
    axisCoherence,
    relationshipCoherence,
    opticalAlignment,
    alignmentConflict,
    groupingCoherence,
    proximityQuality,
    whitespaceQuality,
    spacingConflict,
    gestaltContinuity,
    localContrast,
    apcaEstimatedLc,
    wcagRatio,
    colorHarmony,
    brandCompatibility,
    perceivedInkMass,
    chromaticConflict,
    subjectInterference,
    focalInteraction,
    detailInterference,
    imagePreservation,
    visualFlowInteraction,
    contrastGain,
    surfaceDisruption,
    surfaceComplexity,
    surfaceNecessity,
    semanticPriorityExpression,
    scaleDifferentiation,
    weightDifferentiation,
    attentionDistribution,
  };

  // ─── 12. Aggregate Score Calculation (Fair Surface & Contrast Evaluation) ───

  const spatialScore = (spatialBalance + whitespaceDistribution + edgePressure) / 3;
  const typoScore = (hierarchyClarity + ragQuality + opticalScale) / 3;
  const alignScore = axisCoherence;
  const spacingScore = (groupingCoherence + proximityQuality) / 2;
  const colorScore = ((localContrast * 0.5 + wcagQuality * 0.5) + colorHarmony + brandCompatibility) / 3;
  const imageScore = (imagePreservation + (1 - subjectInterference)) / 2;
  
  // Fair Surface Efficiency: Net disruption is scaled down by necessity; contrast gain is rewarded
  const netDisruption = Math.max(0, surfaceDisruption - surfaceNecessity * 0.7);
  const surfaceScore = Number(Math.max(0, Math.min(1.0, 1.0 - netDisruption + Math.min(0.2, contrastGain * 0.04))).toFixed(3));
  const hierScore = hierarchyClarity;
  const interactScore = (typeImage + colorSurface + placementAlignment + spacingHierarchy + subjectType) / 5;

  // Element Overlap Penalty: Text elements must never physically collide or overlap
  let maxElementOverlap = 0;
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const e1 = elements[i].rect;
      const e2 = elements[j].rect;
      const ox = Math.max(0, Math.min(e1.x + e1.width, e2.x + e2.width) - Math.max(e1.x, e2.x));
      const oy = Math.max(0, Math.min(e1.y + e1.height, e2.y + e2.height) - Math.max(e1.y, e2.y));
      if (ox > 0.005 && oy > 0.005) {
        const oArea = (ox * oy) / Math.min(e1.width * e1.height, e2.width * e2.height);
        maxElementOverlap = Math.max(maxElementOverlap, oArea);
      }
    }
  }
  const overlapPenalty = maxElementOverlap > 0 ? (0.60 + maxElementOverlap * 0.40) : 0;
  // Direct Subject Occlusion Penalty: Prevent text elements from sitting on primary subject mass
  const subjectMultiplier = input.recoveryContext?.failures?.includes('OCCLUSION_FAILURE') ? 0.85 : 0.45;
  const subjectOcclusionPenalty = subjectInterference > 0.15 ? (subjectInterference * subjectMultiplier) : 0;

  // Active Logo Legibility Enforcement under LOGO_LEGIBILITY_FAILURE recovery
  let logoRecoveryPenalty = 0;
  if (logoState && input.recoveryContext?.failures?.includes('LOGO_LEGIBILITY_FAILURE')) {
    const logoEffectiveWcag = logoState.surface.signals.postSurfaceWcag ?? (logoState.ink.contrast.wcagRatio + (logoState.surface.signals.contrastGain || 0));
    if (logoEffectiveWcag < 3.0) {
      logoRecoveryPenalty += (3.0 - logoEffectiveWcag) * 0.20;
    }
    if (logoState.rect.height < 0.055) {
      logoRecoveryPenalty += (0.055 - logoState.rect.height) * 2.5;
    }
  }

  // Prior Rejection Avoidance Penalty: Discourage placing elements back into rejected failure zones
  let priorRejectionPenalty = 0;
  if (input.recoveryContext?.priorRejections?.length) {
    for (const pr of input.recoveryContext.priorRejections) {
      for (const el of elements) {
        if (el.id === pr.id) {
          const ox = Math.max(0, Math.min(el.rect.x + el.rect.width, pr.rect.x + pr.rect.width) - Math.max(el.rect.x, pr.rect.x));
          const oy = Math.max(0, Math.min(el.rect.y + el.rect.height, pr.rect.y + pr.rect.height) - Math.max(el.rect.y, pr.rect.y));
          if (ox > 0.01 && oy > 0.01) {
            const overlapFraction = (ox * oy) / Math.max(0.0001, el.rect.width * el.rect.height);
            if (overlapFraction > 0.40) {
              priorRejectionPenalty += overlapFraction * 0.35;
            }
          }
        }
      }
    }
  }

  const aggregateRaw =
    spatialScore * w.spatialCoherenceWeight +
    typoScore * w.typographyWeight +
    alignScore * w.alignmentWeight +
    spacingScore * w.spacingWeight +
    colorScore * w.colorContrastWeight +
    imageScore * w.imagePreservationWeight +
    surfaceScore * w.surfaceEfficiencyWeight +
    hierScore * w.hierarchyWeight +
    interactScore * w.interactionWeight -
    overlapPenalty -
    subjectOcclusionPenalty -
    logoRecoveryPenalty -
    priorRejectionPenalty -
    genericCompositionPenalty;

  const aggregateScore = Number(Math.max(0.001, Math.min(1.0, aggregateRaw)).toFixed(3));

  // ─── 13. Deterministic, Signal-Driven Explanations ────────────────────────

  const reasons: string[] = [
    `Legibility: WCAG min ${wcagRatio}:1 (APCA avg: ${apcaEstimatedLc}), Contrast Quality: ${(tradeoffProfile.legibilityScore * 100).toFixed(0)}%`,
    `Image Integrity: ${(tradeoffProfile.imagePreservationScore * 100).toFixed(0)}% (Subject Overlap: ${(subjectInterference * 100).toFixed(0)}%, Image Preservation: ${(imagePreservation * 100).toFixed(0)}%)`,
    `Spatial & Alignment: Axis Coherence ${(axisCoherence * 100).toFixed(0)}%, Spatial Balance ${(spatialBalance * 100).toFixed(0)}%, Margin Comfort ${(edgePressure * 100).toFixed(0)}%`,
    `Brand & Hierarchy: Brand Compatibility ${(brandCompatibility * 100).toFixed(0)}%, Hierarchy Clarity ${(hierarchyClarity * 100).toFixed(0)}%`,
    `Interactions: Type×Image ${(typeImage * 100).toFixed(0)}%, Color×Surface ${(colorSurface * 100).toFixed(0)}%, Spacing×Hierarchy ${(spacingHierarchy * 100).toFixed(0)}%`,
    `Creative Realization: ${(conceptRealization * 100).toFixed(0)}% (Mechanism: "${(mechanism || 'standard').slice(0, 32)}"${genericCompositionPenalty > 0 ? `, Generic Penalty: -${(genericCompositionPenalty * 100).toFixed(0)}%` : ''})`,
  ];

  return {
    signals,
    interactionSignals,
    tradeoffProfile,
    aggregateScore,
    reasons,
  };
}

// ─── 4. Pipeline Orchestration: Dependency-Aware Discovery ──────────────────

export interface CompositionDiscoveryInput {
  copyItems: Array<{
    id: string;
    text: string;
    role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo';
    priority: number;
    font?: string;
    weight?: number;
    spatialBox?: FieldRect;
  }>;
  logoItem?: {
    id: string;
    role: 'logo';
    aspectRatio: number;
    sourceDimensions?: { width: number; height: number };
  };
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  concept?: GraphicDesignConcept;
  realizationContext?: CreativeRealizationContext;
  explorationConfig?: Partial<CompositionExplorationConfig>;
  evaluationWeights?: Partial<CompositionEvaluationWeights>;
  recoveryContext?: CompositionRecoveryContext;
}

export interface CompositionDiscoveryResult {
  bestState: OptimizedCompositionState;
  retainedAlternatives: OptimizedCompositionState[];
  metrics: {
    totalHypothesesFormed: number;
    totalStatesEvaluated: number;
    statesRetained: number;
    diversitySpread: number;
    explorationLatencyMs: number;
  };
}

export class CompositionStateAssertionError extends Error {
  constructor(message: string, public readonly failureClass: string = 'COMPOSITION_STATE_INVALID') {
    super(message);
    this.name = 'CompositionStateAssertionError';
  }
}

/**
 * Validates the complete composition state prior to rendering.
 * Fails closed if any required element is missing, invalid, or severely colliding.
 */
export function assertCompositionStateValid(
  plan: { nodes: Array<{ id: string; kind?: string; x: number; y: number; width: number; height: number }> },
  copyItems: Array<{ id: string; role?: string }>,
  options?: { requireLogo?: boolean; logoId?: string },
): void {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    throw new CompositionStateAssertionError('Composition plan contains no elements.');
  }

  // 1. Verify all required copy items are present and have valid geometry
  for (const item of copyItems) {
    const node = plan.nodes.find((n) => n.id === item.id);
    if (!node) {
      throw new CompositionStateAssertionError(`Required copy item "${item.id}" is missing from composition plan.`);
    }
    if (
      !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
      !Number.isFinite(node.width) || !Number.isFinite(node.height) ||
      node.width <= 0 || node.height <= 0 ||
      node.x < -0.01 || node.y < -0.01 ||
      node.x + node.width > 1.01 || node.y + node.height > 1.01
    ) {
      throw new CompositionStateAssertionError(`Copy node "${item.id}" has invalid geometry [${node.x}, ${node.y}, ${node.width}, ${node.height}].`);
    }
  }

  // 2. Verify logo requirement and geometry if requested
  if (options?.requireLogo) {
    const logoId = options.logoId || 'brand-mark';
    const logoNode = plan.nodes.find((n) => n.kind === 'logo' || n.id === logoId);
    if (!logoNode) {
      throw new CompositionStateAssertionError(`Required brand logo "${logoId}" is missing from composition plan.`);
    }
    if (
      !Number.isFinite(logoNode.x) || !Number.isFinite(logoNode.y) ||
      !Number.isFinite(logoNode.width) || !Number.isFinite(logoNode.height) ||
      logoNode.width <= 0 || logoNode.height <= 0 ||
      logoNode.x < -0.01 || logoNode.y < -0.01 ||
      logoNode.x + logoNode.width > 1.01 || logoNode.y + logoNode.height > 1.01
    ) {
      throw new CompositionStateAssertionError(`Logo node "${logoId}" has invalid geometry [${logoNode.x}, ${logoNode.y}, ${logoNode.width}, ${logoNode.height}].`);
    }
  }

  // 3. Verify that distinct text/logo nodes do not severely collide
  const foregroundNodes = plan.nodes.filter((n) => n.kind === 'copy' || n.kind === 'logo');
  for (let i = 0; i < foregroundNodes.length; i++) {
    for (let j = i + 1; j < foregroundNodes.length; j++) {
      const a = foregroundNodes[i];
      const b = foregroundNodes[j];
      const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (ox > 0.01 && oy > 0.01) {
        const oArea = (ox * oy) / Math.min(a.width * a.height, b.width * b.height);
        if (oArea > 0.10) {
          throw new CompositionStateAssertionError(`Nodes "${a.id}" and "${b.id}" have severe collision (${(oArea * 100).toFixed(1)}% overlap).`);
        }
      }
    }
  }
}

/**
 * Discovers the optimized composition state across Phases 3–9 using dependency-aware exploration.
 */
export function discoverOptimizedComposition(input: CompositionDiscoveryInput): CompositionDiscoveryResult {
  const startTime = Date.now();
  const { copyItems, field, canvas, brand, explorationConfig, evaluationWeights } = input;
  const config = { ...DEFAULT_EXPLORATION_CONFIG, ...explorationConfig };

  // STEP 1: Discover Natural Alignment Axes (Phase 6)
  const discoveredAxes = discoverNaturalAxes({ field, canvas });

  // STEP 2: Generate Viable Line Structure States per Copy Item (Phases 3–4)
  const lineStatesByCopyId = new Map<string, LineStructureState[]>();
  const safeMargin = canvas.safeBounds ? canvas.safeBounds.x : 0.04;
  const availableWidth = 1.0 - safeMargin * 2;

  for (const item of copyItems) {
    const semanticRole = item.role === 'headline' ? 'primary-hook' : item.role === 'subheadline' ? 'secondary-hook' : 'supporting-note';
    const copyObj = createDynamicCopyModel(item.id, item.text, semanticRole, item.priority);

    const isHeadline = item.role === 'headline';
    const isSub = item.role === 'subheadline';
    const box: FieldRect = item.spatialBox || {
      x: safeMargin,
      y: safeMargin,
      width: isHeadline ? Math.min(0.88, availableWidth) : isSub ? Math.min(0.75, availableWidth) : Math.min(0.50, availableWidth),
      height: isHeadline ? 0.35 : isSub ? 0.20 : 0.12,
    };

    // Candidate fonts pool from item or Brand approved list
    const candidateFontPool: string[] = (item as any).approvedFonts?.length
      ? (item as any).approvedFonts
      : (isHeadline && brand?.approvedFonts?.headline?.length)
        ? brand.approvedFonts.headline
        : (isSub && brand?.approvedFonts?.body?.length)
          ? brand.approvedFonts.body
          : item.font
            ? [item.font]
            : (brand as any)?.primaryFonts?.length
              ? (brand as any).primaryFonts
              : ['Inter'];

    // Dynamic typography candidate evaluation against the physical DesignField
    const evaluatedTypographyCandidates: Array<{ family: string; weight: number; fitScore: number }> = [];
    for (const cf of candidateFontPool) {
      const fontDef = getFontDefinition(cf);
      if (!fontDef) {
        evaluatedTypographyCandidates.push({
          family: cf,
          weight: nearestAvailableWeight(cf, item.weight || (isHeadline ? 700 : 400)),
          fitScore: 50,
        });
        continue;
      }
      const fontEval = evaluateFontFit({
        font: fontDef,
        role: semanticRole as any,
        copy: copyObj,
        spatialBox: box,
        canvas,
        field,
        brand: brand || { brandName: 'Brand', primaryColors: [], secondaryColors: [], neutralColors: [], constraints: [] },
      });
      evaluatedTypographyCandidates.push({
        family: cf,
        weight: fontEval.recommendedWeight,
        fitScore: fontEval.fitScore,
      });
    }

    evaluatedTypographyCandidates.sort((a, b) => b.fitScore - a.fitScore);
    const orderedCandidateFonts = evaluatedTypographyCandidates.map((e) => ({
      family: e.family,
      weight: e.weight,
    }));

    const itemStates: LineStructureState[] = [];
    // Explore line structures across top candidate fonts
    for (const fontCandidate of orderedCandidateFonts.slice(0, 3)) {
      const states = exploreLineStructures({
        copy: copyObj,
        font: fontCandidate.family,
        weight: fontCandidate.weight,
        spatialBox: box,
        canvas,
      });
      itemStates.push(...states);
    }

    lineStatesByCopyId.set(item.id, itemStates.slice(0, config.maxTypographyStates * 2));
  }

  // STEP 3: Discover Placement & Alignment Candidates for Primary Element (Phase 5–6)
  const primaryItem = copyItems[0];
  const primaryLineStates = lineStatesByCopyId.get(primaryItem.id) || [];
  
  const spatialText = (input.concept?.spatialRelationship || '').toLowerCase();
  const preferredRegion: 'upper' | 'lower' | undefined =
    spatialText.includes('upper') || spatialText.includes('top') || spatialText.includes('void') || input.concept?.negativeSpaceRegion === 'top' || input.concept?.hero === 'whitespace'
      ? 'upper'
      : spatialText.includes('lower') || spatialText.includes('bottom') || input.concept?.negativeSpaceRegion === 'bottom'
      ? 'lower'
      : undefined;

  const candidateStates: OptimizedCompositionState[] = [];
  let totalHypothesesFormed = 0;

  // Resolve Logo Item Requirement
  const effectiveLogoItem = input.logoItem || (brand?.logo ? {
    id: 'brand-mark',
    role: 'logo' as const,
    aspectRatio: brand.logo.aspectRatio || 2.5,
    sourceDimensions: undefined,
  } : undefined);

  const priorAvoidBoxes: FieldRect[] = (input.recoveryContext?.priorRejections || [])
    .filter((pr) => input.recoveryContext?.failures.includes('OCCLUSION_FAILURE') || pr.reasons.some(r => r.toLowerCase().includes('occlude') || r.toLowerCase().includes('sitting on')))
    .map((pr) => pr.rect);

  for (const pLineState of primaryLineStates) {
    const rawPlacements = discoverPlacementCandidates({
      typographyState: pLineState,
      field,
      canvas,
      preferredRegion,
      existingElements: priorAvoidBoxes.length > 0 ? priorAvoidBoxes : undefined,
      maxCandidates: config.maxPlacementsPerType,
      refineContinuous: true,
    });

    const alignedPlacements: any[] = enhancePlacementCandidatesWithAlignment({
      candidates: rawPlacements,
      field,
      canvas,
      discoveredAxes,
    } as any);

    for (const topPlacement of alignedPlacements) {
      // Build candidate layout arrangements for secondary copy elements
      const secondaryLayoutOptions: Array<Array<{
        item: typeof copyItems[0];
        lineState: LineStructureState;
        rect: FieldRect;
        axisId?: string;
      }>> = [];

      // Calculate total height needed for secondary items in stack
      let totalSecondaryHeight = 0;
      const secondaryLines: LineStructureState[] = [];
      for (let i = 1; i < copyItems.length; i++) {
        const sItem = copyItems[i];
        const sLineStates = lineStatesByCopyId.get(sItem.id) || [];
        const sLine = sLineStates[0];
        secondaryLines.push(sLine);
        const gap = Number((topPlacement.rect.height * (sItem.role === 'subheadline' ? 0.22 : 0.35)).toFixed(3));
        totalSecondaryHeight += gap + (sLine?.boundingBox?.heightNormalized || 0.10);
      }

      // Arrangement 1: Proximity Stack (Down or Up depending on continuous subject check)
      const canStackDown = topPlacement.rect.y + topPlacement.rect.height + totalSecondaryHeight <= 1.0 - safeMargin;
      const canStackUp = topPlacement.rect.y - totalSecondaryHeight >= safeMargin;

      let stackDownHasSubjectConflict = false;
      let checkY = topPlacement.rect.y + topPlacement.rect.height;
      for (let i = 1; i < copyItems.length; i++) {
        const sItem = copyItems[i];
        const sLine = secondaryLines[i - 1];
        if (!sLine) continue;
        const gap = Number((topPlacement.rect.height * (sItem.role === 'subheadline' ? 0.22 : 0.35)).toFixed(3));
        const sY = Math.min(1.0 - safeMargin - sLine.boundingBox.heightNormalized, checkY + gap);
        const testRect: FieldRect = {
          x: topPlacement.rect.x,
          y: Math.max(checkY + 0.005, sY),
          width: sLine.boundingBox.widthNormalized,
          height: sLine.boundingBox.heightNormalized,
        };
        const regEval = field.evaluateRegion(testRect);
        if (regEval.subjectOcclusion > 0.35 || regEval.detailEnergy > 0.70) {
          stackDownHasSubjectConflict = true;
          break;
        }
        checkY = testRect.y + testRect.height;
      }

      if ((canStackDown && !stackDownHasSubjectConflict) || (!canStackUp && !stackDownHasSubjectConflict)) {
        // Stack Downward
        const stackDownElements: Array<{
          item: typeof copyItems[0];
          lineState: LineStructureState;
          rect: FieldRect;
          axisId?: string;
        }> = [
          {
            item: primaryItem,
            lineState: pLineState,
            rect: topPlacement.rect,
            axisId: topPlacement.associatedAxisId,
          },
        ];

        let curY = topPlacement.rect.y + topPlacement.rect.height;
        for (let i = 1; i < copyItems.length; i++) {
          const sItem = copyItems[i];
          const sLine = secondaryLines[i - 1];
          if (!sLine) continue;
          const gap = Number((topPlacement.rect.height * (sItem.role === 'subheadline' ? 0.22 : 0.35)).toFixed(3));
          const sY = Math.min(1.0 - safeMargin - sLine.boundingBox.heightNormalized, curY + gap);
          const sRect: FieldRect = {
            x: topPlacement.rect.x,
            y: Math.max(curY + 0.005, sY),
            width: sLine.boundingBox.widthNormalized,
            height: sLine.boundingBox.heightNormalized,
          };
          stackDownElements.push({
            item: sItem,
            lineState: sLine,
            rect: sRect,
            axisId: topPlacement.associatedAxisId,
          });
          curY = sRect.y + sRect.height;
        }
        secondaryLayoutOptions.push(stackDownElements);
      }

      if (canStackUp && copyItems.length > 1) {
        // Stack Upward (Eyebrow above headline)
        const stackUpElements: Array<{
          item: typeof copyItems[0];
          lineState: LineStructureState;
          rect: FieldRect;
          axisId?: string;
        }> = [
          {
            item: primaryItem,
            lineState: pLineState,
            rect: topPlacement.rect,
            axisId: topPlacement.associatedAxisId,
          },
        ];

        let curY = topPlacement.rect.y;
        for (let i = 1; i < copyItems.length; i++) {
          const sItem = copyItems[i];
          const sLine = secondaryLines[i - 1];
          if (!sLine) continue;
          const gap = Number((topPlacement.rect.height * (sItem.role === 'subheadline' ? 0.22 : 0.35)).toFixed(3));
          const sY = Math.max(safeMargin, curY - gap - sLine.boundingBox.heightNormalized);
          const sRect: FieldRect = {
            x: topPlacement.rect.x,
            y: sY,
            width: sLine.boundingBox.widthNormalized,
            height: sLine.boundingBox.heightNormalized,
          };
          stackUpElements.push({
            item: sItem,
            lineState: sLine,
            rect: sRect,
            axisId: topPlacement.associatedAxisId,
          });
          curY = sRect.y;
        }
        secondaryLayoutOptions.push(stackUpElements);
      }

      // Arrangement 2: Independent Spatial Discovery across field negative space
      if (copyItems.length > 1) {
        const distributedElements: Array<{
          item: typeof copyItems[0];
          lineState: LineStructureState;
          rect: FieldRect;
          axisId?: string;
        }> = [
          {
            item: primaryItem,
            lineState: pLineState,
            rect: topPlacement.rect,
            axisId: topPlacement.associatedAxisId,
          },
        ];

        const placedBoxes: FieldRect[] = [topPlacement.rect];
        for (let i = 1; i < copyItems.length; i++) {
          const sItem = copyItems[i];
          const sLine = secondaryLines[i - 1];
          if (!sLine) continue;

          const independentPlacements = discoverPlacementCandidates({
            typographyState: sLine,
            field,
            canvas,
            existingElements: placedBoxes,
            preferredRegion,
            maxCandidates: 2,
            refineContinuous: true,
          });

          let chosenRect: FieldRect | undefined;
          let chosenAxis: string | undefined;

          for (const cand of independentPlacements) {
            const hasOverlap = placedBoxes.some((b) => {
              const ox = Math.max(0, Math.min(cand.rect.x + cand.rect.width, b.x + b.width) - Math.max(cand.rect.x, b.x));
              const oy = Math.max(0, Math.min(cand.rect.y + cand.rect.height, b.y + b.height) - Math.max(cand.rect.y, b.y));
              return ox > 0.005 && oy > 0.005;
            });
            if (!hasOverlap) {
              chosenRect = cand.rect;
              chosenAxis = (cand as any).associatedAxisId;
              break;
            }
          }

          if (!chosenRect) {
            const oppY = topPlacement.rect.y > 0.5 ? safeMargin + 0.02 : 1.0 - safeMargin - sLine.boundingBox.heightNormalized - 0.02;
            chosenRect = {
              x: topPlacement.rect.x,
              y: oppY,
              width: sLine.boundingBox.widthNormalized,
              height: sLine.boundingBox.heightNormalized,
            };
          }

          distributedElements.push({
            item: sItem,
            lineState: sLine,
            rect: chosenRect,
            axisId: chosenAxis || topPlacement.associatedAxisId,
          });
          placedBoxes.push(chosenRect);
        }
        secondaryLayoutOptions.push(distributedElements);
      }

      // If single element, single layout option
      if (secondaryLayoutOptions.length === 0) {
        secondaryLayoutOptions.push([
          {
            item: primaryItem,
            lineState: pLineState,
            rect: topPlacement.rect,
            axisId: topPlacement.associatedAxisId,
          },
        ]);
      }

      for (const elementPlacements of secondaryLayoutOptions) {
        // STEP 4: Discover Viable Phase 8 Color Candidates per Element
        const elementColors = elementPlacements.map((ep) => {
          const inkCandidates = discoverInkCandidates({
            role: ep.item.role,
            footprint: ep.rect,
            field,
            canvas,
            brand,
            typographyState: ep.lineState,
          });
          return {
            ...ep,
            inkCandidates: inkCandidates.slice(0, config.maxColorsPerPlacement),
          };
        });

        // STEP 5: First-Class Logo Candidate Generation (prior to BestState selection)
        const logoCandidateStates: CompositionElementState[] = [];
        if (effectiveLogoItem) {
          const intrinsicAR = effectiveLogoItem.aspectRatio || 2.5;
          const canvasAR = (canvas.width || 1080) / (canvas.height || 1080);
          const aspectMultiplier = intrinsicAR / canvasAR;

          const hasLogoDefect = Boolean(input.recoveryContext?.failures?.includes('LOGO_LEGIBILITY_FAILURE'));
          // Continuous scale search domain derived from canvas headroom and intrinsic aspect ratio
          const minScale = hasLogoDefect ? 0.058 : 0.042;
          const maxScale = hasLogoDefect ? 0.115 : 0.095;
          const scaleHypotheses = Array.from({ length: 5 }, (_, idx) =>
            Number((minScale + (idx / 4) * (maxScale - minScale)).toFixed(3))
          );
          const textRects = elementPlacements.map((ep) => ep.rect);

          // Geometric spatial sampling across canvas bounds (margins, gutters, open field)
          const sampledPositions: Array<{ x: number; y: number }> = [
            { x: safeMargin, y: safeMargin },
            { x: 1 - safeMargin, y: safeMargin },
            { x: safeMargin, y: 1 - safeMargin },
            { x: 1 - safeMargin, y: 1 - safeMargin },
            { x: 0.5, y: safeMargin },
            { x: 0.5, y: 1 - safeMargin },
            { x: safeMargin, y: 0.5 },
            { x: 1 - safeMargin, y: 0.5 },
          ];

          // Additional continuous grid sampling for negative space opportunities
          for (let gx = 1; gx <= 3; gx++) {
            for (let gy = 1; gy <= 3; gy++) {
              sampledPositions.push({ x: gx * 0.25, y: gy * 0.25 });
            }
          }

          const evaluatedLogoCandidates: Array<{
            rect: FieldRect;
            ink: InkStateCandidate;
            score: number;
          }> = [];

          for (const targetH of scaleHypotheses) {
            const targetW = Number(Math.min(0.42, Math.max(0.08, targetH * aspectMultiplier)).toFixed(3));
            const h = Number(targetH.toFixed(3));

            for (const pos of sampledPositions) {
              const x = Number(Math.max(safeMargin, Math.min(1.0 - safeMargin - targetW, pos.x > 0.8 ? pos.x - targetW : pos.x > 0.3 ? pos.x - targetW / 2 : pos.x)).toFixed(3));
              const y = Number(Math.max(safeMargin, Math.min(1.0 - safeMargin - h, pos.y > 0.8 ? pos.y - h : pos.y > 0.3 ? pos.y - h / 2 : pos.y)).toFixed(3));
              const candRect: FieldRect = { x, y, width: targetW, height: h };

              // Check clearance against text bounding boxes
              let minTextClearance = 1.0;
              let hasCollision = false;
              for (const tr of textRects) {
                const overlapX = Math.min(candRect.x + candRect.width, tr.x + tr.width) - Math.max(candRect.x, tr.x);
                const overlapY = Math.min(candRect.y + candRect.height, tr.y + tr.height) - Math.max(candRect.y, tr.y);
                if (overlapX > -0.010 && overlapY > -0.010) {
                  hasCollision = true;
                  break;
                }
                const dx = Math.max(0, tr.x - (candRect.x + candRect.width), candRect.x - (tr.x + tr.width));
                const dy = Math.max(0, tr.y - (candRect.y + candRect.height), candRect.y - (tr.y + tr.height));
                minTextClearance = Math.min(minTextClearance, Math.hypot(dx, dy));
              }

              if (hasCollision) continue;

              // Continuous field evaluation on actual logo footprint
              const regEval = field.evaluateRegion(candRect);
              let subjOcc = regEval.subjectOcclusion || 0;
              if (field.subjectBox && field.subjectBox.width > 0 && field.subjectBox.height > 0) {
                const sb = field.subjectBox;
                const ox = Math.max(0, Math.min(candRect.x + candRect.width, sb.x + sb.width) - Math.max(candRect.x, sb.x));
                const oy = Math.max(0, Math.min(candRect.y + candRect.height, sb.y + sb.height) - Math.max(candRect.y, sb.y));
                if (ox > 0 && oy > 0) {
                  subjOcc = Math.max(subjOcc, (ox * oy) / Math.max(0.0001, candRect.width * candRect.height));
                }
              }

              if (subjOcc > 0.40) continue; // Skip severe subject occlusion

              const opticalMass = Math.sqrt(candRect.width * candRect.height);
              const scaleLegibility = Math.min(1.0, opticalMass / 0.085);
              const detailEnergy = regEval.detailEnergy || 0;
              const quietScore = Math.max(0, 1.0 - detailEnergy);
              const clearanceScore = Math.min(1.0, minTextClearance / 0.10);
              const subjectScore = Math.max(0, 1.0 - subjOcc * 2.0);

              // Discover ink candidates on actual logo footprint
              const inkCandidates = discoverInkCandidates({
                role: 'logo',
                footprint: candRect,
                field,
                canvas,
                brand,
              });

              // Evaluate up to top 2 ink candidates (direct & adaptive contrast variants)
              const topInks = inkCandidates.slice(0, 2);
              for (const logoInk of topInks) {
                const wcag = logoInk.contrast.wcagRatio || 1;
                const apca = Math.abs(logoInk.contrast.apcaEstimatedLc || 0);
                const contrastScore = Math.min(1.0, wcag / 4.5);
                const apcaScore = Math.min(1.0, apca / 75);
                const texturePenalty = detailEnergy * Math.max(0, 1.0 - contrastScore);

                let physicalLegibility = Math.max(0, (contrastScore * 0.50 + apcaScore * 0.20 + scaleLegibility * 0.30) - texturePenalty * 0.30);

                if (hasLogoDefect) {
                  if (wcag < 3.0) {
                    physicalLegibility *= Math.max(0.1, wcag / 3.0);
                  }
                  if (targetH < 0.060) {
                    physicalLegibility *= Math.max(0.1, targetH / 0.060);
                  }
                }

                const candScore = physicalLegibility * 0.40 + clearanceScore * 0.25 + subjectScore * 0.20 + quietScore * 0.15;
                evaluatedLogoCandidates.push({
                  rect: candRect,
                  ink: logoInk,
                  score: candScore,
                });
              }
            }
          }

          // Fallback if no candidate cleared subject/text constraints: pick best available corner
          if (evaluatedLogoCandidates.length === 0) {
            const fallbackH = hasLogoDefect ? 0.070 : 0.055;
            const fallbackW = Number(Math.min(0.35, Math.max(0.08, fallbackH * aspectMultiplier)).toFixed(3));
            const topY = textRects.length > 0 ? Math.min(...textRects.map(r => r.y)) : 0.05;
            const fallbackY = topY > 0.4 ? safeMargin : 1.0 - safeMargin - fallbackH;
            const fallbackX = 1.0 - safeMargin - fallbackW;
            const fallbackRect: FieldRect = { x: fallbackX, y: fallbackY, width: fallbackW, height: fallbackH };
            const fallbackInk = discoverInkCandidates({ role: 'logo', footprint: fallbackRect, field, canvas, brand })[0];
            evaluatedLogoCandidates.push({ rect: fallbackRect, ink: fallbackInk, score: 0.5 });
          }

          // Retain top diverse logo hypotheses (bounded retention with spatial diversity)
          evaluatedLogoCandidates.sort((a, b) => b.score - a.score);
          const topLogos: typeof evaluatedLogoCandidates = [];
          for (const cand of evaluatedLogoCandidates) {
            const isNearExisting = topLogos.some((tl) =>
              Math.hypot(tl.rect.x - cand.rect.x, tl.rect.y - cand.rect.y) < 0.06 &&
              tl.ink.color.hex === cand.ink.color.hex
            );
            if (!isNearExisting) {
              topLogos.push(cand);
            }
            if (topLogos.length >= 2) break;
          }

          for (const tl of topLogos) {
            const logoTypeState: LineStructureState = {
              hypothesis: { lines: ['Logo'], maxCharsPerLine: 4, naturalBreaksPreserved: true, punctuationOrphansAvoided: true, balanceScore: 1.0, tokenCount: 1, lineCount: 1, structuralScore: 1.0, ragVariance: 0, syntacticPenalty: 0, hasWidowOrOrphan: false } as any,
              family: 'Inter',
              weight: 400,
              style: 'normal',
              fontSizePx: Math.round(canvas.shortEdge * 0.045),
              fontScale: 0.045,
              lineHeightPx: Math.round(canvas.shortEdge * 0.045),
              lineHeightMultiplier: 1.0,
              letterSpacing: 0,
              measuredMetrics: { lineWidths: [Math.round(tl.rect.width * canvas.width)], maxLineWidth: Math.round(tl.rect.width * canvas.width), totalHeight: Math.round(tl.rect.height * canvas.height), lineHeight: Math.round(canvas.shortEdge * 0.045), ascent: Math.round(canvas.shortEdge * 0.035), descent: Math.round(canvas.shortEdge * 0.010) },
              boundingBox: { widthPx: Math.round(tl.rect.width * canvas.width), heightPx: Math.round(tl.rect.height * canvas.height), widthNormalized: tl.rect.width, heightNormalized: tl.rect.height },
              slack: { horizontalSlackPx: 0, verticalSlackPx: 0, widthFillRatio: 1.0, heightFillRatio: 1.0 },
              scores: { scaleImpactScore: 0.5, spatialUtilizationScore: 0.8, linguisticScore: 1.0, ragVariance: 0, syntacticPenalty: 0, hasWidowOrOrphan: false, compositeScore: 0.8 },
              reasons: ['Brand logo node'],
            };

            logoCandidateStates.push({
              id: effectiveLogoItem.id,
              role: 'logo',
              typographyState: logoTypeState,
              rect: tl.rect,
              ink: tl.ink,
              surface: {
                id: 'surface-none',
                scores: { aggregateSurfaceScore: 0.9, legibilityBoostScore: 0, imageIntegrityScore: 1.0, brandAlignmentScore: 1.0, necessityScore: 0 } as any,
                signals: { contrastGain: 0, visualDisruption: 0, imagePreservation: 1.0, surfaceComplexity: 0, postSurfaceWcag: tl.ink.contrast.wcagRatio, postSurfaceApca: tl.ink.contrast.apcaEstimatedLc } as any,
              } as any,
            });
          }
        }

        // Form combinatorial variations of Color × Surface × Logo
        for (const primaryInk of elementColors[0].inkCandidates) {
          const totalBounds = {
            x: Math.min(...elementColors.map((e) => e.rect.x)),
            y: Math.min(...elementColors.map((e) => e.rect.y)),
            width: Math.max(...elementColors.map((e) => e.rect.x + e.rect.width)) - Math.min(...elementColors.map((e) => e.rect.x)),
            height: Math.max(...elementColors.map((e) => e.rect.y + e.rect.height)) - Math.min(...elementColors.map((e) => e.rect.y)),
          };

          // STEP 6: Discover Phase 9A Surface Candidates for Footprint
          const surfaceCandidates = discoverSurfaceCandidates({
            targetElementIds: elementColors.map((e) => e.item.id),
            footprint: totalBounds,
            ink: primaryInk,
            field,
            canvas,
            brand,
            maxCandidates: config.maxSurfacesPerState,
          });

          const logoVariations = logoCandidateStates.length > 0 ? logoCandidateStates : [undefined];

          for (const surfaceCand of surfaceCandidates) {
            for (const logoEl of logoVariations) {
              totalHypothesesFormed++;
              if (candidateStates.length >= config.maxEvaluatedStates) break;

              const resolvedElements: CompositionElementState[] = elementColors.map((ec, idx) => ({
                id: ec.item.id,
                role: ec.item.role,
                typographyState: ec.lineState,
                rect: ec.rect,
                alignmentAxisId: ec.axisId,
                ink: idx === 0 ? primaryInk : ec.inkCandidates[0],
                surface: surfaceCand,
              }));

              if (logoEl) {
                resolvedElements.push(logoEl);
              }

              const evaluation = evaluateCompositionState({
                canvas,
                elements: resolvedElements,
                field,
                brand,
                concept: input.concept,
                realizationContext: input.realizationContext,
                weights: evaluationWeights,
                recoveryContext: input.recoveryContext,
              });

              const activeSurfaces: SurfaceField[] = surfaceCand.surfaceField ? [surfaceCand.surfaceField] : [];

              candidateStates.push({
                id: `composition-state-${candidateStates.length + 1}`,
                canvas,
                elements: resolvedElements,
                surfaces: activeSurfaces,
                signals: evaluation.signals,
                interactionSignals: evaluation.interactionSignals,
                tradeoffProfile: evaluation.tradeoffProfile,
                evaluation: {
                  aggregateScore: evaluation.aggregateScore,
                  reasons: evaluation.reasons,
                },
              });
            }
          }
        }
      }
    }
  }

  // STEP 7: Sort by Holistic Aggregate Score & Preserve Tradeoff Diversity
  const sorted = candidateStates.sort((a, b) => b.evaluation.aggregateScore - a.evaluation.aggregateScore);
  const bestState = sorted[0];

  // Retain diverse alternatives (differing in legibility, image integrity, or surface presence)
  const retainedAlternatives: OptimizedCompositionState[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const cand = sorted[i];
    const hasDifferentSurface = (cand.surfaces.length > 0) !== (bestState.surfaces.length > 0);
    const hasDifferentTradeoff =
      Math.abs(cand.tradeoffProfile.imageIntegrityScore - bestState.tradeoffProfile.imageIntegrityScore) > 0.05 ||
      Math.abs(cand.tradeoffProfile.legibilityScore - bestState.tradeoffProfile.legibilityScore) > 0.05;

    if (hasDifferentSurface || hasDifferentTradeoff) {
      retainedAlternatives.push(cand);
    }
    if (retainedAlternatives.length >= 3) break;
  }

  const explorationLatencyMs = Date.now() - startTime;

  return {
    bestState,
    retainedAlternatives,
    metrics: {
      totalHypothesesFormed,
      totalStatesEvaluated: candidateStates.length,
      statesRetained: 1 + retainedAlternatives.length,
      diversitySpread: retainedAlternatives.length,
      explorationLatencyMs,
    },
  };
}


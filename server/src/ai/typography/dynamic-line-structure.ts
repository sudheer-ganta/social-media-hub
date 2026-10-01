/**
 * FLOWPOST DYNAMIC LINE STRUCTURE ENGINE — PHASE 4
 *
 * Connects linguistic line partitioning, actual TrueType font metrics, font sizing,
 * and spatial capacity so they participate in the same dynamic composition decision.
 *
 * Architecture Principles:
 *   1. ACTUAL FONT METRIC SOURCE OF TRUTH:
 *      - All line width, block height, and bounding box calculations use exact
 *        OpenType glyph advances, ascenders, descenders, and lineGap from server/assets/fonts/.
 *      - Zero character-width multipliers (0.38, 0.45, 0.52, 0.56) in production decisions.
 *      - Zero repeated 0.92x geometric shrinking loops.
 *
 *   2. LINE STRUCTURE AS A COMPOSITION VARIABLE:
 *      - Explores viable (hypothesis, font size, tracking, line height, physical footprint) states.
 *      - Produces viable candidate states for the composition engine, NOT final truth.
 *      - Does not force a fixed line count or preset layout archetype (no ONE_LINE, TWO_LINE, BANNER enums).
 *
 *   3. OBSERVABLE SIGNALS & CONFIGURABLE SCORING:
 *      - All geometric and linguistic sub-scores are explicitly exposed on each candidate.
 *      - Scoring weights are configurable and calibratable by downstream composition.
 *      - Multiple structurally diverse candidate states are preserved (e.g. 1-line, 2-line, 3-line options).
 *
 *   4. SPATIAL CAPACITY AFFORDANCE:
 *      - Region bounds come from the Dynamic Design Field (observable quiet regions).
 *      - Line structures adapt to whatever width/height space is available.
 */

import {
  fontFilePath,
  getFontDefinition,
  nearestAvailableWeight,
  type FontDefinition,
} from './font-catalog';
import {
  measureMultiLineBlock,
  getFontMetrics,
  calculateTypographicMassProxy,
  type MeasuredBlockMetrics,
  type TypographicMassMetrics,
} from './font-metrics.service';
import {
  createDynamicCopyModel,
  generateLineBreakHypotheses,
  type DynamicCopyVisualObject,
  type LineBreakHypothesis,
} from '../render/copy-model';
import type { CanvasRepresentation } from '../render/design-representation';
import type { FieldRect } from '../render/image-field';

// ─── Observable Scoring Breakdown & Weights ──────────────────────────────────

export interface LineStructureScores {
  scaleImpactScore: number;         // 0..1 font size achieved relative to max bound
  spatialUtilizationScore: number;  // 0..1 how effectively it fills the spatial box
  linguisticScore: number;          // 0..1 overall structural score from syntax & rag
  ragVariance: number;              // 0..1 rag imbalance signal
  syntacticPenalty: number;         // penalty from awkward token splits
  hasWidowOrOrphan: boolean;        // widow/orphan soft signal
  compositeScore: number;           // 0..1 configurable composite ranking
}

export interface LineStructureScoringWeights {
  scaleImpactWeight: number;
  spatialUtilizationWeight: number;
  linguisticWeight: number;
}

export const DEFAULT_LINE_STRUCTURE_WEIGHTS: LineStructureScoringWeights = {
  scaleImpactWeight: 0.40,
  spatialUtilizationWeight: 0.30,
  linguisticWeight: 0.30,
};

// ─── Line Structure Candidate State ──────────────────────────────────────────

export interface LineStructureState {
  hypothesis: LineBreakHypothesis;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  fontSizePx: number;
  fontScale: number; // multiplier of canvas short edge
  lineHeightPx: number;
  lineHeightMultiplier: number;
  letterSpacing: number;
  measuredMetrics: MeasuredBlockMetrics;
  typographicMass?: TypographicMassMetrics;
  boundingBox: {
    widthPx: number;
    heightPx: number;
    widthNormalized: number;
    heightNormalized: number;
  };
  slack: {
    horizontalSlackPx: number;
    verticalSlackPx: number;
    widthFillRatio: number;
    heightFillRatio: number;
  };
  scores: LineStructureScores;
  reasons: string[];
}

export interface LineStructureExplorationOptions {
  copy: DynamicCopyVisualObject | string;
  font: FontDefinition | string;
  weight?: number;
  style?: 'normal' | 'italic';
  spatialBox: FieldRect | { widthPx: number; heightPx: number };
  canvas: CanvasRepresentation;
  /** Custom scoring weights for composition engine calibration */
  customWeights?: Partial<LineStructureScoringWeights>;
  /** Optical scale limits (fraction of canvas short edge) */
  opticalLimits?: {
    minFontScale?: number;
    maxFontScale?: number;
    targetScale?: number;
  };
  /** Optical tracking override */
  trackingOverride?: number;
  /** Maximum candidate states to return */
  maxCandidates?: number;
  /** Include sub-optimal hypotheses to give composition engine full search space */
  includeAllViable?: boolean;
}

// ─── Continuous Tracking Candidate Domain & Scoring ──────────────────────────

export interface TrackingCandidateContext {
  fontScale: number;
  isAllUppercase: boolean;
  fontWidth?: 'condensed' | 'normal' | 'expanded';
  trackingOverride?: number;
}

export interface EvaluatedTrackingCandidate {
  tracking: number;
  measuredMetrics: MeasuredBlockMetrics;
  fitsWidth: boolean;
  fitsHeight: boolean;
  opticalScore: number;
  compositeScore: number;
}

/**
 * Generates continuous, metric-informed optical tracking candidates
 * spanning tight, neutral, and open apertures without discrete threshold jumps.
 */
export function generateTrackingCandidates(ctx: TrackingCandidateContext): number[] {
  if (ctx.trackingOverride !== undefined) {
    return [ctx.trackingOverride];
  }

  // Continuous optical tracking baseline curve (smooth linear interpolation with scale):
  // At large display scale (>= 0.100): ~ -0.016 em
  // At neutral body scale (~ 0.045): ~ -0.002 em
  // At caption/micro scale (<= 0.012): ~ +0.014 em
  const scaleNorm = Math.max(0, Math.min(1, (ctx.fontScale - 0.012) / (0.100 - 0.012)));
  const baseOpticalTracking = 0.014 - scaleNorm * 0.030;

  // Continuous modifiers for lettercase and font width
  const caseModifier = ctx.isAllUppercase ? 0.010 : 0.0;
  const widthModifier = ctx.fontWidth === 'condensed' ? -0.004 : ctx.fontWidth === 'expanded' ? 0.006 : 0.0;

  const centerTracking = baseOpticalTracking + caseModifier + widthModifier;

  // Generate bounded candidate spread around center tracking
  const candidateDeltas = [-0.008, -0.004, 0.000, +0.004, +0.008];
  const candidates = candidateDeltas.map(d => {
    const raw = centerTracking + d;
    // Physical optical safety bounds: [-0.030, +0.035]
    const clamped = Math.max(-0.030, Math.min(0.035, raw));
    return Number(clamped.toFixed(4));
  });

  return Array.from(new Set(candidates));
}

/**
 * Evaluates a set of tracking candidates for a specific font size, hypothesis, and spatial box.
 */
export function evaluateTrackingCandidates(options: {
  fontFile: string;
  lines: string[];
  fontSize: number;
  lineHeightMultiplier: number;
  fontScale: number;
  isAllUppercase: boolean;
  fontWidth?: 'condensed' | 'normal' | 'expanded';
  availWidthPx: number;
  availHeightPx: number;
  ragVariance?: number;
  trackingOverride?: number;
}): EvaluatedTrackingCandidate[] {
  const {
    fontFile,
    lines,
    fontSize,
    lineHeightMultiplier,
    fontScale,
    isAllUppercase,
    fontWidth,
    availWidthPx,
    availHeightPx,
    ragVariance = 0,
    trackingOverride,
  } = options;

  const candidates = generateTrackingCandidates({
    fontScale,
    isAllUppercase,
    fontWidth,
    trackingOverride,
  });

  const scaleNorm = Math.max(0, Math.min(1, (fontScale - 0.012) / (0.100 - 0.012)));
  const centerTracking = 0.014 - scaleNorm * 0.030 +
    (isAllUppercase ? 0.010 : 0.0) +
    (fontWidth === 'condensed' ? -0.004 : fontWidth === 'expanded' ? 0.006 : 0.0);

  return candidates.map((t) => {
    const measured = measureMultiLineBlock({
      fontFile,
      lines,
      fontSize,
      lineHeightMultiplier,
      letterSpacing: t,
    });

    const fitsWidth = measured.maxLineWidth <= availWidthPx;
    const fitsHeight = measured.totalHeight <= availHeightPx;

    const opticalDeviation = Math.abs(t - centerTracking);
    const opticalScore = Math.max(0, 1.0 - opticalDeviation / 0.025);

    const widthFill = measured.maxLineWidth / Math.max(1, availWidthPx);
    const widthScore = Math.max(0, 1.0 - Math.abs(widthFill - 0.85) * 0.5);
    const ragScore = Math.max(0, 1.0 - Math.min(1.0, ragVariance));

    const compositeScore = Number(
      (opticalScore * 0.60 + widthScore * 0.25 + ragScore * 0.15).toFixed(3)
    );

    return {
      tracking: t,
      measuredMetrics: measured,
      fitsWidth,
      fitsHeight,
      opticalScore: Number(opticalScore.toFixed(3)),
      compositeScore,
    };
  });
}

// ─── Authoritative Line Structure Discovery ─────────────────────────────────

/**
 * Discovers and measures all viable line structure states for a copy element
 * within a spatial capacity box using exact OpenType font metrics and candidate-based
 * geometric discovery (size, measure, lines, leading, tracking).
 */
export function exploreLineStructures(
  options: LineStructureExplorationOptions
): LineStructureState[] {
  const {
    copy: rawCopy,
    font: rawFont,
    weight: requestedWeight = 400,
    style = 'normal',
    spatialBox: rawBox,
    canvas,
    customWeights,
    opticalLimits,
    trackingOverride,
    maxCandidates = 8,
    includeAllViable = false,
  } = options;

  const weights: LineStructureScoringWeights = {
    ...DEFAULT_LINE_STRUCTURE_WEIGHTS,
    ...customWeights,
  };

  const shortEdge = canvas.shortEdge;

  // 1. Resolve Copy Object & Hypotheses
  const copyObj: DynamicCopyVisualObject =
    typeof rawCopy === 'string'
      ? createDynamicCopyModel('copy-dyn', rawCopy, 'primary-hook', 1)
      : rawCopy;

  const hypotheses = copyObj.hypotheses.length > 0
    ? copyObj.hypotheses
    : generateLineBreakHypotheses(copyObj.tokens, 4);

  // 2. Resolve Font Family, Definition, and Exact Physical Metrics on Disk
  const family = typeof rawFont === 'string' ? rawFont : rawFont.family;
  const weight = nearestAvailableWeight(family, requestedWeight);
  const fontDef = typeof rawFont === 'object' ? rawFont : getFontDefinition(family);
  const filePath = fontFilePath(family, weight, style);
  const fontMetrics = getFontMetrics(filePath);

  // TrueType baseline intrinsic vertical metric ratio
  const baselineIntrinsicLeading = (fontMetrics.ascender - fontMetrics.descender + fontMetrics.lineGap) / fontMetrics.unitsPerEm;

  // 3. Resolve Spatial Box Dimensions in Physical Pixels
  const availWidthPx = 'widthPx' in rawBox
    ? rawBox.widthPx
    : rawBox.width * canvas.width;
  const availHeightPx = 'heightPx' in rawBox
    ? rawBox.heightPx
    : rawBox.height * canvas.height;

  // Continuous Optical Scale Bounds (Responsive to Semantic Role and Headroom)
  const isPrimary = copyObj.semanticRole === 'primary-hook';
  const isSecondary = copyObj.semanticRole === 'secondary-hook';
  const minScale = opticalLimits?.minFontScale ?? (isPrimary ? 0.035 : isSecondary ? 0.016 : 0.012);
  const maxScale = opticalLimits?.maxFontScale ?? (isPrimary ? 0.098 : isSecondary ? 0.055 : 0.045);

  const minFontSizePx = Math.max(12, Math.round(shortEdge * minScale));
  const maxFontSizePx = Math.max(minFontSizePx, Math.round(shortEdge * maxScale));

  const candidateStates: LineStructureState[] = [];

  // 4. Candidate Generation for Leading Treatments
  const candidateLeadingMultipliers: number[] = [];
  if (isPrimary) {
    candidateLeadingMultipliers.push(
      Number(Math.max(0.96, Math.min(1.22, baselineIntrinsicLeading * 0.95)).toFixed(3)),
      Number(Math.max(1.02, Math.min(1.28, baselineIntrinsicLeading * 1.05)).toFixed(3))
    );
  } else {
    candidateLeadingMultipliers.push(
      Number(Math.max(1.10, Math.min(1.40, baselineIntrinsicLeading * 1.08)).toFixed(3)),
      Number(Math.max(1.18, Math.min(1.50, baselineIntrinsicLeading * 1.20)).toFixed(3))
    );
  }

  // Deduplicate leading multipliers
  const uniqueLeadingMultipliers = Array.from(new Set(candidateLeadingMultipliers));

  // 5. Evaluate Each Line Break Hypothesis across Candidate Leading & Tracking
  for (const hyp of hypotheses) {
    for (const testLineHeightMul of uniqueLeadingMultipliers) {
      // Dynamic binary search for the maximal font size that fits into the spatial box
      let low = minFontSizePx;
      let high = maxFontSizePx;
      let bestFittingSize = 0;
      let bestFittingMetrics: MeasuredBlockMetrics | null = null;
      let bestFittingTracking = 0;

      while (low <= high) {
        const testSize = Math.floor((low + high) / 2);
        const testScale = testSize / shortEdge;

        // Evaluate all tracking candidates for this test size and hypothesis
        const evaluatedTracking = evaluateTrackingCandidates({
          fontFile: filePath,
          lines: hyp.lines,
          fontSize: testSize,
          lineHeightMultiplier: testLineHeightMul,
          fontScale: testScale,
          isAllUppercase: copyObj.isAllUppercase,
          fontWidth: fontDef?.width,
          availWidthPx,
          availHeightPx,
          ragVariance: hyp.ragVariance,
          trackingOverride,
        });

        // Filter to candidates that physically fit in the spatial box
        const fittingCandidates = evaluatedTracking.filter(c => c.fitsWidth && c.fitsHeight);

        if (fittingCandidates.length > 0) {
          // Sort fitting tracking candidates by composite score (optical aperture + width + rag)
          fittingCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
          const winningCandidate = fittingCandidates[0];

          bestFittingSize = testSize;
          bestFittingMetrics = winningCandidate.measuredMetrics;
          bestFittingTracking = winningCandidate.tracking;
          low = testSize + 1; // Try larger font size
        } else {
          high = testSize - 1; // Too big, reduce
        }
      }

      // If hypothesis cannot fit even at minimum size, evaluate at min size if includeAllViable is set
      if (!bestFittingMetrics) {
        if (!includeAllViable) continue;
        const testScale = minFontSizePx / shortEdge;
        const evaluatedTracking = evaluateTrackingCandidates({
          fontFile: filePath,
          lines: hyp.lines,
          fontSize: minFontSizePx,
          lineHeightMultiplier: testLineHeightMul,
          fontScale: testScale,
          isAllUppercase: copyObj.isAllUppercase,
          fontWidth: fontDef?.width,
          availWidthPx,
          availHeightPx,
          ragVariance: hyp.ragVariance,
          trackingOverride,
        });

        evaluatedTracking.sort((a, b) => b.compositeScore - a.compositeScore);
        const fallbackCandidate = evaluatedTracking[0];

        bestFittingSize = minFontSizePx;
        bestFittingTracking = fallbackCandidate.tracking;
        bestFittingMetrics = fallbackCandidate.measuredMetrics;
      }

      const fontScale = bestFittingSize / shortEdge;
      const widthFill = bestFittingMetrics.maxLineWidth / Math.max(1, availWidthPx);
      const heightFill = bestFittingMetrics.totalHeight / Math.max(1, availHeightPx);
      const hSlack = Math.max(0, availWidthPx - bestFittingMetrics.maxLineWidth);
      const vSlack = Math.max(0, availHeightPx - bestFittingMetrics.totalHeight);

      // Multi-Criteria Scoring (All sub-signals observable and configurable)
      const scaleImpactScore = bestFittingSize / maxFontSizePx;
      const spatialUtilizationScore = Math.min(1.0, (widthFill * 0.55 + heightFill * 0.45) * 1.1);
      const linguisticScore = hyp.structuralScore;

      const totalWeight = weights.scaleImpactWeight + weights.spatialUtilizationWeight + weights.linguisticWeight;
      const normScaleWeight = weights.scaleImpactWeight / totalWeight;
      const normSpatialWeight = weights.spatialUtilizationWeight / totalWeight;
      const normLingWeight = weights.linguisticWeight / totalWeight;

      const compositeScore = Number(
        (scaleImpactScore * normScaleWeight + spatialUtilizationScore * normSpatialWeight + linguisticScore * normLingWeight).toFixed(3)
      );

      // Calculate Authoritative Typographic Mass Proxy (excluding contrast)
      const massProxy = calculateTypographicMassProxy({
        fontFile: filePath,
        lines: hyp.lines,
        fontSize: bestFittingSize,
        weight,
        style,
      });

      const reasons: string[] = [
        `${hyp.lineCount}-line layout at ${bestFittingSize}px (${(fontScale * 100).toFixed(1)}% canvas scale)`,
        `Max line width: ${bestFittingMetrics.maxLineWidth}px / ${Math.round(availWidthPx)}px (${Math.round(widthFill * 100)}% width fill)`,
        `Total block height: ${bestFittingMetrics.totalHeight}px / ${Math.round(availHeightPx)}px (${Math.round(heightFill * 100)}% height fill)`,
        `Typographic mass proxy: ${massProxy.massProxy} (advance=${massProxy.totalAdvancePx}px, height=${massProxy.opticalHeightPx}px)`,
      ];

      if (hyp.hasWidowOrOrphan) {
        reasons.push('Contains widow/orphan line (soft signal recorded)');
      }
      if (hyp.ragVariance > 0.3) {
        reasons.push(`Rag variance: ${(hyp.ragVariance * 100).toFixed(0)}%`);
      }

      candidateStates.push({
        hypothesis: hyp,
        family,
        weight,
        style,
        fontSizePx: bestFittingSize,
        fontScale: Number(fontScale.toFixed(4)),
        lineHeightPx: bestFittingMetrics.lineHeight,
        lineHeightMultiplier: testLineHeightMul,
        letterSpacing: Number(bestFittingTracking.toFixed(4)),
        measuredMetrics: bestFittingMetrics,
        typographicMass: massProxy,
        boundingBox: {
          widthPx: bestFittingMetrics.maxLineWidth,
          heightPx: bestFittingMetrics.totalHeight,
          widthNormalized: Number((bestFittingMetrics.maxLineWidth / canvas.width).toFixed(4)),
          heightNormalized: Number((bestFittingMetrics.totalHeight / canvas.height).toFixed(4)),
        },
        slack: {
          horizontalSlackPx: Math.round(hSlack),
          verticalSlackPx: Math.round(vSlack),
          widthFillRatio: Number(widthFill.toFixed(3)),
          heightFillRatio: Number(heightFill.toFixed(3)),
        },
        scores: {
          scaleImpactScore: Number(scaleImpactScore.toFixed(3)),
          spatialUtilizationScore: Number(spatialUtilizationScore.toFixed(3)),
          linguisticScore: Number(linguisticScore.toFixed(3)),
          ragVariance: Number(hyp.ragVariance.toFixed(3)),
          syntacticPenalty: hyp.syntacticPenalty,
          hasWidowOrOrphan: hyp.hasWidowOrOrphan,
          compositeScore,
        },
        reasons,
      });
    }
  }

  // Preserve candidates across distinct line counts (e.g. top 1-line, top 2-line, top 3-line)
  // plus overall highest scoring states to ensure diversity for downstream composition
  candidateStates.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);

  const preserved: LineStructureState[] = [];
  const seenLineCounts = new Set<number>();

  // First pass: preserve best candidate of each distinct line count
  for (const state of candidateStates) {
    if (!seenLineCounts.has(state.hypothesis.lineCount)) {
      seenLineCounts.add(state.hypothesis.lineCount);
      preserved.push(state);
    }
  }

  // Second pass: fill remaining slots up to maxCandidates with next best candidates
  for (const state of candidateStates) {
    if (!preserved.includes(state) && preserved.length < maxCandidates) {
      preserved.push(state);
    }
  }

  return preserved.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
}


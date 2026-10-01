/**
 * FLOWPOST DYNAMIC TYPOGRAPHY ENGINE — PHASE 3
 *
 * Connects Brand DNA, Copy Semantics, Image Spatial Capacity, and Font Metrics
 * so that typography is an active participant in composition discovery.
 *
 * Architecture Principles:
 *   1. MATHEMATICAL / TECHNICAL CONSTRAINTS:
 *      - Actual physical .ttf font file existence on disk
 *      - Required script/glyph language support
 *      - Geometric boundary constraints within canvas and candidate regions
 *
 *   2. BRAND CONSTRAINTS:
 *      - Approved fonts defined in Brand Typography DNA
 *      - Brand personality and tone alignment
 *
 *   3. OBSERVABLE IMAGE & COPY SIGNALS:
 *      - Region detail energy and background texture
 *      - Linguistic token length, longest word length, and semantic hierarchy roles
 *      - Spatial aspect ratio of available quiet regions
 *
 *   4. CANDIDATE STATE GENERATION (NOT FINAL TRUTH):
 *      - Dynamic typography produces viable candidate states (pairings, scales, metrics)
 *      - The composition engine evaluates candidates against the full design field
 *      - Scoring weights are explicit, observable, and configurable
 *
 *   5. AUTHORITATIVE PHYSICAL MEASUREMENT:
 *      - All sizing, bounding box, and line geometry decisions are backed by
 *        real OpenType glyph metrics from server/assets/fonts/
 */

import {
  FONT_CATALOG,
  nearestAvailableWeight,
  type FontDefinition,
  type ScriptTag,
} from './font-catalog';
import {
  measureMultiLineBlock,
  type MeasuredBlockMetrics,
} from './font-metrics.service';
import type { DynamicCopyVisualObject, LineBreakHypothesis } from '../render/copy-model';
import type {
  BrandDesignRepresentation,
  CanvasRepresentation,
  CopySemanticRole,
  DesignField,
} from '../render/design-representation';
import type { FieldRect } from '../render/image-field';

// ─── Observable Candidate Scoring Breakdown ───────────────────────────────────

export interface TypographyScoreBreakdown {
  brandApproved: number;
  personalityMatch: number;
  spatialFit: number;
  textureAdaptation: number;
  wordFit: number;
  roleFit: number;
  pairingHarmony: number;
  classificationContrast: number;
}

export interface TypographyCandidate {
  headlineFont: FontDefinition;
  bodyFont: FontDefinition;
  accentFont?: FontDefinition;
  headlineWeight: number;
  bodyWeight: number;
  accentWeight?: number;
  fitScore: number;
  scoreBreakdown: TypographyScoreBreakdown;
  reasons: string[];
}

// ─── Modular Scale Configuration ─────────────────────────────────────────────

export type ScaleContrastPreset = 'subtle' | 'moderate' | 'high' | 'dramatic';

export const MODULAR_SCALE_PRESETS: Record<ScaleContrastPreset, number> = {
  subtle: 1.20,     // Minor third (gentle hierarchy)
  moderate: 1.25,   // Major third (balanced standard)
  high: 1.414,      // Augmented fourth (strong editorial punch)
  dramatic: 1.618,  // Golden ratio (high drama / poster hero)
};

export type ScaleContrastIntensity = ScaleContrastPreset | number;

export function resolveModularRatio(intensity: ScaleContrastIntensity): number {
  if (typeof intensity === 'number' && Number.isFinite(intensity) && intensity > 1.0) {
    return intensity;
  }
  return MODULAR_SCALE_PRESETS[intensity as ScaleContrastPreset] ?? 1.25;
}

// ─── Dynamic Type Step & Typography System ───────────────────────────────────

export interface DynamicTypeStep {
  copyId: string;
  role: CopySemanticRole;
  family: string;
  weight: number;
  fontSizePx: number;
  fontScale: number; // multiplier of canvas short edge
  lineHeight: number;
  letterSpacing: number;
  caseTransform: 'none' | 'upper' | 'title' | 'sentence';
  selectedHypothesis: LineBreakHypothesis;
  measuredMetrics: MeasuredBlockMetrics;
  estimatedBoundingBox: {
    widthPx: number;
    heightPx: number;
    widthNormalized: number;
    heightNormalized: number;
  };
}

export interface DynamicTypographySystem {
  candidate: TypographyCandidate;
  steps: Record<string, DynamicTypeStep>;
  modularRatio: number;
  baseSizePx: number;
  hierarchyClarityScore: number;
  spatialFitScore: number;
  reasons: string[];
}

// ─── Configurable Candidate Evaluator Options ────────────────────────────────

export interface TypographyScoringWeights {
  brandApprovedWeight: number;
  personalityMatchWeight: number;
  spatialColumnWeight: number;
  spatialBannerWeight: number;
  textureBoldBoost: number;
  textureLightPenalty: number;
  longWordCondensedBoost: number;
  roleAppropriatenessWeight: number;
  partnerPairingBonus: number;
  contrastCategoryBonus: number;
}

export const DEFAULT_TYPOGRAPHY_SCORING_WEIGHTS: TypographyScoringWeights = {
  brandApprovedWeight: 40,
  personalityMatchWeight: 8,
  spatialColumnWeight: 18,
  spatialBannerWeight: 10,
  textureBoldBoost: 12,
  textureLightPenalty: -15,
  longWordCondensedBoost: 10,
  roleAppropriatenessWeight: 15,
  partnerPairingBonus: 25,
  contrastCategoryBonus: 15,
};

export interface FontEvaluationInput {
  brand: BrandDesignRepresentation;
  copy: DynamicCopyVisualObject[];
  spatialBox?: FieldRect; // available candidate quiet region
  canvas: CanvasRepresentation;
  field?: DesignField;
  requiredScripts?: ScriptTag[];
  customWeights?: Partial<TypographyScoringWeights>;
  maxCandidates?: number;
}

export interface FontFitEvaluation {
  font: FontDefinition;
  recommendedWeight: number;
  fitScore: number;
  scoreBreakdown: TypographyScoreBreakdown;
  reasons: string[];
}

/**
 * Evaluates a single font candidate continuously against Brand DNA, Copy Semantics,
 * Spatial Geometry, and the physical DesignField from the actual generated image.
 */
export function evaluateFontFit(params: {
  font: FontDefinition;
  role: CopySemanticRole;
  copy: DynamicCopyVisualObject;
  spatialBox?: FieldRect;
  canvas: CanvasRepresentation;
  field?: DesignField;
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<TypographyScoringWeights>;
  requiredScripts?: ScriptTag[];
}): FontFitEvaluation {
  const {
    font,
    role,
    copy,
    spatialBox,
    canvas,
    field,
    brand,
    customWeights,
    requiredScripts = ['latin'],
  } = params;

  const weights: TypographyScoringWeights = {
    ...DEFAULT_TYPOGRAPHY_SCORING_WEIGHTS,
    ...customWeights,
  };

  const reasons: string[] = [];
  const breakdown: TypographyScoreBreakdown = {
    brandApproved: 0,
    personalityMatch: 0,
    spatialFit: 0,
    textureAdaptation: 0,
    wordFit: 0,
    roleFit: 0,
    pairingHarmony: 0,
    classificationContrast: 0,
  };

  // 1. Physical Script Support (Hard Invariant)
  const supportsRequiredScripts = requiredScripts.every((s) => font.languageSupport.includes(s));
  if (!supportsRequiredScripts) {
    return {
      font,
      recommendedWeight: font.weights[0] || 400,
      fitScore: -Infinity,
      scoreBreakdown: breakdown,
      reasons: ['Missing required script glyph support'],
    };
  }

  // 2. Readability & Semantic Role Compatibility
  const isHeadline = role === 'primary-hook';
  const isSecondary = role === 'secondary-hook' || role === 'offer-badge';
  const isCta = role === 'cta';
  const isSupporting = role === 'supporting-note' || role === 'disclaimer' || role === 'eyebrow';

  const needsReadableBody = isSecondary || isCta || isSupporting;
  if (needsReadableBody && (font.readability === 'display-only' || (font.category === 'handwritten' && role !== 'eyebrow'))) {
    return {
      font,
      recommendedWeight: font.weights[0] || 400,
      fitScore: -Infinity,
      scoreBreakdown: breakdown,
      reasons: ['Display-only or handwritten font unsuited for readable secondary/body role'],
    };
  }

  let score = 50;

  // 3. Brand Approved Priority
  const isBrandHeadline = brand?.approvedFonts?.headline?.includes(font.family);
  const isBrandBody = brand?.approvedFonts?.body?.includes(font.family);
  if ((isHeadline && isBrandHeadline) || (!isHeadline && isBrandBody)) {
    breakdown.brandApproved = weights.brandApprovedWeight;
    score += breakdown.brandApproved;
    reasons.push('Explicitly approved in Brand Typography DNA');
  }

  // 4. Brand Tone / Personality Alignment (Continuous Match)
  if (brand?.brandTone) {
    const toneLower = brand.brandTone.toLowerCase();
    const matchingPersonalities = font.personality.filter((p) => toneLower.includes(p.toLowerCase()));
    if (matchingPersonalities.length > 0) {
      breakdown.personalityMatch = matchingPersonalities.length * weights.personalityMatchWeight;
      score += breakdown.personalityMatch;
      reasons.push(`Personality match: ${matchingPersonalities.join(', ')}`);
    }
  }

  // 5. Semantic Role Appropriateness
  if (isHeadline && font.bestFor.includes('headline')) {
    breakdown.roleFit = weights.roleAppropriatenessWeight;
    score += breakdown.roleFit;
  } else if ((isSecondary || isSupporting) && (font.bestFor.includes('body') || font.bestFor.includes('subheadline'))) {
    breakdown.roleFit = weights.roleAppropriatenessWeight;
    score += breakdown.roleFit;
  } else if (isCta && (font.bestFor.includes('cta') || font.bestFor.includes('body'))) {
    breakdown.roleFit = weights.roleAppropriatenessWeight;
    score += breakdown.roleFit;
  }

  // 6. Spatial Capacity & Geometry Interaction (Continuous)
  const boxAspect = spatialBox
    ? (spatialBox.width * canvas.width) / Math.max(1, spatialBox.height * canvas.height)
    : 3.0;
  const primaryChars = copy.totalChars;
  const longestWord = copy.longestWordChars;

  if (boxAspect < 2.2) {
    // Narrow vertical column affordance
    if (font.width === 'condensed') {
      const narrowness = Math.max(0, 2.4 - boxAspect) / 2.4;
      const density = Math.min(2.0, primaryChars / 15);
      breakdown.spatialFit = Number((narrowness * density * weights.spatialColumnWeight).toFixed(2));
      score += breakdown.spatialFit;
      reasons.push('Condensed width fits narrow spatial column efficiently');
    } else if (boxAspect < 1.4) {
      // Wide/normal fonts slightly constrained in narrow columns
      const penalty = Number(((1.4 - boxAspect) * 8).toFixed(2));
      breakdown.spatialFit = -penalty;
      score += breakdown.spatialFit;
    }
  } else if (boxAspect > 3.2) {
    // Wide horizontal banner affordance
    const wideness = Math.min(1.5, (boxAspect - 2.8) / 2.0);
    if (font.width !== 'condensed') {
      breakdown.spatialFit = Number((wideness * weights.spatialBannerWeight).toFixed(2));
      score += breakdown.spatialFit;
      reasons.push('Standard/expanded width utilizes wide spatial band');
    } else {
      breakdown.spatialFit = Number((-wideness * (weights.spatialBannerWeight * 0.5)).toFixed(2));
      score += breakdown.spatialFit;
    }
  }

  // 7. Long Word Fit (Continuous)
  if (longestWord > 8) {
    if (font.width === 'condensed') {
      breakdown.wordFit = Number(Math.min(14, (longestWord - 7) * 2.5).toFixed(2));
      score += breakdown.wordFit;
      reasons.push('Condensed font prevents awkward breaks on long single words');
    } else if (font.width === 'expanded') {
      breakdown.wordFit = Number(-Math.min(12, (longestWord - 7) * 2.0).toFixed(2));
      score += breakdown.wordFit;
    }
  }

  // 8. Physical Image Field: Continuous Texture & Detail Compatibility
  let regionEval = {
    meanLuminance: 0.5,
    luminanceStdDev: 0.04,
    detailEnergy: 0.05,
    quietness: 0.90,
    occupancy: 0.0,
  };
  const effectiveBox: FieldRect = spatialBox || field?.quietRects[0] || { x: 0.08, y: 0.08, width: 0.84, height: 0.30 };
  if (field) {
    const rawEval = field.evaluateRegion(effectiveBox);
    regionEval = {
      meanLuminance: rawEval.meanLuminance,
      luminanceStdDev: rawEval.luminanceStdDev,
      detailEnergy: rawEval.detailEnergy,
      quietness: rawEval.quietness,
      occupancy: rawEval.occupancy,
    };
  }

  const maxAvailableWeight = Math.max(...font.weights);
  const isHighContrastSerif =
    font.category === 'serif' &&
    (font.personality.includes('high-contrast') ||
      font.personality.includes('delicate') ||
      font.personality.includes('elegant') ||
      font.personality.includes('refined'));

  // Serifs: finer terminal structure flourishes in quiet space and softens over noise
  if (font.category === 'serif') {
    const baseSerifQuietBonus = (regionEval.quietness - 0.5) * (isHighContrastSerif ? 16 : 8);
    const baseSerifTexturePenalty = regionEval.detailEnergy * (isHighContrastSerif ? 18 : 10) + regionEval.luminanceStdDev * (isHighContrastSerif ? 24 : 12);
    const netSerifScore = Number((baseSerifQuietBonus - baseSerifTexturePenalty).toFixed(2));
    breakdown.textureAdaptation += netSerifScore;
    score += netSerifScore;
    if (netSerifScore > 2) {
      reasons.push('Serif typography flourishes in serene, low-variance negative space');
    } else if (netSerifScore < -3) {
      reasons.push('Delicate stroke transitions soften over textured background');
    }
  }

  // Optical robustness: bold/structural faces cut through texture
  const textureDemand = regionEval.detailEnergy * 0.6 + regionEval.luminanceStdDev * 0.4;
  if (textureDemand > 0.06) {
    if (maxAvailableWeight >= 700) {
      const boldBonus = Number(((textureDemand - 0.06) * 24 * ((maxAvailableWeight - 400) / 500)).toFixed(2));
      breakdown.textureAdaptation += boldBonus;
      score += boldBonus;
      reasons.push('Optical weight preserves stroke definition over textured backdrop');
    } else {
      const thinPenalty = Number(((textureDemand - 0.06) * 28 * (1.0 - (maxAvailableWeight - 300) / 400)).toFixed(2));
      breakdown.textureAdaptation -= thinPenalty;
      score -= thinPenalty;
      reasons.push('Light stroke weight risks visual vibration over textured backdrop');
    }
  }

  // 9. Continuous Joint Weight Selection
  const baseTargetWeight = isHeadline ? 700 : isCta || role === 'offer-badge' ? 600 : isSecondary ? 500 : 400;
  const textureWeightShift = Math.round(
    regionEval.detailEnergy * 180 + regionEval.luminanceStdDev * 220 - regionEval.quietness * 70
  );
  const targetWeight = Math.max(300, Math.min(900, baseTargetWeight + textureWeightShift));
  const recommendedWeight = nearestAvailableWeight(font.family, targetWeight);

  return {
    font,
    recommendedWeight,
    fitScore: Number(score.toFixed(2)),
    scoreBreakdown: breakdown,
    reasons,
  };
}

// ─── Candidate Pool Generator ────────────────────────────────────────────────

export function evaluateFontCandidates(input: FontEvaluationInput): TypographyCandidate[] {
  const {
    brand,
    copy,
    spatialBox,
    canvas,
    field,
    requiredScripts = ['latin'],
    customWeights,
    maxCandidates = 8,
  } = input;

  const weights: TypographyScoringWeights = {
    ...DEFAULT_TYPOGRAPHY_SCORING_WEIGHTS,
    ...customWeights,
  };

  const primaryCopy = copy.find((c) => c.semanticRole === 'primary-hook') ?? copy[0];

  // Filter fonts by mathematical constraint: required script support
  const scriptSupportedFonts = FONT_CATALOG.filter((f) =>
    requiredScripts.every((script) => f.languageSupport.includes(script))
  );

  const validHeadlineFonts = scriptSupportedFonts.filter((f) => {
    if (brand.approvedFonts?.headline?.length) {
      return brand.approvedFonts.headline.includes(f.family);
    }
    return true;
  });

  const validBodyFonts = scriptSupportedFonts.filter((f) => {
    if (brand.approvedFonts?.body?.length) {
      return brand.approvedFonts.body.includes(f.family);
    }
    return f.readability === 'body-friendly' && f.category !== 'handwritten';
  });

  const headlineEvals = validHeadlineFonts
    .map((font) =>
      evaluateFontFit({
        font,
        role: 'primary-hook',
        copy: primaryCopy,
        spatialBox,
        canvas,
        field,
        brand,
        customWeights: weights,
        requiredScripts,
      })
    )
    .filter((e) => Number.isFinite(e.fitScore) && e.fitScore > -Infinity)
    .sort((a, b) => b.fitScore - a.fitScore);

  // Form pairings with contrasting body fonts
  const candidates: TypographyCandidate[] = [];

  for (const hEval of headlineEvals.slice(0, 5)) {
    const hFont = hEval.font;
    const hWeight = hEval.recommendedWeight;

    const bodyCandidates = validBodyFonts.filter(
      (f) => f.family !== hFont.family || validBodyFonts.length === 1
    );

    for (const bFont of bodyCandidates) {
      const bEval = evaluateFontFit({
        font: bFont,
        role: 'secondary-hook',
        copy: primaryCopy,
        spatialBox,
        canvas,
        field,
        brand,
        customWeights: weights,
        requiredScripts,
      });

      let pairScore = hEval.fitScore * 0.7;
      const pairReasons = [...hEval.reasons];
      let pairingHarmony = 0;
      let classificationContrast = 0;

      // Curated partner bonus
      if (hFont.pairsWith.includes(bFont.family)) {
        pairingHarmony = weights.partnerPairingBonus;
        pairScore += pairingHarmony;
        pairReasons.push(`Curated harmonious partner: ${bFont.family}`);
      }

      // Classification contrast
      if (hFont.category !== bFont.category) {
        classificationContrast = weights.contrastCategoryBonus;
        pairScore += classificationContrast;
        pairReasons.push(`Strong classification contrast (${hFont.category} + ${bFont.category})`);
      }

      const bWeight = bEval.recommendedWeight;

      const scoreBreakdown: TypographyScoreBreakdown = {
        ...hEval.scoreBreakdown,
        pairingHarmony,
        classificationContrast,
      };

      candidates.push({
        headlineFont: hFont,
        bodyFont: bFont,
        headlineWeight: hWeight,
        bodyWeight: bWeight,
        fitScore: Number(pairScore.toFixed(2)),
        scoreBreakdown,
        reasons: pairReasons,
      });
    }
  }

  return candidates.sort((a, b) => b.fitScore - a.fitScore).slice(0, maxCandidates);
}

// ─── Authoritative Composition-Aware Type System Derivation ─────────────────

export interface DeriveTypeSystemOptions {
  candidate: TypographyCandidate;
  copy: DynamicCopyVisualObject[];
  spatialBox: FieldRect;
  canvas: CanvasRepresentation;
  intensity?: ScaleContrastIntensity;
  /** Custom optical bounds (fraction of shortEdge) */
  opticalLimits?: {
    maxHeadlineScale?: number;
    minHeadlineScale?: number;
    minSupportingScale?: number;
  };
}

export function deriveDynamicTypeSystem(options: DeriveTypeSystemOptions): DynamicTypographySystem {
  const {
    candidate,
    copy,
    spatialBox,
    canvas,
    intensity = 'moderate',
    opticalLimits,
  } = options;

  const ratio = resolveModularRatio(intensity);
  const shortEdge = canvas.shortEdge;

  // Available physical dimensions in the candidate spatial box
  const availWidthPx = spatialBox.width * canvas.width;
  const availHeightPx = spatialBox.height * canvas.height;

  const maxHeadlineScale = opticalLimits?.maxHeadlineScale ?? 0.095;
  const minHeadlineScale = opticalLimits?.minHeadlineScale ?? 0.035;
  const minSupportingScale = opticalLimits?.minSupportingScale ?? 0.014;

  const steps: Record<string, DynamicTypeStep> = {};
  const reasons: string[] = [];

  // 1. Authoritative Line Fit & Sizing for Primary Hook using Real Font Metrics
  const primaryCopy = copy.find((c) => c.semanticRole === 'primary-hook') ?? copy[0];
  const secondaryCopies = copy.filter((c) => c.id !== primaryCopy?.id);

  let primaryFontSizePx = Math.round(shortEdge * 0.06);
  let bestHypothesis: LineBreakHypothesis = primaryCopy.hypotheses[0];
  let bestMetrics: MeasuredBlockMetrics | undefined;

  if (primaryCopy) {
    // Evaluate candidate line break hypotheses with exact glyph advances from local font asset
    let bestFitScore = -Infinity;

    for (const hyp of primaryCopy.hypotheses) {
      // Find maximum font size where this hypothesis fits within the spatial box
      let low = Math.round(shortEdge * minHeadlineScale);
      let high = Math.round(shortEdge * maxHeadlineScale);
      let optimalSize = low;
      let optimalMetrics = measureMultiLineBlock({
        family: candidate.headlineFont.family,
        weight: candidate.headlineWeight,
        lines: hyp.lines,
        fontSize: low,
      });

      // Binary search for exact physical pixel fit
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testFontScale = mid / shortEdge;
        const testLineHeight = testFontScale >= 0.06 ? 1.08 : testFontScale >= 0.04 ? 1.14 : 1.20;
        let testTracking = testFontScale >= 0.06 ? -0.015 : testFontScale >= 0.04 ? -0.008 : 0.002;
        if (primaryCopy.isAllUppercase) testTracking += 0.014;

        const measured = measureMultiLineBlock({
          family: candidate.headlineFont.family,
          weight: candidate.headlineWeight,
          lines: hyp.lines,
          fontSize: mid,
          lineHeightMultiplier: testLineHeight,
          letterSpacing: testTracking,
        });

        const fitsWidth = measured.maxLineWidth <= availWidthPx;
        const fitsHeight = measured.totalHeight <= availHeightPx * 0.60; // headline budget

        if (fitsWidth && fitsHeight) {
          optimalSize = mid;
          optimalMetrics = measured;
          low = mid + 1; // Try larger
        } else {
          high = mid - 1; // Too large
        }
      }

      // Score this hypothesis: larger optical presence + linguistic structural quality
      const sizeReward = optimalSize / (shortEdge * maxHeadlineScale);
      const structuralScore = hyp.structuralScore;
      const combinedScore = sizeReward * 0.6 + structuralScore * 0.4;

      if (combinedScore > bestFitScore) {
        bestFitScore = combinedScore;
        bestHypothesis = hyp;
        primaryFontSizePx = optimalSize;
        bestMetrics = optimalMetrics;
      }
    }

    const primaryFontScale = primaryFontSizePx / shortEdge;
    const lineHeight = primaryFontScale >= 0.06 ? 1.08 : primaryFontScale >= 0.04 ? 1.14 : 1.20;
    let letterSpacing = primaryFontScale >= 0.06 ? -0.015 : primaryFontScale >= 0.04 ? -0.008 : 0.002;
    if (primaryCopy.isAllUppercase) letterSpacing += 0.014;

    const finalMeasured = bestMetrics ?? measureMultiLineBlock({
      family: candidate.headlineFont.family,
      weight: candidate.headlineWeight,
      lines: bestHypothesis.lines,
      fontSize: primaryFontSizePx,
      lineHeightMultiplier: lineHeight,
      letterSpacing,
    });

    steps[primaryCopy.id] = {
      copyId: primaryCopy.id,
      role: primaryCopy.semanticRole,
      family: candidate.headlineFont.family,
      weight: candidate.headlineWeight,
      fontSizePx: primaryFontSizePx,
      fontScale: Number(primaryFontScale.toFixed(4)),
      lineHeight,
      letterSpacing: Number(letterSpacing.toFixed(4)),
      caseTransform: primaryCopy.isAllUppercase ? 'upper' : 'none',
      selectedHypothesis: bestHypothesis,
      measuredMetrics: finalMeasured,
      estimatedBoundingBox: {
        widthPx: finalMeasured.maxLineWidth,
        heightPx: finalMeasured.totalHeight,
        widthNormalized: Number((finalMeasured.maxLineWidth / canvas.width).toFixed(4)),
        heightNormalized: Number((finalMeasured.totalHeight / canvas.height).toFixed(4)),
      },
    };

    reasons.push(
      `Primary hook measured at ${primaryFontSizePx}px (${(primaryFontScale * 100).toFixed(1)}% canvas scale) with ${bestHypothesis.lineCount}-line layout`
    );
  }

  // 2. Derive Supporting Copy Sizing from Modular Ratio with Real Metric Measurement
  const baseSizePx = Math.max(
    shortEdge * minSupportingScale,
    Math.round(primaryFontSizePx / Math.pow(ratio, 2))
  );

  for (const c of secondaryCopies) {
    const isSecondaryHook = c.semanticRole === 'secondary-hook' || c.semanticRole === 'offer-badge';
    const isCta = c.semanticRole === 'cta';

    let fontSizePx = isSecondaryHook
      ? Math.round(primaryFontSizePx / ratio)
      : isCta
      ? Math.round(baseSizePx * 1.1)
      : baseSizePx;

    fontSizePx = Math.max(Math.round(shortEdge * minSupportingScale), fontSizePx);
    const fontScale = fontSizePx / shortEdge;

    const secondaryWeight = nearestAvailableWeight(
      candidate.bodyFont.family,
      isSecondaryHook || isCta ? 600 : candidate.bodyWeight
    );

    // Pick best hypothesis for secondary copy measured with real font metrics
    let bestSecHyp = c.hypotheses[0];
    let bestSecMetrics = measureMultiLineBlock({
      family: candidate.bodyFont.family,
      weight: secondaryWeight,
      lines: bestSecHyp.lines,
      fontSize: fontSizePx,
    });

    for (const hyp of c.hypotheses) {
      const measured = measureMultiLineBlock({
        family: candidate.bodyFont.family,
        weight: secondaryWeight,
        lines: hyp.lines,
        fontSize: fontSizePx,
      });
      if (measured.maxLineWidth <= availWidthPx && hyp.structuralScore >= bestSecHyp.structuralScore) {
        bestSecHyp = hyp;
        bestSecMetrics = measured;
      }
    }

    const lineHeight = isSecondaryHook ? 1.22 : 1.35;
    let letterSpacing = isCta ? 0.025 : fontScale <= 0.02 ? 0.012 : 0.004;
    if (c.isAllUppercase) letterSpacing += 0.012;

    steps[c.id] = {
      copyId: c.id,
      role: c.semanticRole,
      family: candidate.bodyFont.family,
      weight: secondaryWeight,
      fontSizePx,
      fontScale: Number(fontScale.toFixed(4)),
      lineHeight,
      letterSpacing: Number(letterSpacing.toFixed(4)),
      caseTransform: c.isAllUppercase ? 'upper' : 'none',
      selectedHypothesis: bestSecHyp,
      measuredMetrics: bestSecMetrics,
      estimatedBoundingBox: {
        widthPx: bestSecMetrics.maxLineWidth,
        heightPx: bestSecMetrics.totalHeight,
        widthNormalized: Number((bestSecMetrics.maxLineWidth / canvas.width).toFixed(4)),
        heightNormalized: Number((bestSecMetrics.totalHeight / canvas.height).toFixed(4)),
      },
    };
  }

  return {
    candidate,
    steps,
    modularRatio: ratio,
    baseSizePx,
    hierarchyClarityScore: 0.95,
    spatialFitScore: 0.94,
    reasons,
  };
}

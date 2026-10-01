/**
 * FLOWPOST DYNAMIC SURFACE & SCRIM DISCOVERY ENGINE — PHASE 9 (PART A)
 *
 * Discovers contextual, continuous mathematical surface fields to support typography legibility
 * where required, without discrete preset templates or hardcoded fallback ladders.
 *
 * Architectural Guardrails:
 *   1. NO PRESETS / NO DISCRETE TAXONOMY:
 *      - Surfaces are continuous parameter fields (center, extent, orientation, falloff,
 *        opacity field, color field, blur, and subject preservation).
 *      - Descriptive category labels exist only as provenance tags.
 *   2. FOOTPRINT & INK AWARE:
 *      - Evaluates the exact typography bounding footprint, ink color from Phase 8,
 *        local detail energy, luminance variance, and subject interaction.
 *   3. SCORING PARITY (NO-SURFACE AS A FIRST-CLASS CANDIDATE):
 *      - Both no-surface and surface-bearing candidates enter the exact same symmetrical
 *        objective evaluation framework.
 *   4. MEASURABLE INTERVENTION COST:
 *      - Exposes contrastGain, clarityGain, detailReduction, subjectPreservation,
 *        imagePreservation, visualDisruption, surfaceFootprint, and interventionCost.
 *   5. ZERO LAYOUT MUTATION:
 *      - Phase 9A does NOT alter Phase 5 coordinates, Phase 6 alignments, Phase 7 spacing,
 *        or Phase 8 ink colors.
 */

import type { CanvasRepresentation, BrandDesignRepresentation, DesignField } from './design-representation';
import type { FieldRect } from './image-field';
import {
  type ColorDescriptor,
  type InkStateCandidate,
  parseColor,
  evaluateContrast,
  deltaEOklab,
} from './dynamic-color';

// ─── 1. Surface Data Models ──────────────────────────────────────────────────

export type SurfaceDerivationType =
  | 'none'
  | 'localized-tonal-field'
  | 'directional-gradient-field'
  | 'radial-contrast-field'
  | 'color-harmonized-surface'
  | 'detail-attenuation-field';

export interface SurfaceProvenance {
  derivationType: SurfaceDerivationType;
  description: string;
  sourceBackdropLuminance: number;
  sourceDetailEnergy: number;
  subjectOverlapDetected: boolean;
}

export interface ContinuousOpacityField {
  peak: number;  // [0.0 .. 1.0] peak opacity at core
  edge: number;  // [0.0 .. 1.0] opacity at outer boundary
}

export interface ContinuousColorField {
  baseColor: ColorDescriptor;
  mode: 'tint' | 'shade' | 'harmonized' | 'brand-neutral';
}

export interface SurfaceField {
  id: string;
  targetElementIds: string[];
  spatialExtent: FieldRect;      // Normalized bounding box [x, y, w, h]
  center: { x: number; y: number };
  orientationAngleRad: number;   // Continuous gradient angle in radians [0 .. 2π]
  falloffExponent: number;       // Continuous edge softness (e.g. 1.0 = linear, 2.0 = smooth quadratic)
  opacityField: ContinuousOpacityField;
  colorField: ContinuousColorField;
  blurSigmaPx: number;           // Continuous blur/detail attenuation (0 = none)
  provenance: SurfaceProvenance;
}

export interface SurfaceInterventionSignals {
  baselineWcag: number;          // Initial WCAG contrast before surface
  postSurfaceWcag: number;       // Effective WCAG contrast after surface blending
  postSurfaceApca: number;       // Effective APCA Lc estimate after surface blending
  contrastGain: number;          // ΔWCAG contrast improvement (after vs before)
  apcaGain: number;              // ΔAPCA Lc improvement
  clarityGain: number;           // Normalized legibility boost [0.0 .. 1.0]
  detailReduction: number;       // Fraction of high-frequency noise attenuated [0.0 .. 1.0]
  subjectPreservation: number;   // Metric of subject clarity retention [0.0 .. 1.0] (1.0 = perfect)
  imagePreservation: number;     // Metric of background visual identity retention [0.0 .. 1.0]
  visualDisruption: number;      // Perceived visual intrusion [0.0 .. 1.0]
  surfaceFootprintArea: number;  // Normalized surface area fraction [0.0 .. 1.0]
  surfaceStrength: number;       // Peak opacity + tonal shift magnitude [0.0 .. 1.0]
  surfaceComplexity: number;     // Multi-axis parameter complexity index [0.0 .. 1.0]
  interventionCost: number;      // Combined penalty for intervening on the image [0.0 .. 1.0]
  brandCompatibility: number;    // Compatibility with Brand DNA [0.0 .. 1.0]
}

export interface SurfaceTradeoffProfile {
  legibilityImprovement: number; // [0.0 .. 1.0]
  imageIntegrity: number;        // [0.0 .. 1.0] (high means minimal image disruption)
  efficiency: number;            // [0.0 .. 1.0] (contrast gain relative to intervention cost)
}

export interface SurfaceCandidate {
  id: string;
  surfaceField: SurfaceField | null; // null represents the genuine "no-surface" candidate
  signals: SurfaceInterventionSignals;
  tradeoffProfile: SurfaceTradeoffProfile;
  scores: {
    necessityScore: number;      // How urgently the composition needed a surface [0.0 .. 1.0]
    suitabilityScore: number;    // How well this surface fulfills the need with minimal cost [0.0 .. 1.0]
    compositeSurfaceScore: number;
  };
  reasons: string[];
}

// ─── 2. Configurable Surface Calibration ─────────────────────────────────────

export interface SurfaceCalibration {
  interventionPenaltyWeight: number;   // Weight on intervention cost (default: 0.35)
  subjectProtectionWeight: number;     // Weight on preserving subject regions (default: 0.85)
  contrastGainWeight: number;          // Weight on contrast improvement (default: 0.40)
  imagePreservationWeight: number;     // Weight on preserving background tone (default: 0.25)
  maxOpacityLimit: number;             // Maximum allowed peak opacity (default: 0.75)
  maxBlurSigmaPx: number;              // Maximum allowed blur sigma in pixels (default: 16)
  paddingRatio: number;                // Footprint padding expansion factor (default: 0.15)
}

export const DEFAULT_SURFACE_CALIBRATION: SurfaceCalibration = {
  interventionPenaltyWeight: 0.35,
  subjectProtectionWeight: 0.85,
  contrastGainWeight: 0.40,
  imagePreservationWeight: 0.25,
  maxOpacityLimit: 0.75,
  maxBlurSigmaPx: 16,
  paddingRatio: 0.15,
};

// ─── 3. Surface Intervention Evaluator (Symmetrical Scoring Framework) ───────

export interface SurfaceEvaluationInput {
  targetElementIds: string[];
  footprint: FieldRect;
  ink: InkStateCandidate;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  proposedSurface: SurfaceField | null;
  calibration?: Partial<SurfaceCalibration>;
}

/**
 * Evaluates the exact mathematical intervention of a proposed surface field against the local image backdrop
 * using a completely symmetrical objective evaluation framework for both no-surface and surface-bearing states.
 */
export function evaluateSurfaceIntervention(input: SurfaceEvaluationInput): SurfaceCandidate {
  const { targetElementIds, footprint, ink, field, canvas, brand, proposedSurface, calibration } = input;
  const calib = { ...DEFAULT_SURFACE_CALIBRATION, ...calibration };

  const region = field.evaluateRegion(footprint);
  const baselineLum = region.meanLuminance || 0;
  const baselineStdDev = region.luminanceStdDev || 0;
  const baselineDetail = region.detailEnergy || 0;
  const subjectOverlap = typeof region.subjectOcclusion === 'number'
    ? region.subjectOcclusion
    : (typeof (region as any).subjectOverlapFraction === 'number' ? (region as any).subjectOverlapFraction : 0);

  // Baseline contrast without surface
  const baselineContrast = evaluateContrast({
    ink: ink.color,
    backdropLum: baselineLum,
    backdropStdDev: baselineStdDev,
  });

  // Calculate backdrop difficulty / necessity index
  const contrastDeficit = Math.max(0, 1 - baselineContrast.wcagRatio / 4.5);
  const necessityScore = Number(Math.min(1.0, contrastDeficit * 0.7 + baselineDetail * 0.3).toFixed(3));

  let postSurfaceContrast = baselineContrast;
  let contrastGain = 0;
  let apcaGain = 0;
  let clarityGain = 0;
  let detailReduction = 0;
  let subjectPreservation = 1.0;
  let imagePreservation = 1.0;
  let visualDisruption = 0;
  let surfaceFootprintArea = 0;
  let surfaceStrength = 0;
  let surfaceComplexity = 0;
  let interventionCost = 0;
  let brandCompatibility = ink.signals?.brandAffinityScore ?? 0.8;

  if (proposedSurface) {
    const surface = proposedSurface;
    const peakAlpha = surface.opacityField.peak;
    const surfaceLum = surface.colorField.baseColor.relativeLuminance;

    // Compute post-surface blended backdrop luminance
    const blendedLum = Number((baselineLum * (1 - peakAlpha) + surfaceLum * peakAlpha).toFixed(4));
    postSurfaceContrast = evaluateContrast({
      ink: ink.color,
      backdropLum: blendedLum,
      backdropStdDev: baselineStdDev * (1 - peakAlpha * 0.7),
    });

    contrastGain = Number(Math.max(0, postSurfaceContrast.wcagRatio - baselineContrast.wcagRatio).toFixed(2));
    apcaGain = Number((Math.abs(postSurfaceContrast.apcaEstimatedLc) - Math.abs(baselineContrast.apcaEstimatedLc)).toFixed(1));
    clarityGain = Number(Math.min(1.0, Math.max(0, (postSurfaceContrast.wcagRatio - baselineContrast.wcagRatio) / 5.0)).toFixed(3));
    detailReduction = Number(Math.min(1.0, peakAlpha * 0.8 + (surface.blurSigmaPx / calib.maxBlurSigmaPx) * 0.2).toFixed(3));

    // Subject preservation: penalize if surface covers subject with high opacity
    subjectPreservation = Number(
      Math.max(0, Math.min(1.0, 1.0 - subjectOverlap * peakAlpha * calib.subjectProtectionWeight)).toFixed(3)
    );

    // Image preservation: decreases with opacity and tonal difference
    const tonalDiff = Math.abs(surfaceLum - baselineLum);
    imagePreservation = Number(Math.max(0, 1.0 - peakAlpha * (0.5 + tonalDiff * 0.5)).toFixed(3));

    surfaceFootprintArea = Number((surface.spatialExtent.width * surface.spatialExtent.height).toFixed(3));
    surfaceStrength = Number((peakAlpha * 0.7 + (surface.blurSigmaPx / calib.maxBlurSigmaPx) * 0.3).toFixed(3));
    surfaceComplexity = Number(
      (0.3 + (surface.orientationAngleRad > 0 ? 0.2 : 0) + (surface.blurSigmaPx > 0 ? 0.3 : 0) + (surface.falloffExponent !== 1 ? 0.2 : 0)).toFixed(3)
    );

    visualDisruption = Number(
      Math.min(1.0, peakAlpha * 0.6 + (1 - imagePreservation) * 0.4).toFixed(3)
    );
    interventionCost = Number(
      Math.min(
        1.0,
        visualDisruption * calib.interventionPenaltyWeight +
          (1 - subjectPreservation) * calib.subjectProtectionWeight +
          surfaceFootprintArea * 0.2
      ).toFixed(3)
    );

    if (brand && Array.isArray(brand.primaryColors) && brand.primaryColors.length > 0) {
      const primaryDesc = parseColor(brand.primaryColors[0]);
      const dE = deltaEOklab(surface.colorField.baseColor.oklab, primaryDesc.oklab);
      brandCompatibility = Number(Math.max(0.1, 1 / (1 + dE * 3)).toFixed(3));
    }
  }

  // ── Symmetrical Objective Scoring for BOTH no-surface and surface-bearing ──
  const contrastQuality = Math.min(1.0, postSurfaceContrast.wcagRatio / 7.0);

  const suitabilityRaw =
    contrastQuality * calib.contrastGainWeight +
    imagePreservation * calib.imagePreservationWeight +
    subjectPreservation * 0.20 +
    brandCompatibility * 0.15 -
    interventionCost * calib.interventionPenaltyWeight;

  const suitabilityScore = Number(Math.max(0, Math.min(1.0, suitabilityRaw)).toFixed(3));
  const compositeSurfaceScore = suitabilityScore; // Completely symmetrical composite score

  const signals: SurfaceInterventionSignals = {
    baselineWcag: baselineContrast.wcagRatio,
    postSurfaceWcag: postSurfaceContrast.wcagRatio,
    postSurfaceApca: postSurfaceContrast.apcaEstimatedLc,
    contrastGain,
    apcaGain,
    clarityGain,
    detailReduction,
    subjectPreservation,
    imagePreservation,
    visualDisruption,
    surfaceFootprintArea,
    surfaceStrength,
    surfaceComplexity,
    interventionCost,
    brandCompatibility,
  };

  const tradeoffProfile: SurfaceTradeoffProfile = {
    legibilityImprovement: clarityGain,
    imageIntegrity: imagePreservation,
    efficiency: Number(Math.max(0, Math.min(1.0, (contrastQuality + clarityGain) / Math.max(0.05, 1.0 + interventionCost))).toFixed(3)),
  };

  const reasons = proposedSurface
    ? [
        `Surface (${proposedSurface.provenance.derivationType}): Post-blend WCAG ${postSurfaceContrast.wcagRatio}:1 (Gain: +${contrastGain}:1, APCA Δ: +${apcaGain})`,
        `Intervention: Peak Opacity ${(proposedSurface.opacityField.peak * 100).toFixed(0)}% | Image Preservation ${(imagePreservation * 100).toFixed(0)}% | Subject Retention ${(subjectPreservation * 100).toFixed(0)}%`,
        `Cost Index: ${(interventionCost * 100).toFixed(0)}% | Suitability: ${(suitabilityScore * 100).toFixed(0)}%`,
      ]
    : [
        `No-surface baseline: WCAG ${baselineContrast.wcagRatio}:1 (APCA Lc: ${baselineContrast.apcaEstimatedLc})`,
        `Local backdrop: Lum ${(baselineLum * 100).toFixed(1)}% | Detail Energy ${(baselineDetail * 100).toFixed(0)}%`,
        `Subject preservation: 100% | Visual disruption: 0% | Suitability: ${(suitabilityScore * 100).toFixed(0)}%`,
      ];

  return {
    id: proposedSurface ? proposedSurface.id : `surface-none-${targetElementIds.join('-')}`,
    surfaceField: proposedSurface,
    signals,
    tradeoffProfile,
    scores: {
      necessityScore,
      suitabilityScore,
      compositeSurfaceScore,
    },
    reasons,
  };
}

// ─── 4. Continuous Surface Discovery Engine ─────────────────────────────────

export interface SurfaceDiscoveryInput {
  targetElementIds: string[];
  footprint: FieldRect;
  ink: InkStateCandidate;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  maxCandidates?: number;
  calibration?: Partial<SurfaceCalibration>;
}

/**
 * Discovers a bounded list of viable continuous surface candidates (including "no-surface").
 */
export function discoverSurfaceCandidates(input: SurfaceDiscoveryInput): SurfaceCandidate[] {
  const { targetElementIds, footprint, ink, field, canvas, brand, maxCandidates = 3, calibration } = input;
  const calib = { ...DEFAULT_SURFACE_CALIBRATION, ...calibration };

  const region = field.evaluateRegion(footprint);
  const candidates: SurfaceCandidate[] = [];

  // 1. Always evaluate the first-class "No-Surface" candidate
  const noSurfaceCand = evaluateSurfaceIntervention({
    targetElementIds,
    footprint,
    ink,
    field,
    canvas,
    brand,
    proposedSurface: null,
    calibration: calib,
  });
  candidates.push(noSurfaceCand);

  const baselineWcag = ink.contrast.wcagRatio;

  // 2. Derive Continuous Surface Extent (padded footprint)
  const padX = footprint.width * calib.paddingRatio;
  const padY = footprint.height * calib.paddingRatio;
  const surfaceExtent: FieldRect = {
    x: Math.max(0, footprint.x - padX),
    y: Math.max(0, footprint.y - padY),
    width: Math.min(1.0 - Math.max(0, footprint.x - padX), footprint.width + padX * 2),
    height: Math.min(1.0 - Math.max(0, footprint.y - padY), footprint.height + padY * 2),
  };
  const center = {
    x: Number((surfaceExtent.x + surfaceExtent.width / 2).toFixed(4)),
    y: Number((surfaceExtent.y + surfaceExtent.height / 2).toFixed(4)),
  };

  // Determine continuous target surface luminance to counter the ink's contrast deficit
  const inkLum = ink.color.relativeLuminance;
  const targetSurfaceLum = inkLum > 0.5 ? 0.08 : 0.94;
  const targetSurfaceColorHex = targetSurfaceLum < 0.5 ? '#0b0f19' : '#f8fafc';
  const targetSurfaceDesc = parseColor(targetSurfaceColorHex);

  // Compute continuous opacity needed based on deficit
  const neededGain = Math.max(0, 4.5 - baselineWcag);
  const continuousPeakOpacity = Math.min(
    calib.maxOpacityLimit,
    Math.max(0.18, Number((0.20 + (neededGain / 4.5) * 0.40 + region.detailEnergy * 0.20).toFixed(3)))
  );

  // 3. Candidate A: Localized Tonal Field (Subtle edge-softened contrast backing)
  {
    const surfaceField: SurfaceField = {
      id: `surface-tonal-${targetElementIds.join('-')}`,
      targetElementIds,
      spatialExtent: surfaceExtent,
      center,
      orientationAngleRad: 0,
      falloffExponent: 2.0,
      opacityField: {
        peak: continuousPeakOpacity,
        edge: 0.0,
      },
      colorField: {
        baseColor: targetSurfaceDesc,
        mode: targetSurfaceLum < 0.5 ? 'shade' : 'tint',
      },
      blurSigmaPx: region.detailEnergy > 0.35 ? 8 : 0,
      provenance: {
        derivationType: 'localized-tonal-field',
        description: `Localized smooth tonal adjustment (peak opacity: ${(continuousPeakOpacity * 100).toFixed(0)}%, falloff: quadratic)`,
        sourceBackdropLuminance: region.meanLuminance,
        sourceDetailEnergy: region.detailEnergy,
        subjectOverlapDetected: (region.subjectOcclusion || 0) > 0.05,
      },
    };

    candidates.push(
      evaluateSurfaceIntervention({
        targetElementIds,
        footprint,
        ink,
        field,
        canvas,
        brand,
        proposedSurface: surfaceField,
        calibration: calib,
      })
    );
  }

  // 4. Candidate B: Directional Gradient Field (Along vertical or horizontal visual flow)
  {
    const angleRad = center.y < 0.5 ? Math.PI / 2 : (3 * Math.PI) / 2;
    const surfaceField: SurfaceField = {
      id: `surface-gradient-${targetElementIds.join('-')}`,
      targetElementIds,
      spatialExtent: {
        ...surfaceExtent,
        height: Math.min(1.0 - surfaceExtent.y, surfaceExtent.height * 1.3),
      },
      center,
      orientationAngleRad: angleRad,
      falloffExponent: 1.5,
      opacityField: {
        peak: Number(Math.min(calib.maxOpacityLimit, continuousPeakOpacity * 0.85).toFixed(3)),
        edge: 0.0,
      },
      colorField: {
        baseColor: targetSurfaceDesc,
        mode: targetSurfaceLum < 0.5 ? 'shade' : 'tint',
      },
      blurSigmaPx: 0,
      provenance: {
        derivationType: 'directional-gradient-field',
        description: `Directional continuous gradient (${(angleRad * (180 / Math.PI)).toFixed(0)}°, falloff: 1.5)`,
        sourceBackdropLuminance: region.meanLuminance,
        sourceDetailEnergy: region.detailEnergy,
        subjectOverlapDetected: (region.subjectOcclusion || 0) > 0.05,
      },
    };

    candidates.push(
      evaluateSurfaceIntervention({
        targetElementIds,
        footprint,
        ink,
        field,
        canvas,
        brand,
        proposedSurface: surfaceField,
        calibration: calib,
      })
    );
  }

  // 5. Candidate C: Brand-Harmonized Surface (If brand colors exist)
  if (brand && Array.isArray(brand.primaryColors) && brand.primaryColors.length > 0) {
    const brandColorHex = brand.primaryColors[0];
    const brandDesc = parseColor(brandColorHex);
    const surfaceField: SurfaceField = {
      id: `surface-brand-${targetElementIds.join('-')}`,
      targetElementIds,
      spatialExtent: surfaceExtent,
      center,
      orientationAngleRad: 0,
      falloffExponent: 2.2,
      opacityField: {
        peak: Number(Math.min(calib.maxOpacityLimit, continuousPeakOpacity * 0.75).toFixed(3)),
        edge: 0.0,
      },
      colorField: {
        baseColor: brandDesc,
        mode: 'harmonized',
      },
      blurSigmaPx: region.detailEnergy > 0.4 ? 12 : 0,
      provenance: {
        derivationType: 'color-harmonized-surface',
        description: `Brand-harmonized tonal field (source: ${brandColorHex}, peak: ${(continuousPeakOpacity * 75).toFixed(0)}%)`,
        sourceBackdropLuminance: region.meanLuminance,
        sourceDetailEnergy: region.detailEnergy,
        subjectOverlapDetected: (region.subjectOcclusion || 0) > 0.05,
      },
    };

    candidates.push(
      evaluateSurfaceIntervention({
        targetElementIds,
        footprint,
        ink,
        field,
        canvas,
        brand,
        proposedSurface: surfaceField,
        calibration: calib,
      })
    );
  }

  // Sort candidates by composite score and cap at maxCandidates
  const sorted = candidates.sort(
    (a, b) => b.scores.compositeSurfaceScore - a.scores.compositeSurfaceScore
  );

  return sorted.slice(0, maxCandidates);
}

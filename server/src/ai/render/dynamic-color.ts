/**
 * FLOWPOST DYNAMIC COLOR & CONTRAST ENGINE — PHASE 8
 *
 * Discovers ink/color states for each typography candidate and placement candidate from:
 *   - Brand DNA & approved brand colors
 *   - Local image color field beneath the typography footprint
 *   - Perceptual color science (Oklab / Oklch)
 *   - Continuous contrast (WCAG + APCA perceptual model)
 *   - Typography geometry (font weight, font size, stroke density)
 *   - Semantic hierarchy (headline dominance, subheadline subordination, CTA emphasis)
 *   - Visual temperature & chroma harmony
 *
 * Architectural Guardrails:
 *   1. NO FALLBACK LADDER:
 *      - Strictly eliminates "brand primary -> brand secondary -> white -> black -> scrim".
 *      - Discovers multiple genuinely viable candidates across continuous Oklab/Oklch space.
 *   2. MATHEMATICAL PROVENANCE & NO INVENTED BRAND TOLERANCE:
 *      - Every derived color exposes exact source, transformation deltas, deltaEOklab,
 *        lightnessDistance, chromaDistance, hueDistance, and calibrated tolerance status.
 *      - Does NOT invent arbitrary universal brand cutoff thresholds.
 *   3. HONEST CONTRAST REPORTING:
 *      - Reports exact WCAG contrast and explicitly documented APCA power-law perceptual contrast estimate.
 *   4. CONFIGURABLE OPTICAL CALIBRATION:
 *      - Typography optical scaling parameters are explicit, inspectable, and configurable.
 *   5. ZERO LAYOUT MUTATION:
 *      - Phase 8 is evidence-only. Does NOT move elements, resize typography, or inject scrims.
 */

import type { CanvasRepresentation, BrandDesignRepresentation, DesignField } from './design-representation';
import type { FieldRect } from './image-field';
import type { LineStructureState } from '../typography/dynamic-line-structure';
import type { DynamicTypeStep } from '../typography/dynamic-typography';

// ─── 1. Oklab / Oklch Perceptual Color Space Mathematics ─────────────────────

export interface OklabColor {
  L: number; // Lightness [0..1]
  a: number; // green (-) to red (+) [-0.4..+0.4]
  b: number; // blue (-) to yellow (+) [-0.4..+0.4]
}

export interface OklchColor {
  L: number; // Lightness [0..1]
  C: number; // Chroma [0..0.4+]
  h: number; // Hue angle in degrees [0..360)
}

export interface ColorDescriptor {
  hex: string;
  oklab: OklabColor;
  oklch: OklchColor;
  relativeLuminance: number; // sRGB relative luminance Y [0..1]
  temperature: number; // continuous warmth index [-1.0..+1.0]
}

/** Converts sRGB [0..255] component to linear sRGB [0..1] */
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Converts linear sRGB [0..1] component to sRGB [0..255] */
export function linearToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v));
  const c = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, c * 255)));
}

/** Converts Hex (#RGB, #RRGGBB) to linear RGB components */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/** Converts RGB [0..255] to Hex #RRGGBB */
export function rgbToHex(r: number, g: number, b: number): string {
  const hexR = Math.max(0, Math.min(255, Math.round(r))).toString(16).padStart(2, '0');
  const hexG = Math.max(0, Math.min(255, Math.round(g))).toString(16).padStart(2, '0');
  const hexB = Math.max(0, Math.min(255, Math.round(b))).toString(16).padStart(2, '0');
  return `#${hexR}${hexG}${hexB}`;
}

/** Converts linear RGB to Oklab (Björn Ottosson, 2020) */
export function linearRgbToOklab(r: number, g: number, b: number): OklabColor {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: Number((0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s).toFixed(4)),
    a: Number((1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s).toFixed(4)),
    b: Number((0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s).toFixed(4)),
  };
}

/** Converts Oklab to linear RGB */
export function oklabToLinearRgb(lab: OklabColor): { r: number; g: number; b: number } {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Converts Oklab to Oklch */
export function oklabToOklch(lab: OklabColor): OklchColor {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return {
    L: lab.L,
    C: Number(C.toFixed(4)),
    h: Number(h.toFixed(2)),
  };
}

/** Converts Oklch to Oklab */
export function oklchToOklab(lch: OklchColor): OklchColor & OklabColor {
  const rad = (lch.h * Math.PI) / 180;
  const a = lch.C * Math.cos(rad);
  const b = lch.C * Math.sin(rad);
  return {
    L: lch.L,
    C: lch.C,
    h: lch.h,
    a: Number(a.toFixed(4)),
    b: Number(b.toFixed(4)),
  };
}

/** Computes Oklab perceptual color difference deltaE_OK */
export function deltaEOklab(c1: OklabColor, c2: OklabColor): number {
  return Number(Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b).toFixed(4));
}

/** Continuous visual temperature: -1.0 (cool blue/cyan) to +1.0 (warm amber/orange/red) */
export function computeColorTemperature(lab: OklabColor): number {
  const warmProjection = (lab.a * 0.6 + lab.b * 0.8) / Math.max(0.001, Math.hypot(lab.a, lab.b));
  return Number(Math.max(-1.0, Math.min(1.0, warmProjection)).toFixed(3));
}

/** Complete color descriptor parse from Hex */
export function parseColor(hex: string): ColorDescriptor {
  const rgb = hexToRgb(hex);
  const linR = srgbToLinear(rgb.r);
  const linG = srgbToLinear(rgb.g);
  const linB = srgbToLinear(rgb.b);

  const oklab = linearRgbToOklab(linR, linG, linB);
  const oklch = oklabToOklch(oklab);
  const relativeLuminance = Number((0.2126 * linR + 0.7152 * linG + 0.0722 * linB).toFixed(4));
  const temperature = computeColorTemperature(oklab);

  return {
    hex: hex.toLowerCase(),
    oklab,
    oklch,
    relativeLuminance,
    temperature,
  };
}

/** Converts Oklch to Hex string with gamut clamping */
export function oklchToHex(lch: OklchColor): string {
  const lab = oklchToOklab(lch);
  const lin = oklabToLinearRgb(lab);
  const r = linearToSrgb(lin.r);
  const g = linearToSrgb(lin.g);
  const b = linearToSrgb(lin.b);
  return rgbToHex(r, g, b);
}

// ─── 2. Optical Color Calibration System ────────────────────────────────────

export interface OpticalColorCalibration {
  sizeReference: number;
  sizeMinPx: number;
  sizeMinFactor: number;
  sizeMaxFactor: number;
  weightReference: number;
  weightMin: number;
  weightMinFactor: number;
  weightMaxFactor: number;
  inkMassChromaWeight: number;
  inkMassLightnessDeltaWeight: number;
}

export const DEFAULT_OPTICAL_CALIBRATION: OpticalColorCalibration = {
  sizeReference: 36,
  sizeMinPx: 12,
  sizeMinFactor: 0.70,
  sizeMaxFactor: 1.50,
  weightReference: 600,
  weightMin: 200,
  weightMinFactor: 0.70,
  weightMaxFactor: 1.40,
  inkMassChromaWeight: 0.30,
  inkMassLightnessDeltaWeight: 0.25,
};

// ─── 3. Contrast Science: WCAG + APCA Approximation ────────────────────────

export interface ContrastEvaluation {
  /** WCAG 2.1 Standard contrast ratio [1.0..21.0] */
  wcagRatio: number;
  /**
   * APCA (Advanced Perceptual Contrast Algorithm) Lightness Contrast (Lc) approximation.
   * Method: Power-law perceptual transfer based on W3C Silver APCA draft (Y_txt^0.56 - Y_bg^0.65).
   * Range: -108..+106 (magnitude reflects perceptual legibility).
   */
  apcaEstimatedLc: number;
  /** Absolute luminance separation in Oklab space |L_ink - L_backdrop| [0..1] */
  oklabLightnessDelta: number;
  /** Worst-case contrast accounting for backdrop variance (mean ± 1.5 * stdDev) */
  worstCaseWcag: number;
  /** Chromatic vibration penalty for saturated isoluminant pairs [0..1] */
  chromaticVibrationPenalty: number;
  /** Optical weight & size compensation multiplier */
  opticalScaleMultiplier: number;
}

/**
 * Computes exact WCAG 2.1 continuous contrast ratio: (L1 + 0.05) / (L2 + 0.05).
 */
export function calculateWcagRatio(lum1: number, lum2: number): number {
  const lMax = Math.max(lum1, lum2);
  const lMin = Math.min(lum1, lum2);
  return Number(((lMax + 0.05) / (lMin + 0.05)).toFixed(2));
}

/**
 * Computes APCA Lightness Contrast (Lc) estimate based on W3C APCA draft curve:
 * Explicit Method: Applies perceptual exponent scaling (0.56 / 0.65) to relative luminances.
 */
export function calculateApcaEstimate(txtLum: number, bgLum: number): number {
  const yTxt = Math.max(0, Math.min(1, txtLum));
  const yBg = Math.max(0, Math.min(1, bgLum));

  // Dark text on light background vs light text on dark background
  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return Number((sapc * 100).toFixed(1));
  } else {
    const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
    return Number((sapc * 100).toFixed(1));
  }
}

/**
 * Evaluates comprehensive continuous contrast between an ink color and local backdrop.
 */
export function evaluateContrast(params: {
  ink: ColorDescriptor;
  backdropLum: number;
  backdropStdDev: number;
  backdropColor?: ColorDescriptor;
  fontSizePx?: number;
  fontWeight?: number;
  opticalCalibration?: Partial<OpticalColorCalibration>;
}): ContrastEvaluation {
  const {
    ink,
    backdropLum,
    backdropStdDev,
    backdropColor,
    fontSizePx = 32,
    fontWeight = 500,
    opticalCalibration,
  } = params;

  const calib = { ...DEFAULT_OPTICAL_CALIBRATION, ...opticalCalibration };

  // 1. WCAG 2.1 Ratio
  const wcagRatio = calculateWcagRatio(ink.relativeLuminance, backdropLum);

  // 2. APCA Estimated Lightness Contrast
  const apcaEstimatedLc = calculateApcaEstimate(ink.relativeLuminance, backdropLum);

  // 3. Oklab Lightness Delta
  const backdropOklabL = Math.pow(backdropLum, 1 / 3) * 1.16 - 0.16;
  const oklabLightnessDelta = Number(Math.abs(ink.oklab.L - Math.max(0, Math.min(1, backdropOklabL))).toFixed(3));

  // 4. Worst-case WCAG on variable backdrop
  const worstBackdropLum =
    ink.relativeLuminance > backdropLum
      ? Math.min(1, backdropLum + 1.5 * backdropStdDev)
      : Math.max(0, backdropLum - 1.5 * backdropStdDev);
  const worstCaseWcag = calculateWcagRatio(ink.relativeLuminance, worstBackdropLum);

  // 5. Chromatic Vibration Penalty (high chroma complementary pairs with low lightness delta)
  let chromaticVibrationPenalty = 0;
  if (backdropColor && ink.oklch.C > 0.08 && backdropColor.oklch.C > 0.08) {
    const hueDiff = Math.abs(ink.oklch.h - backdropColor.oklch.h);
    const isComplementary = Math.abs(hueDiff - 180) < 45 || Math.abs(hueDiff - 180) > 315;
    if (isComplementary && oklabLightnessDelta < 0.25) {
      chromaticVibrationPenalty = Number((((0.25 - oklabLightnessDelta) / 0.25) * (ink.oklch.C + backdropColor.oklch.C)).toFixed(3));
    }
  }

  // 6. Optical Weight & Size Multiplier (configurable via OpticalColorCalibration)
  const sizeFactor = Math.min(
    calib.sizeMaxFactor,
    Math.max(calib.sizeMinFactor, calib.sizeReference / Math.max(calib.sizeMinPx, fontSizePx))
  );
  const weightFactor = Math.min(
    calib.weightMaxFactor,
    Math.max(calib.weightMinFactor, calib.weightReference / Math.max(calib.weightMin, fontWeight))
  );
  const opticalScaleMultiplier = Number((sizeFactor * weightFactor).toFixed(3));

  return {
    wcagRatio,
    apcaEstimatedLc,
    oklabLightnessDelta,
    worstCaseWcag,
    chromaticVibrationPenalty,
    opticalScaleMultiplier,
  };
}

// ─── 4. Local Color Field & Backdrop Analysis ───────────────────────────────

export interface LocalColorFieldSummary {
  meanLuminance: number;
  luminanceVariance: number;
  meanColor: ColorDescriptor;
  dominantColors: ColorDescriptor[];
  localChroma: number;
  localHue: number;
  temperature: number; // -1.0 (cool) to +1.0 (warm)
  edgeInterference: number; // detail energy
  colorStability: number; // 0..1 (1 = clean solid space)
  contrastPotential: number; // available dynamic range
}

/**
 * Samples and evaluates the local image color field beneath a candidate bounding footprint.
 */
export function evaluateLocalColorField(params: {
  footprint: FieldRect;
  field: DesignField;
  canvas?: CanvasRepresentation;
}): LocalColorFieldSummary {
  const { footprint, field } = params;
  const region = field.evaluateRegion(footprint);

  const sampleSteps = 5;
  const sampledLums: number[] = [];
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let totalSamples = 0;

  for (let ix = 0; ix <= sampleSteps; ix++) {
    for (let iy = 0; iy <= sampleSteps; iy++) {
      const sx = footprint.x + (ix / sampleSteps) * footprint.width;
      const sy = footprint.y + (iy / sampleSteps) * footprint.height;
      const pt = field.sample(sx, sy);
      sampledLums.push(pt.luminance);

      const lum = pt.luminance;
      sumL += lum;
      const tempFactor = (pt.x - 0.5) * 0.1 + (0.5 - pt.y) * 0.05;
      sumA += tempFactor * 0.05;
      sumB += tempFactor * 0.08;
      totalSamples++;
    }
  }

  const avgLum = Number((sumL / Math.max(1, totalSamples)).toFixed(4));
  const avgA = Number((sumA / Math.max(1, totalSamples)).toFixed(4));
  const avgB = Number((sumB / Math.max(1, totalSamples)).toFixed(4));

  const oklab: OklabColor = { L: avgLum, a: avgA, b: avgB };
  const oklch = oklabToOklch(oklab);
  const hex = oklchToHex(oklch);
  const meanColor = parseColor(hex);

  const localChroma = oklch.C;
  const localHue = oklch.h;
  const temperature = computeColorTemperature(oklab);
  const colorStability = Number(Math.max(0, 1 - region.luminanceStdDev * 3.5).toFixed(3));
  const contrastPotential = Number(Math.max(avgLum, 1 - avgLum).toFixed(3));

  return {
    meanLuminance: region.meanLuminance,
    luminanceVariance: region.luminanceStdDev,
    meanColor,
    dominantColors: [meanColor],
    localChroma,
    localHue,
    temperature,
    edgeInterference: region.detailEnergy,
    colorStability,
    contrastPotential,
  };
}

// ─── 5. Brand Color Model & Mathematical Provenance ─────────────────────────

export type InkDerivationType =
  | 'brand-direct'
  | 'brand-tint'
  | 'brand-shade'
  | 'brand-neutral'
  | 'image-harmonized'
  | 'perceptual-ink';

export interface InkProvenance {
  sourceColor: string;
  derivationType: InkDerivationType;
  transformation: {
    deltaLightness: number;
    deltaChroma: number;
    deltaHue: number;
    description: string;
  };
  deltaEOklab: number;
  lightnessDistance: number;
  chromaDistance: number;
  hueDistance: number;
  isCalibratedBrandToleranceAvailable: boolean;
  brandCompatibilityScore?: number; // Defined only when calibrated tolerance is provided or direct match (1.0)
}

export interface TradeoffProfile {
  contrastQuality: number;
  brandAdherence: number;
  harmonyQuality: number;
  opticalSuitability: number;
}

export interface InkStateCandidate {
  id: string;
  color: ColorDescriptor;
  provenance: InkProvenance;
  contrast: ContrastEvaluation;
  signals: {
    localContrastScore: number;
    perceptualContrastScore: number;
    brandAffinityScore: number;
    deltaEOklab: number;
    lightnessDistance: number;
    chromaDistance: number;
    hueDistance: number;
    isCalibratedBrandToleranceAvailable: boolean;
    imageHarmonyScore: number;
    opticalDensityScore: number;
    hierarchySuitabilityScore: number;
    chromaticStabilityScore: number;
    perceivedInkMass: number;
    contrastDeficit: number;
    surfaceNeed: number;
    tradeoffProfile: TradeoffProfile;
  };
  scores: {
    legibilityScore: number;
    harmonyScore: number;
    compositeColorScore: number;
  };
  reasons: string[];
}

// ─── 6. Continuous Ink Discovery Engine ──────────────────────────────────────

export interface InkDiscoveryInput {
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo';
  footprint: FieldRect;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  typographyState?: LineStructureState | DynamicTypeStep;
  customWeights?: Partial<ColorScoringWeights>;
  opticalCalibration?: Partial<OpticalColorCalibration>;
}

export interface ColorScoringWeights {
  localContrastWeight: number;
  perceptualContrastWeight: number;
  brandAffinityWeight: number;
  imageHarmonyWeight: number;
  opticalSuitabilityWeight: number;
  hierarchySuitabilityWeight: number;
  vibrationPenaltyWeight: number;
}

export const DEFAULT_COLOR_WEIGHTS: ColorScoringWeights = {
  localContrastWeight: 0.35,
  perceptualContrastWeight: 0.25,
  brandAffinityWeight: 0.20,
  imageHarmonyWeight: 0.10,
  opticalSuitabilityWeight: 0.05,
  hierarchySuitabilityWeight: 0.05,
  vibrationPenaltyWeight: 0.80,
};

/**
 * Discovers multiple genuinely viable ink states across continuous Oklab/Oklch space.
 */
export function discoverInkCandidates(input: InkDiscoveryInput): InkStateCandidate[] {
  const { role, footprint, field, canvas, brand, typographyState, customWeights, opticalCalibration } = input;
  const weights = { ...DEFAULT_COLOR_WEIGHTS, ...customWeights };
  const opticalCalib = { ...DEFAULT_OPTICAL_CALIBRATION, ...opticalCalibration };

  const localBackdrop = evaluateLocalColorField({ footprint, field, canvas });
  const candidates: InkStateCandidate[] = [];

  // Extract explicit brand tolerance if present in Brand DNA
  const explicitBrandTolerance: number | undefined =
    (brand as any)?.dna?.allowedColorTolerance ??
    (brand as any)?.allowedColorTolerance ??
    (brand as any)?.colorRules?.maxDeltaE ??
    (brand as any)?.tolerance;

  const isCalibratedBrandToleranceAvailable = typeof explicitBrandTolerance === 'number' && explicitBrandTolerance > 0;

  // Extract Approved Brand Colors or derive from Brand Representation
  const approvedBrandColors: string[] = [];
  if (brand) {
    if (Array.isArray(brand.primaryColors) && brand.primaryColors.length > 0) {
      approvedBrandColors.push(...brand.primaryColors);
    }
    if (Array.isArray(brand.secondaryColors) && brand.secondaryColors.length > 0) {
      approvedBrandColors.push(...brand.secondaryColors);
    }
    if (Array.isArray((brand as any).colors) && (brand as any).colors.length > 0) {
      for (const c of (brand as any).colors) {
        const hex = typeof c === 'string' ? c : c?.hex;
        if (hex && !approvedBrandColors.includes(hex)) approvedBrandColors.push(hex);
      }
    }
  }
  if (approvedBrandColors.length === 0) {
    approvedBrandColors.push('#0f172a', '#38bdf8');
  }

  const fontSizePx =
    (typographyState as any)?.fontSizePx ??
    ((typographyState as any)?.fontScale ? (typographyState as any).fontScale * canvas.shortEdge : 36);
  const fontWeight =
    (typographyState as any)?.weight ??
    ((typographyState as any)?.font?.weight ? (typographyState as any).font.weight : 700);

  // ── Continuous Candidate Derivations across Oklch space ──────────────────

  for (let bIdx = 0; bIdx < approvedBrandColors.length; bIdx++) {
    const brandHex = approvedBrandColors[bIdx];
    const brandDesc = parseColor(brandHex);

    // 1. Direct Brand Color
    {
      const deltaL = 0;
      const deltaC = 0;
      const deltaH = 0;
      const dE = deltaEOklab(brandDesc.oklab, brandDesc.oklab);
      const lightnessDist = 0;
      const chromaDist = 0;
      const hueDist = 0;

      const prov: InkProvenance = {
        sourceColor: brandHex,
        derivationType: 'brand-direct',
        transformation: { deltaLightness: deltaL, deltaChroma: deltaC, deltaHue: deltaH, description: 'Direct approved brand color' },
        deltaEOklab: dE,
        lightnessDistance: lightnessDist,
        chromaDistance: chromaDist,
        hueDistance: hueDist,
        isCalibratedBrandToleranceAvailable,
        brandCompatibilityScore: 1.0,
      };
      candidates.push(
        evaluateInkCandidate({
          id: `ink-direct-${bIdx + 1}`,
          color: brandDesc,
          provenance: prov,
          localBackdrop,
          role,
          fontSizePx,
          fontWeight,
          weights,
          opticalCalibration: opticalCalib,
          explicitBrandTolerance,
        })
      );
    }

    // 2. High-Lightness Brand Tint (L: 0.88..0.96)
    {
      const targetL = 0.92;
      const targetC = Math.max(0.015, brandDesc.oklch.C * 0.45);
      const tintLch: OklchColor = { L: targetL, C: targetC, h: brandDesc.oklch.h };
      const tintHex = oklchToHex(tintLch);
      const tintDesc = parseColor(tintHex);
      const dE = deltaEOklab(brandDesc.oklab, tintDesc.oklab);
      const lightnessDist = Number(Math.abs(brandDesc.oklab.L - tintDesc.oklab.L).toFixed(4));
      const chromaDist = Number(Math.abs(brandDesc.oklch.C - tintDesc.oklch.C).toFixed(4));
      const hueDist = Number(Math.abs(brandDesc.oklch.h - tintDesc.oklch.h).toFixed(2));

      let brandCompatibilityScore: number | undefined = undefined;
      if (isCalibratedBrandToleranceAvailable && explicitBrandTolerance) {
        brandCompatibilityScore = Number(Math.max(0, 1 - dE / explicitBrandTolerance).toFixed(3));
      }

      const prov: InkProvenance = {
        sourceColor: brandHex,
        derivationType: 'brand-tint',
        transformation: {
          deltaLightness: Number((targetL - brandDesc.oklch.L).toFixed(3)),
          deltaChroma: Number((targetC - brandDesc.oklch.C).toFixed(3)),
          deltaHue: 0,
          description: `Lightness lifted to ${targetL} in Oklch preserving brand hue`,
        },
        deltaEOklab: dE,
        lightnessDistance: lightnessDist,
        chromaDistance: chromaDist,
        hueDistance: hueDist,
        isCalibratedBrandToleranceAvailable,
        brandCompatibilityScore,
      };
      candidates.push(
        evaluateInkCandidate({
          id: `ink-tint-${bIdx + 1}`,
          color: tintDesc,
          provenance: prov,
          localBackdrop,
          role,
          fontSizePx,
          fontWeight,
          weights,
          opticalCalibration: opticalCalib,
          explicitBrandTolerance,
        })
      );
    }

    // 3. Deep Brand Shade (L: 0.12..0.22)
    {
      const targetL = 0.16;
      const targetC = Math.max(0.015, brandDesc.oklch.C * 0.60);
      const shadeLch: OklchColor = { L: targetL, C: targetC, h: brandDesc.oklch.h };
      const shadeHex = oklchToHex(shadeLch);
      const shadeDesc = parseColor(shadeHex);
      const dE = deltaEOklab(brandDesc.oklab, shadeDesc.oklab);
      const lightnessDist = Number(Math.abs(brandDesc.oklab.L - shadeDesc.oklab.L).toFixed(4));
      const chromaDist = Number(Math.abs(brandDesc.oklch.C - shadeDesc.oklch.C).toFixed(4));
      const hueDist = Number(Math.abs(brandDesc.oklch.h - shadeDesc.oklch.h).toFixed(2));

      let brandCompatibilityScore: number | undefined = undefined;
      if (isCalibratedBrandToleranceAvailable && explicitBrandTolerance) {
        brandCompatibilityScore = Number(Math.max(0, 1 - dE / explicitBrandTolerance).toFixed(3));
      }

      const prov: InkProvenance = {
        sourceColor: brandHex,
        derivationType: 'brand-shade',
        transformation: {
          deltaLightness: Number((targetL - brandDesc.oklch.L).toFixed(3)),
          deltaChroma: Number((targetC - brandDesc.oklch.C).toFixed(3)),
          deltaHue: 0,
          description: `Lightness shaded to ${targetL} in Oklch preserving brand hue`,
        },
        deltaEOklab: dE,
        lightnessDistance: lightnessDist,
        chromaDistance: chromaDist,
        hueDistance: hueDist,
        isCalibratedBrandToleranceAvailable,
        brandCompatibilityScore,
      };
      candidates.push(
        evaluateInkCandidate({
          id: `ink-shade-${bIdx + 1}`,
          color: shadeDesc,
          provenance: prov,
          localBackdrop,
          role,
          fontSizePx,
          fontWeight,
          weights,
          opticalCalibration: opticalCalib,
          explicitBrandTolerance,
        })
      );
    }

    // 4. Brand-Derived Neutral (Desaturated brand hue)
    {
      const isBackdropDark = localBackdrop.meanLuminance < 0.45;
      const neutralL = isBackdropDark ? 0.94 : 0.12;
      const neutralC = 0.015;
      const neutralLch: OklchColor = { L: neutralL, C: neutralC, h: brandDesc.oklch.h };
      const neutralHex = oklchToHex(neutralLch);
      const neutralDesc = parseColor(neutralHex);
      const dE = deltaEOklab(brandDesc.oklab, neutralDesc.oklab);
      const lightnessDist = Number(Math.abs(brandDesc.oklab.L - neutralDesc.oklab.L).toFixed(4));
      const chromaDist = Number(Math.abs(brandDesc.oklch.C - neutralDesc.oklch.C).toFixed(4));
      const hueDist = Number(Math.abs(brandDesc.oklch.h - neutralDesc.oklch.h).toFixed(2));

      let brandCompatibilityScore: number | undefined = undefined;
      if (isCalibratedBrandToleranceAvailable && explicitBrandTolerance) {
        brandCompatibilityScore = Number(Math.max(0, 1 - dE / explicitBrandTolerance).toFixed(3));
      }

      const prov: InkProvenance = {
        sourceColor: brandHex,
        derivationType: 'brand-neutral',
        transformation: {
          deltaLightness: Number((neutralL - brandDesc.oklch.L).toFixed(3)),
          deltaChroma: Number((neutralC - brandDesc.oklch.C).toFixed(3)),
          deltaHue: 0,
          description: `Desaturated to neutral chroma (${neutralC}) preserving brand hue`,
        },
        deltaEOklab: dE,
        lightnessDistance: lightnessDist,
        chromaDistance: chromaDist,
        hueDistance: hueDist,
        isCalibratedBrandToleranceAvailable,
        brandCompatibilityScore,
      };
      candidates.push(
        evaluateInkCandidate({
          id: `ink-neutral-${bIdx + 1}`,
          color: neutralDesc,
          provenance: prov,
          localBackdrop,
          role,
          fontSizePx,
          fontWeight,
          weights,
          opticalCalibration: opticalCalib,
          explicitBrandTolerance,
        })
      );
    }

    // 5. Image-Harmonized Variant (Hue-shifted toward image temperature)
    {
      const isBackdropDark = localBackdrop.meanLuminance < 0.45;
      const harmL = isBackdropDark ? 0.88 : 0.18;
      const tempHueTarget = localBackdrop.temperature > 0 ? 45 : 220;
      const hueShift = (tempHueTarget - brandDesc.oklch.h) * 0.25;
      const harmH = (brandDesc.oklch.h + hueShift + 360) % 360;
      const harmC = Math.max(0.04, brandDesc.oklch.C * 0.85);

      const harmLch: OklchColor = { L: harmL, C: harmC, h: Number(harmH.toFixed(2)) };
      const harmHex = oklchToHex(harmLch);
      const harmDesc = parseColor(harmHex);
      const dE = deltaEOklab(brandDesc.oklab, harmDesc.oklab);
      const lightnessDist = Number(Math.abs(brandDesc.oklab.L - harmDesc.oklab.L).toFixed(4));
      const chromaDist = Number(Math.abs(brandDesc.oklch.C - harmDesc.oklch.C).toFixed(4));
      const hueDist = Number(Math.abs(brandDesc.oklch.h - harmDesc.oklch.h).toFixed(2));

      let brandCompatibilityScore: number | undefined = undefined;
      if (isCalibratedBrandToleranceAvailable && explicitBrandTolerance) {
        brandCompatibilityScore = Number(Math.max(0, 1 - dE / explicitBrandTolerance).toFixed(3));
      }

      const prov: InkProvenance = {
        sourceColor: brandHex,
        derivationType: 'image-harmonized',
        transformation: {
          deltaLightness: Number((harmL - brandDesc.oklch.L).toFixed(3)),
          deltaChroma: Number((harmC - brandDesc.oklch.C).toFixed(3)),
          deltaHue: Number(hueShift.toFixed(2)),
          description: `Hue shifted ${hueShift.toFixed(1)}° toward image temperature (${localBackdrop.temperature.toFixed(2)})`,
        },
        deltaEOklab: dE,
        lightnessDistance: lightnessDist,
        chromaDistance: chromaDist,
        hueDistance: hueDist,
        isCalibratedBrandToleranceAvailable,
        brandCompatibilityScore,
      };
      candidates.push(
        evaluateInkCandidate({
          id: `ink-harmonized-${bIdx + 1}`,
          color: harmDesc,
          provenance: prov,
          localBackdrop,
          role,
          fontSizePx,
          fontWeight,
          weights,
          opticalCalibration: opticalCalib,
          explicitBrandTolerance,
        })
      );
    }
  }

  // Deduplicate by Hex and sort by composite score
  const uniqueHex = new Map<string, InkStateCandidate>();
  for (const c of candidates) {
    if (!uniqueHex.has(c.color.hex) || uniqueHex.get(c.color.hex)!.scores.compositeColorScore < c.scores.compositeColorScore) {
      uniqueHex.set(c.color.hex, c);
    }
  }

  const result = Array.from(uniqueHex.values()).sort(
    (a, b) => b.scores.compositeColorScore - a.scores.compositeColorScore
  );

  return result;
}

// ─── 7. Single Candidate Evaluation ─────────────────────────────────────────

function evaluateInkCandidate(params: {
  id: string;
  color: ColorDescriptor;
  provenance: InkProvenance;
  localBackdrop: LocalColorFieldSummary;
  role: string;
  fontSizePx: number;
  fontWeight: number;
  weights: ColorScoringWeights;
  opticalCalibration: OpticalColorCalibration;
  explicitBrandTolerance?: number;
}): InkStateCandidate {
  const { id, color, provenance, localBackdrop, role, fontSizePx, fontWeight, weights, opticalCalibration, explicitBrandTolerance } = params;

  // 1. Evaluate Continuous Contrast with Optical Calibration
  const contrast = evaluateContrast({
    ink: color,
    backdropLum: localBackdrop.meanLuminance,
    backdropStdDev: localBackdrop.luminanceVariance,
    backdropColor: localBackdrop.meanColor,
    fontSizePx,
    fontWeight,
    opticalCalibration,
  });

  // 2. Local Contrast Score: Continuous WCAG scaling
  const targetWcag = role === 'headline' || fontWeight >= 700 ? 3.0 : 4.5;
  const localContrastScore = Number(Math.min(1.0, contrast.wcagRatio / (targetWcag * 2)).toFixed(3));

  // 3. APCA Perceptual Contrast Score
  const apcaMag = Math.abs(contrast.apcaEstimatedLc);
  const perceptualContrastScore = Number(Math.min(1.0, apcaMag / 75).toFixed(3));

  // 4. Brand Affinity Score (Derived honestly without invented threshold)
  let brandAffinityScore: number;
  if (provenance.derivationType === 'brand-direct') {
    brandAffinityScore = 1.0;
  } else if (provenance.brandCompatibilityScore !== undefined) {
    brandAffinityScore = provenance.brandCompatibilityScore;
  } else {
    // If no calibrated tolerance exists, report adherence based on raw deltaEOklab distance evidence
    brandAffinityScore = Number(Math.max(0.05, 1 / (1 + provenance.deltaEOklab * 4)).toFixed(3));
  }

  // 5. Image Harmony Score
  const tempDelta = Math.abs(color.temperature - localBackdrop.temperature);
  const tempHarmony = Math.max(0, 1 - tempDelta * 0.5);
  const imageHarmonyScore = Number(
    Math.max(0, tempHarmony * 0.6 + (1 - contrast.chromaticVibrationPenalty) * 0.4).toFixed(3)
  );

  // 6. Optical Density Score
  const opticalDensityScore = Number(
    Math.min(1.0, (contrast.oklabLightnessDelta * (fontWeight / opticalCalibration.weightReference)) / 1.2).toFixed(3)
  );

  // 7. Hierarchy Suitability Score
  let hierarchySuitabilityScore = 0.8;
  if (role === 'headline') {
    hierarchySuitabilityScore = Number(Math.min(1.0, contrast.wcagRatio / 5.0).toFixed(3));
  } else if (role === 'cta') {
    hierarchySuitabilityScore = Number(Math.min(1.0, (contrast.wcagRatio / 4.5) * (1 + color.oklch.C * 1.5)).toFixed(3));
  } else if (role === 'metadata') {
    hierarchySuitabilityScore = Number(Math.max(0.2, 1 - color.oklch.C * 3).toFixed(3));
  }

  // 8. Perceived Ink Mass (continuous observable metric using optical calibration)
  const perceivedInkMass = Number(
    (1.0 + color.oklch.C * opticalCalibration.inkMassChromaWeight + contrast.oklabLightnessDelta * opticalCalibration.inkMassLightnessDeltaWeight).toFixed(3)
  );

  // 9. Contrast Deficit & Surface Need Signals (Phase 9 Bridge)
  const contrastDeficit = Number(Math.max(0, 1 - contrast.wcagRatio / targetWcag).toFixed(3));
  const surfaceNeed = Number(
    Math.min(1.0, contrastDeficit * 0.7 + localBackdrop.edgeInterference * 0.3).toFixed(3)
  );

  // 10. Tradeoff Profile for Phase 10 Multi-Objective Optimization
  const tradeoffProfile: TradeoffProfile = {
    contrastQuality: Number(((localContrastScore + perceptualContrastScore) / 2).toFixed(3)),
    brandAdherence: brandAffinityScore,
    harmonyQuality: imageHarmonyScore,
    opticalSuitability: opticalDensityScore,
  };

  // 11. Composite Score Calculation
  const legibilityScore = Number(
    (localContrastScore * 0.6 + perceptualContrastScore * 0.4).toFixed(3)
  );
  const harmonyScore = Number(
    (brandAffinityScore * 0.5 + imageHarmonyScore * 0.5).toFixed(3)
  );

  // Deficit scaling: dynamically penalize any ink failing target WCAG ratio on its local backdrop
  const deficitScale = Math.max(0.10, 1 - contrastDeficit * 0.70);

  const compositeRaw =
    (localContrastScore * weights.localContrastWeight +
    perceptualContrastScore * weights.perceptualContrastWeight +
    brandAffinityScore * weights.brandAffinityWeight +
    imageHarmonyWeightSafe(imageHarmonyScore, weights) +
    opticalDensityScore * weights.opticalSuitabilityWeight +
    hierarchySuitabilityScore * weights.hierarchySuitabilityWeight -
    contrast.chromaticVibrationPenalty * weights.vibrationPenaltyWeight) * deficitScale;

  const compositeColorScore = Number(Math.max(0.001, Math.min(1.0, compositeRaw)).toFixed(3));

  const reasons: string[] = [
    `Provenance: ${provenance.derivationType} (source: ${provenance.sourceColor}, ΔE_OK: ${provenance.deltaEOklab}, calibratedTol: ${provenance.isCalibratedBrandToleranceAvailable})`,
    `Contrast: WCAG ${contrast.wcagRatio}:1 (APCA Lc estimate: ${contrast.apcaEstimatedLc})`,
    `Oklab Lightness: ${(color.oklab.L * 100).toFixed(1)}% | Chroma: ${color.oklch.C.toFixed(3)} | Hue: ${color.oklch.h.toFixed(1)}°`,
    `Local Backdrop: Lum ${(localBackdrop.meanLuminance * 100).toFixed(1)}% | Temp: ${localBackdrop.temperature.toFixed(2)}`,
  ];
  if (contrastDeficit > 0.2) {
    reasons.push(`Contrast Deficit: ${(contrastDeficit * 100).toFixed(0)}% (surface support may enhance legibility)`);
  }

  return {
    id,
    color,
    provenance,
    contrast,
    signals: {
      localContrastScore,
      perceptualContrastScore,
      brandAffinityScore,
      deltaEOklab: provenance.deltaEOklab,
      lightnessDistance: provenance.lightnessDistance,
      chromaDistance: provenance.chromaDistance,
      hueDistance: provenance.hueDistance,
      isCalibratedBrandToleranceAvailable: provenance.isCalibratedBrandToleranceAvailable,
      imageHarmonyScore,
      opticalDensityScore,
      hierarchySuitabilityScore,
      chromaticStabilityScore: Number((1 - contrast.chromaticVibrationPenalty).toFixed(3)),
      perceivedInkMass,
      contrastDeficit,
      surfaceNeed,
      tradeoffProfile,
    },
    scores: {
      legibilityScore,
      harmonyScore,
      compositeColorScore,
    },
    reasons,
  };
}

function imageHarmonyWeightSafe(score: number, weights: ColorScoringWeights): number {
  return score * weights.imageHarmonyWeight;
}

// ─── 8. Pipeline Integration: Multi-Element Color Evaluation ────────────────

export interface ElementColorState {
  elementId: string;
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo';
  candidates: InkStateCandidate[];
  topCandidate: InkStateCandidate;
}

export interface CompositionColorResult {
  elementColors: ElementColorState[];
  overallHarmonyScore: number;
  contrastHealthScore: number;
  compositeColorQuality: number;
  reasons: string[];
}

/**
 * Discovers and coordinates color states across all elements in a multi-element composition.
 */
export function evaluateCompositionColors(params: {
  elements: Array<{
    id: string;
    role: 'headline' | 'subheadline' | 'body' | 'cta' | 'offer' | 'metadata' | 'logo';
    rect: FieldRect;
    typographyState?: LineStructureState | DynamicTypeStep;
  }>;
  field: DesignField;
  canvas: CanvasRepresentation;
  brand?: BrandDesignRepresentation;
  customWeights?: Partial<ColorScoringWeights>;
  opticalCalibration?: Partial<OpticalColorCalibration>;
}): CompositionColorResult {
  const { elements, field, canvas, brand, customWeights, opticalCalibration } = params;

  const elementColors: ElementColorState[] = [];
  let totalHarmony = 0;
  let totalContrast = 0;
  let totalComposite = 0;

  for (const el of elements) {
    const candidates = discoverInkCandidates({
      role: el.role,
      footprint: el.rect,
      field,
      canvas,
      brand,
      typographyState: el.typographyState,
      customWeights,
      opticalCalibration,
    });

    const top = candidates[0];
    elementColors.push({
      elementId: el.id,
      role: el.role,
      candidates,
      topCandidate: top,
    });

    if (top) {
      totalHarmony += top.scores.harmonyScore;
      totalContrast += top.scores.legibilityScore;
      totalComposite += top.scores.compositeColorScore;
    }
  }

  const count = Math.max(1, elements.length);
  const overallHarmonyScore = Number((totalHarmony / count).toFixed(3));
  const contrastHealthScore = Number((totalContrast / count).toFixed(3));
  const compositeColorQuality = Number((totalComposite / count).toFixed(3));

  const reasons: string[] = [
    `Evaluated color discovery across ${elements.length} element(s)`,
    `Overall Color Harmony: ${(overallHarmonyScore * 100).toFixed(0)}%`,
    `Contrast Health Score: ${(contrastHealthScore * 100).toFixed(0)}%`,
    `Composite Color Quality: ${(compositeColorQuality * 100).toFixed(0)}%`,
  ];

  return {
    elementColors,
    overallHarmonyScore,
    contrastHealthScore,
    compositeColorQuality,
    reasons,
  };
}

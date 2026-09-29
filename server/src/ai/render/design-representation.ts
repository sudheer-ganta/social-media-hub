import type { FieldRect, ImageField, ToneReading, QuietRect } from './image-field';
import { SPATIAL_OCCUPANCY_CALIBRATION } from './image-field';
import type { BrandProfile, ResolvedCreativeDna as CreativeDna } from '../types';

/**
 * FLOWPOST DYNAMIC DESIGN REPRESENTATION — PHASE 1
 *
 * This module provides the unified, continuous internal representation of:
 *   - CANVAS (dimensions, aspect ratio, safe bounds, coordinate normalization)
 *   - IMAGE (continuous spatial field querying, quietness, saliency, visual axes)
 *   - COPY (semantic role, linguistic tokens, visual importance, hierarchy role)
 *   - BRAND (approved typography rules, color palettes, tone, constraints)
 *   - DESIGN ELEMENTS (common structural object for text, logo, shapes)
 *
 * It acts as the shared foundation for upcoming composition discovery phases.
 * It contains NO hardcoded layout templates, presets, quadrant rules, or fixed percentages.
 */

// ─── 1. Canvas Representation ───────────────────────────────────────────────

export type CanvasOrientation = 'portrait' | 'landscape' | 'square';

export interface CanvasRepresentation {
  width: number;
  height: number;
  aspectRatio: number; // width / height
  shortEdge: number;
  longEdge: number;
  orientation: CanvasOrientation;
  safeBounds: FieldRect; // standard physical margin boundary [0..1]
  
  /** Coordinate conversion helpers */
  normalizePoint(px: number, py: number): { x: number; y: number };
  toPixelsPoint(nx: number, ny: number): { x: number; y: number };
  toPixelsRect(rect: FieldRect): { x: number; y: number; width: number; height: number };
}

export function createCanvasRepresentation(
  width: number,
  height: number,
  safeMarginFraction: number = 0.04
): CanvasRepresentation {
  const safeMargin = Math.max(0.01, Math.min(0.15, safeMarginFraction));
  const aspectRatio = width / (height || 1);
  const orientation: CanvasOrientation =
    aspectRatio > 1.05 ? 'landscape' : aspectRatio < 0.95 ? 'portrait' : 'square';

  return {
    width,
    height,
    aspectRatio,
    shortEdge: Math.min(width, height),
    longEdge: Math.max(width, height),
    orientation,
    safeBounds: {
      x: safeMargin,
      y: safeMargin,
      width: Math.max(0.1, 1 - 2 * safeMargin),
      height: Math.max(0.1, 1 - 2 * safeMargin),
    },
    normalizePoint: (px: number, py: number) => ({
      x: px / width,
      y: py / height,
    }),
    toPixelsPoint: (nx: number, ny: number) => ({
      x: Math.round(nx * width),
      y: Math.round(ny * height),
    }),
    toPixelsRect: (rect: FieldRect) => ({
      x: Math.round(rect.x * width),
      y: Math.round(rect.y * height),
      width: Math.round(rect.width * width),
      height: Math.round(rect.height * height),
    }),
  };
}

// ─── 2. Copy Element Representation ─────────────────────────────────────────

export type CopySemanticRole =
  | 'primary-hook'
  | 'secondary-hook'
  | 'supporting-note'
  | 'cta'
  | 'eyebrow'
  | 'offer-badge'
  | 'disclaimer';

export interface CopyElementRepresentation {
  id: string;
  text: string;
  semanticRole: CopySemanticRole;
  /** 1 = highest visual priority (e.g. Lead Headline), 2 = secondary, 3+ = supporting */
  priority: number;
  /** Visual importance weight 0..1 */
  visualImportance: number;
  charCount: number;
  wordCount: number;
  words: string[];
  /** Estimated relative visual density based on character and syllable mass */
  visualDensity: number;
  /** Phase 2: Rich linguistic & geometric visual object */
  visualObject?: import('./copy-model').DynamicCopyVisualObject;
}

export function createCopyElement(
  id: string,
  text: string,
  semanticRole: CopySemanticRole,
  priority: number = 1
): CopyElementRepresentation {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const charCount = trimmed.length;
  const wordCount = words.length;

  // Normalized visual importance based on role & priority
  const importanceMap: Record<CopySemanticRole, number> = {
    'primary-hook': 1.0,
    'offer-badge': 0.85,
    'secondary-hook': 0.7,
    'cta': 0.65,
    'eyebrow': 0.5,
    'supporting-note': 0.4,
    'disclaimer': 0.2,
  };
  const baseImportance = importanceMap[semanticRole] ?? 0.5;
  const visualImportance = Math.max(0.1, Math.min(1.0, baseImportance / Math.max(1, priority * 0.8)));

  // Estimate density (capitalization, special chars, density of characters per word)
  const upperCount = (trimmed.match(/[A-Z]/g) || []).length;
  const isAllUpper = charCount > 0 && upperCount === charCount;
  const visualDensity = Number(
    ((charCount / Math.max(1, wordCount)) * (isAllUpper ? 1.2 : 1.0)).toFixed(2)
  );

  return {
    id,
    text: trimmed,
    semanticRole,
    priority,
    visualImportance,
    charCount,
    wordCount,
    words,
    visualDensity,
  };
}

// ─── 3. Brand Design Representation ─────────────────────────────────────────

export interface BrandDesignRepresentation {
  brandName: string;
  brandTone?: string;
  primaryColors: string[];
  secondaryColors: string[];
  neutralColors: string[];
  primaryFonts?: string[];
  approvedFonts?: {
    headline?: string[];
    body?: string[];
    accent?: string[];
  };
  logoAsset?: {
    url?: string;
    data?: string;
    mimeType?: string;
    aspectRatio?: number;
  };
  logo?: {
    aspectRatio?: number;
    detectedColor?: string;
    recommendedPlacement?: string;
    assetUrl?: string;
    mimeType?: string;
    data?: string;
  };
  constraints: string[];
}

export function createBrandDesignRepresentation(params: {
  brandProfile?: any;
  creativeDna?: any;
  logoAssetUrl?: string;
  logoData?: string;
  approvedFonts?: {
    headline?: string[];
    body?: string[];
    accent?: string[];
  };
  colors?: string[];
  logo?: {
    aspectRatio?: number;
    detectedColor?: string;
    recommendedPlacement?: string;
  };
}): BrandDesignRepresentation {
  const brandName = params.brandProfile?.name || params.brandProfile?.brand?.name || 'Brand';
  const brandTone = params.brandProfile?.tone || params.brandProfile?.brand?.tone || params.creativeDna?.mood;
  const brandColors = params.colors || params.creativeDna?.brandColors || ['#000000', '#ffffff'];

  // Categorize colors
  const primaryColors = brandColors.slice(0, 2);
  const secondaryColors = brandColors.slice(2);
  const neutralColors = ['#ffffff', '#000000', '#faf6f0', '#18181b', '#f4f4f5', '#71717a'];

  return {
    brandName,
    brandTone,
    primaryColors,
    secondaryColors,
    neutralColors,
    approvedFonts: params.approvedFonts,
    logoAsset: params.logoAssetUrl || params.logoData ? {
      url: params.logoAssetUrl,
      data: params.logoData,
    } : undefined,
    constraints: params.brandProfile?.wordsToAvoid || [],
  };
}

// ─── 4. Continuous Design Field ─────────────────────────────────────────────

export interface ContinuousPointSample {
  x: number;
  y: number;
  luminance: number; // 0..1
  detailEnergy: number; // 0..1
  saliency: number; // 0..1
  occupancy: number; // 0..1 continuous spatial occupancy
  isInsideSubject: boolean;
  distanceToFocalCentroid: number;
}

export interface RegionEvaluation {
  rect: FieldRect;
  meanLuminance: number;
  luminanceStdDev: number;
  detailEnergy: number; // busyness
  quietness: number; // 0..1 (1 = flat peaceful space)
  occupancy: number; // 0..1 mean spatial occupancy in rect
  occupancyMass: number; // integrated visual mass
  subjectOcclusion: number; // 0..1 continuous share of subject visual mass covered
  focalDistance: number; // distance from center of rect to focal centroid
  verdict: ToneReading['verdict'];
  availableSpatialAffordance: number; // combined score of quietness & non-critical occlusion
}

export interface VisualAxis {
  orientation: 'horizontal' | 'vertical';
  position: number; // normalized coordinate [0..1]
  strength: number; // 0..1 importance weight
  source: 'canvas-margin' | 'subject-edge' | 'focal-point' | 'horizon' | 'thirds';
}

export interface DesignField {
  /** The underlying raw ImageField for backward compatibility */
  rawImageField: ImageField;
  
  /** Continuous Spatial Occupancy Field (32x32 tiles in [0, 1]) */
  occupancyGrid: Float32Array;

  /** Bounding box of the primary subject (legacy/diagnostic) */
  subjectBox: FieldRect;
  
  /** Energy-weighted focal center of the visual */
  focalCentroid: { x: number; y: number };
  
  /** Quiet candidate regions sorted best-first */
  quietRects: QuietRect[];
  
  /** Sample continuous properties at an arbitrary normalized point (x, y) */
  sample(x: number, y: number): ContinuousPointSample;
  
  /** Evaluate continuous properties under an arbitrary candidate bounding box */
  evaluateRegion(rect: FieldRect): RegionEvaluation;

  /** Mean spatial occupancy in normalized rect in [0, 1] */
  occupancyAt(rect: FieldRect): number;

  /** Total integrated occupancy mass under normalized rect */
  occupancyMass(rect: FieldRect): number;
  
  /** Discover natural visual alignment axes from image geometry and canvas boundaries */
  getVisualAxes(canvas?: CanvasRepresentation): VisualAxis[];
}

/** Bilinear interpolation over a 2D Float32Array grid */
function sampleBilinear(grid: Float32Array, cols: number, rows: number, nx: number, ny: number): number {
  const x = Math.max(0, Math.min(1, nx)) * (cols - 1);
  const y = Math.max(0, Math.min(1, ny)) * (rows - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);

  const fx = x - x0;
  const fy = y - y0;

  const v00 = grid[y0 * cols + x0];
  const v10 = grid[y0 * cols + x1];
  const v01 = grid[y1 * cols + x0];
  const v11 = grid[y1 * cols + x1];

  const top = v00 * (1 - fx) + v10 * fx;
  const bottom = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bottom * fy;
}

export function createDesignField(imageField: ImageField): DesignField {
  const { cols, rows, luminance, energy } = imageField.grid;
  const occupancyGrid = imageField.occupancyGrid || imageField.grid.occupancy || energy;
  const subject = imageField.subjectBox;
  const focal = imageField.focalCentroid;

  const sample = (nx: number, ny: number): ContinuousPointSample => {
    const clampX = Math.max(0, Math.min(1, nx));
    const clampY = Math.max(0, Math.min(1, ny));

    const lum = sampleBilinear(luminance, cols, rows, clampX, clampY);
    const eng = sampleBilinear(energy, cols, rows, clampX, clampY);
    const occ = sampleBilinear(occupancyGrid, cols, rows, clampX, clampY);

    const isInsideSubject = occ >= SPATIAL_OCCUPANCY_CALIBRATION.insideSubjectPointThreshold || (
      clampX >= subject.x &&
      clampX <= subject.x + subject.width &&
      clampY >= subject.y &&
      clampY <= subject.y + subject.height
    );

    const dx = clampX - focal.x;
    const dy = clampY - focal.y;
    const distanceToFocalCentroid = Math.hypot(dx, dy);

    // Continuous point saliency from energy and occupancy
    const saliency = Number(Math.max(eng, occ * SPATIAL_OCCUPANCY_CALIBRATION.signalMultipliers.peakSaliency).toFixed(4));

    return {
      x: clampX,
      y: clampY,
      luminance: Number(lum.toFixed(4)),
      detailEnergy: Number(eng.toFixed(4)),
      saliency,
      occupancy: Number(occ.toFixed(4)),
      isInsideSubject,
      distanceToFocalCentroid: Number(distanceToFocalCentroid.toFixed(4)),
    };
  };

  const occupancyAt = (rect: FieldRect): number => {
    return imageField.occupancyAt ? imageField.occupancyAt(rect) : imageField.occlusionOf(rect);
  };

  const occupancyMass = (rect: FieldRect): number => {
    return imageField.occupancyMass ? imageField.occupancyMass(rect) : imageField.occlusionOf(rect);
  };

  const evaluateRegion = (rect: FieldRect): RegionEvaluation => {
    const tone = imageField.toneAt(rect);
    const busyness = imageField.busynessAt(rect);
    const occlusion = imageField.occlusionOf(rect);
    const occ = occupancyAt(rect);
    const occMass = occupancyMass(rect);

    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;
    const focalDistance = Math.hypot(rectCenterX - focal.x, rectCenterY - focal.y);

    // Quietness formula: high when busyness is low, variance is low, and occupancy is low
    const quietness = Number(
      (Math.max(0, 1 - busyness) * (1 - Math.min(1, tone.stdDev * 1.6)) * (1 - occ * 0.8)).toFixed(4)
    );

    // Spatial affordance: how welcoming this space is for typography
    const availableSpatialAffordance = Number(
      Math.max(0, quietness * 0.7 + (1 - occ) * 0.3).toFixed(4)
    );

    return {
      rect,
      meanLuminance: Number(tone.meanLuminance.toFixed(4)),
      luminanceStdDev: Number(tone.stdDev.toFixed(4)),
      detailEnergy: Number(busyness.toFixed(4)),
      quietness,
      occupancy: Number(occ.toFixed(4)),
      occupancyMass: Number(occMass.toFixed(4)),
      subjectOcclusion: Number(occlusion.toFixed(4)),
      focalDistance: Number(focalDistance.toFixed(4)),
      verdict: tone.verdict,
      availableSpatialAffordance,
    };
  };

  const getVisualAxes = (canvas?: CanvasRepresentation): VisualAxis[] => {
    const axes: VisualAxis[] = [];

    // 1. Canvas safe boundary axes
    const margin = canvas?.safeBounds.x ?? 0.04;
    axes.push({ orientation: 'vertical', position: margin, strength: 0.9, source: 'canvas-margin' });
    axes.push({ orientation: 'vertical', position: 1 - margin, strength: 0.9, source: 'canvas-margin' });
    axes.push({ orientation: 'horizontal', position: margin, strength: 0.85, source: 'canvas-margin' });
    axes.push({ orientation: 'horizontal', position: 1 - margin, strength: 0.85, source: 'canvas-margin' });

    // 2. Subject edge axes (if subject exists and is distinct)
    if (subject.width > 0.05 && subject.height > 0.05) {
      axes.push({ orientation: 'vertical', position: subject.x, strength: 0.8, source: 'subject-edge' });
      axes.push({ orientation: 'vertical', position: subject.x + subject.width, strength: 0.8, source: 'subject-edge' });
      axes.push({ orientation: 'horizontal', position: subject.y, strength: 0.75, source: 'subject-edge' });
      axes.push({ orientation: 'horizontal', position: subject.y + subject.height, strength: 0.75, source: 'subject-edge' });
    }

    // 3. Focal centroid axes
    axes.push({ orientation: 'vertical', position: focal.x, strength: 0.7, source: 'focal-point' });
    axes.push({ orientation: 'horizontal', position: focal.y, strength: 0.7, source: 'focal-point' });

    // 4. Classical thirds axes
    axes.push({ orientation: 'vertical', position: 0.333, strength: 0.5, source: 'thirds' });
    axes.push({ orientation: 'vertical', position: 0.667, strength: 0.5, source: 'thirds' });
    axes.push({ orientation: 'horizontal', position: 0.333, strength: 0.5, source: 'thirds' });
    axes.push({ orientation: 'horizontal', position: 0.667, strength: 0.5, source: 'thirds' });

    return axes;
  };

  return {
    rawImageField: imageField,
    occupancyGrid,
    subjectBox: subject,
    focalCentroid: focal,
    quietRects: imageField.quietRects,
    sample,
    evaluateRegion,
    occupancyAt,
    occupancyMass,
    getVisualAxes,
  };
}

// ─── 5. Common Design Element Representation ────────────────────────────────

export type ElementKind = 'copy' | 'logo' | 'product' | 'shape' | 'visual';

export interface ElementRelationship {
  targetElementId: string;
  relationshipType: 'align-axis' | 'avoid-overlap' | 'proximity-group' | 'stacked-below' | 'counter-balance';
  strength: number; // 0..1
}

export interface DesignElementRepresentation {
  id: string;
  kind: ElementKind;
  semanticRole?: string;
  geometry: FieldRect; // normalized coordinates [0..1]
  zIndex: number;
  opacity: number;
  visualWeight: number; // 0..1 estimated visual mass
  relationships: ElementRelationship[];
}

export function createDesignElement(
  id: string,
  kind: ElementKind,
  geometry: FieldRect,
  semanticRole?: string
): DesignElementRepresentation {
  return {
    id,
    kind,
    semanticRole,
    geometry,
    zIndex: 1,
    opacity: 1.0,
    visualWeight: geometry.width * geometry.height,
    relationships: [],
  };
}

// ─── 6. Unified Dynamic Design Context ──────────────────────────────────────

export interface DynamicDesignContext {
  canvas: CanvasRepresentation;
  field: DesignField;
  copyElements: CopyElementRepresentation[];
  brand: BrandDesignRepresentation;
  elements: DesignElementRepresentation[];
  metadata: Record<string, unknown>;
}

export function createDynamicDesignContext(params: {
  canvas: CanvasRepresentation;
  field: DesignField;
  copyElements: CopyElementRepresentation[];
  brand: BrandDesignRepresentation;
  initialElements?: DesignElementRepresentation[];
  metadata?: Record<string, unknown>;
}): DynamicDesignContext {
  return {
    canvas: params.canvas,
    field: params.field,
    copyElements: params.copyElements,
    brand: params.brand,
    elements: params.initialElements ?? [],
    metadata: params.metadata ?? {},
  };
}

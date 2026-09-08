import type { CompositionArchetype, GraphicDesignConcept, CompositionIntent, ImageCapabilities, ReferenceDesignRecipe } from '../types';
import type { BaseFontStack } from '../typography/font-selector';
import { fitText, type CtaSpec, type TextBlockSpec } from './primitives';

/**
 * The LayoutPlan builder — recipe in, composition out. This replaces the old
 * fixed-template picker: instead of choosing one of four skeletons, every
 * recipe axis moves an actual layout parameter (image placement, text anchor,
 * footer treatment, logo behaviour, typography, decoration), so two different
 * reference sets produce two genuinely different compositions rather than the
 * same skeleton re-coloured.
 *
 * Geometry is computed in pixels (text needs real sizes to flow) but every
 * block also carries a normalized 0–1 rect — that is what validation checks
 * and what makes the plan portable across platform canvas sizes.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrandPalette {
  ink: string;
  paper: string;
  accent: string;
}

/** What the direction authored, reduced to render-ready strings. */
export interface ContentInput {
  headline?: string;
  support?: string;
  /** True when `support` is an interaction instruction — rendered as a badge/italic line, not plain copy. */
  supportIsInteraction?: boolean;
  brandMessage?: string;
  secondaryInfo?: string;
  cta?: string;
  hasLogo: boolean;
  eventBadge?: string;
}

export type TextRole = 'headline' | 'support' | 'brandMessage' | 'secondaryInfo';

export type PlannedBlock =
  | { kind: 'scrim'; rect: Rect; direction: 'up' | 'down'; maxOpacity: number; color: string }
  | { kind: 'footer'; rect: Rect; style: 'torn-paper' | 'solid-band' | 'hairline'; fill: string }
  | { kind: 'panel'; rect: Rect; fill: string; stroke?: string; strokeWidth?: number; radius?: number; rotationDeg?: number; offsetShadow?: boolean }
  | { kind: 'text'; role: TextRole; rect: Rect; spec: TextBlockSpec }
  | { kind: 'badge'; rect: Rect; text: string; fontSize: number; fontFamily: string; fill: string; textFill: string; shapeLanguage?: 'organic' | 'geometric' | 'editorial-rules' | 'none'; rotationDeg?: number }
  | { kind: 'cta'; rect: Rect; spec: CtaSpec }
  | { kind: 'logo'; rect: Rect; opacity: number }
  | { kind: 'underline'; rect: Rect; stroke: string; strokeWidth: number; rotationDeg?: number }
  | { kind: 'divider'; rect: Rect; stroke: string; opacity: number }
  | { kind: 'border'; style: 'hairline' | 'thick' | 'inset-frame'; stroke: string }
  | { kind: 'texture'; texture: 'paper-grain' | 'film-grain' | 'halftone' | 'noise' }
  | { kind: 'tape'; rect: Rect; rotationDeg?: number; color?: string; opacity?: number }
  | { kind: 'stamp'; rect: Rect; text: string; rotationDeg?: number; borderStyle?: 'dashed' | 'solid' | 'circle' | 'double'; fill?: string; stroke?: string; fontFamily?: string; fontSize?: number }
  | { kind: 'handwritten-note'; rect: Rect; text: string; fontFamily?: string; rotationDeg?: number; fill?: string; fontSize?: number };

export interface LayoutPlan {
  canvas: { width: number; height: number };
  /** The base the whole composition sits on — visible whenever the image doesn't cover the full canvas. */
  paper: string;
  /** Where the generated visual goes, normalized. */
  imageRect: Rect;
  /** Optional slight rotation of the photographic element for physical/tactile imperfection (±1–3 deg). */
  imageRotationDeg?: number;
  /** Whether the image has an offset shadow backing panel. */
  imageShadow?: boolean;
  blocks: PlannedBlock[];
  /** Human-readable one-liner for logs/QA — which structural choices this plan made. */
  structure: string;
  /** The deterministic composition archetype that produced this layout geometry. */
  archetype?: CompositionArchetype;
  /** The graphic design concept guiding this layout. */
  concept?: GraphicDesignConcept;
  /** The bold art-direction decisions in this creative. */
  artDirectionDecisions?: string[];
}

// ─── Design System Defaults ──────────────────────────────────────────────────

export const DESIGN_SYSTEM_DEFAULTS = {
  inkColor: '#1a1a1a',
  paperColor: '#f7f4ee',
  accentColor: '#1a1a1a',
  lightScrimColor: '#ffffff',
  darkScrimColor: '#000000',
  lightBackdrop: '#f2f2f2',
  darkBackdrop: '#222222',
  fallbackDarkText: '#1c1917',
  fallbackLightText: '#ffffff',
  bodyCharWidth: 0.52,
  wcagTargetRatio: 4.5,
  luminanceThreshold: 0.45,
  inkMaxLuminance: 0.22,
  paperMinLuminance: 0.60,
  accentMinContrast: 0.14,
};

export const LAYOUT_CONFIG = {
  spacing: {
    tight: 0.05,
    normal: 0.065,
    airy: 0.085,
    gapMultiplier: 0.45,
  },
  density: {
    minimal: 1.06,
    normal: 1.0,
    dense: 0.9,
  },
  headlineScale: {
    oversized: 1.15,
    normal: 1.0,
    restrained: 0.88,
    maxHeightRatio: 0.28,
  },
  headlineBaseSize: {
    fullBleedCentered: 0.072,
    fullBleedLeft: 0.064,
    framedOrInset: 0.058,
  },
  textSizes: {
    supportMultiplier: 0.026,
    brandMessageMultiplier: 0.025,
    secondaryInfoMultiplier: 0.02,
    ctaFontSizeMultiplier: 0.021,
    ctaHeightMultiplier: 2.4,
  },
  footer: {
    paddingMultiplier: 0.55,
    logoSlotHeightRatio: 0.11,
    minHeightRatio: 0.13,
    maxHeightRatio: 0.26,
  },
  logo: {
    cornerSizeRatio: 0.08,
    watermarkSizeRatio: 0.06,
    watermarkOpacity: 0.5,
  },
  badge: {
    fontSizeMultiplier: 0.016,
    heightFontSizeRatio: 2.0,
    paddingCharRatio: 0.9,
  },
  scrim: {
    lightOpacity: 0.45,
    darkOpacity: 0.58,
  },
  collisionThreshold: 0.0005,
};

// ─── Typography resolution ──────────────────────────────────────────────────
//
// The headline/body font stack is no longer a fixed 5-entry table keyed by
// RecipeTypographyFamily — it comes from the automatic typography engine
// (server/src/ai/typography/font-selector.ts), which scores FlowPost's
// curated Google Fonts catalog against the full generation context (style,
// brand, industry, copy, language) and returns real font-file-backed
// families instead of CSS fallback-stack names. See `LayoutPlanInput.typography`.

const BODY_CHAR_WIDTH = DESIGN_SYSTEM_DEFAULTS.bodyCharWidth;

// ─── Color Helpers & Dynamic Contrast Engine ───────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (val: number) => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function contrastRatio(colorA: string, colorB: string): number {
  const l1 = luminance(colorA);
  const l2 = luminance(colorB);
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

/**
 * Dynamically adjusts a textColor's lightness to guarantee it meets WCAG contrast requirements
 * against a background color, preserving the color's hue and saturation.
 */
export function adjustContrast(textColor: string, bgColor: string, targetRatio = DESIGN_SYSTEM_DEFAULTS.wcagTargetRatio): string {
  if (!/^#[0-9a-f]{6}$/i.test(textColor) || !/^#[0-9a-f]{6}$/i.test(bgColor)) {
    return textColor;
  }
  const ratio = contrastRatio(textColor, bgColor);
  if (ratio >= targetRatio) return textColor;

  const bgLum = luminance(bgColor);
  const isBgLight = bgLum > DESIGN_SYSTEM_DEFAULTS.luminanceThreshold;

  const { r, g, b } = hexToRgb(textColor);
  const { h, s, l } = rgbToHsl(r, g, b);

  let currentL = l;
  let bestColor = textColor;

  if (isBgLight) {
    // Darken text color for light backgrounds
    for (let step = 1; step <= 25; step++) {
      currentL = Math.max(0, l - step * (l / 25));
      const testColor = hslToHex(h, s, currentL);
      if (contrastRatio(testColor, bgColor) >= targetRatio) {
        return testColor;
      }
      bestColor = testColor;
    }
  } else {
    // Lighten text color for dark backgrounds
    for (let step = 1; step <= 25; step++) {
      currentL = Math.min(100, l + step * ((100 - l) / 25));
      const testColor = hslToHex(h, s, currentL);
      if (contrastRatio(testColor, bgColor) >= targetRatio) {
        return testColor;
      }
      bestColor = testColor;
    }
  }

  // Fallback if HSL shift wasn't enough
  return isBgLight ? DESIGN_SYSTEM_DEFAULTS.fallbackDarkText : DESIGN_SYSTEM_DEFAULTS.fallbackLightText;
}

// ─── Palette resolution ─────────────────────────────────────────────────────

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const NEUTRAL: BrandPalette = { ink: DESIGN_SYSTEM_DEFAULTS.inkColor, paper: DESIGN_SYSTEM_DEFAULTS.paperColor, accent: DESIGN_SYSTEM_DEFAULTS.accentColor };

function saturation(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
}

/**
 * Colour comes from the client, never from a FlowPost default. Priority
 * mirrors the DNA layers: brand colours always win — they're the member's
 * explicit identity, and the first one stays the accent. Next the recipe's
 * reference palette (the member's own uploaded taste), then the direction's
 * campaign palette — derived per-campaign from brand + occasion + product +
 * concept. Paper comes from a source's lightest, ink from its darkest,
 * accent from its most SATURATED entry (the first entry is usually the
 * background cream, which as an accent would paint invisible CTAs). The
 * grey/cream NEUTRAL is a legibility floor of last resort, only reachable
 * when every layer above supplied nothing.
 */
export function resolvePalette(
  brandColors: string[],
  recipePalette: string[],
  directionPalette: string[] = [],
): BrandPalette {
  const pick = (colors: string[], isRecipe: boolean): BrandPalette | null => {
    const valid = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c.trim()));
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => luminance(a) - luminance(b));

    // When a multi-color recipe palette is provided (e.g. from Style DNA [paper, ink, accent]):
    if (isRecipe && valid.length >= 2) {
      const paper = valid[0];
      let ink = valid[1];
      if (Math.abs(luminance(ink) - luminance(paper)) < 0.25) {
        ink = luminance(paper) < 0.45 ? sorted[sorted.length - 1] : sorted[0];
      }
      const accent = valid.length >= 3 ? valid[2] : sorted[0];
      return { ink, paper, accent };
    }

    if (valid.length === 1) {
      const ink = luminance(valid[0]) < DESIGN_SYSTEM_DEFAULTS.inkMaxLuminance ? valid[0] : NEUTRAL.ink;
      const paper = luminance(valid[0]) > DESIGN_SYSTEM_DEFAULTS.paperMinLuminance ? valid[0] : NEUTRAL.paper;
      return { ink, paper, accent: valid[0] };
    }

    // Direction or multi-brand palette:
    // Paper from lightest, ink from darkest, accent from most saturated
    const ink = sorted[0];
    const paper = sorted[sorted.length - 1];
    const accent = [...valid].sort((a, b) => saturation(b) - saturation(a))[0] ?? valid[0];
    return { ink, paper, accent };
  };

  const brandPick = pick(brandColors, false);
  if (brandPick) {
    return {
      ...brandPick,
      accent: brandColors[0],
      paper: brandColors.length === 1 ? NEUTRAL.paper : brandPick.paper,
      ink: brandColors.length === 1 ? NEUTRAL.ink : brandPick.ink,
    };
  }

  return pick(recipePalette, true) ?? pick(directionPalette, false) ?? NEUTRAL;
}

/** An accent that would vanish against this fill falls back to ink — a CTA must never be invisible. */
function visibleAccent(palette: BrandPalette, against: string): string {
  return Math.abs(luminance(palette.accent) - luminance(against)) < DESIGN_SYSTEM_DEFAULTS.accentMinContrast ? palette.ink : palette.accent;
}

/** Legible text colour on a given fill. */
function onColor(fill: string, palette: BrandPalette): string {
  const candidate = [palette.ink, DESIGN_SYSTEM_DEFAULTS.fallbackDarkText, DESIGN_SYSTEM_DEFAULTS.fallbackLightText]
    .sort((a, b) => contrastRatio(b, fill) - contrastRatio(a, fill))[0];
  return adjustContrast(candidate, fill, DESIGN_SYSTEM_DEFAULTS.wcagTargetRatio);
}

/**
 * Dynamically parses the typography prose from the design recipe (e.g. "tight leading", "wide tracking")
 * and returns customized multipliers/offsets for line-height and letter-spacing.
 */
function parseTypographyAdjustments(
  prose: string,
  baseLineHeight: number,
  baseLetterSpacing = 0,
): { lineHeightMult: number; letterSpacing?: number } {
  let lineHeightMult = baseLineHeight;
  let letterSpacing = baseLetterSpacing;

  const clean = prose.toLowerCase();

  // Dynamic Line Height Adjustment
  if (/\b(tight|condensed|compressed) (leading|line-?height)\b/.test(clean)) {
    lineHeightMult = Math.max(0.9, baseLineHeight * 0.88);
  } else if (/\b(loose|airy|spacious|generous) (leading|line-?height)\b/.test(clean)) {
    lineHeightMult = Math.min(1.45, baseLineHeight * 1.15);
  }

  // Dynamic Letter Spacing (Tracking) Adjustment
  if (/\b(wide|airy|generous|loose) (tracking|letter-?spacing|spacing)\b/.test(clean)) {
    letterSpacing = baseLetterSpacing ? baseLetterSpacing + 1.2 : 1.5;
  } else if (/\b(tight|compressed|condensed) (tracking|letter-?spacing|spacing)\b/.test(clean)) {
    letterSpacing = baseLetterSpacing ? baseLetterSpacing - 0.6 : -0.8;
  }

  return { lineHeightMult, letterSpacing };
}

// ─── Plan building ──────────────────────────────────────────────────────────

export interface LayoutPlanInput {
  width: number;
  height: number;
  recipe: ReferenceDesignRecipe;
  content: ContentInput;
  palette: BrandPalette;
  aspectRatio: string;
  /**
   * Measured brightness of the visual where full-bleed copy will sit. 'light'
   * flips the treatment — ink text on a pale scrim instead of white-on-dark,
   * because a grey wash over a bright photo reads as dirt, not design.
   */
  copyZoneTone?: 'light' | 'dark';
  /** The automatic typography engine's headline/body stack — see font-selector.ts. */
  typography: BaseFontStack;
  /** Accent font for the interactive-support badge, when the style profile offered one. */
  accentFontFamily?: string;
  /** The deterministic composition archetype driving layout geometry. */
  compositionArchetype?: CompositionArchetype;
  /** Image capabilities, e.g. whether transparency/cutout is available. */
  capabilities?: ImageCapabilities;
  /** Graphic design concept defining the primary visual idea. */
  graphicConcept?: GraphicDesignConcept;
  /** Dynamic composition intent derived from the concept and Style DNA. */
  compositionIntent?: CompositionIntent;
  /** Optional deterministic seed for layout variations within the same archetype. */
  seed?: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

interface StackItem {
  height: number;
  gapAfter: number;
  place: (topY: number) => void;
}

interface LayoutPlanCtx {
  w: number;
  h: number;
  m: number;
  gap: number;
  bottomSafe: number;
  norm: (x: number, y: number, bw: number, bh: number) => Rect;
  fonts: {
    headline: string;
    body: string;
    headlineWeight: number;
    bodyWeight: number;
    headlineCharWidth: number;
    lineHeightMult: number;
    letterSpacing?: number;
    headlineLineHeight: number;
    headlineLetterSpacing?: number;
    supportLineHeight: number;
    supportLetterSpacing?: number;
  };
  characterScale: number;
  densityScale: number;
  headlineSize: number;
  headlineMaxLines: number;
  headlineRotation: number;
  headlineUpper: boolean;
  supportUpper: boolean;
  supportSize: number;
  brandMsgSize: number;
  secondarySize: number;
  ctaFontSize: number;
  ctaH: number;
  tone: 'light' | 'dark';
  concept: GraphicDesignConcept;
}

function placeArchetypeLogo(
  w: number,
  h: number,
  m: number,
  bottomSafe: number,
  recipe: ReferenceDesignRecipe,
  blocks: PlannedBlock[],
  norm: (x: number, y: number, bw: number, bh: number) => Rect,
  preferredCorner: 'top-right' | 'top-left' | 'bottom-right' = 'top-right',
) {
  const size = w * LAYOUT_CONFIG.logo.cornerSizeRatio;
  const candidates =
    preferredCorner === 'top-right'
      ? [
          { x: w - m - size, y: m * 0.8 },
          { x: m, y: m * 0.8 },
          { x: w - m - size, y: h - m - size - bottomSafe },
          { x: m, y: h - m - size - bottomSafe },
        ]
      : [
          { x: m, y: m * 0.8 },
          { x: w - m - size, y: m * 0.8 },
          { x: m, y: h - m - size - bottomSafe },
          { x: w - m - size, y: h - m - size - bottomSafe },
        ];

  const occupied = blocks.filter((b): b is Extract<PlannedBlock, { rect: Rect }> => 'rect' in b && SOLID_KINDS.has(b.kind));
  const spot = candidates.find((c) => {
    const rect = norm(c.x, c.y, size, size);
    return occupied.every((b) => overlapArea(rect, b.rect) <= LAYOUT_CONFIG.collisionThreshold);
  }) ?? candidates[0];

  blocks.push({ kind: 'logo', rect: norm(spot.x, spot.y, size, size), opacity: 1 });
}

/**
 * Resolves or synthesizes a GraphicDesignConcept.
 * If input.graphicConcept was provided by the AI Creative Director, honors it.
 * Otherwise, synthesizes an art-directed concept based on archetype and style.
 */
export function resolveGraphicDesignConcept(input: LayoutPlanInput): GraphicDesignConcept {
  if (input.graphicConcept) {
    return {
      ...input.graphicConcept,
      elementsToOmit: input.graphicConcept.elementsToOmit ?? [],
      graphicDevices: input.graphicConcept.graphicDevices ?? [],
    };
  }

  const archetype = input.compositionArchetype ?? input.recipe.compositionArchetype ?? 'FULL_BLEED_TYPE';

  switch (archetype) {
    case 'TYPOGRAPHIC_POSTER':
      return {
        conceptName: 'Monumental Type & Tactile Subject',
        visualIdea: 'Oversized, sculptural typography dominates the poster while photography acts as a small tactile artifact held with tape.',
        hero: 'typography',
        imageRole: 'small-tactile-object',
        firstRead: 'The monumental headline',
        typeBehavior: 'the dominant sculptural object on the canvas',
        imageBehavior: 'a small tactile artifact held against the type',
        hierarchyStrategy: 'extreme contrast — the headline dwarfs everything else',
        compositionStrategy: 'typographic-sculpture',
        intentionalImperfection: ['slight image tilt', 'washi tape', 'word offsets'],
        graphicDevices: ['tape', 'stamp'],
        elementsToOmit: ['cta', 'divider', 'footer'],
      };
    case 'COLLAGE_LAYERED':
      return {
        conceptName: 'Raw Kitchen Noticeboard',
        visualIdea: 'Layered collage of physical paper fragments, tilted photograph held with tape, postal ink stamp, and annotations.',
        hero: 'graphic-element',
        imageRole: 'small-tactile-object',
        firstRead: 'The layered paper collage',
        typeBehavior: 'stacked words set as one of the pasted paper layers',
        imageBehavior: 'a tilted photograph taped among the fragments',
        hierarchyStrategy: 'layered — depth carries the reading order, not scale alone',
        compositionStrategy: 'physical-collage',
        intentionalImperfection: ['offset paper layers', 'slight rotation', 'tape', 'stamp', 'rough underline'],
        graphicDevices: ['tape', 'stamp', 'handwritten-note', 'offset-panel'],
        elementsToOmit: ['cta', 'divider', 'footer'],
      };
    case 'NEGATIVE_SPACE':
      return {
        conceptName: 'Radical White Space',
        visualIdea: 'A deliberate, vast field of empty paper space where a small off-center photograph and delicate type create intense focus.',
        hero: 'whitespace',
        imageRole: 'offset-crop',
        firstRead: 'The emptiness itself',
        typeBehavior: 'restrained footnote-scale type at the edge of the field',
        imageBehavior: 'a small off-centre crop the emptiness points at',
        hierarchyStrategy: 'extreme contrast — almost nothing competes with the void',
        compositionStrategy: 'negative-space-field',
        intentionalImperfection: ['asymmetric placement', 'generous breathing room'],
        graphicDevices: [],
        elementsToOmit: ['cta', 'divider', 'footer', 'description'],
      };
    case 'EDITORIAL_OVERLAP':
      return {
        conceptName: 'Boundary Crosscut',
        visualIdea: 'Deliberate tension where typography crosses the boundary of an edge-bleeding photograph.',
        hero: 'typography',
        imageRole: 'full-bleed',
        firstRead: 'Type crossing the photograph',
        typeBehavior: 'kinetic — letterforms cross the boundary of the image',
        imageBehavior: 'bleeds off the canvas edge beneath the type',
        spatialRelationship: 'typography crosses into the photograph rather than sitting beside it',
        hierarchyStrategy: 'the headline dominates; the image is the surface it crosses',
        compositionStrategy: 'boundary-crossover',
        intentionalImperfection: ['asymmetric margins', 'boundary slice'],
        graphicDevices: ['rough-underline'],
        elementsToOmit: ['divider', 'footer'],
      };
    case 'FULL_BLEED_TYPE':
      return {
        conceptName: 'Monumental Integrated Bleed',
        visualIdea: 'Full-canvas imagery with monumental typography integrated directly into the composition.',
        hero: 'image',
        imageRole: 'full-bleed',
        firstRead: 'The full-canvas image with type set into it',
        typeBehavior: 'monumental, integrated directly into the picture plane',
        imageBehavior: 'the ground the whole composition sits on',
        hierarchyStrategy: 'extreme contrast between the display type and everything smaller',
        compositionStrategy: 'asymmetric-tension',
        elementsToOmit: ['divider', 'footer'],
      };
    case 'PRODUCT_CUTOUT':
      return {
        conceptName: 'Floating Cutout Focus',
        visualIdea: 'Isolated hero subject floating on an offset backdrop panel with rotated stamp badge.',
        hero: 'image',
        imageRole: 'floating-fragment',
        firstRead: 'The isolated subject',
        imageBehavior: 'an isolated cutout floating clear of its backdrop',
        hierarchyStrategy: 'the subject dominates; everything else is annotation',
        graphicDevices: ['stamp'],
        elementsToOmit: ['divider', 'footer'],
      };
    case 'ASYMMETRIC_GRID':
      return {
        conceptName: 'Editorial Folio Column',
        visualIdea: 'Modern asymmetric two-column tension with structured gutters and folio detail.',
        hero: 'typography',
        imageRole: 'offset-crop',
        firstRead: 'The folio headline',
        typeBehavior: 'set to a structured column with editorial folio detail',
        imageBehavior: 'an offset crop answering the type across the gutter',
        hierarchyStrategy: 'layered — the grid carries the reading order',
        compositionStrategy: 'asymmetric-tension',
        elementsToOmit: ['footer'],
      };
    case 'SPLIT_COMPOSITION':
      return {
        conceptName: 'Graphic Color Block Tension',
        visualIdea: 'High-contrast graphic color block dividing the canvas with bold typographic weight.',
        hero: 'graphic-element',
        imageRole: 'offset-crop',
        firstRead: 'The colour block dividing the canvas',
        graphicBehavior: 'a high-contrast colour block that divides the canvas',
        imageBehavior: 'an offset crop locked against the colour block',
        hierarchyStrategy: 'the block leads; type takes its weight from it',
        compositionStrategy: 'split-contrast',
        elementsToOmit: ['divider', 'footer'],
      };
    case 'IMAGE_AS_BACKGROUND':
      return {
        conceptName: 'Atmospheric Postcard Panel',
        visualIdea: 'Atmospheric scene acting as a tactile backdrop for a floating editorial paper panel.',
        hero: 'graphic-element',
        imageRole: 'subordinate-texture',
        firstRead: 'The floating paper panel',
        graphicBehavior: 'an editorial paper panel floating over the scene',
        imageBehavior: 'an atmospheric backdrop the panel sits on',
        hierarchyStrategy: 'layered — the panel reads first, the scene behind it second',
        graphicDevices: ['tape'],
        elementsToOmit: ['divider', 'footer'],
      };
    case 'FRAME_WITH_OVERLAP':
      return {
        conceptName: 'Architectural Frame Puncture',
        visualIdea: 'A structured frame boundary where bold typography intentionally punctures and breaks the margin lines.',
        hero: 'typography',
        imageRole: 'floating-fragment',
        firstRead: 'Type breaking the frame',
        typeBehavior: 'punctures and breaks the frame’s margin lines',
        imageBehavior: 'a fragment held inside the frame',
        spatialRelationship: 'the headline crosses the frame boundary rather than respecting it',
        hierarchyStrategy: 'the type dominates by breaking the structure around it',
        compositionStrategy: 'boundary-crossover',
        elementsToOmit: ['footer'],
      };
    default:
      return {
        conceptName: 'Art-Directed Creative',
        visualIdea: 'Contemporary art-directed composition with distinct scale contrast.',
        hero: 'typography',
        imageRole: 'offset-crop',
        firstRead: 'The headline',
        elementsToOmit: ['divider', 'footer'],
      };
  }
}

function buildFullBleedTypePlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, tone, headlineUpper, supportUpper, characterScale, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);
  const imageRect = norm(0, 0, w, h);
  const lightPhoto = tone === 'light';

  const headlineSize = Math.min(w * 0.092 * characterScale, (h * 0.28) / 2.0);
  const bodyColW = w - m * 2.4;
  const bodyX = m * 1.4;

  let stackH = 0;
  const textItems: Array<{ height: number; gap: number; place: (y: number) => void }> = [];

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, headlineSize, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    textItems.push({
      height: blockH,
      gap: gap * 0.8,
      place: (topY) => {
        blocks.push({
          kind: 'text',
          role: 'headline',
          rect: norm(bodyX, topY, Math.min(bodyColW, actualW), blockH),
          spec: {
            lines: fit.lines,
            x: bodyX,
            y: topY + fit.fontSize * 0.88,
            fontSize: fit.fontSize,
            lineHeight,
            fontFamily: fonts.headline,
            fill: adjustContrast(lightPhoto ? palette.ink : DESIGN_SYSTEM_DEFAULTS.fallbackLightText, lightPhoto ? '#ffffff' : '#000000', 4.5),
            fontWeight: fonts.headlineWeight,
            align: 'left',
            shadow: !lightPhoto,
            letterSpacing: fonts.headlineLetterSpacing,
          },
        });
      },
    });
    stackH += blockH;
  }

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    textItems.push({
      height: blockH,
      gap: gap * 0.8,
      place: (topY) => {
        blocks.push({
          kind: 'text',
          role: 'support',
          rect: norm(bodyX, topY, Math.min(bodyColW, actualW), blockH),
          spec: {
            lines: fit.lines,
            x: bodyX,
            y: topY + fit.fontSize * 0.85,
            fontSize: fit.fontSize,
            lineHeight,
            fontFamily: fonts.body,
            fill: adjustContrast(lightPhoto ? palette.ink : DESIGN_SYSTEM_DEFAULTS.fallbackLightText, lightPhoto ? '#ffffff' : '#000000', 4.5),
            align: 'left',
            shadow: !lightPhoto,
            opacity: 0.95,
          },
        });
      },
    });
    stackH += gap * 0.8 + blockH;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
    textItems.push({
      height: ctx.ctaH,
      gap: 0,
      place: (topY) => {
        blocks.push({
          kind: 'cta',
          rect: norm(bodyX, topY, ctaW, ctx.ctaH),
          spec: {
            text: content.cta as string,
            x: bodyX,
            y: topY,
            width: ctaW,
            height: ctx.ctaH,
            fontSize: fit.fontSize,
            fontFamily: fonts.body,
            shape: 'annotation',
            fill: visibleAccent(palette, lightPhoto ? '#ffffff' : '#000000'),
            textFill: lightPhoto ? palette.ink : '#ffffff',
          },
        });
      },
    });
    stackH += gap * 0.8 + ctx.ctaH;
  }

  const cursor = Math.max(h * 0.52, h - stackH - m * 1.5 - bottomSafe);
  const scrimTop = Math.max(0, cursor - m * 1.2);
  blocks.unshift({
    kind: 'scrim',
    rect: norm(0, scrimTop, w, h - scrimTop),
    direction: 'up',
    maxOpacity: lightPhoto ? 0.6 : 0.72,
    color: lightPhoto ? DESIGN_SYSTEM_DEFAULTS.lightScrimColor : DESIGN_SYSTEM_DEFAULTS.darkScrimColor,
  });

  let currentY = cursor;
  for (let i = 0; i < textItems.length; i++) {
    textItems[i].place(currentY);
    currentY += textItems[i].height + (i < textItems.length - 1 ? textItems[i].gap : 0);
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'monumental-integrated-bleed',
      'extreme-scale-contrast',
      'scrim-integrated-lighting',
    ],
    structure: `FULL_BLEED_TYPE/full-bleed/${recipe.typographyFamily}`,
    archetype: 'FULL_BLEED_TYPE',
  };
}

function buildEditorialOverlapPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  // Edge-bleeding photography crop
  const imgW = w * 0.90;
  const imgH = h * 0.54;
  const imageRect = norm(0, 0, imgW, imgH);

  let headlineBlockH = 0;
  let headlineTopY = imgH - h * 0.08;
  const bodyX = m * 1.4;
  const bodyColW = w - m * 2.8;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, ctx.headlineSize, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    headlineBlockH = fit.lines.length * lineHeight;
    // Overlap: 50% across photo, 50% across paper
    headlineTopY = imgH - headlineBlockH * 0.50;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(bodyX, headlineTopY, Math.min(bodyColW, actualW), headlineBlockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: headlineTopY + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        shadow: true,
        letterSpacing: fonts.headlineLetterSpacing,
      },
    });

    // Editorial rough underline
    const underlineW = Math.min(actualW * 0.8, bodyColW * 0.7);
    blocks.push({
      kind: 'underline',
      rect: norm(bodyX, headlineTopY + headlineBlockH + 6, underlineW, 3),
      stroke: palette.accent,
      strokeWidth: 3,
    });
  }

  let cursor = headlineTopY + headlineBlockH + gap * 1.0;

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW * 0.85, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(bodyX, cursor, Math.min(bodyColW * 0.85, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.85,
        letterSpacing: 0.8,
      },
    });
    cursor += blockH + gap * 0.8;
  }

  if (content.secondaryInfo && !omit.has('secondaryInfo')) {
    const fit = fitText(content.secondaryInfo, bodyColW, ctx.secondarySize, 1, BODY_CHAR_WIDTH);
    const blockH = fit.fontSize * 1.4;
    const actualW = fit.lines[0].length * fit.fontSize * BODY_CHAR_WIDTH;
    blocks.push({
      kind: 'text',
      role: 'secondaryInfo',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * 1.3,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.75,
        letterSpacing: 1.2,
      },
    });
    cursor += blockH + gap * 0.8;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 1.8;
    blocks.push({
      kind: 'cta',
      rect: norm(bodyX, cursor, ctaW, ctx.ctaH),
      spec: {
        text: content.cta,
        x: bodyX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'edge-bleeding-photo-crop',
      'boundary-crossing-headline',
      'editorial-scale-contrast',
    ],
    structure: `EDITORIAL_OVERLAP/editorial-frame/${recipe.typographyFamily}`,
    archetype: 'EDITORIAL_OVERLAP',
  };
}

function buildProductCutoutPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);
  const isCutout = input.capabilities?.isCutout === true;

  let imageRect: Rect;
  if (isCutout) {
    const imgW = w * 0.64;
    const imgH = h * 0.52;
    const imgX = w * 0.18;
    const imgY = h * 0.28;
    imageRect = norm(imgX, imgY, imgW, imgH);

    // Subtle background accent panel
    blocks.push({
      kind: 'panel',
      rect: norm(w * 0.14, h * 0.24, w * 0.72, h * 0.58),
      fill: palette.paper,
      radius: 8,
    });

    const bodyColW = w - m * 2.4;
    const bodyX = m * 1.2;
    let topCursor = m * 1.2;

    if (content.headline && !omit.has('headline')) {
      const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
      const fit = fitText(text, bodyColW, ctx.headlineSize * 0.95, 2, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
      const lineHeight = fit.fontSize * fonts.headlineLineHeight;
      const blockH = fit.lines.length * lineHeight;
      const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
      const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

      blocks.push({
        kind: 'text',
        role: 'headline',
        rect: norm(bodyX, topCursor, Math.min(bodyColW, actualW), blockH),
        spec: {
          lines: fit.lines,
          x: bodyX,
          y: topCursor + fit.fontSize * 0.88,
          fontSize: fit.fontSize,
          lineHeight,
          fontFamily: fonts.headline,
          fill: adjustContrast(palette.ink, palette.paper, 4.5),
          fontWeight: fonts.headlineWeight,
          align: 'left',
          letterSpacing: fonts.headlineLetterSpacing,
        },
      });
      topCursor += blockH + gap * 0.6;
    }

    if (content.support && !omit.has('description') && !omit.has('support')) {
      const text = supportUpper ? content.support.toUpperCase() : content.support;
      const fit = fitText(text, bodyColW * 0.8, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
      const lineHeight = fit.fontSize * fonts.supportLineHeight;
      const blockH = fit.lines.length * lineHeight;
      const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
      const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

      blocks.push({
        kind: 'text',
        role: 'support',
        rect: norm(bodyX, topCursor, Math.min(bodyColW * 0.8, actualW), blockH),
        spec: {
          lines: fit.lines,
          x: bodyX,
          y: topCursor + fit.fontSize * 0.85,
          fontSize: fit.fontSize,
          lineHeight,
          fontFamily: fonts.body,
          fill: adjustContrast(palette.ink, palette.paper, 4.5),
          align: 'left',
          opacity: 0.85,
        },
      });
    }

    if ((content.eventBadge || content.supportIsInteraction) && !omit.has('badge')) {
      const badgeText = content.eventBadge ?? (content.supportIsInteraction ? content.support : 'NEW') ?? 'NEW';
      const badgeFont = ctx.supportSize * 0.9;
      const badgeW = badgeText.length * badgeFont * 0.62 + badgeFont * 2;
      const badgeH = badgeFont * 2.2;
      const badgeFill = visibleAccent(palette, palette.paper);
      blocks.push({
        kind: 'badge',
        rect: norm(imgX + imgW - badgeW * 0.8, imgY + imgH * 0.08, badgeW, badgeH),
        text: badgeText,
        fontSize: badgeFont,
        fontFamily: input.accentFontFamily ?? fonts.body,
        fill: badgeFill,
        textFill: adjustContrast(onColor(badgeFill, palette), badgeFill, 4.5),
        shapeLanguage: 'geometric',
      });
    }

    if (content.cta && !omit.has('cta')) {
      const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
      const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
      const ctaY = Math.min(imgY + imgH + gap, h - ctx.ctaH - m - bottomSafe);
      blocks.push({
        kind: 'cta',
        rect: norm(bodyX, ctaY, ctaW, ctx.ctaH),
        spec: {
          text: content.cta,
          x: bodyX,
          y: ctaY,
          width: ctaW,
          height: ctx.ctaH,
          fontSize: fit.fontSize,
          fontFamily: fonts.body,
          shape: 'annotation',
          fill: visibleAccent(palette, palette.paper),
          textFill: palette.ink,
        },
      });
    }
  } else {
    // Non-cutout fallback
    const imgH = h * 0.50;
    imageRect = norm(m, m * 1.2, w - m * 2, imgH);
    let cursor = m * 1.2 + imgH + gap;
    if (content.headline && !omit.has('headline')) {
      const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
      const fit = fitText(text, w - m * 2, ctx.headlineSize, 2, fonts.headlineCharWidth);
      const blockH = fit.lines.length * fit.fontSize * fonts.headlineLineHeight;
      blocks.push({
        kind: 'text',
        role: 'headline',
        rect: norm(m, cursor, w - m * 2, blockH),
        spec: {
          lines: fit.lines,
          x: m,
          y: cursor + fit.fontSize * 0.88,
          fontSize: fit.fontSize,
          lineHeight: fit.fontSize * fonts.headlineLineHeight,
          fontFamily: fonts.headline,
          fill: palette.ink,
          align: 'left',
        },
      });
      cursor += blockH + gap;
    }
    if (content.cta && !omit.has('cta')) {
      const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
      const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
      blocks.push({
        kind: 'cta',
        rect: norm(m, cursor, ctaW, ctx.ctaH),
        spec: {
          text: content.cta,
          x: m,
          y: cursor,
          width: ctaW,
          height: ctx.ctaH,
          fontSize: fit.fontSize,
          fontFamily: fonts.body,
          shape: 'annotation',
          fill: visibleAccent(palette, palette.paper),
          textFill: palette.ink,
        },
      });
    }
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-left');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'floating-subject-focus',
      'offset-backdrop-panel',
      'angled-stamp-badge',
    ],
    structure: isCutout
      ? `PRODUCT_CUTOUT/cutout-floating/${recipe.typographyFamily}`
      : `PRODUCT_CUTOUT/spotlight/${recipe.typographyFamily}`,
    archetype: 'PRODUCT_CUTOUT',
  };
}

function buildAsymmetricGridPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  const gridGap = m * 0.75;
  const col1W = (w - m * 2 - gridGap) * 0.58;
  const col2W = (w - m * 2 - gridGap) * 0.42;
  const col2X = m + col1W + gridGap;

  const imageRect = norm(m, m, col1W, h - m * 2 - bottomSafe);

  let cursor = m * 1.3;

  if (content.hasLogo && !omit.has('logo')) {
    const size = col2W * 0.28;
    blocks.push({
      kind: 'logo',
      rect: norm(col2X, m, size, size),
      opacity: 1,
    });
    cursor = m + size + gap * 0.8;
  }

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, col2W, col2W * 0.18, 4, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * 1.12;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(col2X, cursor, Math.min(col2W, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: col2X,
        y: cursor + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        letterSpacing: fonts.headlineLetterSpacing,
      },
    });
    cursor += blockH + gap * 0.9;
  }

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, col2W, ctx.supportSize, 3, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * 1.3;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(col2X, cursor, Math.min(col2W, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: col2X,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.85,
      },
    });
    cursor += blockH + gap * 0.9;
  }

  if (content.secondaryInfo && !omit.has('secondaryInfo')) {
    blocks.push({
      kind: 'divider',
      rect: norm(col2X, cursor, col2W, 1),
      stroke: palette.ink,
      opacity: 0.35,
    });
    cursor += gap * 0.5;

    const fit = fitText(content.secondaryInfo, col2W, ctx.secondarySize, 2, BODY_CHAR_WIDTH);
    const blockH = fit.lines.length * fit.fontSize * 1.3;
    blocks.push({
      kind: 'text',
      role: 'secondaryInfo',
      rect: norm(col2X, cursor, col2W, blockH),
      spec: {
        lines: fit.lines,
        x: col2X,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight: fit.fontSize * 1.3,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.75,
        letterSpacing: 0.8,
      },
    });
    cursor += blockH + gap * 0.9;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, col2W, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaY = h - m - ctx.ctaH - bottomSafe;
    blocks.push({
      kind: 'cta',
      rect: norm(col2X, ctaY, col2W, ctx.ctaH),
      spec: {
        text: content.cta,
        x: col2X,
        y: ctaY,
        width: col2W,
        height: ctx.ctaH,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'asymmetric-two-column-grid',
      'architectural-folio-typography',
    ],
    structure: `ASYMMETRIC_GRID/60-40-split/${recipe.typographyFamily}`,
    archetype: 'ASYMMETRIC_GRID',
  };
}

function buildTypographicPosterPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, characterScale, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  // 1. Monumental Typography Hero
  // Giant, architectural word stack with staggered line offsets
  const headlineSize = Math.min(w * 0.12 * characterScale, (h * 0.38) / 2.0);
  const bodyColW = w - m * 2;
  let headlineBlockH = 0;
  let headlineBottom = m * 1.2;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, headlineSize, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * 1.02;
    headlineBlockH = fit.lines.length * lineHeight;
    headlineBottom = m * 1.2 + headlineBlockH;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    // Stagger words for visual rhythm if multiple lines
    const lineOffsets = fit.lines.length > 1
      ? fit.lines.map((_, i) => Math.min(w * 0.14, i * w * 0.07))
      : undefined;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(m, m * 1.2, Math.min(bodyColW, actualW + (lineOffsets ? lineOffsets[lineOffsets.length - 1] : 0)), headlineBlockH),
      spec: {
        lines: fit.lines,
        x: m,
        y: m * 1.2 + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        letterSpacing: -0.5,
        lineOffsets,
      },
    });
  }

  // 2. Small Tactile Subject Image (tilted with soft shadow)
  const imgW = w * 0.50;
  const imgH = h * 0.35;
  const imgX = w - m * 1.4 - imgW;
  const imgY = Math.max(h * 0.36, headlineBottom + gap * 0.5);
  const imageRect = norm(imgX, imgY, imgW, imgH);
  const imageRotationDeg = -2.5;

  // 3. Washi / Masking Tape Pin
  const tapeW = Math.round(imgW * 0.44);
  const tapeH = Math.max(38, Math.round(h * 0.026));
  const tapeX = imgX + imgW * 0.28;
  const tapeY = imgY - tapeH * 0.45;
  blocks.push({
    kind: 'tape',
    rect: norm(tapeX, tapeY, tapeW, tapeH),
    rotationDeg: -4.2,
    color: '#f5ecd7',
    opacity: 0.92,
  });

  // 4. Postal / Rubber Ink Stamp Graphic Device
  const stampSize = Math.min(w * 0.22, 220);
  const stampX = m * 1.5;
  const stampY = imgY + imgH * 0.15;
  const stampText = content.eventBadge ?? (content.brandMessage ? 'AUTHENTIC' : 'SEVEN SISTERS');
  const stampStroke = adjustContrast(palette.accent, palette.paper, 3.5);
  const stampFontSize = Math.round(stampSize * 0.16);
  blocks.push({
    kind: 'stamp',
    rect: norm(stampX, stampY, stampSize, stampSize),
    text: stampText,
    rotationDeg: 12,
    stroke: stampStroke,
    fontSize: stampFontSize,
    borderStyle: 'double',
  });

  // 5. Restrained Editorial Footnote & Supporting Metadata
  let cursor = imgY + imgH + gap * 1.0;
  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, w * 0.65, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(m, cursor, w * 0.65, blockH),
      spec: {
        lines: fit.lines,
        x: m,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.9,
        letterSpacing: 1.2,
      },
    });
    cursor += blockH + gap * 0.6;
  }

  // 6. Optional CTA — Editorial annotation, never a pill button
  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize * 0.9, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 1.6;
    const ctaY = h - m * 1.2 - ctx.ctaH * 0.85 - bottomSafe;
    blocks.push({
      kind: 'cta',
      rect: norm(m, ctaY, ctaW, ctx.ctaH * 0.85),
      spec: {
        text: content.cta,
        x: m,
        y: ctaY,
        width: ctaW,
        height: ctx.ctaH * 0.85,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    imageRotationDeg,
    imageShadow: true,
    blocks,
    concept,
    artDirectionDecisions: [
      'monumental-word-stack',
      'tilted-tactile-photo',
      'washi-tape-pin',
      'editorial-rubber-stamp',
    ],
    structure: `TYPOGRAPHIC_POSTER/monumental-staggered/${recipe.typographyFamily}`,
    archetype: 'TYPOGRAPHIC_POSTER',
  };
}

function buildCollageLayeredPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  // 1. Layer 1: Background Offset Paper Panel (acts as archival sheet on the canvas)
  const panelW = w * 0.86;
  const panelH = h * 0.82;
  const panelX = w * 0.07;
  const panelY = h * 0.09;
  blocks.push({
    kind: 'panel',
    rect: norm(panelX, panelY, panelW, panelH),
    fill: palette.paper,
    stroke: palette.ink,
    strokeWidth: 1.5,
    radius: 2,
    rotationDeg: -1.5,
    offsetShadow: true,
  });

  // 2. Layer 2: Tilted Photograph Fragment (held with tape)
  const imgW = w * 0.58;
  const imgH = h * 0.40;
  const imgX = w * 0.26;
  const imgY = h * 0.16;
  const imageRect = norm(imgX, imgY, imgW, imgH);
  const imageRotationDeg = 3.2;

  // 3. Washi Tape Strip Pinning the Photo Corner
  const tapeW = Math.round(imgW * 0.42);
  const tapeH = Math.max(38, Math.round(h * 0.026));
  const tapeX = imgX + imgW * 0.20;
  const tapeY = imgY - tapeH * 0.45;
  blocks.push({
    kind: 'tape',
    rect: norm(tapeX, tapeY, tapeW, tapeH),
    rotationDeg: 5.8,
    color: '#f3e8d2',
    opacity: 0.92,
  });

  // 4. Layer 3: Editorial Rubber Stamp
  const stampSize = Math.min(w * 0.22, 200);
  const stampX = w * 0.09;
  const stampY = h * 0.14;
  const stampText = content.eventBadge ?? 'ORIGINAL';
  const stampStroke = adjustContrast(palette.accent, palette.paper, 3.5);
  const stampFontSize = Math.round(stampSize * 0.16);
  blocks.push({
    kind: 'stamp',
    rect: norm(stampX, stampY, stampSize, stampSize),
    text: stampText,
    rotationDeg: -12,
    stroke: stampStroke,
    fontSize: stampFontSize,
    borderStyle: 'dashed',
  });

  // 5. Layer 4: Organic Handwritten Note
  const noteX = w * 0.10;
  const noteY = h * 0.52;
  blocks.push({
    kind: 'handwritten-note',
    rect: norm(noteX, noteY, w * 0.42, 34),
    text: 'freshly steamed daily',
    rotationDeg: -2.8,
    fill: palette.ink,
    fontSize: w * 0.032,
  });

  // 6. Typographic Headline: Bold, overlapping the lower section with slight tilt
  let headlineTopY = Math.max(imgY + imgH * 0.72, h * 0.58);
  const headlineX = w * 0.10;
  const headlineColW = w * 0.80;
  let headlineBlockH = 0;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, headlineColW, ctx.headlineSize * 1.05, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    headlineBlockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    const lineOffsets = fit.lines.length > 1
      ? fit.lines.map((_, i) => i * w * 0.05)
      : undefined;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(headlineX, headlineTopY, Math.min(headlineColW, actualW + (lineOffsets ? lineOffsets[lineOffsets.length - 1] : 0)), headlineBlockH),
      spec: {
        lines: fit.lines,
        x: headlineX,
        y: headlineTopY + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        rotationDeg: -1.2,
        letterSpacing: fonts.headlineLetterSpacing,
        lineOffsets,
      },
    });

    // Add a rough underline under the primary headline phrase
    const underlineW = Math.min(actualW * 0.75, headlineColW * 0.8);
    const underlineY = headlineTopY + headlineBlockH + 4;
    blocks.push({
      kind: 'underline',
      rect: norm(headlineX, underlineY, underlineW, 4),
      stroke: palette.accent,
      strokeWidth: 4,
      rotationDeg: -1.0,
    });
  }

  let cursor = headlineTopY + headlineBlockH + gap * 1.1;

  // 7. Editorial Footnote / Secondary Copy
  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, headlineColW * 0.85, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(headlineX, cursor, headlineColW * 0.85, blockH),
      spec: {
        lines: fit.lines,
        x: headlineX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.85,
      },
    });
    cursor += blockH + gap * 0.8;
  }

  // 8. Optional CTA — Annotation style, no pill button
  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
    blocks.push({
      kind: 'cta',
      rect: norm(headlineX, cursor, ctaW, ctx.ctaH),
      spec: {
        text: content.cta,
        x: headlineX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-left');
  }

  blocks.push({ kind: 'texture', texture: 'paper-grain' });

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    imageRotationDeg,
    imageShadow: true,
    blocks,
    concept,
    artDirectionDecisions: [
      'layered-paper-panel',
      'tilted-photo-with-tape',
      'postal-stamp-graphic',
      'handwritten-annotation',
      'physical-collage-hierarchy',
    ],
    structure: `COLLAGE_LAYERED/physical-collage/${recipe.typographyFamily}`,
    archetype: 'COLLAGE_LAYERED',
  };
}

function buildNegativeSpacePlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  // Radical white space: 55-65% pure intentional breathing room
  // Small, quiet, intentional photograph crop offset to lower right
  const imgW = w * 0.44;
  const imgH = h * 0.32;
  const imgX = w - m * 1.6 - imgW;
  const imgY = h - m * 2.2 - imgH - bottomSafe;
  const imageRect = norm(imgX, imgY, imgW, imgH);

  let cursor = m * 2.4;
  const bodyX = m * 1.8;
  const bodyColW = w * 0.62;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, ctx.headlineSize * 0.88, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * 1.25;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        letterSpacing: 1.8,
      },
    });
    cursor += blockH + gap * 1.4;
  }

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW * 0.85, ctx.supportSize * 0.90, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * 1.4;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(bodyX, cursor, Math.min(bodyColW * 0.85, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.75,
        letterSpacing: 2.0,
      },
    });
    cursor += blockH + gap * 1.2;
  }

  // CTA is omitted by default in negative space to preserve purity,
  // but if explicitly requested and not in omit, render as quiet footnote
  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize * 0.85, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 1.4;
    blocks.push({
      kind: 'cta',
      rect: norm(bodyX, cursor, ctaW, ctx.ctaH * 0.75),
      spec: {
        text: content.cta,
        x: bodyX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH * 0.75,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'radical-whitespace-field',
      'asymmetric-deliberate-margins',
      'quiet-architectural-type',
      'intentional-omissions',
    ],
    structure: `NEGATIVE_SPACE/minimal-breathing-room/${recipe.typographyFamily}`,
    archetype: 'NEGATIVE_SPACE',
  };
}

function buildSplitCompositionPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, characterScale, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  // Inverted Graphic Split: Bold Top Typographic Panel, Full-Bleed Bottom Photography
  const splitH = h * 0.44;
  const blockFill = palette.ink;
  const textFill = adjustContrast(palette.paper, blockFill, 4.5);

  blocks.push({
    kind: 'panel',
    rect: norm(0, 0, w, splitH),
    fill: blockFill,
  });

  const imageRect = norm(0, splitH, w, h - splitH);

  let cursor = m * 1.1;
  const bodyX = m * 1.4;
  const bodyColW = w - m * 2.8;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const headlineSize = Math.min(w * 0.088 * characterScale, (splitH * 0.55) / 2.0);
    const fit = fitText(text, bodyColW, headlineSize, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: textFill,
        fontWeight: fonts.headlineWeight,
        align: 'left',
        letterSpacing: fonts.headlineLetterSpacing,
      },
    });
    cursor += blockH + gap * 0.6;
  }

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW * 0.85, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: textFill,
        align: 'left',
        opacity: 0.9,
      },
    });
    cursor += blockH + gap * 0.6;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
    blocks.push({
      kind: 'cta',
      rect: norm(bodyX, cursor, ctaW, ctx.ctaH * 0.85),
      spec: {
        text: content.cta,
        x: bodyX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH * 0.85,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, blockFill),
        textFill: visibleAccent(palette, blockFill),
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'inverted-bold-split-composition',
      'high-contrast-architectural-header',
      'full-bleed-subject-base',
    ],
    structure: `SPLIT_COMPOSITION/inverted-split/${recipe.typographyFamily}`,
    archetype: 'SPLIT_COMPOSITION',
  };
}

function buildImageAsBackgroundPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  const imageRect = norm(0, 0, w, h);

  const panelX = m * 1.2;
  const panelY = h * 0.44;
  const panelW = w - m * 2.4;
  const panelH = h * 0.46 - bottomSafe;

  // Floating tactile paper panel with subtle rotation & shadow
  blocks.push({
    kind: 'panel',
    rect: norm(panelX, panelY, panelW, panelH),
    fill: palette.paper,
    stroke: palette.ink,
    strokeWidth: 1,
    radius: 4,
    rotationDeg: -0.8,
    offsetShadow: true,
  });

  // Washi tape pinning top of the floating panel
  const tapeW = Math.round(panelW * 0.32);
  const tapeH = Math.max(36, Math.round(h * 0.025));
  const tapeX = panelX + panelW * 0.34;
  const tapeY = panelY - tapeH * 0.45;
  blocks.push({
    kind: 'tape',
    rect: norm(tapeX, tapeY, tapeW, tapeH),
    rotationDeg: 1.2,
    color: '#f5ecd7',
    opacity: 0.9,
  });

  let cursor = panelY + m * 1.0;
  const bodyX = panelX + m * 0.9;
  const bodyColW = panelW - m * 1.8;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, ctx.headlineSize * 0.95, 3, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        letterSpacing: fonts.headlineLetterSpacing,
      },
    });
    cursor += blockH + gap * 0.7;
  }

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.85,
      },
    });
    cursor += blockH + gap * 0.7;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, bodyColW * 0.5, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 2.0;
    blocks.push({
      kind: 'cta',
      rect: norm(bodyX, cursor, ctaW, ctx.ctaH),
      spec: {
        text: content.cta,
        x: bodyX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'tactile-floating-panel',
      'washi-tape-anchor',
      'atmospheric-depth',
    ],
    structure: `IMAGE_AS_BACKGROUND/floating-panel/${recipe.typographyFamily}`,
    archetype: 'IMAGE_AS_BACKGROUND',
  };
}

function buildFrameWithOverlapPlan(input: LayoutPlanInput, ctx: LayoutPlanCtx): LayoutPlan {
  const { w, h, m, gap, norm, fonts, bottomSafe, headlineUpper, supportUpper, concept } = ctx;
  const { recipe, content, palette } = input;
  const blocks: PlannedBlock[] = [];
  const omit = new Set(concept.elementsToOmit);

  blocks.push({
    kind: 'border',
    style: 'inset-frame',
    stroke: palette.ink,
  });

  const imgX = m * 1.4;
  const imgY = m * 2.0;
  const imgW = w - m * 2.8;
  const imgH = h * 0.50;
  const imageRect = norm(imgX, imgY, imgW, imgH);

  const bodyX = m * 1.6;
  const bodyColW = w - m * 3.2;
  const topY = m * 0.8;

  if (content.headline && !omit.has('headline')) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, ctx.headlineSize, 2, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;

    blocks.push({
      kind: 'text',
      role: 'headline',
      rect: norm(bodyX, topY, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: topY + fit.fontSize * 0.88,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.headline,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        fontWeight: fonts.headlineWeight,
        align: 'left',
        shadow: true,
        letterSpacing: fonts.headlineLetterSpacing,
      },
    });
  }

  let cursor = imgY + imgH + gap * 0.8;

  if (content.support && !omit.has('description') && !omit.has('support')) {
    const text = supportUpper ? content.support.toUpperCase() : content.support;
    const fit = fitText(text, bodyColW, ctx.supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
    const lineHeight = fit.fontSize * fonts.supportLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;

    blocks.push({
      kind: 'text',
      role: 'support',
      rect: norm(bodyX, cursor, Math.min(bodyColW, actualW), blockH),
      spec: {
        lines: fit.lines,
        x: bodyX,
        y: cursor + fit.fontSize * 0.85,
        fontSize: fit.fontSize,
        lineHeight,
        fontFamily: fonts.body,
        fill: adjustContrast(palette.ink, palette.paper, 4.5),
        align: 'left',
        opacity: 0.85,
      },
    });
    cursor += blockH + gap * 0.8;
  }

  if (content.cta && !omit.has('cta')) {
    const fit = fitText(content.cta, w * 0.35, ctx.ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctx.ctaFontSize * 1.8;
    blocks.push({
      kind: 'cta',
      rect: norm(bodyX, cursor, ctaW, ctx.ctaH),
      spec: {
        text: content.cta,
        x: bodyX,
        y: cursor,
        width: ctaW,
        height: ctx.ctaH,
        fontSize: fit.fontSize,
        fontFamily: fonts.body,
        shape: 'annotation',
        fill: visibleAccent(palette, palette.paper),
        textFill: palette.ink,
      },
    });
  }

  if (content.eventBadge && !omit.has('badge')) {
    const badgeText = content.eventBadge;
    const badgeFont = ctx.supportSize * 0.85;
    const badgeW = badgeText.length * badgeFont * 0.62 + badgeFont * 2;
    const badgeH = badgeFont * 2.0;
    blocks.push({
      kind: 'badge',
      rect: norm(w - m * 2 - badgeW, m * 0.5, badgeW, badgeH),
      text: badgeText,
      fontSize: badgeFont,
      fontFamily: input.accentFontFamily ?? fonts.body,
      fill: palette.accent,
      textFill: adjustContrast(onColor(palette.accent, palette), palette.accent, 4.5),
      shapeLanguage: 'editorial-rules',
    });
  }

  if (content.hasLogo && !omit.has('logo')) {
    placeArchetypeLogo(w, h, m, bottomSafe, recipe, blocks, norm, 'top-right');
  }

  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as any });
  }

  return {
    canvas: { width: w, height: h },
    paper: palette.paper,
    imageRect,
    blocks,
    concept,
    artDirectionDecisions: [
      'architectural-frame-puncture',
      'intentional-boundary-break',
      'editorial-corner-stamp',
    ],
    structure: `FRAME_WITH_OVERLAP/breaking-frame/${recipe.typographyFamily}`,
    archetype: 'FRAME_WITH_OVERLAP',
  };
}

export function buildLayoutPlan(input: LayoutPlanInput): LayoutPlan {
  const { width: w, height: h, recipe, content, palette } = input;
  const tone = input.copyZoneTone ?? 'dark';
  const blocks: PlannedBlock[] = [];
  const norm = (x: number, y: number, bw: number, bh: number): Rect => ({
    x: round(x / w),
    y: round(y / h),
    width: round(bw / w),
    height: round(bh / h),
  });

  const baseFonts = input.typography;
  const headlineTypography = parseTypographyAdjustments(
    recipe.headlineCharacter,
    baseFonts.lineHeightMult,
    baseFonts.letterSpacing || 0
  );
  const supportTypography = parseTypographyAdjustments(
    recipe.supportingTypography,
    1.35,
    0
  );
  const fonts = {
    ...baseFonts,
    headlineLineHeight: headlineTypography.lineHeightMult,
    headlineLetterSpacing: headlineTypography.letterSpacing,
    supportLineHeight: supportTypography.lineHeightMult,
    supportLetterSpacing: supportTypography.letterSpacing,
  };
  const spacingScale =
    recipe.spacingBehaviour === 'tight'
      ? LAYOUT_CONFIG.spacing.tight
      : recipe.spacingBehaviour === 'airy'
        ? LAYOUT_CONFIG.spacing.airy
        : LAYOUT_CONFIG.spacing.normal;
  const m = w * spacingScale;
  const gap = m * LAYOUT_CONFIG.spacing.gapMultiplier;
  // Vertical platforms keep the bottom clearer — platform UI overlays live there.
  const bottomSafe = input.aspectRatio.trim() === '9:16' ? h * 0.05 : 0;

  const layout = recipe.layoutBehaviour;
  const centered = layout === 'centered';
  const align: 'left' | 'center' = centered ? 'center' : 'left';
  const headlineRotation =
    layout === 'diagonal' ? -2 : recipe.imperfectionLevel === 'strong' ? -1.4 : recipe.imperfectionLevel === 'subtle' ? -0.6 : 0;

  const headlineUpper = /\b(caps|uppercase)\b/i.test(recipe.headlineCharacter);
  const supportUpper = /\b(caps|uppercase)\b/i.test(recipe.supportingTypography);

  // ── Font sizing ── large-and-few for minimal, restrained for dense.
  const characterScale = /large|expressive|oversized|big|bold|dominant/i.test(recipe.headlineCharacter)
    ? LAYOUT_CONFIG.headlineScale.oversized
    : /restrained|small|quiet|modest/i.test(recipe.headlineCharacter)
      ? LAYOUT_CONFIG.headlineScale.restrained
      : LAYOUT_CONFIG.headlineScale.normal;
  const densityScale =
    recipe.visualDensity === 'minimal'
      ? LAYOUT_CONFIG.density.minimal
      : recipe.visualDensity === 'dense'
        ? LAYOUT_CONFIG.density.dense
        : LAYOUT_CONFIG.density.normal;
  const treatment = recipe.imageTreatment;
  const headlineBase =
    (treatment === 'full-bleed'
      ? centered
        ? LAYOUT_CONFIG.headlineBaseSize.fullBleedCentered
        : LAYOUT_CONFIG.headlineBaseSize.fullBleedLeft
      : LAYOUT_CONFIG.headlineBaseSize.framedOrInset) * w;
  const headlineMaxLines = centered ? 2 : 3;
  // Hard cap: the headline never eats more than ~28% of the canvas height.
  const headlineSize = Math.min(
    headlineBase * characterScale * densityScale,
    (h * LAYOUT_CONFIG.headlineScale.maxHeightRatio) / (headlineMaxLines * 1.12),
  );
  const supportSize = w * LAYOUT_CONFIG.textSizes.supportMultiplier * (supportUpper ? 0.85 : 1);
  const brandMsgSize = w * LAYOUT_CONFIG.textSizes.brandMessageMultiplier;
  const secondarySize = w * LAYOUT_CONFIG.textSizes.secondaryInfoMultiplier;
  const ctaFontSize = w * LAYOUT_CONFIG.textSizes.ctaFontSizeMultiplier;
  const ctaH = ctaFontSize * LAYOUT_CONFIG.textSizes.ctaHeightMultiplier;

  // Resolve Graphic Design Concept
  const concept = resolveGraphicDesignConcept(input);

  // Archetype dispatch: if archetype is provided, execute dedicated composition geometry
  const archetype: CompositionArchetype | undefined =
    input.compositionArchetype ?? recipe.compositionArchetype;

  if (archetype) {
    const ctx: LayoutPlanCtx = {
      w,
      h,
      m,
      gap,
      bottomSafe,
      norm,
      fonts,
      characterScale,
      densityScale,
      headlineSize,
      headlineMaxLines,
      headlineRotation,
      headlineUpper,
      supportUpper,
      supportSize,
      brandMsgSize,
      secondarySize,
      ctaFontSize,
      ctaH,
      tone,
      concept,
    };

    switch (archetype) {
      case 'FULL_BLEED_TYPE':
        return buildFullBleedTypePlan(input, ctx);
      case 'EDITORIAL_OVERLAP':
        return buildEditorialOverlapPlan(input, ctx);
      case 'PRODUCT_CUTOUT':
        return buildProductCutoutPlan(input, ctx);
      case 'ASYMMETRIC_GRID':
        return buildAsymmetricGridPlan(input, ctx);
      case 'TYPOGRAPHIC_POSTER':
        return buildTypographicPosterPlan(input, ctx);
      case 'COLLAGE_LAYERED':
        return buildCollageLayeredPlan(input, ctx);
      case 'NEGATIVE_SPACE':
        return buildNegativeSpacePlan(input, ctx);
      case 'SPLIT_COMPOSITION':
        return buildSplitCompositionPlan(input, ctx);
      case 'IMAGE_AS_BACKGROUND':
        return buildImageAsBackgroundPlan(input, ctx);
      case 'FRAME_WITH_OVERLAP':
        return buildFrameWithOverlapPlan(input, ctx);
    }
  }

  // Legacy fallback (when no archetype is set)
  // ── Footer ── a real treatment (torn paper / band / hairline), only when the
  // recipe asks for one AND there is content that belongs in it.
  const wantsFooter =
    recipe.footerStyle !== 'none' &&
    Boolean(content.brandMessage || content.secondaryInfo || content.cta || (content.hasLogo && recipe.logoTreatment === 'footer'));
  // A watermark shares the footer's reserved slot when a band exists — floating
  // it above the band would collide with the bottom-anchored body copy.
  const logoInFooter = content.hasLogo && wantsFooter && (recipe.logoTreatment === 'footer' || recipe.logoTreatment === 'watermark');

  const footerPad = m * LAYOUT_CONFIG.footer.paddingMultiplier;
  let footerY = h; // top edge of the footer band; h = no footer
  if (wantsFooter) {
    const logoSlotW = logoInFooter ? h * LAYOUT_CONFIG.footer.logoSlotHeightRatio + gap : 0;
    const rowAvail = w - m * 2 - logoSlotW;
    const msgFit = content.brandMessage
      ? fitText(content.brandMessage, rowAvail, brandMsgSize, 2, fonts.headlineCharWidth)
      : null;
    const msgH = msgFit ? msgFit.lines.length * msgFit.fontSize * 1.25 : 0;
    const hasBottomRow = Boolean(content.secondaryInfo || content.cta);
    const bottomRowH = hasBottomRow ? Math.max(secondarySize * 1.4, content.cta ? ctaH : 0) : 0;
    const contentH = msgH + (msgH && bottomRowH ? gap * 0.9 : 0) + bottomRowH;
    const footerH = Math.max(
      h * LAYOUT_CONFIG.footer.minHeightRatio,
      Math.min(h * LAYOUT_CONFIG.footer.maxHeightRatio, contentH + footerPad * 2 + bottomSafe),
    );
    footerY = h - footerH;

    blocks.push({
      kind: 'footer',
      rect: norm(0, footerY, w, footerH),
      style: recipe.footerStyle as 'torn-paper' | 'solid-band' | 'hairline',
      fill: palette.paper,
    });

    let fy = footerY + footerPad;
    if (msgFit && content.brandMessage) {
      const lineHeight = msgFit.fontSize * 1.25;
      blocks.push({
        kind: 'text',
        role: 'brandMessage',
        rect: norm(m, fy, rowAvail, msgH),
        spec: {
          lines: msgFit.lines,
          x: m,
          y: fy + msgFit.fontSize * 0.85,
          fontSize: msgFit.fontSize,
          lineHeight,
          fontFamily: fonts.headline,
          fill: palette.ink,
          italic: true,
        },
      });
      fy += msgH + gap * 0.9;
    }
    if (hasBottomRow) {
      const rowY = fy;
      let rightEdge = w - m - logoSlotW;
      if (content.cta) {
        const ctaText = content.cta;
        const ctaTextFit = fitText(ctaText, w * 0.3, ctaFontSize, 1, BODY_CHAR_WIDTH);
        const ctaW = ctaTextFit.lines[0].length * ctaTextFit.fontSize * 0.62 + ctaFontSize * 2.4;
        const ctaX = rightEdge - ctaW;
        const ctaFill = visibleAccent(palette, palette.paper);
        blocks.push({
          kind: 'cta',
          rect: norm(ctaX, rowY, ctaW, ctaH),
          spec: {
            text: ctaText,
            x: ctaX,
            y: rowY,
            width: ctaW,
            height: ctaH,
            fontSize: ctaTextFit.fontSize,
            fontFamily: fonts.body,
            shape: recipe.shapeLanguage === 'editorial-rules' ? 'underline' : recipe.shapeLanguage === 'geometric' ? 'rect' : 'pill',
            fill: ctaFill,
            textFill: recipe.shapeLanguage === 'editorial-rules' ? palette.ink : onColor(ctaFill, palette),
          },
        });
        rightEdge = ctaX - gap;
      }
      if (content.secondaryInfo) {
        const items = content.secondaryInfo.split(' · ').map(s => s.trim()).filter(Boolean);
        if (items.length > 1) {
          const itemGap = gap * 1.2;
          const totalAvailW = rightEdge - m;
          const targetItemW = (totalAvailW - (items.length - 1) * itemGap) / items.length;
          
          let currentX = m;
          items.forEach((item, idx) => {
            const fit = fitText(item, targetItemW, secondarySize * 0.95, 1, BODY_CHAR_WIDTH);
            const itemW = fit.lines[0].length * fit.fontSize * BODY_CHAR_WIDTH;
            
            // Draw a tiny circular indicator badge (organic shape) before the text
            const bulletSize = fit.fontSize * 0.35;
            blocks.push({
              kind: 'badge',
              rect: norm(currentX, rowY + ctaH * 0.5 - bulletSize / 2, bulletSize, bulletSize),
              text: '',
              fontSize: 0,
              fontFamily: fonts.body,
              fill: palette.accent,
              textFill: palette.paper,
            });
            
            const textX = currentX + bulletSize + gap * 0.35;
            const textW = targetItemW - (bulletSize + gap * 0.35);
            blocks.push({
              kind: 'text',
              role: 'secondaryInfo',
              rect: norm(textX, rowY + ctaH * 0.5 - fit.fontSize * 0.7, textW, fit.fontSize * 1.4),
              spec: {
                lines: fit.lines,
                x: textX,
                y: rowY + ctaH * 0.5 + fit.fontSize * 0.35,
                fontSize: fit.fontSize,
                lineHeight: fit.fontSize * 1.3,
                fontFamily: fonts.body,
                fill: palette.ink,
                opacity: 0.85,
                letterSpacing: 0.5,
              },
            });
            
            currentX += targetItemW;
            
            // Draw a vertical divider line between columns
            if (idx < items.length - 1) {
              const dividerX = currentX + itemGap / 2;
              blocks.push({
                kind: 'divider',
                rect: norm(dividerX, rowY + ctaH * 0.25, 1, ctaH * 0.5),
                stroke: palette.ink,
                opacity: 0.25,
              });
              currentX += itemGap;
            }
          });
        } else {
          const fit = fitText(content.secondaryInfo, rightEdge - m, secondarySize, 1, BODY_CHAR_WIDTH);
          const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
          const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;
          blocks.push({
            kind: 'text',
            role: 'secondaryInfo',
            rect: norm(m, rowY + ctaH * 0.5 - fit.fontSize * 0.7, Math.min(rightEdge - m, actualW), fit.fontSize * 1.4),
            spec: {
              lines: fit.lines,
              x: m,
              y: rowY + ctaH * 0.5 + fit.fontSize * 0.35,
              fontSize: fit.fontSize,
              lineHeight: fit.fontSize * 1.3,
              fontFamily: fonts.body,
              fill: palette.ink,
              opacity: 0.75,
              letterSpacing: 1,
            },
          });
        }
      }
    }
    if (logoInFooter) {
      const size = h * 0.09;
      blocks.push({
        kind: 'logo',
        rect: norm(w - m - size, footerY + footerPad, size, size),
        opacity: recipe.logoTreatment === 'watermark' ? 0.55 : 1,
      });
    }
  }

  // ── Image placement ── the visual's actual home per imageTreatment.
  let imageRect: Rect;
  let bodyOnPaper = false; // text sits on paper (framed/inset) vs over the photo (full-bleed)
  let bodyTop = m;
  let bodyBottom = footerY - (wantsFooter ? m * 0.35 : m) - (wantsFooter ? 0 : bottomSafe);

  if (treatment === 'full-bleed') {
    imageRect = norm(0, 0, w, wantsFooter ? footerY + h * 0.02 : h);
  } else {
    bodyOnPaper = true;
    // Text height must be known before the image can take the rest — measure the
    // stack first at body width, then hand the leftover to the image.
    const colW = w - m * 2;
    const estimate = (text: string | undefined, size: number, maxLines: number, cw: number) =>
      text ? fitText(text, colW, size, maxLines, cw).lines.length * size * 1.2 + gap : 0;
    const stackEstimate =
      estimate(content.headline, headlineSize, headlineMaxLines, fonts.headlineCharWidth) +
      estimate(content.support, supportSize, 2, BODY_CHAR_WIDTH) +
      (!wantsFooter ? estimate(content.brandMessage, brandMsgSize, 2, fonts.headlineCharWidth) : 0) +
      (!wantsFooter && content.cta ? ctaH + gap : 0) +
      (content.hasLogo && recipe.logoTreatment === 'integrated' ? h * 0.05 + gap : 0);

    if (treatment === 'framed') {
      // Gallery-matte: paper margin on every side of the image, text below on paper.
      const imgH = Math.max(h * 0.34, footerY - m * 2 - stackEstimate - m * 0.8);
      imageRect = norm(m, m, w - m * 2, imgH);
      bodyTop = m + imgH + m * 0.7;
    } else {
      // Inset: image bleeds to the top/left/right edges, text zone on paper below.
      const imgH = Math.max(h * 0.4, footerY - m - stackEstimate - m * 0.8);
      imageRect = norm(0, 0, w, imgH);
      bodyTop = imgH + m * 0.7;
    }
  }

  // ── Body stack ── measured first, then anchored (bottom over photos, top on paper).
  const bodyColW = centered ? w - m * 2 : Math.min(w - m * 2, w * (bodyOnPaper ? 0.86 : 0.7));
  const bodyX = centered ? w / 2 : m;
  const lightPhoto = !bodyOnPaper && tone === 'light';
  /** What copy over the photo contrasts against — the scrim, effectively. */
  const photoBackdrop = lightPhoto ? DESIGN_SYSTEM_DEFAULTS.lightBackdrop : DESIGN_SYSTEM_DEFAULTS.darkBackdrop;
  const baseTextFill = bodyOnPaper ? palette.ink : lightPhoto ? palette.ink : DESIGN_SYSTEM_DEFAULTS.fallbackLightText;
  const textFill = adjustContrast(baseTextFill, bodyOnPaper ? palette.paper : photoBackdrop, DESIGN_SYSTEM_DEFAULTS.wcagTargetRatio);
  const textShadow = !bodyOnPaper && !lightPhoto;
  const stack: StackItem[] = [];

  if (content.hasLogo && recipe.logoTreatment === 'integrated') {
    // Masthead-style: the mark leads the text stack instead of floating in a corner.
    const size = h * 0.05;
    stack.push({
      height: size,
      gapAfter: gap,
      place: (topY) =>
        blocks.push({ kind: 'logo', rect: norm(centered ? w / 2 - size / 2 : m, topY, size, size), opacity: 1 }),
    });
  }

  if (content.headline) {
    const text = headlineUpper ? content.headline.toUpperCase() : content.headline;
    const fit = fitText(text, bodyColW, headlineSize, headlineMaxLines, fonts.headlineCharWidth * (headlineUpper ? 1.06 : 1));
    const lineHeight = fit.fontSize * fonts.headlineLineHeight;
    const blockH = fit.lines.length * lineHeight;
    const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
    const underlineW = Math.min(widestLine * fit.fontSize * fonts.headlineCharWidth * 0.55, bodyColW * 0.5);
    const wantsUnderline =
      /underline|hand-?drawn|marker|scribble/i.test(recipe.graphicElements.join(' ')) ||
      (recipe.imperfectionLevel === 'strong' && recipe.shapeLanguage === 'organic');
    stack.push({
      height: blockH + (wantsUnderline ? gap * 0.8 : 0),
      gapAfter: gap,
      place: (topY) => {
        const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;
        blocks.push({
          kind: 'text',
          role: 'headline',
          rect: norm(centered ? w / 2 - actualW / 2 : bodyX, topY, Math.min(bodyColW, actualW), blockH),
          spec: {
            lines: fit.lines,
            x: bodyX,
            y: topY + fit.fontSize * 0.88,
            fontSize: fit.fontSize,
            lineHeight,
            fontFamily: fonts.headline,
            fill: textFill,
            fontWeight: fonts.headlineWeight,
            align,
            ...(headlineRotation !== 0 && { rotationDeg: headlineRotation }),
            ...(textShadow && { shadow: true }),
            letterSpacing: fonts.headlineLetterSpacing || (headlineUpper ? 1.5 : undefined),
          },
        });
        if (wantsUnderline) {
          const ux = centered ? w / 2 - underlineW / 2 : m;
          blocks.push({
            kind: 'underline',
            rect: norm(ux, topY + blockH + gap * 0.35, underlineW, 8),
            stroke: bodyOnPaper ? visibleAccent(palette, palette.paper) : lightPhoto ? visibleAccent(palette, photoBackdrop) : '#ffffff',
            strokeWidth: Math.max(3, w * 0.004),
          });
        }
      },
    });
  }

  if (content.support) {
    if (content.supportIsInteraction && recipe.shapeLanguage === 'organic') {
      // A participation prompt reads as a sticker, not a paragraph.
      const badgeFont = supportSize * 0.85;
      const badgeW = content.support.length * badgeFont * 0.62 + badgeFont * 1.8;
      const badgeH = badgeFont * 2;
      const badgeFill = visibleAccent(palette, bodyOnPaper ? palette.paper : photoBackdrop);
      const badgeTextFill = adjustContrast(onColor(badgeFill, palette), badgeFill, 4.5);
      stack.push({
        height: badgeH,
        gapAfter: gap,
        place: (topY) =>
          blocks.push({
            kind: 'badge',
            rect: norm(centered ? w / 2 - badgeW / 2 : m, topY, badgeW, badgeH),
            text: content.support as string,
            fontSize: badgeFont,
            fontFamily: input.accentFontFamily ?? fonts.body,
            fill: badgeFill,
            textFill: badgeTextFill,
            shapeLanguage: recipe.shapeLanguage,
          }),
      });
    } else {
      const text = supportUpper ? content.support.toUpperCase() : content.support;
      const fit = fitText(text, bodyColW, supportSize, 2, BODY_CHAR_WIDTH * (supportUpper ? 1.08 : 1));
      const lineHeight = fit.fontSize * fonts.supportLineHeight;
      const blockH = fit.lines.length * lineHeight;
      stack.push({
        height: blockH,
        gapAfter: gap,
        place: (topY) => {
          const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
          const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;
          blocks.push({
            kind: 'text',
            role: 'support',
            rect: norm(centered ? w / 2 - actualW / 2 : bodyX, topY, Math.min(bodyColW, actualW), blockH),
            spec: {
              lines: fit.lines,
              x: bodyX,
              y: topY + fit.fontSize * 0.85,
              fontSize: fit.fontSize,
              lineHeight,
              fontFamily: fonts.body,
              fill: textFill,
              align,
              ...(content.supportIsInteraction && { italic: true }),
              letterSpacing: fonts.supportLetterSpacing || (supportUpper ? 1.5 : undefined),
              ...(textShadow && { shadow: true }),
              opacity: bodyOnPaper ? 0.85 : 0.95,
            },
          });
        },
      });
    }
  }

  if (!wantsFooter && content.brandMessage) {
    const fit = fitText(content.brandMessage, bodyColW, brandMsgSize, 2, fonts.headlineCharWidth);
    const lineHeight = fit.fontSize * 1.3;
    const blockH = fit.lines.length * lineHeight;
    stack.push({
      height: blockH,
      gapAfter: gap,
      place: (topY) => {
        const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
        const actualW = widestLine * fit.fontSize * fonts.headlineCharWidth;
        blocks.push({
          kind: 'text',
          role: 'brandMessage',
          rect: norm(centered ? w / 2 - actualW / 2 : bodyX, topY, Math.min(bodyColW, actualW), blockH),
          spec: {
            lines: fit.lines,
            x: bodyX,
            y: topY + fit.fontSize * 0.85,
            fontSize: fit.fontSize,
            lineHeight,
            fontFamily: fonts.headline,
            fill: textFill,
            italic: true,
            align,
            opacity: 0.9,
            ...(textShadow && { shadow: true }),
          },
        });
      },
    });
  }

  if (!wantsFooter && content.cta) {
    const fit = fitText(content.cta, w * 0.36, ctaFontSize, 1, BODY_CHAR_WIDTH);
    const ctaW = fit.lines[0].length * fit.fontSize * 0.62 + ctaFontSize * 2.4;
    stack.push({
      height: ctaH,
      gapAfter: gap,
      place: (topY) => {
        const ctaX = centered ? w / 2 - ctaW / 2 : m;
        blocks.push({
          kind: 'cta',
          rect: norm(ctaX, topY, ctaW, ctaH),
          spec: {
            text: content.cta as string,
            x: ctaX,
            y: topY,
            width: ctaW,
            height: ctaH,
            fontSize: fit.fontSize,
            fontFamily: fonts.body,
            shape: recipe.shapeLanguage === 'editorial-rules' ? 'underline' : recipe.shapeLanguage === 'geometric' ? 'rect' : 'pill',
            fill: visibleAccent(palette, bodyOnPaper ? palette.paper : photoBackdrop),
            textFill:
              recipe.shapeLanguage === 'editorial-rules'
                ? textFill
                : onColor(visibleAccent(palette, bodyOnPaper ? palette.paper : photoBackdrop), palette),
          },
        });
      },
    });
  }

  if (!wantsFooter && content.secondaryInfo) {
    const fit = fitText(content.secondaryInfo, bodyColW, secondarySize, 1, BODY_CHAR_WIDTH);
    const blockH = fit.fontSize * 1.4;
    stack.push({
      height: blockH,
      gapAfter: 0,
      place: (topY) => {
        const widestLine = fit.lines.reduce((max, l) => Math.max(max, l.length), 0);
        const actualW = widestLine * fit.fontSize * BODY_CHAR_WIDTH;
        blocks.push({
          kind: 'text',
          role: 'secondaryInfo',
          rect: norm(centered ? w / 2 - actualW / 2 : bodyX, topY, Math.min(bodyColW, actualW), blockH),
          spec: {
            lines: fit.lines,
            x: bodyX,
            y: topY + fit.fontSize,
            fontSize: fit.fontSize,
            lineHeight: fit.fontSize * 1.3,
            fontFamily: fonts.body,
            fill: textFill,
            align,
            opacity: 0.75,
            letterSpacing: 1,
            ...(textShadow && { shadow: true }),
          },
        });
      },
    });
  }

  // Anchor the measured stack: photos read best with copy in the lower third,
  // paper zones read top-down. 'stacked' pins to the top regardless.
  const stackH = stack.reduce((sum, item, i) => sum + item.height + (i < stack.length - 1 ? item.gapAfter : 0), 0);
  const anchorTop = bodyOnPaper || layout === 'stacked';
  let cursor = anchorTop ? bodyTop : Math.max(bodyTop, bodyBottom - stackH);

  if (!bodyOnPaper && stack.length > 0) {
    // Legibility scrim under the copy zone — sized to the copy, never the
    // whole frame. Pale photos get a pale scrim + ink text; a dark wash over
    // a bright image reads as dirt, not design.
    const scrimTop = Math.max(0, cursor - m * 1.2);
    blocks.unshift({
      kind: 'scrim',
      rect: norm(0, scrimTop, w, (wantsFooter ? footerY : h) - scrimTop),
      direction: 'up',
      // Pale scrims stay sheer — ink-on-bright already contrasts, and a heavy
      // white wash veils the subject (a ghosted product kills appetite appeal).
      maxOpacity: lightPhoto ? LAYOUT_CONFIG.scrim.lightOpacity : LAYOUT_CONFIG.scrim.darkOpacity,
      color: lightPhoto ? DESIGN_SYSTEM_DEFAULTS.lightScrimColor : DESIGN_SYSTEM_DEFAULTS.darkScrimColor,
    });
  }

  for (const item of stack) {
    item.place(cursor);
    cursor += item.height + item.gapAfter;
  }

  // ── Corner / watermark logo ── collision-aware: candidate corners are tried
  // in preference order and the first that doesn't intersect any solid block
  // wins, so the mark never sits under (or over) the copy.
  const footerLogoStranded = recipe.logoTreatment === 'footer' && !wantsFooter;
  if (content.hasLogo && !logoInFooter && (recipe.logoTreatment === 'corner' || recipe.logoTreatment === 'watermark' || footerLogoStranded)) {
    const watermark = recipe.logoTreatment === 'watermark';
    const size = w * (watermark ? LAYOUT_CONFIG.logo.watermarkSizeRatio : LAYOUT_CONFIG.logo.cornerSizeRatio);
    const bottomY = Math.min(h - bottomSafe, footerY) - m * 0.6 - size;
    const topLeft = { x: m, y: m * 0.7 };
    const topRight = { x: w - m - size, y: m * 0.7 };
    const topCenter = { x: w / 2 - size / 2, y: m * 0.7 };
    const bottomRight = { x: w - m - size, y: bottomY };
    const bottomLeft = { x: m, y: bottomY };
    const candidates = watermark
      ? [bottomRight, bottomLeft, topRight, topLeft]
      : centered
        ? [topCenter, topLeft, topRight, bottomLeft]
        : anchorTop
          ? [topRight, bottomRight, bottomLeft, topLeft]
          : [topRight, topLeft, bottomRight, bottomLeft];
    const occupied = blocks.filter((b): b is Extract<PlannedBlock, { rect: Rect }> => 'rect' in b && SOLID_KINDS.has(b.kind));
    const spot =
      candidates.find((c) => {
        const rect = norm(c.x, c.y, size, size);
        return occupied.every((b) => overlapArea(rect, b.rect) <= LAYOUT_CONFIG.collisionThreshold);
      }) ?? candidates[0];
    blocks.push({ kind: 'logo', rect: norm(spot.x, spot.y, size, size), opacity: watermark ? LAYOUT_CONFIG.logo.watermarkOpacity : 1 });
  }

  // ── Event Badge ── collision-aware corner placement
  if (content.eventBadge) {
    const badgeFont = w * LAYOUT_CONFIG.badge.fontSizeMultiplier;
    const padX = badgeFont * LAYOUT_CONFIG.badge.paddingCharRatio;
    const badgeW = content.eventBadge.length * badgeFont * 0.62 + padX * 2;
    const badgeH = badgeFont * LAYOUT_CONFIG.badge.heightFontSizeRatio;
    const bottomY = Math.min(h - bottomSafe, footerY) - m * 0.6 - badgeH;
    const topLeft = { x: m, y: m * 0.7 };
    const topRight = { x: w - m - badgeW, y: m * 0.7 };
    const topCenter = { x: w / 2 - badgeW / 2, y: m * 0.7 };
    const bottomRight = { x: w - m - badgeW, y: bottomY };
    const bottomLeft = { x: m, y: bottomY };
    const candidates = centered
      ? [topRight, topLeft, bottomRight, bottomLeft]
      : anchorTop
        ? [bottomRight, bottomLeft, topRight, topLeft]
        : [topRight, topLeft, bottomRight, bottomLeft];

    const occupied = blocks.filter((b): b is Extract<PlannedBlock, { rect: Rect }> => 'rect' in b && SOLID_KINDS.has(b.kind));
    const spot =
      candidates.find((c) => {
        const rect = norm(c.x, c.y, badgeW, badgeH);
        return occupied.every((b) => overlapArea(rect, b.rect) <= LAYOUT_CONFIG.collisionThreshold);
      }) ?? candidates[0];

    const badgeFill = visibleAccent(palette, bodyOnPaper ? palette.paper : photoBackdrop);
    const badgeTextColor = adjustContrast(onColor(badgeFill, palette), badgeFill, DESIGN_SYSTEM_DEFAULTS.wcagTargetRatio);

    blocks.push({
      kind: 'badge',
      rect: norm(spot.x, spot.y, badgeW, badgeH),
      text: content.eventBadge,
      fontSize: badgeFont,
      fontFamily: fonts.body,
      fill: badgeFill,
      textFill: badgeTextColor,
      shapeLanguage: recipe.shapeLanguage,
    });
  }

  // ── Decoration ── editorial rules, border, texture.
  if (recipe.shapeLanguage === 'editorial-rules' && content.headline) {
    const ruleY = anchorTop ? bodyTop - gap * 0.8 : Math.max(m, cursor - stackH - gap * 1.6);
    if (ruleY > m * 0.5) {
      blocks.push({
        kind: 'divider',
        rect: norm(centered ? m : bodyX, ruleY, centered ? w - m * 2 : bodyColW * 0.4, 3),
        stroke: bodyOnPaper || lightPhoto ? palette.ink : DESIGN_SYSTEM_DEFAULTS.fallbackLightText,
        opacity: 0.7,
      });
    }
  }
  if (recipe.borderStyle !== 'none') {
    blocks.push({
      kind: 'border',
      style: recipe.borderStyle as 'hairline' | 'thick' | 'inset-frame',
      stroke: bodyOnPaper || lightPhoto ? palette.ink : DESIGN_SYSTEM_DEFAULTS.fallbackLightText,
    });
  }
  if (recipe.texture !== 'none') {
    blocks.push({ kind: 'texture', texture: recipe.texture as 'paper-grain' | 'film-grain' | 'halftone' | 'noise' });
  }

  const structure = [
    'legacy-fallback',
    treatment,
    layout,
    wantsFooter ? `${recipe.footerStyle}-footer` : 'no-footer',
    `logo:${content.hasLogo ? recipe.logoTreatment : 'none'}`,
    `type:${recipe.typographyFamily}`,
    recipe.texture !== 'none' ? `texture:${recipe.texture}` : '',
  ]
    .filter(Boolean)
    .join('/');

  return { canvas: { width: w, height: h }, paper: palette.paper, imageRect, blocks, structure };
}

// ─── Plan validation — the automated pre-raster QA gate ─────────────────────

const PLACEHOLDER_PATTERNS = [/lorem ipsum/i, /placeholder/i, /\byour (text|logo|headline|copy) here\b/i, /\blogo here\b/i, /^(headline|title|tagline|cta|logo|logoo)$/i];

/** Kinds whose rects must never collide — text on text is the "background text becomes noise" failure. */
const SOLID_KINDS = new Set(['text', 'cta', 'logo', 'badge']);

const HEADLINE_IMAGE_OVERLAP_ALLOWED = new Set<CompositionArchetype>([
  'EDITORIAL_OVERLAP',
  'FULL_BLEED_TYPE',
  'FRAME_WITH_OVERLAP',
  'COLLAGE_LAYERED',
  'IMAGE_AS_BACKGROUND',
  'TYPOGRAPHIC_POSTER',
]);

const BADGE_IMAGE_OVERLAP_ALLOWED = new Set<CompositionArchetype>([
  'PRODUCT_CUTOUT',
  'COLLAGE_LAYERED',
  'FULL_BLEED_TYPE',
  'IMAGE_AS_BACKGROUND',
]);

export function overlapArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Anti-template diversity validator.
 * Detects the legacy repetitive template collapse:
 * TOP IMAGE + TEXT DIRECTLY BELOW + DIVIDER + BOTTOM CTA + FOOTER BAND.
 */
export function validateCompositionDiversity(plan: LayoutPlan): string[] {
  const issues: string[] = [];

  // If the plan is intentionally the legacy fallback (no archetype requested),
  // skip anti-template check:
  if (!plan.archetype && (plan.structure?.includes('legacy-fallback') || plan.structure?.includes('stacked-fallback'))) {
    return issues;
  }

  let riskScore = 0;
  const reasons: string[] = [];

  // 1. Image signals
  const img = plan.imageRect;
  if (img && img.y <= 0.06 && img.y >= -0.01) {
    riskScore += 15;
    reasons.push('image starts at top (y <= 0.06)');
  }
  if (img && img.height >= 0.45 && img.height <= 0.70) {
    riskScore += 15;
    reasons.push('image occupies 45-70% height');
  }
  if (img && img.width >= 0.88) {
    riskScore += 10;
    reasons.push('image occupies full width (>= 90%)');
  }

  // 2. Headline text directly below image and centered
  const headline = plan.blocks.find(
    (b) => b.kind === 'text' && (b as Extract<PlannedBlock, { kind: 'text' }>).role === 'headline'
  ) as Extract<PlannedBlock, { kind: 'text' }> | undefined;

  if (headline && img) {
    const headlineY = headline.rect.y;
    const imgBottom = img.y + img.height;
    if (headlineY >= imgBottom - 0.02 && headlineY <= imgBottom + 0.15) {
      if (headline.spec.align === 'center' || Math.abs(headline.rect.x + headline.rect.width / 2 - 0.5) < 0.06) {
        riskScore += 20;
        reasons.push('headline centered directly below top image');
      }
    }
  }

  // 3. Horizontal divider below text
  const divider = plan.blocks.find((b) => b.kind === 'divider') as Extract<PlannedBlock, { kind: 'divider' }> | undefined;
  if (divider && divider.rect.width >= 0.4) {
    if (headline && divider.rect.y > headline.rect.y) {
      riskScore += 20;
      reasons.push('horizontal divider below text');
    }
  }

  // 4. Bottom CTA (at bottom)
  const cta = plan.blocks.find((b) => b.kind === 'cta') as Extract<PlannedBlock, { kind: 'cta' }> | undefined;
  if (cta && cta.rect.y >= 0.72) {
    riskScore += 15;
    reasons.push('CTA at bottom');
  }

  // 5. Footer band
  const footer = plan.blocks.find((b) => b.kind === 'footer');
  if (footer) {
    riskScore += 25;
    reasons.push('footer band present');
  }

  // High risk threshold: >= 75 points
  if (riskScore >= 75) {
    issues.push(
      `LEGACY_TEMPLATE_COLLAPSE: Design collapsed into legacy repetitive template (${reasons.join(', ')}). Risk score: ${riskScore}`
    );
  }

  // Anti-safe requirement: Ensure at least one decisive art-direction decision
  if (plan.archetype && (!plan.artDirectionDecisions || plan.artDirectionDecisions.length === 0)) {
    issues.push('MISSING_ART_DIRECTION: No decisive visual/art-direction decision recorded for this composition.');
  }

  return issues;
}

/**
 * Deterministic QA before any pixel is rastered: everything in bounds, no
 * solid block colliding with another, no placeholder strings, nothing the
 * direction authored silently missing. Returns issues; an empty array is a
 * publishable plan.
 */
export function validateLayoutPlan(plan: LayoutPlan, content: ContentInput): string[] {
  const issues: string[] = [];
  const solid: Array<{ label: string; rect: Rect; kind: string; role?: string }> = [];

  for (const block of plan.blocks) {
    if (!('rect' in block)) continue;
    const { rect } = block;
    if (rect.x < -0.002 || rect.y < -0.002 || rect.x + rect.width > 1.002 || rect.y + rect.height > 1.002) {
      issues.push(`${block.kind} out of canvas bounds: ${JSON.stringify(rect)}`);
    }
    if (SOLID_KINDS.has(block.kind)) {
      solid.push({
        label: `${block.kind}${'role' in block ? `:${block.role}` : ''}`,
        rect,
        kind: block.kind,
        role: 'role' in block ? block.role : undefined,
      });
    }
    if (block.kind === 'text') {
      if (block.spec.lines.length === 0 || block.spec.lines.some((line) => line.trim().length === 0)) {
        issues.push(`${block.role} has an empty line`);
      }
      for (const line of block.spec.lines) {
        if (PLACEHOLDER_PATTERNS.some((p) => p.test(line.trim()))) {
          issues.push(`${block.role} contains placeholder text: "${line}"`);
        }
      }
    }
  }

  // Solid block ↔ solid block collisions (text ↔ text, text ↔ cta are strictly forbidden)
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlapArea(solid[i].rect, solid[j].rect) > 0.0005) {
        issues.push(`${solid[i].label} overlaps ${solid[j].label}`);
      }
    }
  }

  // Archetype-aware image overlap checks
  if (plan.imageRect) {
    for (const b of solid) {
      const area = overlapArea(plan.imageRect, b.rect);
      if (area > 0.005) {
        if (b.kind === 'text' && b.role === 'headline') {
          if (plan.archetype && !HEADLINE_IMAGE_OVERLAP_ALLOWED.has(plan.archetype)) {
            issues.push(`headline unexpectedly overlaps image in ${plan.archetype}`);
          }
        } else if (b.kind === 'badge') {
          if (plan.archetype && !BADGE_IMAGE_OVERLAP_ALLOWED.has(plan.archetype)) {
            issues.push(`badge unexpectedly overlaps image in ${plan.archetype}`);
          }
        } else if (b.kind === 'text' && b.role !== 'headline') {
          if (
            plan.archetype === 'SPLIT_COMPOSITION' ||
            plan.archetype === 'ASYMMETRIC_GRID' ||
            plan.archetype === 'NEGATIVE_SPACE'
          ) {
            issues.push(`${b.role ?? 'text'} unexpectedly overlaps image in ${plan.archetype}`);
          }
        } else if (b.kind === 'cta') {
          if (
            plan.archetype === 'SPLIT_COMPOSITION' ||
            plan.archetype === 'ASYMMETRIC_GRID' ||
            plan.archetype === 'NEGATIVE_SPACE' ||
            plan.archetype === 'EDITORIAL_OVERLAP'
          ) {
            issues.push(`cta unexpectedly overlaps image in ${plan.archetype}`);
          }
        }
      }
    }
  }

  const omitted = new Set(plan.concept?.elementsToOmit ?? []);
  const rendered = new Set(plan.blocks.map((b) => ('role' in b ? b.role : b.kind)));
  if (content.headline && !rendered.has('headline') && !omitted.has('headline')) {
    issues.push('headline was authored but not planned');
  }
  if (content.cta && !rendered.has('cta') && !omitted.has('cta')) {
    issues.push('cta was authored but not planned');
  }
  if (content.hasLogo && !rendered.has('logo') && !omitted.has('logo')) {
    issues.push('a logo exists but no logo block was planned');
  }

  return issues;
}


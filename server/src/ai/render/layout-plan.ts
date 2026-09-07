import type { ReferenceDesignRecipe } from '../types';
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
  | { kind: 'text'; role: TextRole; rect: Rect; spec: TextBlockSpec }
  | { kind: 'badge'; rect: Rect; text: string; fontSize: number; fontFamily: string; fill: string; textFill: string; shapeLanguage?: 'organic' | 'geometric' | 'editorial-rules' | 'none' }
  | { kind: 'cta'; rect: Rect; spec: CtaSpec }
  | { kind: 'logo'; rect: Rect; opacity: number }
  | { kind: 'underline'; rect: Rect; stroke: string; strokeWidth: number }
  | { kind: 'divider'; rect: Rect; stroke: string; opacity: number }
  | { kind: 'border'; style: 'hairline' | 'thick' | 'inset-frame'; stroke: string }
  | { kind: 'texture'; texture: 'paper-grain' | 'film-grain' | 'halftone' | 'noise' };

export interface LayoutPlan {
  canvas: { width: number; height: number };
  /** The base the whole composition sits on — visible whenever the image doesn't cover the full canvas. */
  paper: string;
  /** Where the generated visual goes, normalized. */
  imageRect: Rect;
  blocks: PlannedBlock[];
  /** Human-readable one-liner for logs/QA — which structural choices this plan made. */
  structure: string;
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
  const pick = (colors: string[], accentBySaturation: boolean): BrandPalette | null => {
    const valid = colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c.trim()));
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => luminance(a) - luminance(b));
    // Strict ink luminance constraint to avoid low contrast body colors
    const ink = luminance(sorted[0]) < DESIGN_SYSTEM_DEFAULTS.inkMaxLuminance ? sorted[0] : NEUTRAL.ink;
    const paper = luminance(sorted[sorted.length - 1]) > DESIGN_SYSTEM_DEFAULTS.paperMinLuminance ? sorted[sorted.length - 1] : NEUTRAL.paper;
    const accent = accentBySaturation ? [...valid].sort((a, b) => saturation(b) - saturation(a))[0] : valid[0];
    return { ink, paper, accent };
  };
  return pick(brandColors, false) ?? pick(recipePalette, true) ?? pick(directionPalette, true) ?? NEUTRAL;
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
}

const round = (n: number) => Math.round(n * 1000) / 1000;

interface StackItem {
  height: number;
  gapAfter: number;
  place: (topY: number) => void;
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

function overlapArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Deterministic QA before any pixel is rastered: everything in bounds, no
 * solid block colliding with another, no placeholder strings, nothing the
 * direction authored silently missing. Returns issues; an empty array is a
 * publishable plan.
 */
export function validateLayoutPlan(plan: LayoutPlan, content: ContentInput): string[] {
  const issues: string[] = [];
  const solid: Array<{ label: string; rect: Rect }> = [];

  for (const block of plan.blocks) {
    if (!('rect' in block)) continue;
    const { rect } = block;
    if (rect.x < -0.002 || rect.y < -0.002 || rect.x + rect.width > 1.002 || rect.y + rect.height > 1.002) {
      issues.push(`${block.kind} out of canvas bounds: ${JSON.stringify(rect)}`);
    }
    if (SOLID_KINDS.has(block.kind)) {
      solid.push({ label: `${block.kind}${'role' in block ? `:${block.role}` : ''}`, rect });
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

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlapArea(solid[i].rect, solid[j].rect) > 0.0005) {
        issues.push(`${solid[i].label} overlaps ${solid[j].label}`);
      }
    }
  }

  const rendered = new Set(plan.blocks.map((b) => ('role' in b ? b.role : b.kind)));
  if (content.headline && !rendered.has('headline')) issues.push('headline was authored but not planned');
  if (content.cta && !rendered.has('cta')) issues.push('cta was authored but not planned');
  if (content.hasLogo && !rendered.has('logo')) issues.push('a logo exists but no logo block was planned');

  return issues;
}

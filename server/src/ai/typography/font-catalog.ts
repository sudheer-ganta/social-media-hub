import path from 'path';
import { FONT_MANIFEST, familySlug, fontFileRelPath } from './font-manifest';

/**
 * The design judgement Google Fonts itself doesn't encode: which of our
 * curated families feel elegant vs. brutal vs. friendly, who they pair with,
 * and what they're fit to render. This is the thing a graphic designer knows
 * that a font file alone doesn't say — see font-selector.ts, which scores
 * candidates from this table against the generation's context instead of
 * hardcoding "style X -> font Y".
 *
 * Adding a font: one entry here + a matching entry in font-manifest.ts (so its
 * files get fetched). No selection-logic code changes — font-selector.ts
 * iterates this array generically.
 */

export type FontCategory = 'serif' | 'sans-serif' | 'display' | 'handwritten' | 'monospace';
export type FontWidth = 'condensed' | 'normal' | 'expanded';
export type FontReadability = 'display-only' | 'short-copy' | 'body-friendly';
export type FontRole = 'eyebrow' | 'headline' | 'subheadline' | 'body' | 'offer' | 'cta' | 'metadata' | 'disclaimer' | 'accent';
export type ScriptTag = 'latin' | 'devanagari' | 'bengali' | 'tamil' | 'telugu';

export interface FontDefinition {
  family: string;
  category: FontCategory;
  width: FontWidth;
  /** Static weights this family actually has font FILES for (see font-manifest.ts). */
  weights: number[];
  styles: Array<'normal' | 'italic'>;
  /** Adjectives a creative director would use — matched against style-profile personality. */
  personality: string[];
  readability: FontReadability;
  /** 1 (casual/playful) – 5 (formal/luxury). */
  formality: number;
  bestFor: FontRole[];
  /** Keys into STYLE_PROFILES (server/src/ai/typography/style-profiles.ts) this font suits. */
  compatibleStyles: string[];
  compatibleIndustries: string[];
  /** Scripts this family actually renders (beyond Latin punctuation/numerals). */
  languageSupport: ScriptTag[];
  /** Other catalog family names this pairs well with, best first. */
  pairsWith: string[];
}

const F = (
  def: Omit<FontDefinition, 'weights' | 'styles' | 'languageSupport'> & { languageSupport?: ScriptTag[] },
): FontDefinition => {
  const manifestEntry = FONT_MANIFEST.find((m) => m.family === def.family);
  if (!manifestEntry) throw new Error(`font-catalog: "${def.family}" has no font-manifest.ts entry (no files would exist)`);
  return {
    ...def,
    weights: manifestEntry.weights,
    styles: manifestEntry.styles,
    languageSupport: def.languageSupport ?? ['latin'],
  };
};

export const FONT_CATALOG: FontDefinition[] = [
  // ── Display / headline-only ──────────────────────────────────────────────
  F({
    family: 'Anton',
    category: 'display',
    width: 'condensed',
    personality: ['bold', 'impactful', 'industrial', 'loud', 'confident'],
    readability: 'display-only',
    formality: 2,
    bestFor: ['headline', 'offer'],
    compatibleStyles: ['NEO_BRUTALISM', 'TYPOGRAPHY_LED', 'BOLD_TYPOGRAPHY', 'Y2K'],
    compatibleIndustries: ['fitness', 'streetwear', 'events', 'sports', 'food'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope'],
  }),
  F({
    family: 'Archivo Black',
    category: 'display',
    width: 'normal',
    personality: ['bold', 'confident', 'modern', 'sturdy'],
    readability: 'display-only',
    formality: 2,
    bestFor: ['headline', 'offer'],
    compatibleStyles: ['NEO_BRUTALISM', 'BOLD_TYPOGRAPHY', 'VIBRANT_COLOR_BLOCKING'],
    compatibleIndustries: ['retail', 'tech', 'events', 'food'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope', 'Space Grotesk'],
  }),
  F({
    family: 'Bebas Neue',
    category: 'display',
    width: 'condensed',
    personality: ['tall', 'condensed', 'poster', 'energetic'],
    readability: 'display-only',
    formality: 2,
    bestFor: ['headline', 'offer', 'eyebrow'],
    compatibleStyles: ['NEO_BRUTALISM', 'BOLD_TYPOGRAPHY', 'Y2K', 'CINEMATIC_DRAMA'],
    compatibleIndustries: ['fitness', 'events', 'streetwear', 'entertainment'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope'],
  }),

  // ── Handwritten / marker ─────────────────────────────────────────────────
  F({
    family: 'Permanent Marker',
    category: 'handwritten',
    width: 'normal',
    personality: ['playful', 'marker', 'casual', 'energetic', 'imperfect'],
    readability: 'display-only',
    formality: 1,
    bestFor: ['accent', 'eyebrow', 'offer'],
    compatibleStyles: ['MINIMAL_DOODLES', 'IMPERFECT_HANDMADE', 'CREATOR_UGC', 'Y2K'],
    compatibleIndustries: ['food', 'events', 'education', 'lifestyle'],
    pairsWith: ['DM Sans', 'Inter', 'Poppins'],
  }),
  F({
    family: 'Caveat',
    category: 'handwritten',
    width: 'normal',
    personality: ['friendly', 'handwritten', 'casual', 'warm', 'imperfect'],
    readability: 'short-copy',
    formality: 1,
    bestFor: ['accent', 'eyebrow', 'subheadline'],
    compatibleStyles: ['MINIMAL_DOODLES', 'IMPERFECT_HANDMADE', 'CREATOR_UGC'],
    compatibleIndustries: ['food', 'lifestyle', 'education', 'wellness'],
    pairsWith: ['DM Sans', 'Inter', 'Lora'],
  }),
  F({
    family: 'Patrick Hand',
    category: 'handwritten',
    width: 'normal',
    personality: ['friendly', 'handwritten', 'doodle', 'approachable'],
    readability: 'short-copy',
    formality: 1,
    bestFor: ['accent', 'eyebrow', 'subheadline'],
    compatibleStyles: ['MINIMAL_DOODLES', 'IMPERFECT_HANDMADE'],
    compatibleIndustries: ['education', 'food', 'lifestyle'],
    pairsWith: ['DM Sans', 'Inter'],
  }),

  // ── Condensed / impact ───────────────────────────────────────────────────
  F({
    family: 'Oswald',
    category: 'sans-serif',
    width: 'condensed',
    personality: ['condensed', 'bold', 'editorial-poster', 'utilitarian'],
    readability: 'short-copy',
    formality: 3,
    bestFor: ['headline', 'eyebrow', 'offer'],
    compatibleStyles: ['NEO_BRUTALISM', 'BOLD_TYPOGRAPHY', 'CINEMATIC_DRAMA', 'EDITORIAL_DESIGN'],
    compatibleIndustries: ['news', 'sports', 'events', 'fashion'],
    pairsWith: ['Inter', 'DM Sans', 'Lora'],
  }),
  F({
    family: 'Barlow Condensed',
    category: 'sans-serif',
    width: 'condensed',
    personality: ['condensed', 'clean', 'versatile', 'technical'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['headline', 'eyebrow', 'metadata'],
    compatibleStyles: ['NEO_BRUTALISM', 'BOLD_TYPOGRAPHY', 'VIBRANT_COLOR_BLOCKING'],
    compatibleIndustries: ['tech', 'sports', 'automotive', 'events'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope'],
  }),

  // ── Serif / editorial ────────────────────────────────────────────────────
  F({
    family: 'Playfair Display',
    category: 'serif',
    width: 'normal',
    personality: ['elegant', 'high-contrast', 'editorial', 'luxury', 'dramatic'],
    readability: 'short-copy',
    formality: 5,
    bestFor: ['headline', 'subheadline'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'CINEMATIC_DRAMA', 'DESI_MAXIMALISM'],
    compatibleIndustries: ['fashion', 'beauty', 'hospitality', 'weddings', 'jewelry'],
    pairsWith: ['Inter', 'DM Sans', 'Lora'],
  }),
  F({
    family: 'Cormorant Garamond',
    category: 'serif',
    width: 'normal',
    personality: ['elegant', 'refined', 'fashion', 'delicate', 'sophisticated'],
    readability: 'short-copy',
    formality: 5,
    bestFor: ['headline', 'subheadline', 'accent'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'DESI_MAXIMALISM'],
    compatibleIndustries: ['fashion', 'beauty', 'hospitality', 'weddings', 'jewelry'],
    pairsWith: ['DM Sans', 'Inter', 'Manrope'],
  }),
  F({
    family: 'Libre Baskerville',
    category: 'serif',
    width: 'normal',
    personality: ['classic', 'literary', 'trustworthy', 'traditional'],
    readability: 'body-friendly',
    formality: 4,
    bestFor: ['headline', 'body', 'subheadline'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['finance', 'legal', 'publishing', 'education'],
    pairsWith: ['Inter', 'DM Sans'],
  }),
  F({
    family: 'Lora',
    category: 'serif',
    width: 'normal',
    personality: ['warm', 'readable', 'editorial-body', 'contemporary'],
    readability: 'body-friendly',
    formality: 4,
    bestFor: ['headline', 'body', 'subheadline'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'HUMAN_IN_ACTION', 'IMPERFECT_HANDMADE'],
    compatibleIndustries: ['food', 'wellness', 'publishing', 'hospitality'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope'],
  }),

  // ── Geometric sans (headline-capable) ────────────────────────────────────
  F({
    family: 'Poppins',
    category: 'sans-serif',
    width: 'normal',
    personality: ['geometric', 'friendly', 'modern', 'versatile', 'rounded'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['headline', 'body', 'cta'],
    compatibleStyles: ['MINIMAL_DOODLES', 'VIBRANT_COLOR_BLOCKING', 'CREATOR_UGC'],
    compatibleIndustries: ['tech', 'food', 'retail', 'wellness', 'education'],
    pairsWith: ['Inter', 'DM Sans', 'Lora'],
  }),
  F({
    family: 'Montserrat',
    category: 'sans-serif',
    width: 'normal',
    personality: ['urban', 'geometric', 'confident', 'contemporary'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['headline', 'body', 'cta'],
    compatibleStyles: ['BOLD_TYPOGRAPHY', 'VIBRANT_COLOR_BLOCKING', 'EDITORIAL_DESIGN'],
    compatibleIndustries: ['tech', 'retail', 'fashion', 'events'],
    pairsWith: ['Inter', 'DM Sans', 'Lora'],
  }),
  F({
    family: 'Space Grotesk',
    category: 'sans-serif',
    width: 'normal',
    personality: ['futuristic', 'technical', 'quirky', 'confident'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['headline', 'body'],
    compatibleStyles: ['Y2K', 'NEO_BRUTALISM', 'BOLD_TYPOGRAPHY'],
    compatibleIndustries: ['tech', 'gaming', 'startups', 'streetwear'],
    pairsWith: ['Inter', 'Manrope', 'DM Sans'],
  }),
  F({
    family: 'Outfit',
    category: 'sans-serif',
    width: 'normal',
    personality: ['clean', 'modern', 'minimal', 'neutral'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['headline', 'body'],
    compatibleStyles: ['MINIMAL_DOODLES', 'VIBRANT_COLOR_BLOCKING'],
    compatibleIndustries: ['tech', 'wellness', 'retail'],
    pairsWith: ['Inter', 'DM Sans', 'Manrope'],
  }),

  // ── Humanist sans (mostly body; some double as headline) ─────────────────
  F({
    family: 'Inter',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'readable', 'modern', 'technical', 'quiet'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'metadata', 'disclaimer', 'cta', 'headline'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'MINIMAL_DOODLES', 'NEO_BRUTALISM', 'VIBRANT_COLOR_BLOCKING', 'CREATOR_UGC', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['tech', 'finance', 'saas', 'general'],
    pairsWith: ['Playfair Display', 'Cormorant Garamond', 'Space Grotesk'],
  }),
  F({
    family: 'DM Sans',
    category: 'sans-serif',
    width: 'normal',
    personality: ['clean', 'modern', 'friendly', 'neutral'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'metadata', 'cta', 'headline'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'MINIMAL_DOODLES', 'VIBRANT_COLOR_BLOCKING', 'CREATOR_UGC'],
    compatibleIndustries: ['tech', 'lifestyle', 'retail', 'wellness'],
    pairsWith: ['Playfair Display', 'Cormorant Garamond', 'Anton'],
  }),
  F({
    family: 'Manrope',
    category: 'sans-serif',
    width: 'normal',
    personality: ['modern', 'semi-condensed', 'tech', 'confident'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'metadata', 'cta', 'headline'],
    compatibleStyles: ['NEO_BRUTALISM', 'BOLD_TYPOGRAPHY', 'VIBRANT_COLOR_BLOCKING'],
    compatibleIndustries: ['tech', 'startups', 'finance'],
    pairsWith: ['Anton', 'Archivo Black', 'Space Grotesk'],
  }),
  F({
    family: 'Plus Jakarta Sans',
    category: 'sans-serif',
    width: 'normal',
    personality: ['modern', 'rounded', 'friendly', 'approachable'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'metadata', 'cta'],
    compatibleStyles: ['MINIMAL_DOODLES', 'CREATOR_UGC', 'VIBRANT_COLOR_BLOCKING'],
    compatibleIndustries: ['lifestyle', 'wellness', 'food', 'education'],
    pairsWith: ['Playfair Display', 'Space Grotesk'],
  }),
  F({
    family: 'Roboto',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'readable', 'utilitarian'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'metadata', 'disclaimer'],
    compatibleStyles: ['HUMAN_IN_ACTION', 'EDITORIAL_DESIGN'],
    compatibleIndustries: ['general', 'informational', 'tech'],
    pairsWith: ['Playfair Display', 'Oswald'],
  }),

  // ── Script/language fallback (Noto) ──────────────────────────────────────
  F({
    family: 'Noto Sans',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'plain'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'headline', 'metadata', 'cta'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'HUMAN_IN_ACTION', 'DESI_MAXIMALISM'],
    compatibleIndustries: ['general'],
    pairsWith: ['Noto Serif'],
  }),
  F({
    family: 'Noto Serif',
    category: 'serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'formal'],
    readability: 'body-friendly',
    formality: 4,
    bestFor: ['headline', 'body'],
    compatibleStyles: ['EDITORIAL_DESIGN', 'DESI_MAXIMALISM'],
    compatibleIndustries: ['general'],
    pairsWith: ['Noto Sans'],
  }),
  F({
    family: 'Noto Sans Devanagari',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'plain'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'headline', 'metadata', 'cta'],
    compatibleStyles: ['DESI_MAXIMALISM', 'EDITORIAL_DESIGN', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['general'],
    languageSupport: ['latin', 'devanagari'],
    pairsWith: ['Noto Serif Devanagari', 'Noto Sans'],
  }),
  F({
    family: 'Noto Serif Devanagari',
    category: 'serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'formal'],
    readability: 'body-friendly',
    formality: 4,
    bestFor: ['headline', 'body'],
    compatibleStyles: ['DESI_MAXIMALISM', 'EDITORIAL_DESIGN'],
    compatibleIndustries: ['general'],
    languageSupport: ['latin', 'devanagari'],
    pairsWith: ['Noto Sans Devanagari'],
  }),
  F({
    family: 'Noto Sans Bengali',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'plain'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'headline', 'metadata', 'cta'],
    compatibleStyles: ['DESI_MAXIMALISM', 'EDITORIAL_DESIGN', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['general'],
    languageSupport: ['latin', 'bengali'],
    pairsWith: ['Noto Sans'],
  }),
  F({
    family: 'Noto Sans Tamil',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'plain'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'headline', 'metadata', 'cta'],
    compatibleStyles: ['DESI_MAXIMALISM', 'EDITORIAL_DESIGN', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['general'],
    languageSupport: ['latin', 'tamil'],
    pairsWith: ['Noto Sans'],
  }),
  F({
    family: 'Noto Sans Telugu',
    category: 'sans-serif',
    width: 'normal',
    personality: ['neutral', 'universal', 'plain'],
    readability: 'body-friendly',
    formality: 3,
    bestFor: ['body', 'headline', 'metadata', 'cta'],
    compatibleStyles: ['DESI_MAXIMALISM', 'EDITORIAL_DESIGN', 'HUMAN_IN_ACTION'],
    compatibleIndustries: ['general'],
    languageSupport: ['latin', 'telugu'],
    pairsWith: ['Noto Sans'],
  }),
];

const BY_FAMILY = new Map(FONT_CATALOG.map((f) => [f.family, f]));

export function getFontDefinition(family: string): FontDefinition | undefined {
  return BY_FAMILY.get(family);
}

/** Absolute path to server/assets/fonts. */
export const FONTS_ROOT = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');

/** The closest weight this family actually has a file for (never invents a weight it can't render). */
export function nearestAvailableWeight(family: string, target: number): number {
  const def = getFontDefinition(family);
  if (!def || def.weights.length === 0) return target;
  return def.weights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best));
}

/** Absolute file path for one face, only for weights the family actually has (see nearestAvailableWeight). */
export function fontFilePath(family: string, weight: number, style: 'normal' | 'italic' = 'normal'): string {
  const def = getFontDefinition(family);
  const resolvedStyle = def && !def.styles.includes(style) ? 'normal' : style;
  return path.join(FONTS_ROOT, fontFileRelPath(family, weight, resolvedStyle));
}

export { familySlug };

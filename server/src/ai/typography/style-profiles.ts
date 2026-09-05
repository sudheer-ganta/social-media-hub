import type { FontCategory } from './font-catalog';
import type { ArtDirectionFamily } from '../types';

/**
 * The typography personality of a creative style — what the spec's brief
 * asked for keyed to "Desi Maximalism" / "Neo Brutalism" / "Editorial
 * Design" etc., but this codebase has no such enum: creatives are art-
 * directed by `ArtDirectionFamily` (server/src/ai/types.ts), a 14-value axis
 * the Creative Director already chooses per concept and the renderer's
 * `ReferenceDesignRecipe` already derives from. Rather than bolt on a second,
 * disconnected "creative style" enum nothing else in the pipeline reads, this
 * keys typography profiles to the axis that's actually wired end-to-end —
 * see the mapping comment on each entry for how it corresponds to the
 * spec's named styles. `STYLE_KEYWORD_ALIASES` below additionally lets that
 * exact vocabulary (if it ever appears in a prompt or brand note) nudge
 * scoring, so the named styles work today via prose-matching and slot
 * straight into a first-class enum later without touching font-selector.ts.
 */

export type CaseHint = 'upper' | 'title' | 'sentence' | 'none';
export type TrackingHint = 'tight' | 'normal' | 'wide';
export type ScaleHint = 'oversized' | 'normal' | 'restrained';

export interface TypographyStyleProfile {
  personality: string[];
  preferredCategories: FontCategory[];
  /** Whether a distinct accent font (handwritten/decorative) is welcome for eyebrow/annotation roles. */
  accentFontAllowed: boolean;
  preferPairing: boolean;
  scaleHint: ScaleHint;
  trackingHint: TrackingHint;
  caseHint: CaseHint;
}

/** e.g. "NEO_BRUTALISM" -> ["Neo Brutalism", "brutalist", "brutalism"] — matched against free-text prose. */
export const STYLE_KEYWORD_ALIASES: Record<string, string[]> = {
  DESI_MAXIMALISM: ['desi maximalism', 'maximalist', 'maximalism'],
  HUMAN_IN_ACTION: ['human in action', 'lifestyle documentary'],
  NEO_BRUTALISM: ['neo brutalism', 'neo-brutalism', 'brutalist', 'brutalism'],
  Y2K: ['y2k', 'cybercore', 'retro-futuristic'],
  MINIMAL_DOODLES: ['minimal doodles', 'doodle', 'doodles'],
  EDITORIAL_DESIGN: ['editorial design', 'editorial', 'magazine style'],
  IMPERFECT_HANDMADE: ['imperfect', 'handmade', 'hand-made', 'handcrafted'],
  BOLD_TYPOGRAPHY: ['bold typography', 'typography-led', 'type-led'],
  CINEMATIC_DRAMA: ['cinematic', 'drama', 'dramatic'],
  CREATOR_UGC: ['creator', 'ugc', 'user generated', 'influencer'],
  VIBRANT_COLOR_BLOCKING: ['vibrant color blocking', 'color blocking', 'colour blocking'],
};

/**
 * Keyed by ArtDirectionFamily. Mapping to the spec's named styles noted per
 * entry. A family not listed here (rare — the fallback recipe deriver always
 * assigns one of the five typographyFamily buckets first) falls back to a
 * balanced sans-led profile in font-selector.ts.
 */
export const STYLE_PROFILES: Record<ArtDirectionFamily, TypographyStyleProfile> = {
  // "Editorial Design"
  EDITORIAL_PHOTOGRAPHY: {
    personality: ['sophisticated', 'fashionable', 'structured', 'premium', 'elegant'],
    preferredCategories: ['serif', 'sans-serif'],
    accentFontAllowed: false,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  CULTURAL_EDITORIAL: {
    personality: ['sophisticated', 'structured', 'premium', 'editorial'],
    preferredCategories: ['serif', 'sans-serif'],
    accentFontAllowed: false,
    preferPairing: true,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  SURREAL_EDITORIAL: {
    // High-energy editorial/maximalist ("Desi Maximalism" adjacent).
    personality: ['expressive', 'bold', 'high-energy', 'decorative'],
    preferredCategories: ['serif', 'display'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'normal',
    caseHint: 'title',
  },
  // "Y2K"
  INTERACTIVE_GRAPHIC: {
    personality: ['futuristic', 'geometric', 'energetic', 'unconventional'],
    preferredCategories: ['sans-serif', 'display'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'tight',
    caseHint: 'upper',
  },
  // "Bold Typography"
  TYPOGRAPHY_LED: {
    personality: ['bold', 'impactful', 'high-contrast', 'confident'],
    preferredCategories: ['display', 'sans-serif'],
    accentFontAllowed: false,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'tight',
    caseHint: 'upper',
  },
  PRODUCT_STUDIO: {
    personality: ['clean', 'precise', 'commercial', 'neutral'],
    preferredCategories: ['sans-serif'],
    accentFontAllowed: false,
    preferPairing: false,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  // "Human in Action"
  DOCUMENTARY: {
    personality: ['authentic', 'grounded', 'readable', 'warm'],
    preferredCategories: ['sans-serif', 'serif'],
    accentFontAllowed: false,
    preferPairing: true,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  // "Desi Maximalism"
  COLLAGE: {
    personality: ['expressive', 'decorative', 'high-energy', 'eclectic'],
    preferredCategories: ['serif', 'display', 'handwritten'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'normal',
    caseHint: 'title',
  },
  // "Imperfect / Handmade"
  HANDCRAFTED: {
    personality: ['handwritten', 'imperfect', 'casual', 'humanist', 'warm'],
    preferredCategories: ['handwritten', 'sans-serif'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'restrained',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  CINEMATIC: {
    // "Cinematic / Drama"
    personality: ['dramatic', 'moody', 'high-contrast', 'premium'],
    preferredCategories: ['serif', 'sans-serif'],
    accentFontAllowed: false,
    preferPairing: true,
    scaleHint: 'oversized',
    trackingHint: 'wide',
    caseHint: 'upper',
  },
  // "Minimal Doodles"
  MINIMAL_ART: {
    personality: ['friendly', 'restrained', 'quiet', 'minimal', 'airy'],
    preferredCategories: ['sans-serif'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'restrained',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  PLAYFUL_GRAPHIC: {
    // "Creator / UGC" adjacent — playful, rounded, approachable.
    personality: ['playful', 'rounded', 'friendly', 'approachable'],
    preferredCategories: ['sans-serif', 'handwritten'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  INFORMATIONAL: {
    // "Vibrant Color Blocking" adjacent — clean commercial layouts.
    personality: ['clean', 'geometric', 'confident', 'commercial'],
    preferredCategories: ['sans-serif'],
    accentFontAllowed: false,
    preferPairing: false,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
  ILLUSTRATIVE: {
    personality: ['handwritten', 'playful', 'doodle', 'casual'],
    preferredCategories: ['handwritten', 'sans-serif'],
    accentFontAllowed: true,
    preferPairing: true,
    scaleHint: 'normal',
    trackingHint: 'normal',
    caseHint: 'sentence',
  },
};

/** Reverse mapping: which named style(s) (STYLE_KEYWORD_ALIASES keys) each ArtDirectionFamily corresponds to, per the mapping comments above. Used to score a font's `compatibleStyles` even when the request's own prose never uses the named-style words. */
export const ART_DIRECTION_NAMED_STYLES: Record<ArtDirectionFamily, string[]> = {
  EDITORIAL_PHOTOGRAPHY: ['EDITORIAL_DESIGN'],
  CULTURAL_EDITORIAL: ['EDITORIAL_DESIGN', 'DESI_MAXIMALISM'],
  SURREAL_EDITORIAL: ['DESI_MAXIMALISM'],
  INTERACTIVE_GRAPHIC: ['Y2K'],
  TYPOGRAPHY_LED: ['BOLD_TYPOGRAPHY'],
  PRODUCT_STUDIO: ['VIBRANT_COLOR_BLOCKING'],
  DOCUMENTARY: ['HUMAN_IN_ACTION'],
  COLLAGE: ['DESI_MAXIMALISM'],
  HANDCRAFTED: ['IMPERFECT_HANDMADE'],
  CINEMATIC: ['CINEMATIC_DRAMA'],
  MINIMAL_ART: ['MINIMAL_DOODLES'],
  PLAYFUL_GRAPHIC: ['CREATOR_UGC'],
  INFORMATIONAL: ['VIBRANT_COLOR_BLOCKING'],
  ILLUSTRATIVE: ['MINIMAL_DOODLES'],
};

export const DEFAULT_STYLE_PROFILE: TypographyStyleProfile = {
  personality: ['neutral', 'clean', 'modern'],
  preferredCategories: ['sans-serif', 'serif'],
  accentFontAllowed: false,
  preferPairing: true,
  scaleHint: 'normal',
  trackingHint: 'normal',
  caseHint: 'sentence',
};

/** Named-style keywords (spec §2/§10) found in free text — a soft nudge alongside the ArtDirectionFamily profile, not a replacement for it. */
export function matchStyleKeywords(prose: string): string[] {
  const lower = prose.toLowerCase();
  const matched: string[] = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORD_ALIASES)) {
    if (keywords.some((k) => lower.includes(k))) matched.push(style);
  }
  return matched;
}

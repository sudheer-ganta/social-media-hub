/**
 * The curated Google Fonts subset FlowPost self-hosts, and the one place that
 * names where each family's actual font FILES come from — `scripts/fetch-fonts.ts`
 * reads this to populate `server/assets/fonts/`, and `font-catalog.ts` reads it
 * to know which weights/styles it may legally reference for a given family.
 *
 * Source: fontsource (`@fontsource/<slug>`), which mirrors Google Fonts and
 * — critically — still publishes genuinely distinct STATIC per-weight files.
 * Google's own CDN and upstream `google/fonts` repo now serve most families as
 * a single variable font; resvg's renderer does not implement variable-font
 * instancing (verified empirically — every weight rendered identical), so a
 * variable file would silently fake every weight but Regular. Static
 * per-weight files are the only way to guarantee "bold" actually looks bold.
 *
 * Adding a font later means adding one entry here (plus its metadata in
 * font-catalog.ts) and re-running the fetch script — no other code changes.
 */

export type FontSubset =
  | 'latin'
  | 'devanagari'
  | 'bengali'
  | 'tamil'
  | 'telugu';

export interface FontManifestEntry {
  /** The family name as it appears in font-family CSS/SVG and the catalog. */
  family: string;
  /** The @fontsource/<slug> package name. */
  fontsourceSlug: string;
  /** Which fontsource file-name subset to fetch — almost always 'latin'. */
  subset: FontSubset;
  weights: number[];
  styles: Array<'normal' | 'italic'>;
}

export const FONT_MANIFEST: FontManifestEntry[] = [
  // ── Display / headline-only (single-weight or near enough) ──────────────
  { family: 'Anton', fontsourceSlug: 'anton', subset: 'latin', weights: [400], styles: ['normal'] },
  { family: 'Archivo Black', fontsourceSlug: 'archivo-black', subset: 'latin', weights: [400], styles: ['normal'] },
  { family: 'Bebas Neue', fontsourceSlug: 'bebas-neue', subset: 'latin', weights: [400], styles: ['normal'] },

  // ── Handwritten / marker ─────────────────────────────────────────────────
  { family: 'Permanent Marker', fontsourceSlug: 'permanent-marker', subset: 'latin', weights: [400], styles: ['normal'] },
  { family: 'Caveat', fontsourceSlug: 'caveat', subset: 'latin', weights: [400, 700], styles: ['normal'] },
  { family: 'Patrick Hand', fontsourceSlug: 'patrick-hand', subset: 'latin', weights: [400], styles: ['normal'] },

  // ── Condensed / impact ───────────────────────────────────────────────────
  { family: 'Oswald', fontsourceSlug: 'oswald', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },
  { family: 'Barlow Condensed', fontsourceSlug: 'barlow-condensed', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },

  // ── Serif / editorial ────────────────────────────────────────────────────
  { family: 'Playfair Display', fontsourceSlug: 'playfair-display', subset: 'latin', weights: [400, 700, 900], styles: ['normal', 'italic'] },
  { family: 'Cormorant Garamond', fontsourceSlug: 'cormorant-garamond', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal', 'italic'] },
  { family: 'Libre Baskerville', fontsourceSlug: 'libre-baskerville', subset: 'latin', weights: [400, 700], styles: ['normal', 'italic'] },
  { family: 'Lora', fontsourceSlug: 'lora', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal', 'italic'] },

  // ── Geometric sans (headline-capable) ────────────────────────────────────
  { family: 'Poppins', fontsourceSlug: 'poppins', subset: 'latin', weights: [400, 500, 600, 700, 800], styles: ['normal'] },
  { family: 'Montserrat', fontsourceSlug: 'montserrat', subset: 'latin', weights: [400, 500, 600, 700, 800], styles: ['normal'] },
  { family: 'Space Grotesk', fontsourceSlug: 'space-grotesk', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },
  { family: 'Outfit', fontsourceSlug: 'outfit', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },

  // ── Humanist sans (body-friendly; some double as headline for minimal styles) ──
  { family: 'Inter', fontsourceSlug: 'inter', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },
  { family: 'DM Sans', fontsourceSlug: 'dm-sans', subset: 'latin', weights: [400, 500, 700], styles: ['normal'] },
  { family: 'Manrope', fontsourceSlug: 'manrope', subset: 'latin', weights: [400, 500, 600, 700, 800], styles: ['normal'] },
  { family: 'Plus Jakarta Sans', fontsourceSlug: 'plus-jakarta-sans', subset: 'latin', weights: [400, 500, 600, 700], styles: ['normal'] },
  { family: 'Roboto', fontsourceSlug: 'roboto', subset: 'latin', weights: [400, 500, 700], styles: ['normal'] },

  // ── Script/language fallback (Noto) ──────────────────────────────────────
  { family: 'Noto Sans', fontsourceSlug: 'noto-sans', subset: 'latin', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Serif', fontsourceSlug: 'noto-serif', subset: 'latin', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Sans Devanagari', fontsourceSlug: 'noto-sans-devanagari', subset: 'devanagari', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Serif Devanagari', fontsourceSlug: 'noto-serif-devanagari', subset: 'devanagari', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Sans Bengali', fontsourceSlug: 'noto-sans-bengali', subset: 'bengali', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Sans Tamil', fontsourceSlug: 'noto-sans-tamil', subset: 'tamil', weights: [400, 700], styles: ['normal'] },
  { family: 'Noto Sans Telugu', fontsourceSlug: 'noto-sans-telugu', subset: 'telugu', weights: [400, 700], styles: ['normal'] },
];

/** e.g. "Plus Jakarta Sans" -> "plus-jakarta-sans". Matches how files are named on disk. */
export function familySlug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Relative path (from server/assets/fonts) for one face — the join point between the manifest and the catalog. */
export function fontFileRelPath(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${familySlug(family)}/${weight}-${style}.ttf`;
}

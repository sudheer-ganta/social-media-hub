import type {
  CreativeDirection,
  RecipeBorderStyle,
  RecipeFooterStyle,
  RecipeImageTreatment,
  RecipeImperfection,
  RecipeLayoutBehaviour,
  RecipeLogoTreatment,
  RecipeShapeLanguage,
  RecipeSpacing,
  RecipeTexture,
  RecipeTypographyFamily,
  RecipeVisualDensity,
  ReferenceDesignRecipe,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * ReferenceDesignRecipe plumbing: bounds-check what the vision model returned,
 * and derive a sensible recipe from the concept + Creative DNA when no
 * references were analysed — so the renderer always executes ONE code path,
 * parameterized, never an if-recipe-else-legacy fork.
 */

const TYPOGRAPHY_FAMILIES: RecipeTypographyFamily[] = ['serif-editorial', 'sans-modern', 'condensed-display', 'geometric-sans', 'mixed'];
const LAYOUT_BEHAVIOURS: RecipeLayoutBehaviour[] = ['asymmetric', 'centered', 'grid', 'stacked', 'diagonal'];
const LOGO_TREATMENTS: RecipeLogoTreatment[] = ['integrated', 'corner', 'footer', 'watermark'];
const FOOTER_STYLES: RecipeFooterStyle[] = ['torn-paper', 'solid-band', 'hairline', 'none'];
const BORDER_STYLES: RecipeBorderStyle[] = ['none', 'hairline', 'thick', 'inset-frame'];
const TEXTURES: RecipeTexture[] = ['none', 'paper-grain', 'film-grain', 'halftone', 'noise'];
const SHAPE_LANGUAGES: RecipeShapeLanguage[] = ['organic', 'geometric', 'editorial-rules', 'none'];
const VISUAL_DENSITIES: RecipeVisualDensity[] = ['minimal', 'balanced', 'dense'];
const IMPERFECTIONS: RecipeImperfection[] = ['none', 'subtle', 'strong'];
const IMAGE_TREATMENTS: RecipeImageTreatment[] = ['full-bleed', 'framed', 'inset'];
const SPACINGS: RecipeSpacing[] = ['tight', 'generous', 'airy'];

function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value.trim()) ? (value.trim() as T) : fallback;
}

function asText(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asHexArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
        .filter((item) => /^#[0-9a-f]{6}$/.test(item)),
    ),
  ].slice(0, maxItems);
}

function asTextArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => asText(item, 120)).filter((item) => item.length > 0))].slice(0, maxItems);
}

/** Bounds a model-shaped (or wire-shaped) recipe payload. Returns undefined for a non-object, so absent stays absent. */
export function normaliseDesignRecipe(value: unknown): ReferenceDesignRecipe | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  return {
    photographyStyle: asText(r.photographyStyle),
    illustrationStyle: asText(r.illustrationStyle),
    headlineCharacter: asText(r.headlineCharacter),
    supportingTypography: asText(r.supportingTypography),
    compositionBehaviour: asText(r.compositionBehaviour),
    textHierarchy: asText(r.textHierarchy),
    typographyFamily: asEnum(r.typographyFamily, TYPOGRAPHY_FAMILIES, 'serif-editorial'),
    colorPalette: asHexArray(r.colorPalette, 6),
    layoutBehaviour: asEnum(r.layoutBehaviour, LAYOUT_BEHAVIOURS, 'asymmetric'),
    logoTreatment: asEnum(r.logoTreatment, LOGO_TREATMENTS, 'corner'),
    spacingBehaviour: asEnum(r.spacingBehaviour, SPACINGS, 'generous'),
    texture: asEnum(r.texture, TEXTURES, 'none'),
    graphicElements: asTextArray(r.graphicElements, 6),
    footerStyle: asEnum(r.footerStyle, FOOTER_STYLES, 'none'),
    borderStyle: asEnum(r.borderStyle, BORDER_STYLES, 'none'),
    shapeLanguage: asEnum(r.shapeLanguage, SHAPE_LANGUAGES, 'none'),
    visualDensity: asEnum(r.visualDensity, VISUAL_DENSITIES, 'balanced'),
    imperfectionLevel: asEnum(r.imperfectionLevel, IMPERFECTIONS, 'none'),
    imageTreatment: asEnum(r.imageTreatment, IMAGE_TREATMENTS, 'full-bleed'),
  };
}

/**
 * No references (or a pre-recipe saved profile): derive the recipe from what
 * the pipeline already knows. The prose-matching here is the LAST place free
 * text is interpreted — everything downstream branches on the recipe axes.
 */
export function deriveFallbackRecipe(
  direction: CreativeDirection,
  creativeDna: ResolvedCreativeDna,
  profile?: ReferenceStyleProfile,
): ReferenceDesignRecipe {
  const prose = [
    creativeDna.typographyCharacter,
    creativeDna.visualStyle,
    creativeDna.spacing,
    profile?.typographyCharacter,
    profile?.textureAndMaterial,
    profile?.visualDensity,
    profile?.imperfectionLevel,
    profile?.compositionPatterns.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const family = direction.artDirectionFamily;
  const tactile = /paper|tactile|torn|handmade|craft|grain|collage/.test(prose) || family === 'HANDCRAFTED' || family === 'COLLAGE';
  const typographic = family === 'TYPOGRAPHY_LED';
  const studio = family === 'PRODUCT_STUDIO' || family === 'INFORMATIONAL';

  // With no typographic prose to go on, the CONCEPT's own medium decides —
  // never one universal house serif. A playful graphic idea gets geometric
  // energy, a studio/informational shot gets a clean sans, editorial and
  // cinematic families earn the serif.
  const familyTypography: RecipeTypographyFamily =
    family === 'TYPOGRAPHY_LED'
      ? 'condensed-display'
      : family === 'PLAYFUL_GRAPHIC' || family === 'INTERACTIVE_GRAPHIC'
        ? 'geometric-sans'
        : family === 'PRODUCT_STUDIO' || family === 'INFORMATIONAL' || family === 'MINIMAL_ART'
          ? 'sans-modern'
          : family === 'COLLAGE' || family === 'HANDCRAFTED'
            ? 'mixed'
            : 'serif-editorial';
  const typographyFamily: RecipeTypographyFamily = /condensed|display|impact/.test(prose)
    ? 'condensed-display'
    : /geometric|grotesk|modern sans|minimal/.test(prose)
      ? 'geometric-sans'
      : /sans/.test(prose)
        ? 'sans-modern'
        : /serif|editorial|classic/.test(prose)
          ? 'serif-editorial'
          : familyTypography;

  return {
    photographyStyle: creativeDna.photographyStyle,
    illustrationStyle: '',
    headlineCharacter: creativeDna.typographyCharacter || (typographic ? 'oversized display type as the visual itself' : 'confident editorial headline'),
    supportingTypography: 'small, quiet supporting copy',
    compositionBehaviour: direction.composition,
    textHierarchy: 'headline first, one supporting line, footer detail last',
    typographyFamily,
    colorPalette: [],
    layoutBehaviour: typographic ? 'centered' : studio ? 'grid' : 'asymmetric',
    logoTreatment: tactile ? 'footer' : 'corner',
    spacingBehaviour: /dense|busy|layer/.test(prose) ? 'tight' : /airy|minimal|space/.test(prose) ? 'airy' : 'generous',
    texture: tactile ? 'paper-grain' : 'none',
    graphicElements: tactile ? ['thin rule dividers'] : [],
    footerStyle: tactile ? 'torn-paper' : studio ? 'solid-band' : 'none',
    borderStyle: 'none',
    shapeLanguage: tactile ? 'organic' : studio ? 'geometric' : 'editorial-rules',
    visualDensity: /dense|busy/.test(prose) ? 'dense' : /minimal|airy/.test(prose) ? 'minimal' : 'balanced',
    imperfectionLevel: tactile ? 'subtle' : 'none',
    imageTreatment: studio ? 'inset' : 'full-bleed',
  };
}

/** The one entry the renderer calls: the analysed recipe when there is one, the derived fallback otherwise. */
export function resolveDesignRecipe(
  direction: CreativeDirection,
  creativeDna: ResolvedCreativeDna,
  profile?: ReferenceStyleProfile,
): ReferenceDesignRecipe {
  return profile?.analysed && profile.designRecipe
    ? profile.designRecipe
    : deriveFallbackRecipe(direction, creativeDna, profile);
}

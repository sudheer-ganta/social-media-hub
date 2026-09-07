import {
  FONT_CATALOG,
  getFontDefinition,
  nearestAvailableWeight,
  type FontCategory,
  type FontDefinition,
  type FontRole,
  type ScriptTag,
} from './font-catalog';
import {
  ART_DIRECTION_NAMED_STYLES,
  DEFAULT_STYLE_PROFILE,
  STYLE_PROFILES,
  matchStyleKeywords,
  type CaseHint,
  type TypographyStyleProfile,
} from './style-profiles';
import { detectScriptsAcross } from './language';
import type { ArtDirectionFamily, CreativeDirection, ReferenceDesignRecipe, ResolvedCreativeDna } from '../types';
import type { StyleDNA } from '../style-dna/style-dna';

/**
 * FlowPost's automatic typography engine (spec: the user never selects a
 * font). Scores every candidate in the curated catalog against the full
 * generation context — creative style, brand, industry, copy, language —
 * rather than a fixed "style X -> font Y" lookup, so two requests in the
 * same ArtDirectionFamily can land on genuinely different fonts (see the
 * "editorial fashion" vs "editorial tech announcement" cases in
 * font-selector.test.ts).
 */

export interface RoleTypography {
  family: string;
  weight: number;
  fontSize: number; // multiplier of canvas width — same convention as LAYOUT_CONFIG in render/layout-plan.ts
  letterSpacing: number;
  lineHeightMult: number;
  caseTransform: CaseHint;
  italic: boolean;
}

/** The FontStack shape render/layout-plan.ts already builds its geometry from — kept so that module barely changes. */
export interface BaseFontStack {
  headline: string;
  body: string;
  /** The weight the catalog actually has a file for (see nearestAvailableWeight) — a single-weight display font like Anton never gets asked to render a "700" it doesn't have. */
  headlineWeight: number;
  bodyWeight: number;
  headlineCharWidth: number;
  lineHeightMult: number;
  letterSpacing?: number;
}

export interface TypographySelection {
  headlineFont: string;
  bodyFont: string;
  accentFont?: string;
  headlineWeight: number;
  bodyWeight: number;
  accentWeight?: number;
  typographyReasoning: string;
  hierarchy: Record<FontRole, RoleTypography>;
  /** Render-ready stack for the existing layout geometry (render/layout-plan.ts). */
  baseFontStack: BaseFontStack;
  /** Every distinct (family, weight, style) the renderer must load — see render/text-rasterizer.ts. */
  facesUsed: Array<{ family: string; weight: number; style: 'normal' | 'italic' }>;
}

export interface FontSelectionInput {
  direction: CreativeDirection;
  creativeDna: ResolvedCreativeDna;
  recipe: ReferenceDesignRecipe;
  styleDna?: StyleDNA;
}

// ─── Prose signal extraction ────────────────────────────────────────────────

const CATALOG_PERSONALITY_WORDS = [...new Set(FONT_CATALOG.flatMap((f) => f.personality))];

/** Common brief vocabulary that implies a font personality without using the catalog's own words verbatim. */
const PERSONALITY_SYNONYMS: Record<string, string[]> = {
  technology: ['futuristic', 'technical', 'modern'],
  tech: ['futuristic', 'technical', 'modern'],
  digital: ['futuristic', 'technical', 'modern'],
  software: ['technical', 'modern'],
  app: ['modern', 'clean'],
  startup: ['modern', 'confident'],
  luxury: ['elegant', 'sophisticated', 'premium'],
  premium: ['elegant', 'sophisticated', 'premium'],
  fashion: ['elegant', 'fashion', 'sophisticated'],
  wedding: ['elegant', 'delicate', 'refined'],
  playful: ['playful', 'friendly'],
  fun: ['playful', 'friendly'],
  kids: ['playful', 'friendly', 'rounded'],
  handmade: ['imperfect', 'handwritten', 'casual'],
  organic: ['warm', 'humanist'],
  streetwear: ['bold', 'loud', 'confident'],
  festival: ['expressive', 'high-energy', 'decorative'],
  minimal: ['restrained', 'quiet', 'minimal'],
  bold: ['bold', 'confident', 'impactful'],
  loud: ['bold', 'loud', 'confident'],
  gritty: ['industrial', 'utilitarian'],
  cinematic: ['dramatic', 'moody'],
};

function extractPersonalitySignals(prose: string): Set<string> {
  const lower = prose.toLowerCase();
  const found = new Set<string>();
  for (const word of CATALOG_PERSONALITY_WORDS) {
    if (lower.includes(word)) found.add(word);
  }
  for (const [trigger, adds] of Object.entries(PERSONALITY_SYNONYMS)) {
    if (lower.includes(trigger)) adds.forEach((w) => found.add(w));
  }
  return found;
}

const INDUSTRY_KEYWORDS: Record<string, RegExp> = {
  tech: /\b(tech|technology|software|saas|app|startup|digital|ai\b)/i,
  food: /\b(restaurant|food|cafe|caf[ée]|coffee|menu|dining|cuisine|kitchen|momo|snack|beverage|drink)/i,
  fashion: /\b(fashion|apparel|clothing|couture|style|outfit|wear)/i,
  beauty: /\b(beauty|skincare|cosmetic|makeup|salon|spa)/i,
  fitness: /\b(fitness|gym|workout|athlet|sport)/i,
  finance: /\b(finance|bank|invest|fintech|insurance|loan)/i,
  education: /\b(school|course|learn|education|student|tutor)/i,
  wellness: /\b(wellness|yoga|meditat|health|mindful)/i,
  events: /\b(event|festival|concert|conference|celebration|launch party)/i,
  hospitality: /\b(hotel|resort|hospitality|travel|stay)/i,
  retail: /\b(retail|store|shop|ecommerce|sale)/i,
  gaming: /\b(game|gaming|esports)/i,
  streetwear: /\b(streetwear|sneaker|hype)/i,
  automotive: /\b(car|auto|vehicle|automotive)/i,
  jewelry: /\b(jewel|jewellery|jewelry)/i,
};

function detectIndustry(prose: string): string | undefined {
  for (const [industry, pattern] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (pattern.test(prose)) return industry;
  }
  return undefined;
}

function formalityTarget(personality: string[]): number {
  let target = 3;
  const words = personality.join(' ').toLowerCase();
  if (/premium|luxury|sophisticated|formal|elegant/.test(words)) target += 1;
  if (/casual|playful|friendly|handwritten/.test(words)) target -= 1;
  return Math.max(1, Math.min(5, target));
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

interface ScoreContext {
  role: FontRole;
  styleProfile: TypographyStyleProfile;
  desiredPersonality: Set<string>;
  desiredFormality: number;
  industry?: string;
  namedStyles: string[];
  requiredScripts: ScriptTag[];
  brandFamily?: string;
}

function supportsScripts(font: FontDefinition, required: ScriptTag[]): boolean {
  return required.every((s) => font.languageSupport.includes(s));
}

function scoreFont(font: FontDefinition, ctx: ScoreContext): number {
  if (!supportsScripts(font, ctx.requiredScripts)) return -Infinity;

  // A display-only face is illegible at body/metadata/disclaimer/cta sizes —
  // excluded outright rather than merely penalized.
  const needsReadableBody = ctx.role === 'body' || ctx.role === 'metadata' || ctx.role === 'disclaimer' || ctx.role === 'cta';
  if (needsReadableBody && font.readability === 'display-only') return -Infinity;

  let score = 0;

  const personalityMatches = font.personality.filter((p) => ctx.desiredPersonality.has(p)).length;
  score += Math.min(personalityMatches, 4) * 3;

  if (ctx.styleProfile.preferredCategories.includes(font.category)) score += 2;

  if (font.bestFor.includes(ctx.role)) score += 2;

  const styleMatches = font.compatibleStyles.filter((s) => ctx.namedStyles.includes(s)).length;
  score += Math.min(styleMatches, 2) * 2;

  if (ctx.industry && font.compatibleIndustries.includes(ctx.industry)) score += 4;

  // An accent exists to be a distinctive flourish (eyebrow/annotation), not a
  // third helping of the same neutral sans as headline/body — without this,
  // a well-matched geometric sans can out-score the handwritten/display faces
  // an accent role is actually for.
  if (ctx.role === 'accent' && (font.category === 'handwritten' || font.category === 'display')) score += 3;

  score -= Math.abs(font.formality - ctx.desiredFormality) * 1.5;

  if (ctx.brandFamily && font.family === ctx.brandFamily) {
    score += ctx.role === 'body' ? 12 : 2;
  }

  return score;
}

/**
 * A style's `preferredCategories` is authoritative — the member's selected
 * style (or, absent one, the concept's ArtDirectionFamily profile) must not
 * be silently reinterpreted by typography. This filters candidates BEFORE
 * scoring, so nothing downstream (pairing, brand-family boost, personality
 * match) can ever resurrect a category the style excludes. Previously this
 * was only a +2 scoring bonus, which a strong pairing/personality match
 * could outweigh — e.g. a sans-only style still ending up with a serif body
 * font because it was in the headline font's `pairsWith` list.
 */
function categoryAllowed(font: FontDefinition, ctx: ScoreContext): boolean {
  return ctx.styleProfile.preferredCategories.includes(font.category);
}

function rankCandidates(role: FontRole, ctx: ScoreContext): FontDefinition[] {
  const rank = (fonts: FontDefinition[]) =>
    fonts
      .map((font) => ({ font, score: scoreFont(font, ctx) }))
      .filter((entry) => entry.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.font);

  const constrained = rank(FONT_CATALOG.filter((font) => categoryAllowed(font, ctx)));
  // Only widen back to the full catalog when the hard constraint leaves
  // nothing at all for this role (e.g. a required script has no family in
  // the allowed categories) — never to let a well-paired or well-scored font
  // from an excluded category win anyway.
  return constrained.length > 0 ? constrained : rank(FONT_CATALOG);
}

// ─── Geometry helpers (feeds render/layout-plan.ts's existing char-count wrapper) ──

const CHAR_WIDTH_BY_CATEGORY: Record<FontCategory, number> = {
  serif: 0.54,
  'sans-serif': 0.56,
  display: 0.5,
  handwritten: 0.5,
  monospace: 0.6,
};

function charWidthFor(font: FontDefinition): number {
  const base = CHAR_WIDTH_BY_CATEGORY[font.category];
  return font.width === 'condensed' ? base * 0.82 : font.width === 'expanded' ? base * 1.1 : base;
}

function lineHeightFor(font: FontDefinition): number {
  if (font.category === 'display') return 1.0;
  if (font.category === 'handwritten') return 1.25;
  if (font.category === 'serif') return 1.15;
  return 1.1;
}

function letterSpacingFor(font: FontDefinition, tracking: TypographyStyleProfile['trackingHint']): number {
  const base = font.width === 'condensed' ? -0.6 : font.category === 'display' ? 0 : 0.2;
  const adjust = tracking === 'wide' ? 1.4 : tracking === 'tight' ? -0.8 : 0;
  return Math.round((base + adjust) * 10) / 10;
}

const ROLE_WEIGHT_TARGET: Record<FontRole, number> = {
  eyebrow: 600,
  headline: 700,
  subheadline: 500,
  body: 400,
  offer: 700,
  cta: 600,
  metadata: 400,
  disclaimer: 400,
  accent: 400,
};

const ROLE_SIZE_MULTIPLIER: Record<FontRole, number> = {
  eyebrow: 0.02,
  headline: 0.072,
  subheadline: 0.026,
  body: 0.022,
  offer: 0.03,
  cta: 0.021,
  metadata: 0.018,
  disclaimer: 0.015,
  accent: 0.024,
};

function roleTypography(font: FontDefinition, role: FontRole, profile: TypographyStyleProfile): RoleTypography {
  const weight = nearestAvailableWeight(font.family, ROLE_WEIGHT_TARGET[role]);
  const scaleAdj = profile.scaleHint === 'oversized' ? 1.15 : profile.scaleHint === 'restrained' ? 0.88 : 1;
  const caseTransform: CaseHint =
    (role === 'headline' || role === 'offer' || role === 'eyebrow' || role === 'cta') ? profile.caseHint : role === 'disclaimer' ? 'none' : 'sentence';
  return {
    family: font.family,
    weight,
    fontSize: ROLE_SIZE_MULTIPLIER[role] * (role === 'headline' ? scaleAdj : 1),
    letterSpacing: letterSpacingFor(font, profile.trackingHint),
    lineHeightMult: lineHeightFor(font),
    caseTransform,
    italic: (role === 'subheadline' || role === 'accent') && font.styles.includes('italic'),
  };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function selectTypography({ direction, creativeDna, recipe, styleDna }: FontSelectionInput): TypographySelection {
  const familyProfile = STYLE_PROFILES[direction.artDirectionFamily] ?? DEFAULT_STYLE_PROFILE;
  const styleProfile: TypographyStyleProfile = styleDna ? {
    personality: styleDna.typography.displayPersonality,
    preferredCategories: styleDna.typography.preferredCategories,
    accentFontAllowed: styleDna.typography.accentAllowed,
    preferPairing: true,
    scaleHint: styleDna.typography.hierarchy === 'dramatic' ? 'oversized' : styleDna.typography.hierarchy === 'restrained' ? 'restrained' : 'normal',
    trackingHint: styleDna.typography.tracking,
    caseHint: familyProfile.caseHint,
  } : familyProfile;
  const namedStyles = [
    ...(ART_DIRECTION_NAMED_STYLES[direction.artDirectionFamily] ?? []),
    ...matchStyleKeywords(
      [creativeDna.visualStyle, creativeDna.typographyCharacter, recipe.headlineCharacter].filter(Boolean).join(' '),
    ),
  ];

  const contextProse = [
    direction.concept,
    direction.visualStory,
    direction.subject,
    direction.environment,
    direction.mood,
    creativeDna.visualStyle,
    creativeDna.mood,
    creativeDna.typographyCharacter,
    recipe.headlineCharacter,
    recipe.supportingTypography,
  ]
    .filter(Boolean)
    .join(' ');

  const desiredPersonality = new Set<string>([...styleProfile.personality, ...extractPersonalitySignals(contextProse)]);
  const desiredFormality = formalityTarget([...desiredPersonality]);
  const industry = detectIndustry(
    [direction.concept, direction.subject, direction.environment, creativeDna.visualStyle, ...direction.brandConstraints].join(' '),
  );

  const requiredScripts = detectScriptsAcross([
    direction.headline,
    direction.supportingLine,
    direction.cta,
    direction.marketingCreative?.brandMessage,
    direction.marketingCreative?.offerText,
    direction.marketingCreative?.eventBadge,
    ...(direction.marketingCreative?.secondaryInfo ?? []),
  ]);

  const baseCtx = { styleProfile, desiredPersonality, desiredFormality, industry, namedStyles, requiredScripts };

  // ── Headline ──
  const headlineCandidates = rankCandidates('headline', {
    ...baseCtx,
    role: 'headline',
    brandFamily: creativeDna.headlineFont || undefined,
  });
  const headlineFont = headlineCandidates[0] ?? getFontDefinition('Inter')!;

  // ── Body — prefers the headline's own paired partners, brand body font still the strongest signal ──
  const bodyCandidates = rankCandidates('body', {
    ...baseCtx,
    role: 'body',
    brandFamily: creativeDna.bodyFont || undefined,
  });
  const pairedBody = bodyCandidates.find((f) => headlineFont.pairsWith.includes(f.family));
  const bodyFont = pairedBody ?? bodyCandidates.find((f) => f.family !== headlineFont.family) ?? bodyCandidates[0] ?? getFontDefinition('Inter')!;

  // ── Accent — only when the style calls for one and the concept has a role for it (eyebrow/interactive annotation).
  // Ranked on its own terms (personality/category/bestFor/compatibleStyles), NOT by headline/body pairing —
  // an accent is a decorative flourish (often handwritten), and pairsWith is curated for headline+body legibility,
  // so preferring pairsWith membership here previously picked a plain sans partner over a genuine accent face.
  let accentFont: FontDefinition | undefined;
  if (styleProfile.accentFontAllowed) {
    accentFont = rankCandidates('accent', { ...baseCtx, role: 'accent' }).find(
      (f) => f.family !== headlineFont.family && f.family !== bodyFont.family,
    );
  }

  const preferredHeadlineWeight = styleDna?.typography.preferredWeights.at(-1) ?? ROLE_WEIGHT_TARGET.headline;
  const preferredBodyWeight = styleDna?.typography.preferredWeights[0] ?? ROLE_WEIGHT_TARGET.body;
  const headlineWeight = nearestAvailableWeight(headlineFont.family, preferredHeadlineWeight);
  const bodyWeight = nearestAvailableWeight(bodyFont.family, preferredBodyWeight);
  const accentWeight = accentFont ? nearestAvailableWeight(accentFont.family, ROLE_WEIGHT_TARGET.accent) : undefined;

  const roles: FontRole[] = ['eyebrow', 'headline', 'subheadline', 'body', 'offer', 'cta', 'metadata', 'disclaimer', 'accent'];
  const roleFontFor = (role: FontRole): FontDefinition => {
    if (role === 'headline' || role === 'offer' || role === 'eyebrow') return headlineFont;
    if (role === 'accent') return accentFont ?? headlineFont;
    return bodyFont;
  };
  const hierarchy = Object.fromEntries(
    roles.map((role) => [role, roleTypography(roleFontFor(role), role, styleProfile)]),
  ) as Record<FontRole, RoleTypography>;

  const baseFontStack: BaseFontStack = {
    headline: headlineFont.family,
    body: bodyFont.family,
    headlineWeight,
    bodyWeight,
    headlineCharWidth: charWidthFor(headlineFont),
    lineHeightMult: lineHeightFor(headlineFont),
    letterSpacing: letterSpacingFor(headlineFont, styleProfile.trackingHint),
  };

  const facesUsed = new Map<string, { family: string; weight: number; style: 'normal' | 'italic' }>();
  const addFace = (family: string, weight: number, style: 'normal' | 'italic' = 'normal') =>
    facesUsed.set(`${family}|${weight}|${style}`, { family, weight, style });
  addFace(headlineFont.family, headlineWeight);
  addFace(bodyFont.family, bodyWeight);
  addFace(bodyFont.family, nearestAvailableWeight(bodyFont.family, 600)); // CTA/badge weight (primitives.ts hardcodes 600)
  if (accentFont && accentWeight) {
    addFace(accentFont.family, accentWeight);
    addFace(accentFont.family, nearestAvailableWeight(accentFont.family, 600)); // in case an interactive badge uses the accent font
  }

  const reasonParts = [
    `Headline: ${headlineFont.family} (${headlineFont.personality.slice(0, 3).join('/')}) for its ${headlineFont.category} character`,
    industry ? `matched to a ${industry} context` : undefined,
    `Body: ${bodyFont.family}, a neutral, readable partner${headlineFont.pairsWith.includes(bodyFont.family) ? ' from the headline’s own pairing list' : ''}`,
    accentFont ? `Accent: ${accentFont.family} for eyebrow/annotation flourishes the style calls for` : undefined,
    creativeDna.headlineFont || creativeDna.bodyFont ? 'brand typography honoured where the requested style allowed it' : undefined,
  ].filter(Boolean);

  return {
    headlineFont: headlineFont.family,
    bodyFont: bodyFont.family,
    accentFont: accentFont?.family,
    headlineWeight,
    bodyWeight,
    accentWeight,
    typographyReasoning: reasonParts.join('. ') + '.',
    hierarchy,
    baseFontStack,
    facesUsed: [...facesUsed.values()],
  };
}

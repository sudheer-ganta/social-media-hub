import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import type { GraphicDesignConcept } from '../types';
import type { CaseHint } from './style-profiles';
import type { FontRole } from './font-catalog';
import type { TypographySelection } from './font-selector';

/**
 * The type system for one creative: one base size, one ratio, every other size
 * derived from them.
 *
 * This is the half of typography the renderer previously had no representation
 * for. `selectTypography` picks excellent families and computes a full per-role
 * hierarchy — tracking, line height, case, italic — and the renderer then used
 * two families, two weights, a line height hardcoded to 1.15/1.25, and no
 * tracking at all. Everything else was thrown away, which is why finished
 * creatives looked like defaults rendered in a nice font rather than like
 * typography.
 *
 * Two independent choices become one relationship here. A designer does not pick
 * a headline size and then pick a caption size; they pick a base and a ratio and
 * read the rest off the scale, which is what makes a hierarchy feel deliberate
 * instead of arbitrary. Sizes on a modular scale are `base * ratio^n`.
 *
 * The ratio comes from what the art director declared about scale contrast — not
 * from the subject, the occasion, the industry or the platform. Nothing here may
 * be keyed on what the creative is ABOUT (see CLAUDE.md); it is keyed on what the
 * blueprint said the type should DO.
 */

export type SemanticRole = 'primary-hook' | 'secondary-hook' | 'supporting-note';

export interface TypeStep {
  family: string;
  weight: number;
  /** Multiplier of the canvas short edge — the `fontScale` convention DesignNode already uses. */
  fontScale: number;
  /** Fraction of the font size; positive opens the line, negative tightens it. */
  letterSpacing: number;
  /** Multiplier of font size between baselines. */
  lineHeight: number;
  caseTransform: CaseHint;
  italic: boolean;
}

export interface TypeSystem {
  /** The one modular ratio governing this creative. */
  ratio: number;
  /** Size of the smallest step, as a fraction of the canvas short edge. */
  base: number;
  steps: Record<SemanticRole, TypeStep>;
  /** Nothing may render below this, whatever the plan asks for. */
  opticalFloor: number;
  reasoning: string;
}

/**
 * The classical modular ratios, by how much separation the art director asked
 * for. Minor third is a whisper between levels; the golden ratio is a shout.
 */
const RATIOS = {
  minorThird: 1.2,
  majorThird: 1.25,
  perfectFifth: 1.5,
  golden: 1.618,
} as const;

/**
 * The smallest type that still reads. Creatives are rendered on a 1600px long
 * edge and then viewed in a feed at roughly 1080px and in a grid thumbnail at
 * around 320px, so the floor is expressed against the canvas rather than in
 * absolute pixels: 1.5% of the short edge is about 24px at render size and
 * survives the 1080px downscale, which is where captions and disclaimers live.
 */
const OPTICAL_FLOOR = 0.015;

/** Display type at feed scale reads down to about here before it stops being display. */
const DISPLAY_FLOOR = 0.038;

/**
 * Tracking is a function of size, and this is the single strongest signal that
 * type was set rather than defaulted. Display sizes need negative tracking
 * because the gaps between letters grow with the type; small sizes need positive
 * tracking because they close up. Type set at one tracking for every size is the
 * look of software output.
 */
function trackingFor(fontScale: number, declared: number | undefined, caseTransform: CaseHint): number {
  const base =
    fontScale >= 0.09 ? -0.022 : fontScale >= 0.06 ? -0.015 : fontScale >= 0.038 ? -0.008 : fontScale <= 0.02 ? 0.02 : 0.004;
  // All-caps has no ascender/descender rhythm to separate letters, so it always
  // wants more air than the same size in mixed case.
  const caseAdjust = caseTransform === 'upper' ? 0.014 : 0;
  // The font's own catalog letter-spacing (in 0.1px units) nudges, never decides:
  // a condensed face wants tighter setting than a wide one at the same size.
  const familyNudge = typeof declared === 'number' ? Math.max(-0.01, Math.min(0.01, declared / 100)) : 0;
  return Number((base + caseAdjust + familyNudge).toFixed(4));
}

/**
 * Line height falls as type grows: a headline set at body line height looks
 * gappy and loses its punch, and body copy set at headline line height is hard
 * to read. The font's own preference (serif vs display vs handwritten) sets the
 * starting point and size adjusts it from there.
 */
function lineHeightFor(fontScale: number, familyPreference: number): number {
  const sizeAdjust = fontScale >= 0.09 ? -0.14 : fontScale >= 0.06 ? -0.08 : fontScale >= 0.038 ? -0.03 : 0.06;
  return Number(Math.max(0.92, Math.min(1.5, familyPreference + sizeAdjust)).toFixed(3));
}

/**
 * Reads the ratio off what the blueprint declared about scale, never off what the
 * creative is about. Prose rather than an enum because that is what the art
 * director writes — `typographyScaleContrast` is a free-text field, and an
 * undecided one must stay undecided rather than acquiring a default that every
 * creative then shares.
 */
function resolveRatio(concept: Pick<GraphicDesignConcept, 'typographyScaleContrast' | 'hierarchyStrategy' | 'typographyStrategy'>): {
  ratio: number;
  named: string;
} {
  const declared = [concept.typographyScaleContrast, concept.hierarchyStrategy, concept.typographyStrategy]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase();

  if (/extreme|violent|enormous|colossal|shout|overwhelming|vast (?:size )?(?:gap|difference)/.test(declared)) {
    return { ratio: RATIOS.golden, named: 'golden ratio (extreme contrast)' };
  }
  if (/dramatic|dominant|huge|massive|oversized|strong contrast|commanding|hero/.test(declared)) {
    return { ratio: RATIOS.perfectFifth, named: 'perfect fifth (dramatic contrast)' };
  }
  if (/restrained|quiet|subtle|even|flat hierarchy|close|gentle|understated|equal/.test(declared)) {
    return { ratio: RATIOS.minorThird, named: 'minor third (restrained contrast)' };
  }
  return { ratio: RATIOS.majorThird, named: 'major third' };
}

/**
 * How much of the canvas the type may occupy sets the base size, so a creative
 * with one line gets genuinely large type and a creative with five lines does not
 * overflow. This replaces the fixed scale bands that were handed to the planning
 * model for every creative regardless of how much copy it carried.
 */
function resolveBase(lineCount: number, longestLine: number, ratio: number, steps: number): number {
  // Budget: the tallest step must fit its share of the canvas alongside the rest.
  const verticalBudget = lineCount <= 1 ? 0.34 : lineCount === 2 ? 0.3 : lineCount === 3 ? 0.24 : 0.19;
  const topStep = ratio ** steps;
  const fromHeight = verticalBudget / (topStep + Math.max(0, lineCount - 1) * 0.9);
  // A long headline cannot be set large however much vertical room there is —
  // character count is the real constraint on display type.
  const fromLength = longestLine > 0 ? 1.9 / (longestLine * topStep) : fromHeight;
  return Math.max(OPTICAL_FLOOR, Math.min(0.075, Math.min(fromHeight, fromLength)));
}

const ROLE_TO_FONT_ROLE: Record<SemanticRole, FontRole> = {
  'primary-hook': 'headline',
  'secondary-hook': 'offer',
  'supporting-note': 'body',
};

/** Scale steps above the base, per role — the hierarchy as a set of intervals. */
const ROLE_STEPS: Record<SemanticRole, number> = {
  'primary-hook': 3,
  'secondary-hook': 1,
  'supporting-note': 0,
};

export interface BuildTypeSystemInput {
  typography: TypographySelection;
  concept: Pick<GraphicDesignConcept, 'typographyScaleContrast' | 'hierarchyStrategy' | 'typographyStrategy'>;
  copy: CampaignCopyLine[];
}

export function buildTypeSystem({ typography, concept, copy }: BuildTypeSystemInput): TypeSystem {
  const { ratio, named } = resolveRatio(concept);

  const lineCount = Math.max(1, copy.length);
  const longest = copy.reduce((max, c) => Math.max(max, c.text.length), 0);
  const base = resolveBase(lineCount, longest, ratio, ROLE_STEPS['primary-hook']);

  const steps = Object.fromEntries(
    (Object.keys(ROLE_STEPS) as SemanticRole[]).map((role) => {
      const fontRole = ROLE_TO_FONT_ROLE[role];
      const roleTypography = typography.hierarchy[fontRole];
      const isDisplay = role !== 'supporting-note';
      const rawScale = base * ratio ** ROLE_STEPS[role];
      const fontScale = Number(Math.max(isDisplay ? DISPLAY_FLOOR : OPTICAL_FLOOR, Math.min(0.34, rawScale)).toFixed(4));
      return [
        role,
        {
          family: roleTypography.family,
          weight: roleTypography.weight,
          fontScale,
          letterSpacing: trackingFor(fontScale, roleTypography.letterSpacing, roleTypography.caseTransform),
          lineHeight: lineHeightFor(fontScale, roleTypography.lineHeightMult),
          caseTransform: roleTypography.caseTransform,
          italic: roleTypography.italic,
        } satisfies TypeStep,
      ];
    }),
  ) as Record<SemanticRole, TypeStep>;

  return {
    ratio,
    base,
    steps,
    opticalFloor: OPTICAL_FLOOR,
    reasoning:
      `Scale: ${named}, ratio ${ratio}. Base ${base.toFixed(4)} of the short edge, sized for ` +
      `${lineCount} line${lineCount === 1 ? '' : 's'} with a longest line of ${longest} characters. ` +
      `First read ${steps['primary-hook'].fontScale}, second ${steps['secondary-hook'].fontScale}, ` +
      `supporting ${steps['supporting-note'].fontScale}.`,
  };
}

/** The step a node should follow, resolved from the semantic role the plan gave it. */
export function stepForRole(system: TypeSystem, role: SemanticRole): TypeStep {
  return system.steps[role] ?? system.steps['supporting-note'];
}

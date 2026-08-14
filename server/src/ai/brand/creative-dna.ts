import type {
  BrandFactSource,
  CreativeDnaInput,
  ImageAnalysis,
  ResolvedCreativeDna,
} from '../types';

/**
 * Creative Intelligence's visual counterpart to `brand-profile.ts`.
 *
 *   image → [Vision] ─────┐
 *                         ├→ [resolveCreativeDna] → CreativeDirection
 *   saved Creative DNA ───┘
 *
 * Same two jobs as `resolveBrandProfile`, same reason it costs no model call:
 * a coalesce is not a judgement. A member who has never saved a Creative DNA
 * profile still gets a usable visual brief the first time they attach a
 * product photo — Vision's `brandStyle`, `colorPalette`, `composition` and
 * `lighting` fill the gaps — and `completeness`/`provenance` let the brief
 * say which of those are guesses rather than assert them as brand fact.
 */

const MAX_LIST_ITEMS = 12;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => text(item))
        .filter((item) => item.length > 0),
    ),
  ].slice(0, MAX_LIST_ITEMS);
}

function coalesce(
  key: string,
  fromDna: string,
  fromImage: string,
  provenance: Record<string, BrandFactSource>,
): string {
  if (fromDna) {
    provenance[key] = 'brand';
    return fromDna;
  }
  if (fromImage) {
    provenance[key] = 'image';
    return fromImage;
  }
  return '';
}

const SCORED_FIELDS = [
  'visualStyle',
  'photographyStyle',
  'composition',
  'lighting',
  'mood',
  'productTreatment',
  'brandColors',
] as const;

export interface ResolveCreativeDnaOptions {
  creativeDna?: CreativeDnaInput | null;
  imageAnalysis?: ImageAnalysis | null;
}

/**
 * Merges what the member saved as their Creative DNA with what an attached
 * image reveals. Never throws, never returns null — a caller with neither
 * gets an empty-but-renderable profile at `completeness: 0`.
 */
export function resolveCreativeDna({
  creativeDna,
  imageAnalysis,
}: ResolveCreativeDnaOptions = {}): ResolvedCreativeDna {
  const d = creativeDna ?? {};
  const provenance: Record<string, BrandFactSource> = {};

  const visualStyle = coalesce(
    'visualStyle',
    text(d.visualStyle),
    text(imageAnalysis?.brandStyle),
    provenance,
  );

  const composition = coalesce(
    'composition',
    text(d.composition),
    text(imageAnalysis?.composition),
    provenance,
  );

  const lighting = coalesce(
    'lighting',
    text(d.lighting),
    text(imageAnalysis?.lighting),
    provenance,
  );

  const mood = coalesce('mood', text(d.mood), text(imageAnalysis?.mood), provenance);

  const dnaColors = list(d.brandColors);
  const colors = dnaColors.length ? dnaColors : list(imageAnalysis?.colorPalette);
  if (colors.length) provenance.brandColors = dnaColors.length ? 'brand' : 'image';

  const resolved = {
    visualStyle,
    photographyStyle: text(d.photographyStyle),
    composition,
    lighting,
    mood,
    typographyCharacter: text(d.typographyCharacter),
    spacing: text(d.spacing),
    productTreatment: text(d.productTreatment),
    logoTreatment: text(d.logoTreatment),
    preferredElements: list(d.preferredElements),
    avoidedElements: list(d.avoidedElements),
    brandColors: colors,
    logoAssetUrl: text(d.logoAssetUrl),
    referenceAssetUrls: list(d.referenceAssetUrls),
  };

  for (const [key, value] of Object.entries(resolved)) {
    if (provenance[key]) continue;
    const filled = Array.isArray(value) ? value.length > 0 : value.length > 0;
    if (filled) provenance[key] = 'brand';
  }

  const filled = SCORED_FIELDS.filter((field) => {
    const value = resolved[field as keyof typeof resolved];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;

  return {
    ...resolved,
    completeness: Math.round((filled / SCORED_FIELDS.length) * 100),
    provenance,
  };
}

/** True when there is nothing worth putting in front of the image model. */
export function isCreativeDnaEmpty(dna: ResolvedCreativeDna): boolean {
  return Object.keys(dna.provenance).length === 0;
}

/**
 * Renders one profile as a `## Visual identity` block for the
 * creative-direction prompt. Mirrors `renderBrandSection` — inferred facts
 * are labelled inline so the model treats them as a working assumption, not
 * an asserted brand fact.
 */
export function renderCreativeDnaSection(
  dna: ResolvedCreativeDna,
  heading = '## Visual identity',
): string | null {
  if (isCreativeDnaEmpty(dna)) return null;

  const inferred = (key: string) =>
    dna.provenance[key] === 'image'
      ? ' (read from the attached image, not set by the brand — treat as a working assumption)'
      : '';

  const lines = [
    dna.visualStyle && `- Visual style: ${dna.visualStyle}${inferred('visualStyle')}`,
    dna.photographyStyle && `- Photography style: ${dna.photographyStyle}`,
    dna.composition && `- Composition: ${dna.composition}${inferred('composition')}`,
    dna.lighting && `- Lighting: ${dna.lighting}${inferred('lighting')}`,
    dna.mood && `- Mood: ${dna.mood}${inferred('mood')}`,
    dna.productTreatment && `- Product treatment: ${dna.productTreatment}`,
    dna.logoTreatment && `- Logo treatment: ${dna.logoTreatment}`,
    dna.typographyCharacter && `- Typography character: ${dna.typographyCharacter}`,
    dna.spacing && `- Spacing/composition density: ${dna.spacing}`,
    dna.brandColors.length &&
      `- Brand colours: ${dna.brandColors.join(', ')}${inferred('brandColors')}`,
    dna.preferredElements.length &&
      `- Favour these visual elements: ${dna.preferredElements.join(', ')}`,
    dna.avoidedElements.length &&
      `- Never include these visual elements: ${dna.avoidedElements.join(', ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  const caveat =
    dna.completeness < 35
      ? '\n- This visual identity is mostly empty. Do not invent a house style to fill the gaps — take direction from the request and any attached image instead.'
      : '';

  return `${heading}\n${lines.join('\n')}${caveat}`;
}

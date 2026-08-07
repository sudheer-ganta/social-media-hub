import type {
  BrandFactSource,
  BrandProfile,
  BrandProfileInput,
  ImageAnalysis,
} from '../types';

/**
 * Brand Intelligence.
 *
 * One function, no model call, sitting between Vision and both engines:
 *
 *   image → [Vision] ─┐
 *                     ├→ [resolveBrandProfile] → Creative → Marketing
 *   brand profile ────┘
 *
 * ─── Why this is its own layer ───────────────────────────────────────────────
 * Before it existed, every AI feature read the brand its own way. The caption
 * prompt had a `brandVoiceSection`; the analysis prompt would have grown a
 * near-identical one; anything added later would have grown a third. Each would
 * have made its own decision about what to do with a missing field, and they
 * would have drifted — which is how you end up with a caption written for
 * "luxury weddings" being scored against "unknown industry".
 *
 * So the merge happens once, here, and both engines consume the same resolved
 * object. Adding a brand fact means adding it in this file and in the two
 * `## Brand` renderers, rather than everywhere a brand is read.
 *
 * ─── Why it is deterministic ─────────────────────────────────────────────────
 * Every rule below is "prefer what the user typed; otherwise take what Vision
 * already reported". That is a coalesce, not a judgement, and a model call to
 * perform a coalesce would add a second or two of latency and a failure mode to
 * a step that cannot currently fail.
 */

/** Fields a completeness score is measured against — the ones that change output. */
const SCORED_FIELDS = [
  'name',
  'description',
  'industry',
  'audience',
  'tone',
  'writingStyle',
  'personality',
  'products',
  'usp',
  'ctaStyle',
  'wordsToAvoid',
] as const;

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

/**
 * The coalesce that does the actual work: the user's value wins, Vision's is
 * the fallback, and whichever was used is recorded.
 *
 * Recording the source is the point. A prompt that knows the industry was
 * inferred can hedge on it; a prompt handed a bare string cannot tell the
 * difference between a fact and a guess, and will assert both with equal
 * confidence.
 */
function coalesce(
  key: string,
  fromBrand: string,
  fromImage: string,
  provenance: Record<string, BrandFactSource>,
): string {
  if (fromBrand) {
    provenance[key] = 'brand';
    return fromBrand;
  }
  if (fromImage) {
    provenance[key] = 'image';
    return fromImage;
  }
  return '';
}

export interface ResolveBrandProfileOptions {
  brand?: BrandProfileInput | null;
  /** Vision's read, when there was an image and stage one succeeded. */
  imageAnalysis?: ImageAnalysis | null;
}

/**
 * Merges what the user said about their brand with what the image revealed.
 *
 * Never throws and never returns null: a caller with neither a brand nor an
 * image gets a profile of empty strings and `completeness: 0`, which is a
 * perfectly renderable thing for a prompt to be told.
 */
export function resolveBrandProfile({
  brand,
  imageAnalysis,
}: ResolveBrandProfileOptions = {}): BrandProfile {
  const b = brand ?? {};
  const provenance: Record<string, BrandFactSource> = {};

  // Three fields Vision reports that a brand profile would otherwise leave
  // blank. Nothing else in the analysis is inferable from a picture — an image
  // cannot tell you a mission statement or a list of banned words.
  const industry = coalesce(
    'industry',
    text(b.industry),
    text(imageAnalysis?.industry),
    provenance,
  );

  const audience = coalesce(
    'audience',
    text(b.targetAudience),
    text(imageAnalysis?.targetAudience),
    provenance,
  );

  // `productCategory` is a category, not a product, so it seeds the list rather
  // than replacing it — "bridal wear" is a useful hint and a wrong SKU.
  const brandProducts = list(b.products);
  const products = brandProducts.length
    ? brandProducts
    : list([imageAnalysis?.productCategory]);
  if (products.length) {
    provenance.products = brandProducts.length ? 'brand' : 'image';
  }

  // Read off the pixels only as a fallback: a brand that stated its palette
  // means the stated one, and an image sampled in warm light is not evidence
  // the brand changed colour.
  const brandColors = list(b.brandColors);
  const colors = brandColors.length ? brandColors : list(imageAnalysis?.colorPalette);
  if (colors.length) {
    provenance.brandColors = brandColors.length ? 'brand' : 'image';
  }

  const resolved = {
    name: text(b.name),
    description: text(b.description),
    mission: text(b.mission),
    industry,
    audience,
    tone: text(b.tone),
    writingStyle: text(b.writingStyle),
    personality: text(b.personality),
    products,
    usp: text(b.usp),
    competitors: list(b.competitors),
    ctaStyle: text(b.ctaStyle),
    emojiStyle: text(b.emojiStyle),
    wordsToUse: list(b.wordsToUse),
    wordsToAvoid: list(b.wordsToAvoid),
    brandColors: colors,
  };

  // Anything the user typed directly is 'brand'; the four fields above have
  // already recorded themselves and are not overwritten here.
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

/** True when the profile has nothing worth putting in front of a model. */
export function isBrandProfileEmpty(profile: BrandProfile): boolean {
  return Object.keys(profile.provenance).length === 0;
}

/**
 * Renders one profile as the `## Brand` block both prompts use.
 *
 * Shared rather than duplicated for the reason in this file's header — two
 * renderers drift, and a caption written against one description while being
 * scored against another is a bug nobody would think to look for.
 *
 * Inferred facts are labelled inline. A model told `Industry: weddings (read
 * from the image, not stated by the brand)` treats it as the working assumption
 * it is, and stops writing copy that asserts it as the brand's own positioning.
 */
export function renderBrandSection(
  profile: BrandProfile,
  heading = '## Brand',
): string | null {
  if (isBrandProfileEmpty(profile)) return null;

  const inferred = (key: string) =>
    profile.provenance[key] === 'image'
      ? ' (read from the image, not stated by the brand — treat as a working assumption)'
      : '';

  const lines = [
    profile.name && `- Brand: ${profile.name}`,
    profile.description && `- What it does: ${profile.description}`,
    profile.mission && `- Mission: ${profile.mission}`,
    profile.industry && `- Industry: ${profile.industry}${inferred('industry')}`,
    profile.products.length &&
      `- Sells: ${profile.products.join('; ')}${inferred('products')}`,
    profile.usp && `- Why people choose it over rivals: ${profile.usp}`,
    profile.competitors.length && `- Up against: ${profile.competitors.join(', ')}`,
    profile.audience && `- Audience: ${profile.audience}${inferred('audience')}`,
    profile.tone && `- Tone: ${profile.tone}`,
    profile.writingStyle && `- Writing style: ${profile.writingStyle}`,
    profile.personality && `- Personality: ${profile.personality}`,
    profile.emojiStyle && `- Emoji usage: ${profile.emojiStyle}`,
    profile.ctaStyle && `- Call-to-action style: ${profile.ctaStyle}`,
    profile.brandColors.length &&
      `- Brand colours: ${profile.brandColors.join(', ')}${inferred('brandColors')}`,
    profile.wordsToUse.length &&
      `- Work these words in naturally where they fit: ${profile.wordsToUse.join(', ')}`,
    profile.wordsToAvoid.length &&
      `- Never use these words: ${profile.wordsToAvoid.join(', ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  // Below roughly a third filled, the profile is a handful of scraps. Saying so
  // is what stops a model treating three fields as a complete brand and writing
  // as though it knows the positioning.
  const caveat =
    profile.completeness < 35
      ? '\n- This brand profile is mostly empty. Do not invent positioning to fill the gaps — write from the subject and the image instead.'
      : '';

  return `${heading}\n${lines.join('\n')}${caveat}`;
}

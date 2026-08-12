import {
  AiProviderError,
  analyseCaption,
  generateCaption,
  generateHashtags,
  improveCaption,
  providerForRole,
  resolveBrandProfile,
  type AnalysisRequest,
  type HashtagRequest,
  type HashtagResult,
  type AudienceRegister,
  type BrandStyle,
  type CaptionAnalysis,
  type CaptionLength,
  type CaptionMode,
  type CaptionRequest,
  type CaptionResult,
  type FunnelStage,
  type ImageAnalysis,
  type ImprovementRequest,
  type ImprovementTarget,
  type MarketingGoal,
  type TargetedImprovement,
} from '../ai';
import { activityService, ActivityAction } from './activity.service';
import { loadBrandIntelligence } from './brand-intelligence.service';

/**
 * The AI module's application layer.
 *
 * Everything between "an HTTP body arrived" and "the generator has a valid
 * brief" happens here: validation, defaults, clamps, and the choice of
 * provider. The route serializes; the generator generates; policy lives in
 * this file.
 *
 * Validation is hand-rolled rather than schema-library driven, matching the
 * rest of this backend (see `routes/integrations.routes.ts`). The rule is the
 * same one applied to `:provider` there — a value that reaches a downstream
 * call is a value we recognised, never a value we passed through.
 */

/** A failure a route should turn into a specific HTTP answer. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

// ─── Bounds ──────────────────────────────────────────────────────────────────

/** Long enough to be a brief, short enough not to be an essay pasted by mistake. */
const MAX_TOPIC_LENGTH = 2000;
const MIN_TOPIC_LENGTH = 3;
const MAX_TITLE_LENGTH = 300;
const MAX_PREVIOUS_CAPTION_LENGTH = 5000;
/** Matches the composer's own limit on the Music / Song field. */
const MAX_MUSIC_LENGTH = 200;
const MAX_PLATFORMS = 8;

const MIN_VARIATIONS = 1;
const MAX_VARIATIONS = 5;
const DEFAULT_VARIATIONS = 3;

const MIN_HASHTAGS = 0;
const MAX_HASHTAGS = 30;
const DEFAULT_HASHTAGS = 8;

const GOALS: MarketingGoal[] = [
  'brand_awareness',
  'lead_generation',
  'website_traffic',
  'sales',
  'bookings',
  'product_launch',
  'event_promotion',
  'newsletter',
  'community_building',
  'customer_retention',
];

const FUNNEL_STAGES: FunnelStage[] = ['TOFU', 'MOFU', 'BOFU', 'Retention'];
const CAPTION_LENGTHS: CaptionLength[] = ['Short', 'Medium', 'Long'];

const AUDIENCE_REGISTERS: AudienceRegister[] = [
  'gen_z',
  'millennial',
  'gen_z_millennial',
  'professional',
  'broad',
];

const MODES: CaptionMode[] = ['personal', 'brand'];

/**
 * The registers a member may force.
 *
 * Exported so the browser's picker is built from the same list the server
 * accepts — an option the UI offers and the API silently drops is worse than no
 * option at all.
 */
export const BRAND_STYLES: BrandStyle[] = [
  'professional',
  'playful',
  'gen_z',
  'bold',
  'controversial',
  'educational',
  'premium',
  'promotional',
];

function isBrandStyle(value: unknown): value is BrandStyle {
  return typeof value === 'string' && (BRAND_STYLES as string[]).includes(value);
}

/**
 * The mode an unlabelled request gets.
 *
 * `brand` rather than `personal`, because brand is what this endpoint did
 * before modes existed: a client that has never sent the field must keep
 * receiving the captions it always received. The browser sends it explicitly
 * from the composer's publishing context.
 */
const DEFAULT_MODE: CaptionMode = 'brand';

/**
 * The shortest text each mode will accept.
 *
 * Brand's floor exists because a two-character caption from a marketing
 * generator is a failed generation, not a terse one. Personal's exists for the
 * opposite reason: "ofc" is a caption someone meant, and a shared floor of 12
 * silently discarded exactly the output Personal is for.
 */
const MIN_CAPTION_LENGTH_BY_MODE: Record<CaptionMode, number> = {
  brand: 12,
  personal: 2,
};

/**
 * The register everything is written in unless the user says otherwise.
 *
 * A blend rather than either generation on its own: it is the voice most of
 * this product's audience actually writes in, and the one that reads as human
 * to both without impersonating either. The picker in the composer is there
 * for the cases it is wrong for — a B2B post, a broad consumer announcement.
 */
const DEFAULT_AUDIENCE: AudienceRegister = 'gen_z_millennial';

/** Free text we will forward to the model, e.g. a language name. */
const MAX_FREE_TEXT_LENGTH = 60;

/**
 * How much of a caption a feedback event stores.
 *
 * Enough for any personal caption several times over. The row is evidence about
 * how somebody writes, not a copy of their post — the post is already in
 * `posts`, and this is only here for the case where it never got there.
 */
const MAX_FEEDBACK_CAPTION_LENGTH = 500;

// ─── Field readers ───────────────────────────────────────────────────────────

function readString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function readStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item, MAX_FREE_TEXT_LENGTH))
    .filter((item): item is string => item !== undefined)
    .slice(0, maxItems);
}

/** One of `allowed`, or `fallback` for anything else — including undefined. */
function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readClampedInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Platform ids, normalised to a safe slug.
 *
 * Deliberately *not* filtered against the provider catalogue. A caption can be
 * written for a network long before OAuth exists for it — the post editor
 * already offers Threads, which nothing can publish to yet — and dropping it
 * here would silently return a caption the user did not ask for. The prompt
 * builder has a generic brief for ids it does not recognise, so an unknown
 * platform degrades to sensible advice rather than to nothing.
 *
 * The slug filter is the security boundary that matters: the id becomes a key
 * in the response schema and a line in the prompt, so it may only ever be
 * lowercase letters, digits, `-` and `_`.
 */
function readPlatforms(value: unknown): string[] {
  const requested = readStringArray(value, MAX_PLATFORMS)
    .map((platform) => platform.toLowerCase())
    .filter((platform) => /^[a-z0-9_-]{1,32}$/.test(platform));
  return [...new Set(requested)];
}

function readBrandVoice(value: unknown): CaptionRequest['brandVoice'] {
  if (!value || typeof value !== 'object') return undefined;
  const voice = value as Record<string, unknown>;

  const brandVoice: NonNullable<CaptionRequest['brandVoice']> = {
    ...(readString(voice.name, 120) && { name: readString(voice.name, 120) }),
    ...(readString(voice.description, 600) && {
      description: readString(voice.description, 600),
    }),
    ...(readString(voice.mission, 600) && {
      mission: readString(voice.mission, 600),
    }),
    ...(readString(voice.tone, MAX_FREE_TEXT_LENGTH) && {
      tone: readString(voice.tone, MAX_FREE_TEXT_LENGTH),
    }),
    ...(readString(voice.writingStyle, MAX_FREE_TEXT_LENGTH) && {
      writingStyle: readString(voice.writingStyle, MAX_FREE_TEXT_LENGTH),
    }),
    ...(readString(voice.personality, MAX_FREE_TEXT_LENGTH) && {
      personality: readString(voice.personality, MAX_FREE_TEXT_LENGTH),
    }),
    ...(readString(voice.targetAudience, 300) && {
      targetAudience: readString(voice.targetAudience, 300),
    }),
    ...(readString(voice.emojiStyle, MAX_FREE_TEXT_LENGTH) && {
      emojiStyle: readString(voice.emojiStyle, MAX_FREE_TEXT_LENGTH),
    }),
    ...(readString(voice.ctaStyle, MAX_FREE_TEXT_LENGTH) && {
      ctaStyle: readString(voice.ctaStyle, MAX_FREE_TEXT_LENGTH),
    }),
    wordsToUse: readStringArray(voice.wordsToUse, 25),
    wordsToAvoid: readStringArray(voice.wordsToAvoid, 25),

    // ── Brand Intelligence additions ───────────────────────────────────────
    //
    // Read under the same key as the rest of the voice, so a client that has
    // never heard of a brand profile posts exactly the body it always did and
    // these simply come back undefined. `products` and `competitors` are lists
    // of short names, and `usp` is a sentence — hence the different bounds.
    ...(readString(voice.industry, 120) && {
      industry: readString(voice.industry, 120),
    }),
    ...(readString(voice.usp, 400) && { usp: readString(voice.usp, 400) }),
    products: readStringArray(voice.products, 15),
    competitors: readStringArray(voice.competitors, 10),
    brandColors: readColors(voice.brandColors),
  };

  // An object of nothing but empty arrays is not a brand; sending it would put
  // an empty "## Brand" heading in front of the model.
  const listKeys = ['wordsToUse', 'wordsToAvoid', 'products', 'competitors', 'brandColors'] as const;
  const meaningful =
    Object.keys(brandVoice).length > listKeys.length ||
    listKeys.some((key) => (brandVoice[key]?.length ?? 0) > 0);

  return meaningful ? brandVoice : undefined;
}

/**
 * Hex codes only.
 *
 * A brand colour reaches a prompt as literal text and nothing else, so the
 * filter is about keeping the block truthful rather than about safety: "our
 * signature gold" tells a model nothing it can act on, and passing it through
 * as though it were a colour value makes the brand section read as precise
 * when it is not.
 */
function readColors(value: unknown): string[] {
  return readStringArray(value, 8)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(entry));
}

/**
 * Only `http(s)` URLs are forwarded.
 *
 * This used to note that the image "is never fetched by us". It is now — the
 * AI module downloads it and shows the pixels to the model, which is the whole
 * point of Sprint 4.2. That raises the stakes on this function rather than
 * changing its job: a scheme filter here, and an address filter at the socket
 * in `ai/vision/image-source.ts`, which is where a URL that resolves to
 * something internal is actually stopped.
 */
function readImageUrl(value: unknown): string | undefined {
  const raw = readString(value, 2000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? raw
      : undefined;
  } catch {
    return undefined;
  }
}

function readCompetitor(value: unknown): CaptionRequest['competitor'] {
  if (!value || typeof value !== 'object') return undefined;
  const comp = value as Record<string, unknown>;
  const website = readString(comp.website, 300);
  const brandName = readString(comp.brandName, 120);
  const socialHandle = readString(comp.socialHandle, 120);
  if (!website && !brandName && !socialHandle) return undefined;
  return {
    ...(website && { website }),
    ...(brandName && { brandName }),
    ...(socialHandle && { socialHandle }),
  };
}

function readFeatures(value: unknown): CaptionRequest['features'] {
  if (!value || typeof value !== 'object') return undefined;
  const f = value as Record<string, unknown>;
  return {
    ...(typeof f.seo === 'boolean' && { seo: f.seo }),
    ...(typeof f.campaign === 'boolean' && { campaign: f.campaign }),
    ...(typeof f.competitorAnalysis === 'boolean' && { competitorAnalysis: f.competitorAnalysis }),
    ...(typeof f.platformVariations === 'boolean' && { platformVariations: f.platformVariations }),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Turns an unknown request body into a {@link CaptionRequest}.
 *
 * Only one field can fail the request outright. Everything else has a sensible
 * default, because a caption generator that refuses to run over a missing
 * `funnelStage` is a worse product than one that assumes "TOFU".
 *
 * `userId` arrives as an argument and never from the body. It selects whose
 * writing history the generator is allowed to read, which makes it the one
 * field on this request that a caller must not be able to choose.
 */
export function parseCaptionRequest(
  body: unknown,
  { userId }: { userId: string },
): CaptionRequest {
  if (!body || typeof body !== 'object') {
    throw new AiError('Send a JSON body describing the post.');
  }

  const input = body as Record<string, unknown>;
  const mode = readEnum(input.mode, MODES, DEFAULT_MODE);
  const personal = mode === 'personal';

  // `topic` is what to write about; a caller with only a title may send that.
  const title = readString(input.title, MAX_TITLE_LENGTH);
  const topic = readString(input.topic, MAX_TOPIC_LENGTH) ?? title;

  if (!topic || topic.length < MIN_TOPIC_LENGTH) {
    throw new AiError(
      'Tell us what the post is about — a title or a short description is enough.',
      422,
    );
  }

  return {
    mode,
    userId,
    // Scopes a brand-context style profile. Meaningless in personal mode, and
    // dropped there rather than carried, so a personal request can never be
    // pointed at a brand's writing history.
    ...(!personal &&
      readString(input.brandId, 64) && { brandId: readString(input.brandId, 64) }),
    topic,
    ...(title && { title }),
    ...(readImageUrl(input.imageUrl) && {
      imageUrl: readImageUrl(input.imageUrl),
    }),
    ...(readString(input.music, MAX_MUSIC_LENGTH) && {
      music: readString(input.music, MAX_MUSIC_LENGTH),
    }),
    // Off unless a caller explicitly asks. See CaptionRequest.suggestSongs.
    suggestSongs: input.suggestSongs === true,
    audience: readEnum(input.audience, AUDIENCE_REGISTERS, DEFAULT_AUDIENCE),
    platforms: readPlatforms(input.platforms),
    goal: readEnum(input.goal, GOALS, 'brand_awareness'),
    funnelStage: readEnum(input.funnelStage, FUNNEL_STAGES, 'TOFU'),
    captionLength: readEnum(input.captionLength, CAPTION_LENGTHS, 'Medium'),
    language: readString(input.language, MAX_FREE_TEXT_LENGTH) ?? 'English',
    // ── Brand-only from here down ──────────────────────────────────────────
    //
    // Parsed for every mode so an unchanged client body still validates, but
    // dropped in personal mode rather than passed on. The personal prompt does
    // not read any of them; dropping them here is belt and braces, and it makes
    // the logged request honest about what was actually used.
    ...(!personal &&
      readBrandVoice(input.brandVoice) && {
        brandVoice: readBrandVoice(input.brandVoice),
      }),
    // The optional register override. Absent is the default and does not mean
    // "professional" — it means the model decides. An unrecognised value is
    // dropped rather than defaulted, so a client sending a style FlowPost does
    // not offer gets the smart behaviour instead of an arbitrary register.
    ...(!personal && isBrandStyle(input.styleOverride)
      ? { styleOverride: input.styleOverride }
      : {}),
    ...(!personal &&
      readCompetitor(input.competitor) && {
        competitor: readCompetitor(input.competitor),
      }),
    ...(!personal &&
      readFeatures(input.features) && {
        features: readFeatures(input.features),
      }),
    ...(readString(input.previousCaption, MAX_PREVIOUS_CAPTION_LENGTH) && {
      previousCaption: readString(
        input.previousCaption,
        MAX_PREVIOUS_CAPTION_LENGTH,
      ),
    }),
    variationCount: readClampedInt(
      input.variationCount,
      MIN_VARIATIONS,
      MAX_VARIATIONS,
      DEFAULT_VARIATIONS,
    ),
    // A personal post has no hashtags. Not "zero by default" — there is no
    // number a personal member could send that would produce any.
    hashtagCount: personal
      ? 0
      : readClampedInt(
          input.hashtagCount,
          MIN_HASHTAGS,
          MAX_HASHTAGS,
          DEFAULT_HASHTAGS,
        ),
  };
}

// ─── Analysis request ────────────────────────────────────────────────────────

/** Long enough for any caption a network will accept, with room to be told so. */
const MAX_CAPTION_LENGTH = 8000;
const MAX_ANALYSED_HASHTAGS = 40;

/**
 * The vision block, when the caller passes back what generation already found.
 *
 * Read defensively rather than trusted: this arrives from the browser, which
 * got it from a previous response, and nothing stops a client sending a hand-
 * written object. Every field is bounded and the whole thing is optional — an
 * analysis without it simply scores `visual` with low confidence.
 *
 * Only the fields the analysis prompt actually renders are kept. Passing the
 * other fourteen through would put a large object in the request for no change
 * in what the model reads.
 */
function readImageAnalysis(value: unknown): ImageAnalysis | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const a = value as Record<string, unknown>;

  const primarySubject = readString(a.primarySubject, 160) ?? '';
  const sceneDescription = readString(a.sceneDescription, 600) ?? '';
  if (!primarySubject && !sceneDescription) return undefined;

  return {
    primarySubject,
    sceneDescription,
    secondarySubjects: readStringArray(a.secondarySubjects, 6),
    objects: readStringArray(a.objects, 12),
    setting: readString(a.setting, 200) ?? '',
    composition: readString(a.composition, 300) ?? '',
    lighting: readString(a.lighting, 200) ?? '',
    mood: readString(a.mood, 120) ?? '',
    colorPalette: readColors(a.colorPalette),
    brandStyle: readString(a.brandStyle, 160) ?? '',
    textInImage: readStringArray(a.textInImage, 8),
    emotions: readStringArray(a.emotions, 6),
    themes: readStringArray(a.themes, 6),
    symbolism: readStringArray(a.symbolism, 6),
    storyAngles: readStringArray(a.storyAngles, 6),
    productCategory: readString(a.productCategory, 120) ?? '',
    industry: readString(a.industry, 120) ?? '',
    targetAudience: readString(a.targetAudience, 300) ?? '',
    suggestedCampaignType: readString(a.suggestedCampaignType, 160) ?? '',
    suggestedMarketingObjective: readString(a.suggestedMarketingObjective, 160) ?? '',
    suggestedBuyerPersona: readString(a.suggestedBuyerPersona, 300) ?? '',
    confidenceScore: readClampedInt(a.confidenceScore, 0, 100, 0),
  };
}

/**
 * Turns an unknown body into an {@link AnalysisRequest}.
 *
 * Same policy as {@link parseCaptionRequest}: exactly one field can fail the
 * request, and everything else defaults. The difference is which field — there
 * is no useful analysis of an empty caption, and unlike a missing funnel stage
 * there is nothing sensible to assume in its place.
 *
 * `hasImage` is taken from the caller rather than inferred from
 * `imageAnalysis`, because the two genuinely differ: a post can have an image
 * whose analysis was never run or has since been discarded, and treating that
 * as "no image" would score the copy as text-only and quietly drop the visual
 * dimension it should be judged on.
 */
export function parseAnalysisRequest(body: unknown): AnalysisRequest {
  if (!body || typeof body !== 'object') {
    throw new AiError('Send a JSON body containing the caption to analyse.');
  }

  const input = body as Record<string, unknown>;
  const mode = readEnum(input.mode, MODES, DEFAULT_MODE);
  const caption = readString(input.caption, MAX_CAPTION_LENGTH);

  if (!caption || caption.length < MIN_CAPTION_LENGTH_BY_MODE[mode]) {
    throw new AiError(
      'There is not enough caption here to analyse yet. Write a line or two first.',
      422,
    );
  }

  const imageAnalysis = readImageAnalysis(input.imageAnalysis);

  return {
    mode,
    caption,
    // Normalised the same way the generator normalises what it produces, so a
    // tag list round-tripped through the browser is counted identically here.
    hashtags: readStringArray(input.hashtags, MAX_ANALYSED_HASHTAGS).map((tag) =>
      tag.replace(/^#+/, ''),
    ),
    platforms: readPlatforms(input.platforms),
    goal: readEnum(input.goal, GOALS, 'brand_awareness'),
    funnelStage: readEnum(input.funnelStage, FUNNEL_STAGES, 'TOFU'),
    audience: readEnum(input.audience, AUDIENCE_REGISTERS, DEFAULT_AUDIENCE),
    language: readString(input.language, MAX_FREE_TEXT_LENGTH) ?? 'English',
    ...(readBrandVoice(input.brand ?? input.brandVoice) && {
      brand: readBrandVoice(input.brand ?? input.brandVoice),
    }),
    ...(imageAnalysis && { imageAnalysis }),
    hasImage:
      typeof input.hasImage === 'boolean' ? input.hasImage : Boolean(imageAnalysis),
  };
}

// ─── Improvement request ─────────────────────────────────────────────────────

/**
 * The targets a client may ask to have regenerated.
 *
 * An allow-list rather than a pass-through, for the same reason `readPlatforms`
 * filters to a slug: the value selects a prompt and a response schema, so a
 * value we do not recognise must never reach the builder.
 */
const IMPROVEMENT_TARGETS: ImprovementTarget[] = [
  'hook',
  'readability',
  'cta',
  'hashtags',
];

/** What the analysis said, bounded — it is quoted into the prompt verbatim. */
const MAX_FLAGGED_TEXT_LENGTH = 400;

/**
 * Turns an unknown body into an {@link ImprovementRequest}.
 *
 * Two fields can fail it: the target, because there is no sensible default for
 * "which part of the post did you mean", and the caption, because there is
 * nothing to improve without one. Everything else defaults exactly as the
 * analysis request does.
 */
export function parseImprovementRequest(body: unknown): ImprovementRequest {
  if (!body || typeof body !== 'object') {
    throw new AiError('Send a JSON body describing what to improve.');
  }

  const input = body as Record<string, unknown>;
  const mode = readEnum(input.mode, MODES, DEFAULT_MODE);

  if (!IMPROVEMENT_TARGETS.includes(input.target as ImprovementTarget)) {
    throw new AiError(
      `Unknown improvement target. Expected one of: ${IMPROVEMENT_TARGETS.join(', ')}.`,
    );
  }

  // Two of the four targets exist to make copy conform, which is the opposite
  // of what a personal caption wants. `readability` would iron out the
  // fragments and `cta` would bolt an engagement prompt onto a post that is
  // not asking for engagement — so neither is reachable in personal mode, and
  // the composer does not offer them either.
  if (mode === 'personal' && (input.target === 'readability' || input.target === 'cta')) {
    throw new AiError(
      `"${String(input.target)}" is a brand improvement. A personal caption is not tidied or given a call to action.`,
    );
  }

  const caption = readString(input.caption, MAX_CAPTION_LENGTH);
  if (!caption || caption.length < MIN_CAPTION_LENGTH_BY_MODE[mode]) {
    throw new AiError(
      'There is not enough caption here to improve yet. Write a line or two first.',
      422,
    );
  }

  const imageAnalysis = readImageAnalysis(input.imageAnalysis);

  return {
    mode,
    target: input.target as ImprovementTarget,
    caption,
    hashtags: readStringArray(input.hashtags, MAX_ANALYSED_HASHTAGS).map((tag) =>
      tag.replace(/^#+/, ''),
    ),
    platforms: readPlatforms(input.platforms),
    audience: readEnum(input.audience, AUDIENCE_REGISTERS, DEFAULT_AUDIENCE),
    language: readString(input.language, MAX_FREE_TEXT_LENGTH) ?? 'English',
    ...(readString(input.music, MAX_MUSIC_LENGTH) && {
      music: readString(input.music, MAX_MUSIC_LENGTH),
    }),
    ...(readString(input.issue, MAX_FLAGGED_TEXT_LENGTH) && {
      issue: readString(input.issue, MAX_FLAGGED_TEXT_LENGTH),
    }),
    ...(readString(input.recommendation, MAX_FLAGGED_TEXT_LENGTH) && {
      recommendation: readString(input.recommendation, MAX_FLAGGED_TEXT_LENGTH),
    }),
    ...(imageAnalysis && { imageAnalysis }),
    hasImage:
      typeof input.hasImage === 'boolean' ? input.hasImage : Boolean(imageAnalysis),
  };
}

// ─── Hashtag request ─────────────────────────────────────────────────────────

/**
 * The body of `POST /api/ai/hashtags`, after validation.
 *
 * `userId` and the scope are injected from the session and never read from the
 * body — the same rule {@link parseCaptionRequest} keeps, and for the same
 * reason: a body that could name its own scope is a body that can read another
 * member's hashtag history.
 */
export interface ParsedHashtagRequest extends HashtagRequest {
  brandId?: string;
}

export function parseHashtagRequest(body: unknown): ParsedHashtagRequest {
  const input = (body ?? {}) as Record<string, unknown>;

  const mode = readEnum(input.mode, MODES, DEFAULT_MODE);
  const platforms = readPlatforms(input.platforms);
  const caption = readString(input.caption, MAX_CAPTION_LENGTH) ?? '';
  const topic = readString(input.topic, MAX_TOPIC_LENGTH) ?? '';

  // Neither a caption nor a topic leaves nothing to choose tags *about*, and a
  // model asked anyway returns tags for the category. Refused rather than
  // answered badly.
  if (!caption.trim() && !topic.trim()) {
    throw new AiError(
      'Add a caption or a topic first — hashtags are chosen from what the post actually says.',
      400,
    );
  }

  const brandId = readString(input.brandId, 64);
  const imageAnalysis = readImageAnalysis(input.imageAnalysis);
  const brandVoice = readBrandVoice(input.brandVoice);

  return {
    mode,
    platforms,
    caption,
    topic,
    language: readString(input.language, 40) ?? 'English',
    ...(typeof input.count === 'number'
      ? {
          requestedCount: readClampedInt(
            input.count,
            MIN_HASHTAGS,
            MAX_HASHTAGS,
            MAX_HASHTAGS,
          ),
        }
      : {}),
    ...(imageAnalysis && { imageAnalysis }),
    // Resolved the same way generation resolves it, so the tags are chosen
    // against the brand the copy was written against — including the fields
    // Vision inferred rather than only the ones the member typed.
    brand: resolveBrandProfile({
      brand: brandVoice,
      imageAnalysis: imageAnalysis ?? null,
    }),
    ...(mode === 'brand' && brandId ? { brandId } : {}),
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const aiService = {
  /**
   * Generates captions for one post brief.
   *
   * A provider failure arrives as {@link AiProviderError}, which already
   * carries a status and a message written for a member; it is re-thrown as-is
   * and the route answers with it. Its `detail` — which can quote the vendor's
   * response — is logged by the provider and never returned.
   */
  async generateCaption(
    userId: string,
    body: unknown,
  ): Promise<CaptionResult> {
    const request = parseCaptionRequest(body, { userId });
    const provider = providerForRole('caption');

    if (!provider.isConfigured()) {
      throw new AiError(
        'AI generation is not set up on this server yet.',
        503,
      );
    }

    const result = await generateCaption(request, {
      provider,
      visionProvider: providerForRole('vision'),
      // Style profiles are built off the request path and are the cheapest
      // model call in the module — the light role, not the writer's.
      lightProvider: providerForRole('light'),
    });

    console.info('[ai] caption generated', {
      userId,
      mode: request.mode,
      model: result.meta.model,
      durationMs: result.meta.durationMs,
      variations: result.variations.length,
      platforms: request.platforms,
      audience: request.audience,
      regenerate: Boolean(request.previousCaption),
      // The line that answers "why is this caption generic?" — an image that
      // was sent but not analysed means stage one bailed, and the reason is
      // logged by `analyseImage` right above this.
      imageAnalysed: Boolean(result.imageAnalysis),
      imageSent: Boolean(request.imageUrl),
    });

    return result;
  },

  /**
   * Chooses hashtags for one post.
   *
   * Its own endpoint rather than a slice of generation, because the tags worth
   * having are the ones chosen against the caption that will actually publish —
   * usually not the one the model wrote. See the header of
   * `ai/prompts/hashtags.prompt.ts`.
   *
   * The scope is built from the session and the requested mode, so hashtag
   * history is read for this member's Personal or this one brand and nothing
   * else. A `brandId` the member does not own simply matches no rows — every
   * analytics read filters on `created_by` as well — so a foreign id yields an
   * empty history rather than somebody else's.
   */
  async generateHashtags(userId: string, body: unknown): Promise<HashtagResult> {
    const request = parseHashtagRequest(body);
    const provider = providerForRole('caption');

    if (!provider.isConfigured()) {
      throw new AiError('AI generation is not set up on this server yet.', 503);
    }

    // The account's own record: which tags it uses, which sat on stronger posts,
    // and which have made no difference. Never throws — a scope with no history
    // returns empty and the tags are chosen from the content alone.
    const intelligence = await loadBrandIntelligence({
      userId,
      contextType: request.mode,
      brandId: request.mode === 'brand' ? (request.brandId ?? null) : null,
    });

    const result = await generateHashtags(
      {
        ...request,
        historySection: intelligence.hashtagSection,
        tagsInUse: intelligence.tagsInUse,
      },
      { provider },
    );

    console.info('[ai] hashtags generated', {
      userId,
      mode: request.mode,
      platforms: request.platforms,
      model: result.meta.model,
      durationMs: result.meta.durationMs,
      primary: result.primary.length,
      secondary: result.secondary.length,
      // The line that answers "why did I get two tags?" — a conflict means the
      // selected networks disagreed and the tighter ceiling bound.
      conflict: result.budget.conflict,
      // Proves the spam filter ran, without logging the caption or the tags.
      rejected: result.rejected.length,
      historySample: intelligence.hashtags.sampleSize,
    });

    return result;
  },

  /**
   * Scores one caption — Marketing Intelligence.
   *
   * Deliberately its own entry point rather than a flag on `generateCaption`.
   * The caption worth analysing is usually not the one the model wrote: it is
   * the one sitting in the editor after the user rewrote the opening line. An
   * analyser reachable only as a side effect of generation could never see it.
   */
  async analyseCaption(userId: string, body: unknown): Promise<CaptionAnalysis> {
    const request = { ...parseAnalysisRequest(body), userId };
    const provider = providerForRole('marketing');

    if (!provider.isConfigured()) {
      throw new AiError('AI analysis is not set up on this server yet.', 503);
    }

    const analysis = await analyseCaption(request, { provider });

    console.info('[ai] analysis served', {
      userId,
      model: analysis.meta.model,
      durationMs: analysis.meta.durationMs,
      reachScore: analysis.reachScore,
      readiness: analysis.checklist.readiness,
      analysisVersion: analysis.meta.analysisVersion,
      weightsVersion: analysis.meta.weightsVersion,
      platforms: request.platforms,
      // Answers "why is the visual dimension missing?" without a second look:
      // an image whose analysis was not passed back scores differently.
      hasImage: request.hasImage,
      imageAnalysisSupplied: Boolean(request.imageAnalysis),
    });

    return analysis;
  },

  /**
   * Regenerates one flagged part of a post.
   *
   * Uses the `caption` role's provider: this writes copy, so it belongs with
   * the writer rather than with the analyst — the marketing role is tuned to
   * judge, and asking a judge to draft returns judge-flavoured prose.
   *
   * Returns a proposal. Nothing is saved and nothing is applied; the browser
   * shows it, and the member decides.
   */
  async improveCaption(
    userId: string,
    body: unknown,
  ): Promise<TargetedImprovement> {
    const request = parseImprovementRequest(body);
    const provider = providerForRole('caption');

    if (!provider.isConfigured()) {
      throw new AiError('AI generation is not set up on this server yet.', 503);
    }

    const improvement = await improveCaption(request, { provider });

    console.info('[ai] improvement generated', {
      userId,
      target: improvement.target,
      kind: improvement.kind,
      model: improvement.meta.model,
      durationMs: improvement.meta.durationMs,
      platforms: request.platforms,
      hasImage: request.hasImage,
    });

    return improvement;
  },

  /**
   * Records what the member did with a set of suggestions.
   *
   * The two signals the post row cannot reconstruct — see
   * `ActivityAction.CAPTION_SELECTED`. Everything else style memory learns is
   * derived from posts that already exist, retroactively and for free.
   *
   * Never throws and never reports a problem to the browser. This is a hint
   * about somebody's writing style; a failed hint is worth a log line and
   * nothing more, and a member who sees "could not record feedback" after
   * clicking Use This has been told about a mechanism they did not know
   * existed and cannot act on.
   */
  async recordCaptionFeedback(userId: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object') return;
    const input = body as Record<string, unknown>;

    const action =
      input.action === 'regenerated'
        ? ActivityAction.CAPTION_REGENERATED
        : input.action === 'selected'
          ? ActivityAction.CAPTION_SELECTED
          : null;
    if (!action) return;

    const captionText = readString(input.caption, MAX_FEEDBACK_CAPTION_LENGTH);
    if (!captionText) return;

    const mode = readEnum(input.mode, MODES, DEFAULT_MODE);

    await activityService.logCaptionFeedback(userId, action, {
      contextType: mode,
      ...(mode === 'brand' &&
        readString(input.brandId, 64) && { brandId: readString(input.brandId, 64) }),
      ...(readString(input.postId, 64) && { postId: readString(input.postId, 64) }),
      captionText,
      ...(typeof input.variationIndex === 'number' && {
        variationIndex: readClampedInt(input.variationIndex, 0, MAX_VARIATIONS, 0),
      }),
    });
  },

  /**
   * Whether generation is available, for the Create Post page to decide
   * between an enabled button and an explanatory one. Reports the model but
   * never the key — `configured` is the only fact the browser needs.
   */
  status(): { configured: boolean; provider: string; model: string } {
    // The caption role is what the Create Post button actually invokes, so its
    // model is the honest answer here. All roles share one key, so
    // `configured` speaks for every workload.
    const provider = providerForRole('caption');
    return {
      configured: provider.isConfigured(),
      provider: provider.id,
      model: provider.model,
    };
  },
};

export { AiProviderError };

import { env } from '../config/env';
import {
  activeProvider,
  AiProviderError,
  generateCaption,
  type AudienceRegister,
  type CaptionLength,
  type CaptionRequest,
  type CaptionResult,
  type FunnelStage,
  type MarketingGoal,
} from '../ai';

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
  };

  // An object of nothing but two empty arrays is not a brand voice; sending it
  // would put an empty "## Brand voice" heading in front of the model.
  const meaningful =
    Object.keys(brandVoice).length > 2 ||
    (brandVoice.wordsToUse?.length ?? 0) > 0 ||
    (brandVoice.wordsToAvoid?.length ?? 0) > 0;

  return meaningful ? brandVoice : undefined;
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
 */
export function parseCaptionRequest(body: unknown): CaptionRequest {
  if (!body || typeof body !== 'object') {
    throw new AiError('Send a JSON body describing the post.');
  }

  const input = body as Record<string, unknown>;

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
    topic,
    ...(title && { title }),
    ...(readImageUrl(input.imageUrl) && {
      imageUrl: readImageUrl(input.imageUrl),
    }),
    audience: readEnum(input.audience, AUDIENCE_REGISTERS, DEFAULT_AUDIENCE),
    platforms: readPlatforms(input.platforms),
    goal: readEnum(input.goal, GOALS, 'brand_awareness'),
    funnelStage: readEnum(input.funnelStage, FUNNEL_STAGES, 'TOFU'),
    captionLength: readEnum(input.captionLength, CAPTION_LENGTHS, 'Medium'),
    language: readString(input.language, MAX_FREE_TEXT_LENGTH) ?? 'English',
    ...(readBrandVoice(input.brandVoice) && {
      brandVoice: readBrandVoice(input.brandVoice),
    }),
    ...(readCompetitor(input.competitor) && {
      competitor: readCompetitor(input.competitor),
    }),
    ...(readFeatures(input.features) && {
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
    hashtagCount: readClampedInt(
      input.hashtagCount,
      MIN_HASHTAGS,
      MAX_HASHTAGS,
      DEFAULT_HASHTAGS,
    ),
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
    const request = parseCaptionRequest(body);
    const provider = activeProvider(env.AI_PROVIDER);

    if (!provider.isConfigured()) {
      throw new AiError(
        'AI generation is not set up on this server yet.',
        503,
      );
    }

    const result = await generateCaption(request, { provider });

    console.info('[ai] caption generated', {
      userId,
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
   * Whether generation is available, for the Create Post page to decide
   * between an enabled button and an explanatory one. Reports the model but
   * never the key — `configured` is the only fact the browser needs.
   */
  status(): { configured: boolean; provider: string; model: string } {
    const provider = activeProvider(env.AI_PROVIDER);
    return {
      configured: provider.isConfigured(),
      provider: provider.id,
      model: provider.model,
    };
  },
};

export { AiProviderError };

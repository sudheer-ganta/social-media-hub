/**
 * The AI module's contracts.
 *
 * These types are the *backend's* shapes, deliberately independent of the
 * frontend's `src/ai/types.ts`. The two meet at the HTTP boundary and nowhere
 * else: the browser posts a {@link CaptionRequest} and receives a
 * {@link CaptionResult}. Keeping them separate is what lets the studio
 * envelope on the frontend evolve without dragging the generator with it.
 *
 * Nothing in this file knows about Gemini. The provider interface takes a
 * prompt and returns text; everything above it is model-agnostic.
 */

// ─── Request ─────────────────────────────────────────────────────────────────

export type CaptionLength = 'Short' | 'Medium' | 'Long';

export type MarketingGoal =
  | 'brand_awareness'
  | 'lead_generation'
  | 'website_traffic'
  | 'sales'
  | 'bookings'
  | 'product_launch'
  | 'event_promotion'
  | 'newsletter'
  | 'community_building'
  | 'customer_retention';

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU' | 'Retention';

/**
 * Who the copy is written *at*, in the sense that changes the sentences rather
 * than the argument.
 *
 * Separate from `brandVoice.targetAudience`, which describes who buys. This
 * picks the register: a luxury wedding brand selling to 26-year-olds writes
 * nothing like the same brand selling to their parents, and the brief for both
 * is otherwise identical.
 */
export type AudienceRegister =
  | 'gen_z'
  | 'millennial'
  | 'gen_z_millennial'
  | 'professional'
  | 'broad';

/**
 * The brand's voice as the caller chose to describe it. Every field is
 * optional — a user who has never opened the Brand Voice panel still gets a
 * usable caption, just a less distinctive one.
 */
export interface BrandVoiceInput {
  name?: string;
  description?: string;
  mission?: string;
  tone?: string;
  writingStyle?: string;
  personality?: string;
  wordsToUse?: string[];
  wordsToAvoid?: string[];
  emojiStyle?: string;
  ctaStyle?: string;
  targetAudience?: string;
}

// ─── Vision ──────────────────────────────────────────────────────────────────

/** One image, already fetched and encoded, ready to ride in a model request. */
export interface InlineImage {
  /** e.g. `image/jpeg`. Only formats the provider accepts get this far. */
  mimeType: string;
  /** Base64, no data-URI prefix. */
  data: string;
  sizeBytes: number;
}

/**
 * What stage one saw, and what a marketer should do with it.
 *
 * The first block is observation — it comes from the pixels, and the model is
 * told to describe only what is actually there. The second block is
 * interpretation: themes, emotions and angles the picture *makes available* to
 * a campaign. Stage two reads both, which is the whole point of the split.
 * Asking one call to look and sell at the same time reliably produces a caption
 * about the brand with the image ignored.
 */
export interface ImageAnalysis {
  // Observation
  primarySubject: string;
  secondarySubjects: string[];
  objects: string[];
  sceneDescription: string;
  setting: string;
  composition: string;
  lighting: string;
  mood: string;
  /** Hex codes read off the image, e.g. `["#1A1A2E", "#E94560"]`. */
  colorPalette: string[];
  brandStyle: string;
  /** Words legible in the image. Empty when there is none. */
  textInImage: string[];

  // Interpretation
  emotions: string[];
  themes: string[];
  symbolism: string[];
  /** Storytelling openings the image offers, in plain marketing language. */
  storyAngles: string[];
  productCategory: string;
  industry: string;
  targetAudience: string;
  suggestedCampaignType: string;
  suggestedMarketingObjective: string;
  suggestedBuyerPersona: string;
  /** 0–100. Low means the image was ambiguous and stage two should lean brand. */
  confidenceScore: number;
}

/** A creative direction stage two chose before it wrote anything. */
export interface CreativeAngle {
  /** Short label, e.g. "Fairytale scale". */
  name: string;
  /** The idea in one sentence. */
  premise: string;
  /** What in the image it is built on — the audit trail back to the pixels. */
  imageHook: string;
}

export interface CompetitorContext {
  website?: string;
  brandName?: string;
  socialHandle?: string;
}

export interface StudioFeatureFlags {
  seo: boolean;
  campaign: boolean;
  competitorAnalysis: boolean;
  platformVariations: boolean;
}

export const DEFAULT_FEATURE_FLAGS: StudioFeatureFlags = {
  seo: false,
  campaign: false,
  competitorAnalysis: false,
  platformVariations: false,
};

/** The body of `POST /api/ai/caption`, after validation. */
export interface CaptionRequest {
  /** What the post is about. The one field the generator cannot do without. */
  topic: string;
  /** The post's working title, when it differs from the topic. */
  title?: string;
  /**
   * Public URL of the post's image. Fetched, decoded and sent to the model as
   * pixels — not quoted into the prompt as a string, which is what a model
   * cannot do anything with.
   */
  imageUrl?: string;
  /** Register the copy is written in. Defaults to `gen_z_millennial`. */
  audience: AudienceRegister;
  /** Networks this will be published to, e.g. ['linkedin']. */
  platforms: string[];
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  captionLength: CaptionLength;
  language: string;
  brandVoice?: BrandVoiceInput;
  competitor?: CompetitorContext | null;
  features?: Partial<StudioFeatureFlags>;
  /**
   * The caption currently in the editor. Present on a regenerate, and the
   * model is told to take a different angle rather than paraphrase it.
   */
  previousCaption?: string;
  /** How many alternative captions to write. Clamped to 1–5. */
  variationCount: number;
  /** How many hashtags to suggest. Clamped to 0–30. */
  hashtagCount: number;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface CaptionVariation {
  tone: string;
  caption: string;
  /** The opening line, repeated so the UI can show it without re-parsing. */
  hook: string;
  wordCount: number;
  /** The creative direction this option took, e.g. "Fairytale scale". */
  angle?: string;
  /** One line on why it should land. Shown to whoever is choosing. */
  whyItWorks?: string;
}

/** Provenance for one generation. Stored alongside the caption on the post. */
export interface CaptionMeta {
  provider: string;
  model: string;
  /** Round trip to the model, in milliseconds. */
  durationMs: number;
  generatedAt: string;
  /** Bumped when the prompt changes shape — lets you compare output quality. */
  promptVersion: number;
}

export interface SeoKeyword {
  keyword: string;
  relevanceScore: number;
  difficultyScore: number;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
}

export interface SeoAnalysis {
  primaryKeyword: string;
  keywords: SeoKeyword[];
  metaTitle: string;
  metaDescription: string;
  altText: string;
  slug: string;
  readabilityScore: number;
}

export interface CampaignBeat {
  day: number;
  channel: string;
  angle: string;
  contentIdea: string;
}

export interface CampaignPlan {
  name: string;
  bigIdea: string;
  durationDays: number;
  beats: CampaignBeat[];
  kpis: string[];
  budgetTier: 'organic' | 'low' | 'medium' | 'high';
}

export interface CompetitorAnalysis {
  brandName: string;
  positioning: string;
  toneObserved: string;
  contentThemes: string[];
  postingFrequency: string;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  differentiationAdvice: string;
}

/** The body of a successful `POST /api/ai/caption`. */
export interface CaptionResult {
  /** The recommended caption — the first variation, promoted for convenience. */
  caption: string;
  variations: CaptionVariation[];
  /** Hashtags without the leading `#`. */
  hashtags: string[];
  /** One caption per requested platform, keyed by platform id. */
  platformCaptions: Record<string, string>;
  /**
   * What the model saw in the image. Absent when the post has no image, or
   * when the image could not be fetched — captions are still written, from the
   * topic alone.
   */
  imageAnalysis?: ImageAnalysis;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
  /** The directions considered, in the order the options use them. */
  angles?: CreativeAngle[];
  meta: CaptionMeta;
}

/** What the model is asked to return, before we normalise it. */
export interface RawCaptionPayload {
  angles?: Array<{
    name?: unknown;
    premise?: unknown;
    imageHook?: unknown;
  }>;
  variations?: Array<{
    tone?: unknown;
    caption?: unknown;
    hook?: unknown;
    angle?: unknown;
    whyItWorks?: unknown;
  }>;
  hashtags?: unknown;
  platformCaptions?: Record<string, unknown>;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
}

/** Stage one's reply, before normalisation. Every field is suspect. */
export type RawImageAnalysisPayload = Partial<
  Record<keyof ImageAnalysis, unknown>
>;

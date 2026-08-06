/**
 * AI Marketing Studio — type definitions
 *
 * These types flow through three places:
 *   1. Frontend → PromptBuilder.ts (assembles AiStudioInput)
 *   2. AiStudioInput → Supabase (ai_studio_input column)
 *   3. Make.com → Supabase (writes one AiStudioOutput envelope to ai_studio_output)
 *
 * ─── Why two columns instead of one per feature ─────────────────────────────
 * Everything Make writes back lands in a single versioned envelope. Adding a
 * new studio capability (SEO, campaign plan, competitor analysis, A/B tests…)
 * means adding a key to AiStudioOutput — no migration, no Prisma regen, no
 * Supabase column. Bump STUDIO_SCHEMA_VERSION when an existing key's shape
 * changes incompatibly so readers can branch on it.
 */

// ─── Schema version ──────────────────────────────────────────────────────────

/** Bump when an existing output shape changes incompatibly. Additive keys don't. */
export const STUDIO_SCHEMA_VERSION = 1;

// ─── Input enums ────────────────────────────────────────────────────────────

export type MarketingGoal =
  | "brand_awareness"
  | "lead_generation"
  | "website_traffic"
  | "sales"
  | "bookings"
  | "product_launch"
  | "event_promotion"
  | "newsletter"
  | "community_building"
  | "customer_retention";

export type FunnelStage = "TOFU" | "MOFU" | "BOFU" | "Retention";

export type BrandPersonality =
  | "Luxury"
  | "Corporate"
  | "Playful"
  | "Minimal"
  | "Friendly"
  | "Bold"
  | "Professional"
  | "Premium"
  | "Technical";

export type EmojiStyle = "None" | "Light" | "Moderate" | "Heavy";
export type CtaStyle = "Soft" | "Hard" | "Luxury" | "Professional" | "Urgency" | "Minimal";
export type ContentTone =
  | "Professional"
  | "Minimal"
  | "Luxury"
  | "Storytelling"
  | "Emotional"
  | "Sales"
  | "Corporate"
  | "Creative"
  | "Technical";

export type CaptionLength = "Short" | "Medium" | "Long";

// ─── Brand Voice ─────────────────────────────────────────────────────────────

export interface BrandVoice {
  name: string;
  description: string;
  mission: string;
  tone: string;
  writingStyle: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
  emojiStyle: EmojiStyle;
  ctaStyle: CtaStyle;
  targetAudience: string;
  personality: BrandPersonality;
}

export const DEFAULT_BRAND_VOICE: BrandVoice = {
  name: "",
  description: "",
  mission: "",
  tone: "Professional",
  writingStyle: "Conversational",
  wordsToUse: [],
  wordsToAvoid: [],
  emojiStyle: "Light",
  ctaStyle: "Soft",
  targetAudience: "",
  personality: "Professional",
};

/**
 * A saved brand voice profile as stored in the `brand_voices` table.
 * The `voice` payload is snapshotted into each post's AiStudioInput at
 * generation time, so editing a profile never rewrites past posts.
 */
export interface BrandVoiceProfile {
  id: string;
  name: string;
  is_default: boolean;
  voice: BrandVoice;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BrandVoiceProfileInsert {
  name: string;
  voice: BrandVoice;
  is_default?: boolean;
}

export interface BrandVoiceProfileUpdate {
  name?: string;
  voice?: BrandVoice;
  is_default?: boolean;
}

// ─── Competitor context ───────────────────────────────────────────────────────

export interface CompetitorContext {
  website?: string;
  brandName?: string;
  socialHandle?: string;
}

// ─── Studio Input (frontend → Supabase ai_studio_input) ──────────────────────

/** Optional per-feature toggles. Adding a capability adds a flag here. */
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

export interface AiStudioInput {
  schemaVersion: number;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  /** Snapshot of the brand voice used for this generation. */
  brandVoice: BrandVoice;
  /** Which saved profile it came from, if any — for provenance only. */
  brandVoiceProfileId: string | null;
  competitor: CompetitorContext | null;
  features: StudioFeatureFlags;
  language: string;
  captionLength: CaptionLength;
  /** Expanded prompt modules Make.com reads directly. */
  modules: StudioPromptModules;
  /** ISO timestamp when the request was built. */
  builtAt: string;
}

export interface StudioPromptModules {
  persona: unknown;
  goalModule: unknown;
  funnelModule: unknown;
  brandVoiceModule: unknown;
  competitorModule: unknown;
}

/** @deprecated Legacy name — use AiStudioInput. Kept so old code compiles. */
export type MarketingStudioRequest = AiStudioInput;

// ─── Output: generation metadata ─────────────────────────────────────────────

export type GenerationStatus = "pending" | "generating" | "complete" | "partial" | "failed";

/**
 * Without this, a failed or half-finished Make run is indistinguishable from
 * "never generated" — both leave the output column null-ish.
 */
export interface GenerationMeta {
  status: GenerationStatus;
  /** ISO timestamp Make finished (or gave up). */
  generatedAt: string | null;
  /** e.g. "gemini-2.0-flash" — lets you compare output quality across models. */
  model: string | null;
  /** Wall-clock duration of the Make scenario, in milliseconds. */
  durationMs: number | null;
  /** Human-readable failure reason when status is "partial" or "failed". */
  error: string | null;
  /** Which output keys Make actually produced this run. */
  produced: string[];
}

// ─── Output: per-feature shapes ──────────────────────────────────────────────

export interface ImageAnalysis {
  productCategory: string;
  industry: string;
  targetAudience: string;
  mood: string;
  colorPalette: string[];          // hex codes e.g. ["#1A1A2E", "#E94560"]
  brandStyle: string;
  primarySubject: string;
  secondarySubjects: string[];
  objects: string[];
  sceneDescription: string;
  suggestedCampaignType: string;
  suggestedMarketingObjective: string;
  suggestedBuyerPersona: string;
  confidenceScore: number;          // 0–100
}

export interface ContentVariation {
  tone: ContentTone;
  caption: string;
  hook: string;                    // opening line / hook sentence
  wordCount: number;
}

export interface ContentVariations {
  variations: ContentVariation[];
}

export interface CtaOption {
  type: CtaStyle;
  text: string;
  label: string;                   // short description e.g. "Builds curiosity"
}

export interface CtaOptions {
  options: CtaOption[];
}

export interface Hashtag {
  tag: string;                     // without #
  difficultyScore: number;         // 0–100 (higher = more competitive)
  popularityScore: number;         // 0–100
}

export interface HashtagGroup {
  category: "trending" | "niche" | "location" | "branded" | "competitor";
  hashtags: Hashtag[];
  suggestedQuantity: number;
}

export interface HashtagGroups {
  groups: HashtagGroup[];
}

/** Produced when features.seo is on. */
export interface SeoKeyword {
  keyword: string;
  searchVolume: number | null;
  difficultyScore: number;         // 0–100
  intent: "informational" | "commercial" | "transactional" | "navigational";
}

export interface SeoAnalysis {
  primaryKeyword: string;
  keywords: SeoKeyword[];
  metaTitle: string;
  metaDescription: string;
  altText: string;
  slug: string;
  readabilityScore: number;        // 0–100
}

/** Produced when features.campaign is on. */
export interface CampaignBeat {
  day: number;                     // offset from campaign start
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
  budgetTier: "organic" | "low" | "medium" | "high";
}

/** Produced when features.competitorAnalysis is on. */
export interface CompetitorAnalysis {
  brandName: string;
  positioning: string;
  toneObserved: string;
  contentThemes: string[];
  postingFrequency: string;
  strengths: string[];
  weaknesses: string[];
  /** Angles the competitor is not claiming. */
  gaps: string[];
  differentiationAdvice: string;
}

/** Produced when features.platformVariations is on. */
export interface PlatformVariation {
  caption: string;
  hashtags: string[];
  characterCount: number;
  /** Platform-specific notes, e.g. "first 125 chars show before 'more'". */
  notes: string;
}

/** Keyed by Platform — kept loose so adding a platform needs no change here. */
export type PlatformVariations = Record<string, PlatformVariation>;

// ─── Output envelope (Make.com → Supabase ai_studio_output) ──────────────────

/**
 * Everything Make writes back. Every feature key is optional: a run with
 * features.seo off simply omits `seo`, and a partial run omits whatever
 * failed (see meta.produced / meta.error).
 */
export interface AiStudioOutput {
  schemaVersion: number;
  meta: GenerationMeta;

  imageAnalysis?: ImageAnalysis;
  contentVariations?: ContentVariations;
  ctaOptions?: CtaOptions;
  hashtagGroups?: HashtagGroups;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
  platformVariations?: PlatformVariations;
}

/** Keys of AiStudioOutput that hold generated content (i.e. not schemaVersion/meta). */
export type StudioOutputKey = Exclude<keyof AiStudioOutput, "schemaVersion" | "meta">;

export const STUDIO_OUTPUT_KEYS: StudioOutputKey[] = [
  "imageAnalysis",
  "contentVariations",
  "ctaOptions",
  "hashtagGroups",
  "seo",
  "campaign",
  "competitor",
  "platformVariations",
];

export const EMPTY_GENERATION_META: GenerationMeta = {
  status: "pending",
  generatedAt: null,
  model: null,
  durationMs: null,
  error: null,
  produced: [],
};

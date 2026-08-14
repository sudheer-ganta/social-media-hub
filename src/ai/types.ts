/**
 * AI Marketing Studio — type definitions
 *
 * These types flow through three places:
 *   1. Frontend → PromptBuilder.ts (assembles AiStudioInput)
 *   2. AiStudioInput → Supabase (ai_studio_input column) as the record of what
 *      a generation was asked for
 *   3. The backend AI module's result → AiStudioOutput envelope, folded in by
 *      `ai/caption.ts` and stored in the ai_studio_output column
 *
 * ─── Why two columns instead of one per feature ─────────────────────────────
 * Everything a generation produces lands in a single versioned envelope.
 * Adding a new studio capability (SEO, campaign plan, competitor analysis,
 * A/B tests…) means adding a key to AiStudioOutput — no migration, no Prisma
 * regen, no Supabase column. Bump STUDIO_SCHEMA_VERSION when an existing key's
 * shape changes incompatibly so readers can branch on it.
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

/**
 * The brand, as the user described it.
 *
 * ─── Why the extra five fields ───────────────────────────────────────────────
 * The original shape described how the brand *sounds*. That is enough to write
 * a caption in the right voice and not enough to judge whether the caption will
 * sell anything: the analyser has to know what is being sold, to whom, and why
 * they would pick this brand over the next one.
 *
 * `industry`, `products`, `usp`, `competitors` and `brandColors` are all
 * optional, and everything that consumes them treats an empty value as
 * "unknown" rather than as a reason to fail. A user who never opens the new
 * fields gets exactly the behaviour they had before.
 *
 * ─── Why no migration ────────────────────────────────────────────────────────
 * `brand_voices.voice` is JSONB. Adding a key to this interface adds a key to
 * that payload and nothing else — the same additive trick `AiStudioOutput`
 * relies on. A profile saved before these fields existed simply has them
 * undefined, which is a state every reader already handles.
 */
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

  // ── Brand Intelligence ──
  /** e.g. "luxury weddings", "developer tooling". */
  industry?: string;
  /** What the brand actually sells. */
  products?: string[];
  /** The one line explaining why someone picks this brand over a rival. */
  usp?: string;
  /**
   * Named rivals. Distinct from {@link CompetitorContext}, which is a single
   * competitor the studio researches in depth — this is the standing list.
   */
  competitors?: string[];
  /** Hex codes. Compared against the palette the image actually contains. */
  brandColors?: string[];
}

export const EMPTY_BRAND_VOICE: BrandVoice = {
  name: "None",
  description: "",
  mission: "",
  tone: "",
  writingStyle: "",
  wordsToUse: [],
  wordsToAvoid: [],
  emojiStyle: "None" as any,
  ctaStyle: "None" as any,
  targetAudience: "",
  personality: "" as any,
};

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
  industry: "",
  products: [],
  usp: "",
  competitors: [],
  brandColors: [],
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
  /**
   * Which publishing context the generation ran under. Optional and additive —
   * legacy envelopes lack it, and every reader treats missing keys as unknown.
   */
  contextType?: "personal" | "brand";
  brandId?: string | null;
  competitor: CompetitorContext | null;
  features: StudioFeatureFlags;
  language: string;
  captionLength: CaptionLength;
  /** Expanded prompt modules, kept as the record of the brief used. */
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
 * Without this, a failed or half-finished run is indistinguishable from
 * "never generated" — both leave the output column null-ish.
 */
export interface GenerationMeta {
  status: GenerationStatus;
  /** ISO timestamp the generation finished (or gave up). */
  generatedAt: string | null;
  /** e.g. "gemini-2.5-flash" — lets you compare output quality across models. */
  model: string | null;
  /** Wall-clock duration of the generation, in milliseconds. */
  durationMs: number | null;
  /** Human-readable failure reason when status is "partial" or "failed". */
  error: string | null;
  /** Which output keys were actually produced this run. */
  produced: string[];
}

// ─── Output: per-feature shapes ──────────────────────────────────────────────

/**
 * What the model saw in the post's image, and what a marketer can do with it.
 *
 * Produced by the backend's vision stage (`server/src/ai/generators/
 * image-analysis.generator.ts`) and folded into the envelope by
 * `ai/caption.ts`. The required fields are the ones the studio's Analysis card
 * has always rendered; the optional block below them is what the two-stage
 * pipeline added, and is optional so an envelope written by the old Make.com
 * scenario still satisfies this type.
 */
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

  // ── Added by the vision pipeline ──
  /** Type of place, never a named location. */
  setting?: string;
  composition?: string;
  lighting?: string;
  /** Words legible in the image itself. */
  textInImage?: string[];
  /** Emotions the image can trigger in a viewer. */
  emotions?: string[];
  /** Marketable themes it carries, e.g. "legacy", "quiet luxury". */
  themes?: string[];
  /** What its elements can stand for. */
  symbolism?: string[];
  /** Storytelling openings it offers, one sentence each. */
  storyAngles?: string[];
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

/**
 * One suggested tag.
 *
 * Deliberately just the tag. It used to carry `difficultyScore` and
 * `popularityScore`, and those numbers were **fabricated** — derived in
 * `caption.ts` from the tag's character length and a hash of its characters,
 * then rendered as progress bars beside the words "Difficulty" and "Popularity".
 * Nothing in FlowPost reads a hashtag volume API, so there was no measurement
 * behind them at any point.
 *
 * They are gone rather than zeroed or made optional: a field for a number nobody
 * can supply is a field somebody will eventually populate with an estimate
 * again. If a real hashtag-volume source is ever integrated, add them back
 * alongside the provider that answers for them.
 */
export interface Hashtag {
  tag: string;                     // without #
}

export interface HashtagGroup {
  /**
   * `suggested` is what a caption generation produces — the honest label for
   * "these are the tags the model chose", carrying no claim about reach or
   * competition. The others are only valid when something actually establishes
   * them.
   */
  category:
    | "suggested"
    | "trending"
    | "niche"
    | "location"
    | "branded"
    | "competitor";
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

// ─── Output envelope (generation → Supabase ai_studio_output) ────────────────

/**
 * Everything a generation writes back. Every feature key is optional: a run
 * that did not produce SEO simply omits `seo`, and a partial run omits
 * whatever failed (see meta.produced / meta.error).
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
  /**
   * Marketing Intelligence's verdict — reach score, checklist, forecast.
   *
   * Written by a different call from every other key here, and often at a
   * different time: a post can be generated once and re-analysed after each
   * edit. That is why it is an ordinary optional key rather than part of the
   * generation result — see `ai/analysis.ts`.
   *
   * Typed structurally rather than imported to keep this file free of a
   * circular import; `ai/analysis.ts` imports `AiStudioOutput` from here.
   */
  analysis?: import("./analysis").CaptionAnalysis;
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
  "analysis",
];

export const EMPTY_GENERATION_META: GenerationMeta = {
  status: "pending",
  generatedAt: null,
  model: null,
  durationMs: null,
  error: null,
  produced: [],
};

// ─── Creative DNA — the visual sibling of BrandVoice ──────────────────────────
//
// Same shape BrandVoice has above: a plain payload, saved as a named profile,
// picked later. Where BrandVoice describes how a brand writes, this describes
// how it looks — photography style, composition, lighting, mood, colour,
// logo/product treatment. Resolved server-side by
// `server/src/ai/brand/creative-dna.ts`, which fills any gap left blank from
// whatever Vision reads off an attached image.

export interface CreativeDna {
  visualStyle: string;
  photographyStyle: string;
  composition: string;
  lighting: string;
  mood: string;
  typographyCharacter: string;
  spacing: string;
  productTreatment: string;
  logoTreatment: string;
  preferredElements: string[];
  avoidedElements: string[];
  brandColors: string[];
  logoAssetUrl: string;
  referenceAssetUrls: string[];
}

export const DEFAULT_CREATIVE_DNA: CreativeDna = {
  visualStyle: "",
  photographyStyle: "",
  composition: "",
  lighting: "",
  mood: "",
  typographyCharacter: "",
  spacing: "",
  productTreatment: "",
  logoTreatment: "",
  preferredElements: [],
  avoidedElements: [],
  brandColors: [],
  logoAssetUrl: "",
  referenceAssetUrls: [],
};

export interface CreativeDnaProfile {
  id: string;
  name: string;
  is_default: boolean;
  dna: CreativeDna;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreativeDnaProfileInsert {
  name: string;
  dna: CreativeDna;
  is_default?: boolean;
}

export interface CreativeDnaProfileUpdate {
  name?: string;
  dna?: CreativeDna;
  is_default?: boolean;
}

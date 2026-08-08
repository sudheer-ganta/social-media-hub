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

/**
 * The brand as the caller described it, in full.
 *
 * A superset of {@link BrandVoiceInput} — every field of that shape is still
 * valid here, which is what lets a client that has never heard of a brand
 * profile keep posting the same body. The five additions are the facts a
 * marketer needs and a *voice* cannot express: what is sold, to which market,
 * why it wins, who it is up against, and what it looks like.
 *
 * This is a wire shape. Both engines read {@link BrandProfile} instead, which
 * is what `brand/brand-profile.ts` resolves this into.
 */
export interface BrandProfileInput extends BrandVoiceInput {
  /** e.g. "luxury weddings", "developer tooling". */
  industry?: string;
  /** What the brand actually sells. */
  products?: string[];
  /** The one-line reason to pick this brand over the next one. */
  usp?: string;
  /** Named rivals. Distinct from {@link CompetitorContext}, which is one rival to study. */
  competitors?: string[];
  /** Hex codes, e.g. `["#1A1A2E"]`. Compared against what the image actually contains. */
  brandColors?: string[];
}

/**
 * Brand Intelligence: the resolved layer that sits between Vision and both
 * engines.
 *
 *   image → [Vision] ─┐
 *                     ├→ [Brand Intelligence] → Creative → Marketing
 *   brand profile ────┘
 *
 * Two jobs, both deliberately deterministic — this layer costs no model call:
 *
 *  1. **Fill gaps from the image.** A user who never typed an industry still
 *     gets one when the picture plainly shows a wedding venue. Vision already
 *     reports `industry`, `targetAudience` and `productCategory`; leaving those
 *     unused while the prompt says "industry: unknown" was pure waste.
 *  2. **Report its own confidence.** `completeness` and `provenance` let a
 *     prompt say *"this is a guess, lean on the copy"* instead of asserting a
 *     derived fact as though the user had stated it.
 *
 * Every field is a string or array rather than an optional, so prompt builders
 * never branch on undefined — an unknown field is simply empty.
 */
export interface BrandProfile {
  name: string;
  description: string;
  mission: string;
  industry: string;
  audience: string;
  tone: string;
  writingStyle: string;
  personality: string;
  products: string[];
  usp: string;
  competitors: string[];
  ctaStyle: string;
  emojiStyle: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
  brandColors: string[];
  /** 0–100. How much of the profile is actually filled in. */
  completeness: number;
  /** Where each resolved field came from. Only keys that have a value appear. */
  provenance: Record<string, BrandFactSource>;
}

/**
 * `brand` — the user typed it. `image` — Brand Intelligence read it off the
 * picture. A field with no value at all is absent from `provenance` entirely.
 */
export type BrandFactSource = 'brand' | 'image';

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
   * The song the user already chose, if any.
   *
   * Two effects, both deliberate: the copy is written to sit with that track's
   * mood, and no song suggestions are produced. A user who has picked their
   * audio does not want a list of alternatives, and overwriting their choice is
   * the one thing the assistant must never do.
   */
  music?: string;
  /**
   * Whether to return audio ideas. Opt-in and off by default.
   *
   * The default matters: with this false the prompt is assembled exactly as it
   * was before song suggestions existed. Only the Personal composer sets it,
   * which is what keeps every other caller's generation unchanged.
   */
  suggestSongs: boolean;
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
  /**
   * Kept under its original key so an older client's body still validates.
   * The type widened in the Brand Intelligence sprint — the extra fields are
   * all optional, so nothing that used to be sent has stopped being valid.
   */
  brandVoice?: BrandProfileInput;
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

/**
 * One audio recommendation.
 *
 * Deliberately carries no "trending on Instagram right now" claim. Nothing in
 * this backend reads a live charts feed, so a trending label would be invented
 * — the UI presents these as what they are: a model's read of the post.
 */
export interface SongSuggestion {
  title: string;
  artist: string;
  /** One line on why it fits this post. */
  reason: string;
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
  /**
   * What Brand Intelligence resolved and the copy was actually written
   * against, inferred fields included. Not an echo of the request: a user who
   * never stated an industry can see the one the image supplied.
   */
  brand?: BrandProfile;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
  /** The directions considered, in the order the options use them. */
  angles?: CreativeAngle[];
  /** Audio ideas. Absent when the user already chose a song. */
  songSuggestions?: SongSuggestion[];
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
  songSuggestions?: Array<{
    title?: unknown;
    artist?: unknown;
    reason?: unknown;
  }>;
  platformCaptions?: Record<string, unknown>;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
}

/** Stage one's reply, before normalisation. Every field is suspect. */
export type RawImageAnalysisPayload = Partial<
  Record<keyof ImageAnalysis, unknown>
>;

// ─── Marketing Intelligence ──────────────────────────────────────────────────
//
// The second engine. Creative Intelligence writes copy; Marketing Intelligence
// judges it. They are separate calls against separate prompts because they are
// separate jobs, and asking one call to do both produces a model that marks its
// own homework — it scored its own caption 9/10 with striking consistency.
//
// The split has a second payoff that matters more day to day: analysis runs
// over a caption the *user* edited, not only over one the model wrote.

/** How sure the model is of a judgement it just made. */
export type Confidence = 'High' | 'Medium' | 'Low';

/** A predicted outcome band. Deliberately not a percentage — see EngagementForecast. */
export type Likelihood = 'Low' | 'Medium' | 'High';

/**
 * The axes a caption is scored on.
 *
 * `visual` is only scored when there is an image; `hashtags` only when tags
 * were supplied. Weights are renormalised over whichever axes actually applied,
 * so a text-only post is not quietly marked down for having no visual.
 */
export type ScoreDimension =
  | 'hook'
  | 'visual'
  | 'platformFit'
  | 'audienceFit'
  | 'cta'
  | 'readability'
  | 'hashtags';

export interface DimensionScore {
  /** 0–10. */
  score: number;
  /**
   * How certain this particular judgement is.
   *
   * Not decoration. "Does this open strongly" is a judgement a model makes
   * well; "will a luxury buyer respond to this register" is one it makes from
   * thinner evidence. Reporting both as a bare 8/10 implies a precision the
   * second one does not have.
   */
  confidence: Confidence;
  /** One line on what drove the number. Shown under the score. */
  reason: string;
}

/**
 * Facts about the caption, counted rather than asked for.
 *
 * Nothing in here goes to a model. A model asked "how many hashtags are in
 * this caption" is slower, costs money, and is occasionally wrong about a
 * number that `String.match` is never wrong about. The model's job is the part
 * arithmetic cannot do — whether the hook lands — and every metric it would
 * otherwise have to count is handed to it instead as ground truth.
 */
export interface CaptionMetrics {
  characterCount: number;
  wordCount: number;
  sentenceCount: number;
  /** Blank-line-separated blocks. */
  paragraphCount: number;
  lineCount: number;
  emojiCount: number;
  hashtagCount: number;
  mentionCount: number;
  linkCount: number;
  /** At 200 words per minute, rounded up. */
  readingTimeSeconds: number;
  averageWordsPerSentence: number;
  longestParagraphWords: number;
  /**
   * Flesch Reading Ease, 0–100 — higher is easier. Calibrated for English;
   * see the note in `analysis/metrics.ts` for what it means elsewhere.
   */
  readingEase: number;
  /** Length of the first line, which is what a feed truncation cuts into. */
  hookCharacterCount: number;
  endsWithQuestion: boolean;
}

export interface PlatformCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

/**
 * One network's verdict.
 *
 * Every check in here is deterministic — character budgets, truncation points,
 * hashtag counts, paragraph shape. Platform rules are arithmetic against a
 * published limit, and a model has no advantage at arithmetic.
 */
export interface PlatformFit {
  platform: string;
  /** 0–10, derived from `checks`. Not a model output. */
  score: number;
  checks: PlatformCheck[];
  /** Platform-specific advice, e.g. "Move the 8 hashtags to the first comment." */
  recommendations: string[];
}

/**
 * What the post is likely to actually *do*, which is the question a reach score
 * only gestures at.
 *
 * Bands rather than percentages on purpose. Nothing here is calibrated against
 * this account's real engagement history — there is none wired up yet — so a
 * "6.2% save rate" would be a fabricated precision. "High saves, low comments"
 * is the same information without the false decimal point, and it is the shape
 * a marketer acts on anyway.
 */
export interface EngagementForecast {
  saves: Likelihood;
  shares: Likelihood;
  comments: Likelihood;
  clicks: Likelihood;
  rationale: string;
}

/** The answer to "why is it 74?", in the two directions that matters. */
export interface ScoreExplanation {
  strengths: string[];
  weaknesses: string[];
}

export interface Improvement {
  dimension: ScoreDimension;
  /** What is wrong, in one line. */
  issue: string;
  /** What to do about it, specifically enough to act on without thinking. */
  suggestion: string;
  /** Rough points on the 0–100 reach score if it were fixed. */
  estimatedGain: number;
  /**
   * The concrete change, when there is one a client can apply verbatim.
   *
   * Optional and additive: an improvement without either field is exactly the
   * prose recommendation this type has always carried, which is all the Brand
   * panel reads. Personal's Reach panel turns these into an Apply button, so
   * "your tags are broad" arrives with the specific tags it means instead of
   * leaving the member to guess them.
   *
   * Never a rewrite. `suggestedHashtags` are tags to *add* to the caption and
   * `suggestedLine` is one sentence to *append* — nothing here can replace a
   * word somebody typed.
   */
  suggestedHashtags?: string[];
  suggestedLine?: string;
}

/**
 * `blocker` — do not publish. `important` — publish worse without it.
 * `polish` — nice to have. Severity drives the readiness percentage, so ten
 * unticked polish items never look like one unticked blocker.
 */
export type ChecklistSeverity = 'blocker' | 'important' | 'polish';

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  severity: ChecklistSeverity;
  /** What to do about it. Present only when `passed` is false. */
  fix?: string;
}

export interface PrePublishChecklist {
  items: ChecklistItem[];
  /** 0–100, weighted by severity rather than a raw pass count. */
  readiness: number;
}

/**
 * Provenance for one analysis.
 *
 * `analysisVersion` and `weightsVersion` move independently and both matter:
 * re-tuning the weights changes every score without a line of the prompt
 * changing, and without two version fields you cannot tell a re-scored caption
 * from a re-analysed one.
 */
export interface AnalysisMeta {
  /** Semver for the analyser as a whole. */
  analysisVersion: string;
  /** Semver for the scoring weights alone. */
  weightsVersion: string;
  /** Bumped when `analysis.prompt.ts` changes shape. */
  promptVersion: number;
  provider: string;
  model: string;
  durationMs: number;
  analysedAt: string;
}

/** The body of `POST /api/ai/analyse`, after validation. */
export interface AnalysisRequest {
  /** The caption to judge — usually the one in the editor, edits included. */
  caption: string;
  /** Hashtags as they will be published, without the leading `#`. */
  hashtags: string[];
  platforms: string[];
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  audience: AudienceRegister;
  language: string;
  brand?: BrandProfileInput;
  /**
   * Vision's read, when the caller still has it from generation. Passing it
   * back is what makes the `visual` dimension mean anything — without it the
   * analyser knows only that an image exists, not whether the copy uses it.
   */
  imageAnalysis?: ImageAnalysis;
  hasImage: boolean;
}

/** The body of a successful `POST /api/ai/analyse`. */
export interface CaptionAnalysis {
  /** 0–100. The weighted roll-up of `scores`. */
  reachScore: number;
  /** Only the dimensions that applied to this caption. */
  scores: Partial<Record<ScoreDimension, DimensionScore>>;
  /** The weights actually used, after renormalisation. Sums to 1. */
  weights: Partial<Record<ScoreDimension, number>>;
  explanation: ScoreExplanation;
  metrics: CaptionMetrics;
  platforms: PlatformFit[];
  engagement: EngagementForecast;
  checklist: PrePublishChecklist;
  /** Highest estimated gain first. */
  improvements: Improvement[];
  /** What Brand Intelligence resolved for this run, for the audit trail. */
  brand?: BrandProfile;
  meta: AnalysisMeta;
}

/** What the analysis model is asked for, before we normalise it. */
export interface RawAnalysisPayload {
  scores?: Record<string, { score?: unknown; confidence?: unknown; reason?: unknown }>;
  strengths?: unknown;
  weaknesses?: unknown;
  engagement?: {
    saves?: unknown;
    shares?: unknown;
    comments?: unknown;
    clicks?: unknown;
    rationale?: unknown;
  };
  improvements?: Array<{
    dimension?: unknown;
    issue?: unknown;
    suggestion?: unknown;
    estimatedGain?: unknown;
    suggestedHashtags?: unknown;
    suggestedLine?: unknown;
  }>;
}

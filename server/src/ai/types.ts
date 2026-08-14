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

/**
 * Which brain writes the post.
 *
 * Not a tone setting and not a feature flag — the two select genuinely
 * different prompts, different output contracts and different evaluation
 * rubrics. `brand` is everything this module did before Personal existed and is
 * the default, so a client that has never heard of a mode keeps the behaviour
 * it always had.
 *
 *   brand     a social strategist writing for a business: objective, funnel,
 *             audience register, hook, CTA, hashtags, platform rules, SEO.
 *   personal  the member's own voice. None of the above applies — see
 *             `prompts/personal.prompt.ts` for what replaces it.
 *
 * Mirrors `posts.context_type`, which is where the browser gets it from.
 */
export type CaptionMode = 'personal' | 'brand';

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
 * The register the brand speaks in, when the member insists on one.
 *
 * ─── Why this is optional, and must stay optional ────────────────────────────
 * The default is **absent**, and absent does not mean "professional" — it means
 * *work it out*. A brand does not have one voice: the same account is playful
 * announcing a drop, plain answering a complaint, and precise explaining a
 * price. Making the member choose per post moves that judgement onto the person
 * who wanted the tool to make it, and they will pick the same value every time
 * and then wonder why every caption sounds identical.
 *
 * So when this is absent the prompt is told to infer the register from the
 * content in front of it, the brand's own learned voice, the platform and what
 * has performed. Present, it is an instruction and overrides the inference —
 * which is the whole point of offering it.
 *
 * Distinct from {@link AudienceRegister}, which is *who the copy is aimed at*.
 * A premium brand writing for Gen Z is a real and common combination, and
 * collapsing the two axes would make it unsayable.
 */
export type BrandStyle =
  | 'professional'
  | 'playful'
  | 'gen_z'
  | 'bold'
  | 'controversial'
  | 'educational'
  | 'premium'
  | 'promotional';

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

  // ─── Personal read ─────────────────────────────────────────────────────────
  //
  // Asked for only when `mode: 'personal'`, which is why every field here is
  // optional: a brand analysis never carries them, and neither does any
  // analysis stored on a post before Personal existed.
  //
  // The block above answers "what could a campaign do with this picture". These
  // four answer the question a person posting it actually has — what is going
  // on here, and what would somebody notice first.

  /** What the subject is visibly doing, in a few words. */
  whatSubjectIsDoing?: string;
  /** The energy of the picture in plain words — not a marketing "mood". */
  vibe?: string;
  /**
   * Characters, franchises, films, songs or public figures the image visibly
   * evokes. A *resemblance*, never an identification of a real person.
   */
  recognisableReferences?: string[];
  /** The one thing a friend would comment on first. Often the funny part. */
  whatAFriendWouldNotice?: string;
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
  /**
   * Which brain writes it. Defaults to `brand` in the service, so an older
   * client's body produces exactly the caption it always produced.
   */
  mode: CaptionMode;
  /**
   * Whose style memory to read.
   *
   * Injected by the service from the authenticated session and **never** read
   * from the request body. A body that could name its own user id is a body
   * that can read another member's entire writing history.
   */
  userId: string;
  /** Scopes a brand-context style profile. Ignored in personal mode. */
  brandId?: string;
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
  /**
   * The brand's voice for this post, when the member overrode the default.
   *
   * Absent is the normal case and means FlowPost decides — see
   * {@link BrandStyle}. Ignored in personal mode, where the member's own learned
   * voice is the only register there is and a style knob would fight it.
   */
  styleOverride?: BrandStyle;
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

export interface WhyThisWorksDetails {
  hook?: string;
  funnel?: string;
  voice?: string;
  platform?: string;
}

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
  /** Evidence-based breakdown of why this option works. */
  whyItWorksDetails?: WhyThisWorksDetails;
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

export interface StrategyUsedInfo {
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  audience: AudienceRegister;
  styleOverride?: BrandStyle | null;
  brandVoiceApplied: boolean;
  audienceConsidered: boolean;
  imageAnalyzed: boolean;
  performanceSignalsConsidered: boolean;
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
  /** Exact strategy details actually used during generation (for transparency UI) */
  strategyUsed?: StrategyUsedInfo;
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
    whyItWorksDetails?: Record<string, unknown>;
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

// ─── Personal ────────────────────────────────────────────────────────────────

/**
 * What the personal writer worked out before it wrote anything.
 *
 * The counterpart of Brand's `angles`, and deliberately a different shape.
 * Angles are creative *directions to fill* — three named premises, one caption
 * each. This is a single read of one post, and the captions that follow are not
 * required to divide themselves between anything.
 *
 * Never returned to the browser. It exists so the model commits to
 * understanding the post before it starts typing, which is the whole of what
 * separates "a caption for this image" from "what this person would post".
 */
export interface PersonalRead {
  whatThisIs: string;
  whatStandsOut: string;
  /** Which creative behaviours suit THIS post. The model's call, not ours. */
  whatFits: string;
}

/** One personal candidate, before filtering and ranking. */
export interface PersonalCandidate {
  text: string;
  /**
   * Free text, at most two words, chosen by the model rather than assigned by
   * us — an enum here would become a checklist to work through, which is the
   * rotation this design exists to avoid. Logged for telemetry and used for
   * diversity; never returned to the browser and never shown to a member.
   */
  behaviour: string;
}

/** What the personal prompt is asked to return, before we normalise it. */
export interface RawPersonalPayload {
  read?: {
    whatThisIs?: unknown;
    whatStandsOut?: unknown;
    whatFits?: unknown;
  };
  captions?: Array<{ text?: unknown; behaviour?: unknown }>;
}

// ─── Hashtags ────────────────────────────────────────────────────────────────
//
// A generator of its own rather than a field on {@link CaptionResult}, and the
// split earns itself twice: tags are chosen against the *finished* caption
// (including one the member typed), and they can be regenerated without
// regenerating the copy. The caption call still returns `hashtags` so no existing
// client breaks — this is the surface that knows what it is doing.

/**
 * The two-tier answer.
 *
 * `primary` is what publishes and already fits the tightest selected network's
 * ceiling. `secondary` is offered, never applied — the overflow plus the model's
 * own extras, so a member cross-posting to Instagram and X can see the tags
 * Instagram would have taken without X being pushed over its limit.
 *
 * Both may be empty, and that is a success rather than a failure: some posts read
 * worse with tags, and `note` says so.
 */
export interface HashtagResult {
  /** Tags to publish, without the leading `#`. May be empty. */
  primary: string[];
  /** Relevant extras for the member to add by hand. May be empty. */
  secondary: string[];
  /** One line on why these, or why none. Never a reach claim. */
  note: string;
  /** The networks this set was chosen for. */
  platforms: string[];
  /**
   * The count the selected networks jointly allow. `conflict` is true when they
   * do not agree — Instagram wants at least three, X tolerates at most two — in
   * which case `max` is the tighter ceiling and the UI can explain why.
   */
  budget: { min: number; max: number; conflict: boolean };
  /** What was dropped and why. For the log and for tests; never shown. */
  rejected: Array<{ tag: string; reason: string }>;
  meta: {
    provider: string;
    model: string;
    durationMs: number;
    promptVersion: number;
  };
}

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
  // Brand. Unchanged, and still the whole of what Marketing Intelligence
  // judges a business's copy on.
  | 'hook'
  | 'visual'
  | 'platformFit'
  | 'audienceFit'
  | 'cta'
  | 'readability'
  | 'hashtags'
  // ─── Personal ─────────────────────────────────────────────────────────────
  //
  // A different rubric, not a relaxed one. Judging a personal caption on hooks,
  // CTAs and hashtags marks it down for three things it is deliberately not
  // doing — and the mechanism for judging a caption on a subset of axes already
  // existed, because a text-only post has always had to be scored without
  // `visual`. See `applicableDimensions` and `normaliseWeights`.
  //
  // Only `visual` is shared, and it means the same thing in both.
  | 'voiceMatch'
  | 'humanness'
  | 'originality';

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

// ─── Targeted improvement ────────────────────────────────────────────────────

/**
 * The parts of a post a targeted regeneration can rewrite.
 *
 * A strict subset of {@link ScoreDimension}, and the omissions are the point.
 * `visual` and `platformFit` are not here because no amount of copy fixes a
 * badly cropped image or an unselected network — offering to "regenerate" them
 * would be inventing a fix for a problem text cannot reach. `audienceFit` is
 * out because it is a property of the whole post rather than of one passage.
 */
export type ImprovementTarget = 'hook' | 'readability' | 'cta' | 'hashtags';

/**
 * Where a generated improvement goes in the caption.
 *
 * Derived from the target on our side, never chosen by the model: a hook is
 * always added in front, an engagement prompt always at the end, hashtags
 * always through the existing append-and-dedupe path, and only `readability`
 * produces a whole replacement caption — which is why that one, and only that
 * one, requires the member to confirm a visible before/after.
 */
export type ImprovementKind = 'lead' | 'line' | 'hashtags' | 'replace';

export interface ImprovementRequest {
  /**
   * Which mode wrote it. In personal mode the register rule hardens: their
   * fragments, lowercase and missing punctuation are the voice, and an
   * improvement that tidies them has broken the thing it was fixing.
   */
  mode: CaptionMode;
  target: ImprovementTarget;
  /** The caption as it stands right now. The thing being improved. */
  caption: string;
  hashtags: string[];
  platforms: string[];
  audience: AudienceRegister;
  language: string;
  hasImage: boolean;
  imageAnalysis?: ImageAnalysis;
  /** The member's chosen song, as context for tone. Never changed here. */
  music?: string;
  /** What the analysis said was wrong, so the fix answers that and not a guess. */
  issue?: string;
  /** What the analysis recommended doing about it. */
  recommendation?: string;
}

export interface TargetedImprovement {
  target: ImprovementTarget;
  kind: ImprovementKind;
  /** For `lead` and `line`. */
  line?: string;
  /** For `replace` — a whole caption, offered, never applied on its own. */
  caption?: string;
  /** For `hashtags`, without the leading `#`. */
  hashtags?: string[];
  /** One short line naming what changed, shown above the preview. */
  note: string;
  meta: {
    provider: string;
    model: string;
    durationMs: number;
  };
}

/** What the improvement model is asked for, before we normalise it. */
export interface RawImprovementPayload {
  line?: unknown;
  caption?: unknown;
  hashtags?: unknown;
  note?: unknown;
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
  /**
   * Which rubric to judge against. A personal caption scored on hooks, CTAs
   * and hashtags is scored on three things it is not trying to do — see the
   * personal dimensions in `analysis/weights.ts`.
   */
  mode: CaptionMode;
  /**
   * Whose style memory to judge `voiceMatch` against. Injected by the service
   * from the session, never read from the body — same rule as
   * {@link CaptionRequest.userId}. Absent on the paths that build an
   * AnalysisRequest directly, which simply judge without a style profile.
   */
  userId?: string;
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

// ─── Creative DNA / brand-native image generation ────────────────────────────
//
// The visual sibling of BrandVoiceInput/BrandProfile above. Same shape,
// different axis: BrandVoiceInput describes how a brand *writes*; this
// describes how it *looks*. Resolved the same deterministic way — see
// `ai/brand/creative-dna.ts` — and rendered into the same kind of brief a
// generator reads before calling a model.

/** The brand's visual identity as the caller chose to describe it. */
export interface CreativeDnaInput {
  visualStyle?: string;
  photographyStyle?: string;
  composition?: string;
  lighting?: string;
  mood?: string;
  typographyCharacter?: string;
  spacing?: string;
  productTreatment?: string;
  logoTreatment?: string;
  preferredElements?: string[];
  avoidedElements?: string[];
  brandColors?: string[];
  logoAssetUrl?: string;
  referenceAssetUrls?: string[];
}

/** Resolved Creative DNA: user-set fields plus whatever Vision filled in. */
export interface ResolvedCreativeDna {
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
  /** 0–100. How much of the profile is actually filled in. */
  completeness: number;
  provenance: Record<string, BrandFactSource>;
}

/**
 * The internal creative brief a generator assembles before calling the image
 * model — never shown raw to the user, who sees the friendly "FlowPost
 * understood" summary built from it instead.
 */
/**
 * The medium/technique a creative is executed in — a SEPARATE axis from
 * `CreativeMode` (tone/register). Two SURREAL-mode concepts can still look
 * nothing alike: one shot as SURREAL_EDITORIAL photography, the other as
 * ILLUSTRATIVE collage. Chosen by the Creative Director from the concept's
 * mechanism, never defaulted — the fix for FlowPost's outputs collapsing
 * into one repeated "AI SaaS" visual language regardless of the idea.
 */
export type ArtDirectionFamily =
  | 'EDITORIAL_PHOTOGRAPHY'
  | 'SURREAL_EDITORIAL'
  | 'INTERACTIVE_GRAPHIC'
  | 'TYPOGRAPHY_LED'
  | 'PRODUCT_STUDIO'
  | 'DOCUMENTARY'
  | 'COLLAGE'
  | 'HANDCRAFTED'
  | 'CINEMATIC'
  | 'MINIMAL_ART'
  | 'PLAYFUL_GRAPHIC'
  | 'CULTURAL_EDITORIAL'
  | 'INFORMATIONAL'
  | 'ILLUSTRATIVE';

/**
 * The register a creative is art-directed in — chosen by the Creative
 * Director from the brief, never asked of the user (spec §14).
 */
export type CreativeMode =
  | 'EDITORIAL'
  | 'PLAYFUL'
  | 'SURREAL'
  | 'INTERACTIVE'
  | 'HUMOROUS'
  | 'MINIMAL'
  | 'CULTURAL'
  | 'STORYTELLING'
  | 'VISUAL_METAPHOR'
  | 'EDUCATIONAL';

/**
 * How much of "a complete creative" this direction actually needs — decided
 * by the idea, not defaulted to everything (spec §8). `none` is a real,
 * common answer: some ideas communicate entirely through the image.
 */
export type CopyTreatment = 'none' | 'headline' | 'headline_support' | 'interactive' | 'editorial_punchline';

/**
 * The layer that turns a visual concept into a FINISHED social creative,
 * rather than just a nice image with a headline on it — the gap between
 * "AI image" and "marketing creative". Every field is optional and additive:
 * `headline`/`supportingLine`/`cta`/`interactionInstructions` above already
 * cover the copy itself, so this only carries what a beautiful visual +
 * headline still leaves out — brand positioning, practical/location detail,
 * how the logo actually sits in the shot, and anything else the concept
 * specifically requires. Never force a field the idea doesn't need.
 */
export interface MarketingCreative {
  /** Why this brand specifically, distinct from the headline's hook — e.g. "Cooked in silence, served with love." */
  brandMessage?: string;
  /** Practical/location detail that finishes the creative — e.g. "Prism Mall, Gachibowli". */
  secondaryInfo?: string[];
  /** How the logo/wordmark participates in this specific shot, if it needs a call beyond the brand's default mark. */
  logoTreatment?: string;
  /** Anything this concept requires that isn't implied by the other fields. */
  requiredElements?: string[];
}

/**
 * The graphic-design layer that turns an art-directed image into a laid-out
 * social creative — where things sit, in what order, at what density. Every
 * field is optional and derived from the concept, never a fixed default: a
 * minimal visual-metaphor idea might only need `safeAreas`, while a dense
 * promo needs most of them. Not layout content (that's headline/cta/
 * marketingCreative above) — this is where that content goes and why.
 */
export interface LayoutDirection {
  /** The overall layout approach this concept calls for — e.g. "editorial vertical split, product foreground-left, copy right column". */
  layoutType?: string;
  /** Reading order, each entry naming its job — e.g. "HOOK — headline, top-left", "DIRECT — cta, bottom-right corner". */
  textHierarchy?: string[];
  headlinePlacement?: string;
  supportingCopyPlacement?: string;
  logoPlacement?: string;
  /** How brand identity (colour, motif, material) shows up across the piece beyond the logo mark itself. */
  brandTreatment?: string;
  /** Where practical/secondary detail (location, campaign tag) sits — not the detail itself, see marketingCreative.secondaryInfo. */
  secondaryInformation?: string;
  ctaPlacement?: string;
  productPlacement?: string;
  foregroundElements?: string;
  backgroundElements?: string;
  textureDirection?: string;
  typographyDirection?: string;
  /** How busy the composition should feel — e.g. "minimal, one focal point" or "dense, editorial layering". */
  visualDensity?: string;
  /** What must stay clear of text/graphics — e.g. "bottom 15% clear for platform UI". */
  safeAreas?: string;
}

export interface CreativeDirection {
  concept: string;
  visualStory: string;
  subject: string;
  environment: string;
  composition: string;
  lighting: string;
  mood: string;
  palette: string[];
  brandConstraints: string[];
  productTreatment: string;
  background: string;
  /** Things the image must NOT contain — invented claims, extra logos, text. */
  negativeVisualConstraints: string[];
  aspectRatio: string;
  platform: string;
  mode: CreativeMode;
  /** Fixed from the chosen concept, never re-decided here — see ScoredCreativeConcept.artDirectionFamily. */
  artDirectionFamily: ArtDirectionFamily;
  copyTreatment: CopyTreatment;
  /** Only meaningful when copyTreatment isn't 'none'. Short, human, brand-specific — never filler. */
  headline: string;
  supportingLine: string;
  cta: string;
  /** For an INTERACTIVE concept — "Which one fits?", "Guess before you scroll." */
  interactionInstructions: string;
  /** Absent when the idea communicates entirely through headline/visual alone. */
  marketingCreative?: MarketingCreative;
  /** Absent when the concept is simple enough that composition/copyTreatment already say where things go. */
  layoutDirection?: LayoutDirection;
}

/** What stage one hands the image call: the direction, and its provenance. */
export interface CreativeDirectionOutcome {
  direction: CreativeDirection;
  meta: { provider: string; model: string; durationMs: number };
}

/** What the direction model is asked for, before we normalise it. */
export interface RawCreativeDirectionPayload {
  concept?: unknown;
  visualStory?: unknown;
  subject?: unknown;
  environment?: unknown;
  composition?: unknown;
  lighting?: unknown;
  mood?: unknown;
  palette?: unknown;
  brandConstraints?: unknown;
  productTreatment?: unknown;
  background?: unknown;
  negativeVisualConstraints?: unknown;
  aspectRatio?: unknown;
  platform?: unknown;
  mode?: unknown;
  copyTreatment?: unknown;
  headline?: unknown;
  supportingLine?: unknown;
  cta?: unknown;
  interactionInstructions?: unknown;
  marketingCreative?: {
    brandMessage?: unknown;
    secondaryInfo?: unknown;
    logoTreatment?: unknown;
    requiredElements?: unknown;
  };
  layoutDirection?: {
    layoutType?: unknown;
    textHierarchy?: unknown;
    headlinePlacement?: unknown;
    supportingCopyPlacement?: unknown;
    logoPlacement?: unknown;
    brandTreatment?: unknown;
    secondaryInformation?: unknown;
    ctaPlacement?: unknown;
    productPlacement?: unknown;
    foregroundElements?: unknown;
    backgroundElements?: unknown;
    textureDirection?: unknown;
    typographyDirection?: unknown;
    visualDensity?: unknown;
    safeAreas?: unknown;
  };
}

// ─── Creative concepts — the idea stage, ahead of art direction ──────────────
//
// FlowPost is the creative director, not the image model (spec §23): before
// any art direction or image generation, this stage asks "what is the
// advertising idea?" and answers with several genuinely different mechanisms
// — never five cosmetic variants of one idea. See
// `ai/generators/creative-concepts.generator.ts`.

/**
 * One advertising idea. Every field is optional except the three that anchor
 * it (conceptName, bigIdea, visualMechanism) — spec §3: "not every concept
 * needs every field." A puzzle concept has an `interaction`; a visual-
 * metaphor concept has a `visualMetaphor`; neither needs the other.
 */
export interface CreativeConcept {
  conceptName: string;
  bigIdea: string;
  visualMechanism: string;
  humanInsight?: string;
  visualMetaphor?: string;
  interaction?: string;
  message?: string;
  productRole?: string;
  brandConnection?: string;
  whyItWouldStopTheScroll?: string;
}

/** The quality gate a concept clears before it reaches the user — spec §18. 0–100 each. */
export interface CreativeConceptScores {
  conceptStrength: number;
  brandSpecificity: number;
  productRelevance: number;
  visualOriginality: number;
  scrollStoppingPotential: number;
  messageClarity: number;
  socialInteractionPotential: number;
  /** Higher = closer to a generic AI-ad default. Lower is better. */
  templateRisk: number;
}

export interface ScoredCreativeConcept extends CreativeConcept {
  mode: CreativeMode;
  /** The medium/technique this idea's mechanism calls for — see ArtDirectionFamily. Chosen per concept, not defaulted. */
  artDirectionFamily: ArtDirectionFamily;
  scores: CreativeConceptScores;
}

export interface RawCreativeConceptPayload {
  conceptName?: unknown;
  bigIdea?: unknown;
  visualMechanism?: unknown;
  humanInsight?: unknown;
  visualMetaphor?: unknown;
  interaction?: unknown;
  message?: unknown;
  productRole?: unknown;
  brandConnection?: unknown;
  whyItWouldStopTheScroll?: unknown;
  mode?: unknown;
  artDirectionFamily?: unknown;
  scores?: {
    conceptStrength?: unknown;
    brandSpecificity?: unknown;
    productRelevance?: unknown;
    visualOriginality?: unknown;
    scrollStoppingPotential?: unknown;
    messageClarity?: unknown;
    socialInteractionPotential?: unknown;
    templateRisk?: unknown;
  };
}

export interface CreativeConceptsOutcome {
  concepts: ScoredCreativeConcept[];
  /** How many the model proposed before the quality gate filtered any out. */
  proposedCount: number;
  meta: { provider: string; model: string; durationMs: number };
  /** Present whenever references were analysed (fresh upload or a reused saved profile) — the "FlowPost understood your style" transparency step reads this. */
  referenceStyle?: ReferenceStyleProfile;
}

/** The request behind `POST /api/ai/creative/direction` and `/generate`. */
export interface CreativeGenerationRequest {
  userId: string;
  contextType: CaptionMode;
  brandId?: string;
  /** The member's natural-language request, verbatim. */
  prompt: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  /** Public URLs of product/logo/reference images the member attached. */
  assetUrls: string[];
  /**
   * The member's saved Creative DNA, as the browser read it from `creative_dna`
   * and sent along — the same pattern `CaptionRequest.brandVoice` uses rather
   * than a `creativeDnaId` the backend would have to look up itself. The
   * backend has no read path to a frontend-owned, PostgREST/RLS table.
   */
  creativeDna?: CreativeDnaInput;
  /** Optional brand text identity, same shape as CaptionRequest.brandVoice. */
  brandVoice?: BrandProfileInput;
  /**
   * "Show FlowPost what you like" — 2-6 inspiration/taste images, DISTINCT
   * from `assetUrls` (product/logo, preserved exactly). These are analysed
   * for visual LANGUAGE only, never preserved as content. Ignored when
   * `referenceStyleProfile` is already given.
   */
  referenceImageUrls?: string[];
  /** Optional lightweight labels, same order as referenceImageUrls — informational only, the analyser infers the real role either way. */
  referenceLabels?: string[];
  /** A previously-saved "Creative Style Profile" the member is reusing — when present, skips re-analysing referenceImageUrls entirely (spec §9/§13). */
  referenceStyleProfile?: ReferenceStyleProfile;
  /**
   * The concept the member picked from `/concepts`. When present, generation
   * skips discovering concepts again and art-directs this one directly —
   * the whole point of separating "what's the idea" from "render it" (§19).
   * Absent, `generate()` discovers concepts itself and takes the strongest
   * one, so a caller that skips the picker still gets a real generation.
   */
  selectedConcept?: ScoredCreativeConcept;
}

/** The request behind `POST /api/ai/creative/refine`. */
export interface CreativeRefinementRequest {
  userId: string;
  assetId: string;
  /** "Make it more premium.", "Keep the product, change the background." */
  instruction: string;
}

// ─── Creative research ────────────────────────────────────────────────────────
//
// Runs before the creative-direction call. Patterns extracted from how real
// campaigns are art-directed — never a reference to copy. Gemini + Google
// Search grounding, not a third-party search vendor — see
// `ai/research/gemini-grounded-search.ts` and
// `ai/generators/creative-research.generator.ts`.

export interface CreativeResearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface CreativeResearch {
  /** False when grounding wasn't available/configured — the model reasoned from its own knowledge instead. */
  researchPerformed: boolean;
  /** Provenance only — never the source's copyrighted text. */
  sources: CreativeResearchSource[];
  referenceCount: number;
  creativeMechanisms: string[];
  visualPatterns: string[];
  typographyPatterns: string[];
  compositionPatterns: string[];
  productTreatmentPatterns: string[];
  /** Generic AI-template patterns to avoid for this request specifically. */
  ideasToAvoid: string[];
  /** One sentence: how this request's creative should differ from what was found. */
  originalityDirection: string;
}

/**
 * A compact visual fingerprint of one of this brand's recent creatives —
 * derived from a persisted `CreativeDirection`, never a fresh model call.
 * Fed to the concepts stage so it has something concrete to diverge from
 * instead of "be different" with nothing to compare against.
 */
export interface RecentCreativeSignature {
  artDirectionFamily: ArtDirectionFamily;
  mode: CreativeMode;
  palette: string[];
  lighting: string;
  background: string;
}

// ─── Reference-style — "understand my taste, don't copy the picture" ─────────
//
// A member uploads a few images they like; this is what FlowPost extracts
// from them — visual LANGUAGE, never content. Modelled on CreativeResearch's
// exact shape (patterns + an explicit avoid-list + one directional sentence),
// because the job is identical: inspiration a generator can lean on without
// ever reproducing a specific source. See `ai/generators/reference-style.generator.ts`.

/** How much weight the extracted style should carry — surfaced to the UI, and a single reference always caps at 'low'. */
export type ReferenceStyleInfluence = 'low' | 'medium' | 'high';

// The renderer's actual levers. Each axis is a small closed vocabulary so the
// layout planner can branch on it — free prose can only ever be pattern-matched
// back into one of these anyway, so the vision model is asked to classify
// directly instead of us grepping its adjectives afterward.
export type RecipeTypographyFamily = 'serif-editorial' | 'sans-modern' | 'condensed-display' | 'geometric-sans' | 'mixed';
export type RecipeLayoutBehaviour = 'asymmetric' | 'centered' | 'grid' | 'stacked' | 'diagonal';
export type RecipeLogoTreatment = 'integrated' | 'corner' | 'footer' | 'watermark';
export type RecipeFooterStyle = 'torn-paper' | 'solid-band' | 'hairline' | 'none';
export type RecipeBorderStyle = 'none' | 'hairline' | 'thick' | 'inset-frame';
export type RecipeTexture = 'none' | 'paper-grain' | 'film-grain' | 'halftone' | 'noise';
export type RecipeShapeLanguage = 'organic' | 'geometric' | 'editorial-rules' | 'none';
export type RecipeVisualDensity = 'minimal' | 'balanced' | 'dense';
export type RecipeImperfection = 'none' | 'subtle' | 'strong';
export type RecipeImageTreatment = 'full-bleed' | 'framed' | 'inset';
export type RecipeSpacing = 'tight' | 'generous' | 'airy';

/**
 * The reference images turned into an actionable DESIGN SYSTEM, not adjectives.
 * Split by consumer: the free-text fields art-direct the VISUAL (they flow into
 * the Gemini prompt via the creative direction); the constrained axes drive the
 * deterministic renderer — typography stack, layout skeleton, footer treatment,
 * texture, logo placement. Gemini never sees the axes; the renderer never
 * guesses from prose.
 */
export interface ReferenceDesignRecipe {
  /** e.g. "warm editorial photography, natural window light" — empty when references aren't photographic. */
  photographyStyle: string;
  /** e.g. "loose ink linework, flat gouache colour" — empty when references aren't illustrative. */
  illustrationStyle: string;
  /** The character of the headline type — "large expressive serif, tight leading, sentence case". */
  headlineCharacter: string;
  /** The character of small supporting copy — "restrained grotesk caps, wide tracking". */
  supportingTypography: string;
  /** How the references compose a frame — "subject offset left, copy in cleared right third". */
  compositionBehaviour: string;
  /** Reading order as seen in the references — "headline first, one supporting line, tiny footer detail". */
  textHierarchy: string;
  typographyFamily: RecipeTypographyFamily;
  /** Dominant colours actually seen across the references, as hex — the renderer tints paper/ink with these when the brand has no colours of its own. */
  colorPalette: string[];
  layoutBehaviour: RecipeLayoutBehaviour;
  logoTreatment: RecipeLogoTreatment;
  spacingBehaviour: RecipeSpacing;
  texture: RecipeTexture;
  /** Recurring decorative devices — "hand-drawn underline", "thin rule dividers", "starburst badge". */
  graphicElements: string[];
  footerStyle: RecipeFooterStyle;
  borderStyle: RecipeBorderStyle;
  shapeLanguage: RecipeShapeLanguage;
  visualDensity: RecipeVisualDensity;
  imperfectionLevel: RecipeImperfection;
  imageTreatment: RecipeImageTreatment;
}

export interface ReferenceStyleProfile {
  /** False when no references were given, or analysis failed — degrades silently, same tolerance as CreativeResearch.researchPerformed. */
  analysed: boolean;
  referenceCount: number;
  /** One-line overall descriptor — e.g. "editorial, tactile, asymmetric". */
  visualLanguage: string;
  compositionPatterns: string[];
  typographyCharacter: string;
  /** How colours relate to each other, not a hex list — that's brandColors' job. */
  colorRelationships: string;
  textureAndMaterial: string;
  lightingAndMood: string;
  /** Which register the references sit in — photographic, illustrative, or a mix. */
  photographicOrIllustrative: string;
  /** Density and negative-space feel together — how busy vs. spacious. */
  visualDensity: string;
  brandTreatment: string;
  /** WHAT'S INTERESTING about the references — unusual perspective, tactile texture, hand-drawn type — the actual signal this feature exists to extract. */
  creativeMechanisms: string[];
  /** Polish vs. deliberate human imperfection — the anti-generic-AI lever. */
  imperfectionLevel: string;
  interactionPatterns: string;
  /** Explicit negative-copy protection — exact composition/objects/headline/logo placement/character/campaign concept never to reproduce. */
  doNotCopy: string[];
  /** One sentence: the coherent direction across all references, or a conflict note when they pull two ways (spec §12). */
  dominantDirection: string;
  influence: ReferenceStyleInfluence;
  /** The structured design system the renderer consumes — absent on profiles saved before recipes existed; the renderer derives a fallback then. */
  designRecipe?: ReferenceDesignRecipe;
}

export interface RawReferenceStyleProfilePayload {
  visualLanguage?: unknown;
  compositionPatterns?: unknown;
  typographyCharacter?: unknown;
  colorRelationships?: unknown;
  textureAndMaterial?: unknown;
  lightingAndMood?: unknown;
  photographicOrIllustrative?: unknown;
  visualDensity?: unknown;
  brandTreatment?: unknown;
  creativeMechanisms?: unknown;
  imperfectionLevel?: unknown;
  interactionPatterns?: unknown;
  doNotCopy?: unknown;
  dominantDirection?: unknown;
  influence?: unknown;
  designRecipe?: Record<string, unknown>;
}

export interface RawCreativeResearchPayload {
  creativeMechanisms?: unknown;
  visualPatterns?: unknown;
  typographyPatterns?: unknown;
  compositionPatterns?: unknown;
  productTreatmentPatterns?: unknown;
  ideasToAvoid?: unknown;
  originalityDirection?: unknown;
}

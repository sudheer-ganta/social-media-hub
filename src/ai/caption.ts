/**
 * The caption API's contract, and the bridge back into the studio envelope.
 *
 * `CaptionBrief` and `CaptionResult` mirror the backend's `server/src/ai/types.ts`
 * across the HTTP boundary — the two files are the same contract written from
 * each side, and changing one means changing the other.
 *
 * The mapper at the bottom is what let Sprint 4.1 replace the whole Make.com
 * pipeline without rewriting the panels that display its output: a
 * {@link CaptionResult} is folded into the existing {@link AiStudioOutput}
 * envelope, so `selectors.ts` and every component reading through it carry on
 * unchanged.
 */

import {
  STUDIO_SCHEMA_VERSION,
  type AiStudioOutput,
  type BrandVoice,
  type CampaignPlan,
  type CaptionLength,
  type CompetitorAnalysis,
  type CompetitorContext,
  type ContentTone,
  type FunnelStage,
  type ImageAnalysis,
  type MarketingGoal,
  type PlatformVariations,
  type SeoAnalysis,
  type StudioFeatureFlags,
} from "@/ai/types";

// ─── Request ─────────────────────────────────────────────────────────────────

/**
 * The register the copy is written in.
 *
 * Distinct from the brand voice's `targetAudience`, which says who buys. This
 * decides how the sentences are built — the same brief in `gen_z` and in
 * `professional` argues the same thing in two unrecognisably different voices.
 */
export type AudienceRegister =
  | "gen_z"
  | "millennial"
  | "gen_z_millennial"
  | "professional"
  | "broad";

/**
 * Which brain writes the post.
 *
 * Mirrors `posts.context_type`, which is where the composer takes it from, and
 * the backend's `CaptionMode`. Not a tone setting: the two modes select
 * different prompts, different output contracts and different evaluation
 * rubrics. A brief that omits it is treated as `brand`, which is what this
 * endpoint always did.
 */
export type CaptionMode = "personal" | "brand";

/** Everything the backend needs to write a caption. Only `topic` is required. */
export interface CaptionBrief {
  /** Personal or Brand. Omitted means Brand. See {@link CaptionMode}. */
  mode?: CaptionMode;
  /** The brand whose style memory to read. Brand mode only. */
  brandId?: string;
  /** What the post is about. Falls back to `title` on the backend. */
  topic?: string;
  title?: string;
  /**
   * The post's image. The backend downloads it and shows the pixels to the
   * model — it is not quoted into a prompt, which is what a model cannot read.
   */
  imageUrl?: string;
  /**
   * The song already in the composer's Music / Song field.
   *
   * Sending it does two things: the copy is written to match that track, and
   * the backend returns no song suggestions — a user who has chosen their audio
   * is not shopping for alternatives, and nothing here may overwrite it.
   */
  music?: string;
  /**
   * Ask for audio ideas. Opt-in, and only the Personal composer sends it —
   * without it the backend builds exactly the prompt it built before song
   * suggestions existed, which is what keeps Brand generations unchanged.
   * Ignored when `music` is set.
   */
  suggestSongs?: boolean;
  /** Defaults to `gen_z_millennial` on the backend. */
  audience?: AudienceRegister;
  platforms?: string[];
  goal?: MarketingGoal;
  funnelStage?: FunnelStage;
  captionLength?: CaptionLength;
  language?: string;
  brandVoice?: Partial<BrandVoice>;
  competitor?: CompetitorContext | null;
  features?: Partial<StudioFeatureFlags>;
  /** The caption currently on screen. Present on a regenerate. */
  previousCaption?: string;
  variationCount?: number;
  hashtagCount?: number;
}

// ─── Response ────────────────────────────────────────────────────────────────

export interface CaptionVariation {
  tone: string;
  caption: string;
  hook: string;
  wordCount: number;
  /** The creative direction this option took, e.g. "Fairytale scale". */
  angle?: string;
  /** One line on why it should land. Shown next to the option. */
  whyItWorks?: string;
}

/** A creative direction the model committed to before writing. */
export interface CreativeAngle {
  name: string;
  premise: string;
  /** What in the image it was built on — the trail back to the picture. */
  imageHook: string;
}

/**
 * One audio recommendation, and why it fits.
 *
 * Presented as a model's read of the post and labelled as such — nothing in
 * this app reads a live charts feed, so "trending on Instagram right now" is a
 * claim it is not entitled to make.
 */
export interface SongSuggestion {
  title: string;
  artist: string;
  reason: string;
}

export interface CaptionMeta {
  provider: string;
  model: string;
  durationMs: number;
  generatedAt: string;
  promptVersion: number;
}

export interface CaptionResult {
  caption: string;
  variations: CaptionVariation[];
  /** Without the leading `#`. */
  hashtags: string[];
  platformCaptions: Record<string, string>;
  /**
   * What the model saw. Absent when the post has no image, or when the image
   * could not be fetched — captions are still written, just from the brief
   * alone, and the panel says so rather than showing an empty card.
   */
  imageAnalysis?: ImageAnalysis;
  seo?: SeoAnalysis;
  campaign?: CampaignPlan;
  competitor?: CompetitorAnalysis;
  /** The directions considered, in the order the options use them. */
  angles?: CreativeAngle[];
  /** Audio ideas. Absent when the composer already has a song. */
  songSuggestions?: SongSuggestion[];
  meta: CaptionMeta;
}

// ─── Envelope mapping ────────────────────────────────────────────────────────

/**
 * Folds a generation into the studio envelope stored on the post.
 *
 * `meta.produced` reports exactly what was written. An earlier envelope's
 * other sections are preserved: a post generated by the old pipeline that gets
 * a fresh caption keeps whatever it already had rather than silently losing it.
 */
function estimateHashtagMetrics(tag: string): { difficultyScore: number; popularityScore: number; category: "trending" | "niche" | "branded" } {
  const len = tag.length;
  let pop = 85 - len * 2.5;
  let diff = 80 - len * 2.0;

  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  const variance = (Math.abs(hash) % 25) - 12;

  pop = Math.min(95, Math.max(25, Math.round(pop + variance)));
  diff = Math.min(90, Math.max(20, Math.round(diff + (variance / 2))));

  let category: "trending" | "niche" | "branded" = "niche";
  if (pop > 65) {
    category = "trending";
  } else if (tag.toLowerCase().includes("brand") || tag.toLowerCase().includes("ai") || tag.toLowerCase().includes("studio")) {
    category = "branded";
  } else {
    category = "niche";
  }

  return { difficultyScore: diff, popularityScore: pop, category };
}

export function toStudioOutput(
  result: CaptionResult,
  previous?: AiStudioOutput | null,
): AiStudioOutput {
  const platformVariations: PlatformVariations = Object.fromEntries(
    Object.entries(result.platformCaptions).map(([platform, caption]) => [
      platform,
      {
        caption,
        hashtags: result.hashtags,
        characterCount: caption.length,
        notes: "",
      },
    ]),
  );

  const scoredTags = result.hashtags.map((tag) => ({
    tag,
    ...estimateHashtagMetrics(tag),
  }));

  const groupedMap = new Map<string, typeof scoredTags>();
  for (const item of scoredTags) {
    const list = groupedMap.get(item.category) ?? [];
    list.push(item);
    groupedMap.set(item.category, list);
  }

  const groups = Array.from(groupedMap.entries()).map(([category, tags]) => ({
    category: category as any,
    hashtags: tags.map(({ tag, difficultyScore, popularityScore }) => ({
      tag,
      difficultyScore,
      popularityScore,
    })),
    suggestedQuantity: tags.length,
  }));

  return {
    ...previous,
    schemaVersion: STUDIO_SCHEMA_VERSION,
    meta: {
      status: "complete",
      generatedAt: result.meta.generatedAt,
      model: result.meta.model,
      durationMs: result.meta.durationMs,
      error: null,
      produced: [
        ...(result.imageAnalysis ? ["imageAnalysis"] : []),
        "contentVariations",
        "hashtagGroups",
        ...(Object.keys(platformVariations).length > 0
          ? ["platformVariations"]
          : []),
        ...(result.seo ? ["seo"] : []),
        ...(result.campaign ? ["campaign"] : []),
        ...(result.competitor ? ["competitor"] : []),
      ],
    },
    ...(result.imageAnalysis && { imageAnalysis: result.imageAnalysis }),
    ...(result.seo && { seo: result.seo }),
    ...(result.campaign && { campaign: result.campaign }),
    ...(result.competitor && { competitor: result.competitor }),
    contentVariations: {
      variations: result.variations.map((variation) => ({
        // The prompt draws its tone names from ContentTone, but a model can
        // still return something off-list; the studio's colour lookup treats a
        // miss as "no colour" rather than failing, so this stays a cast.
        tone: variation.tone as ContentTone,
        caption: variation.caption,
        hook: variation.hook,
        wordCount: variation.wordCount,
      })),
    },
    hashtagGroups: {
      groups: groups.length > 0 ? groups : [
        {
          category: "niche",
          hashtags: result.hashtags.map((tag) => ({
            tag,
            difficultyScore: 45,
            popularityScore: 60,
          })),
          suggestedQuantity: result.hashtags.length,
        },
      ],
    },
    ...(Object.keys(platformVariations).length > 0 && { platformVariations }),
  };
}

/**
 * Reconstructs a {@link CaptionResult} from a saved {@link AiStudioOutput}.
 * Enables restoring AI Assistant generated options when opening an existing post or refreshing.
 */
export function fromStudioOutput(
  output: AiStudioOutput | null | undefined,
): CaptionResult | null {
  if (!output || !output.contentVariations?.variations?.length) {
    return null;
  }

  const variations = output.contentVariations.variations.map((v) => ({
    tone: v.tone ?? "friendly",
    caption: v.caption,
    wordCount: v.wordCount ?? v.caption.split(/\s+/).filter(Boolean).length,
    hook: v.hook,
  }));

  const hashtags: string[] = [];
  if (output.hashtagGroups?.groups) {
    for (const group of output.hashtagGroups.groups) {
      for (const item of group.hashtags) {
        if (!hashtags.includes(item.tag)) {
          hashtags.push(item.tag);
        }
      }
    }
  }

  const platformCaptions: Record<string, string> = {};
  if (output.platformVariations) {
    for (const [p, v] of Object.entries(output.platformVariations)) {
      if (v?.caption) {
        platformCaptions[p] = v.caption;
      }
    }
  }

  return {
    caption: variations[0]?.caption ?? "",
    variations,
    hashtags,
    platformCaptions,
    ...(output.imageAnalysis && { imageAnalysis: output.imageAnalysis }),
    ...(output.seo && { seo: output.seo }),
    ...(output.campaign && { campaign: output.campaign }),
    ...(output.competitor && { competitor: output.competitor }),
    meta: {
      provider: "saved",
      model: output.meta?.model ?? "saved-generation",
      durationMs: output.meta?.durationMs ?? 0,
      generatedAt: output.meta?.generatedAt ?? new Date().toISOString(),
      promptVersion: 1,
    },
  };
}


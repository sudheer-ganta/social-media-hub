import dayjs from "dayjs";
import { postsRepository, brandVoicesRepository } from "@/repositories";
import { PromptBuilder } from "@/ai/prompts/PromptBuilder";
import { DEFAULT_FEATURE_FLAGS, EMPTY_BRAND_VOICE } from "@/ai/types";
import {
  toStudioOutput,
  type AudienceRegister,
  type CaptionBrief,
  type CaptionMode,
  type CaptionResult,
} from "@/ai/caption";
import { aiService } from "./ai.service";
import type {
  AiStudioInput,
  DashboardStats,
  Paginated,
  Post,
  PostInsert,
  PostListParams,
  PostUpdate,
} from "@/types";

/**
 * Settings for a generation started outside the AI Studio: the user's default
 * brand voice if they've saved one, otherwise the app defaults. Optional
 * capabilities stay off — they are not part of the caption generator, and a
 * flag set here would promise output the backend does not produce.
 *
 * Still saved to `ai_studio_input` alongside the result: it is the record of
 * *what was asked for*, which is what makes a caption reproducible.
 */
async function buildDefaultStudioInput(
  existingInput?: AiStudioInput | null,
): Promise<AiStudioInput> {
  let brandVoice = EMPTY_BRAND_VOICE;
  let brandVoiceProfileId: string | null = null;

  try {
    const profiles = await brandVoicesRepository.listAll();
    const preferred = profiles.find((p) => p.is_default);
    if (preferred) {
      brandVoice = preferred.voice;
      brandVoiceProfileId = preferred.id;
    }
  } catch {
    // A missing or unreadable profile shouldn't block generation.
  }

  return PromptBuilder.from({
    goal: existingInput?.goal ?? "brand_awareness",
    funnelStage: existingInput?.funnelStage ?? "TOFU",
    brandVoice: existingInput?.brandVoice ?? brandVoice,
    brandVoiceProfileId: existingInput?.brandVoiceProfileId ?? brandVoiceProfileId,
    competitor: existingInput?.competitor ?? null,
    features: existingInput?.features ?? DEFAULT_FEATURE_FLAGS,
    language: existingInput?.language ?? "English",
    captionLength: existingInput?.captionLength ?? "Medium",
  });
}

/**
 * The brief for one post: what it is about, plus the marketing settings it was
 * generated under. The post's own caption becomes `previousCaption` so a
 * second run is told to take a different angle rather than reword the first.
 */
function briefForPost(post: Post, settings: AiStudioInput): CaptionBrief {
  return {
    topic: post.title,
    title: post.title,
    ...(post.image_url && { imageUrl: post.image_url }),
    platforms: post.platforms,
    goal: settings.goal,
    funnelStage: settings.funnelStage,
    captionLength: settings.captionLength,
    language: settings.language,
    brandVoice: settings.brandVoice,
    competitor: settings.competitor,
    features: settings.features,
    ...(post.caption?.trim() && { previousCaption: post.caption }),
  };
}

/**
 * The columns one generation writes.
 *
 * Both representations are filled: the versioned `ai_studio_output` envelope
 * the studio panels read, and the flat `ai_*` columns the post editor and the
 * card summaries read. `selectors.ts` prefers the envelope and falls back to
 * the flat columns, so writing both is what keeps every surface consistent
 * without touching any of them.
 */
function aiColumnsFor(result: CaptionResult, post: Post): PostUpdate {
  return {
    ai_status: "ready",
    ai_caption: result.caption,
    ai_hashtags: result.hashtags,
    ai_platform_content: result.platformCaptions,
    ai_studio_output: toStudioOutput(result, post.ai_studio_output),
  };
}

/**
 * Business layer for posts. Components and hooks talk to this — the
 * repository underneath is a swappable Supabase implementation.
 */
export const postsService = {
  page(params: PostListParams): Promise<Paginated<Post>> {
    return postsRepository.page(params);
  },

  listAll(filter?: {
    context: Post["context_type"] | "all";
    brandId: string | null;
  }): Promise<Post[]> {
    return postsRepository.listAll(filter);
  },

  listForMonth(monthIso: string): Promise<Post[]> {
    const month = dayjs(monthIso);
    // Cover the visible 6-week grid, not just the calendar month.
    const start = month.startOf("month").subtract(7, "day");
    const end = month.endOf("month").add(14, "day");
    return postsRepository.listByDateRange(
      start.format("YYYY-MM-DD"),
      end.format("YYYY-MM-DD"),
    );
  },

  getById(id: string): Promise<Post> {
    return postsRepository.getById(id);
  },

  create(input: PostInsert): Promise<Post> {
    return postsRepository.insert(input);
  },

  update(id: string, input: PostUpdate): Promise<Post> {
    return postsRepository.update(id, input);
  },

  remove(id: string): Promise<void> {
    return postsRepository.remove(id);
  },

  /** Copy an existing post into a fresh draft, in the same publishing context. */
  async duplicate(id: string): Promise<Post> {
    const source = await postsRepository.getById(id);
    return postsRepository.insert({
      title: `${source.title} (Copy)`,
      caption: source.caption,
      image_url: source.image_url,
      platforms: source.platforms,
      status: "draft",
      publish_date: source.publish_date,
      publish_time: source.publish_time,
      context_type: source.context_type,
      brand_id: source.brand_id,
      music: source.music,
      cta: source.cta,
      link_url: source.link_url,
      // A copy is framed like its source — the whole point of duplicating is
      // to reuse the setup, and re-cropping for every network by hand is
      // exactly the work this feature removes.
      platform_media: source.platform_media,
      // Same list, same order. The copy is a starting point for another post,
      // and its images are most of what makes it one.
      media: source.media,
    });
  },

  /** Mark a post as published right now. */
  publishNow(id: string): Promise<Post> {
    return postsRepository.update(id, {
      status: "published",
      publish_date: dayjs().format("YYYY-MM-DD"),
      publish_time: dayjs().format("HH:mm"),
      published_at: new Date().toISOString(),
    });
  },

  /**
   * Generates AI content for a saved post and stores it, resolving with the
   * updated row.
   *
   * ─── What changed in Sprint 4.1 ───────────────────────────────────────────
   * This used to write `ai_status = 'generating'` and return immediately. A
   * Supabase database webhook fired, a Make.com scenario picked it up, called
   * Gemini, and wrote the results back minutes later — which is why the post
   * editor polled, and why a scenario that died left rows stuck at
   * 'generating' forever.
   *
   * Now the whole thing happens inside this call: build the brief, ask the
   * backend, save what comes back. The caller's promise stays pending for the
   * duration, so every Generate button gets a real loading state for free, and
   * a failure is a rejected promise instead of a row that never changes.
   *
   * `ai_status` is still written because the card summaries and the workflow
   * badge read it. It never takes the value 'generating' any more.
   */
  async requestAiGeneration(id: string): Promise<Post> {
    const post = await postsRepository.getById(id);
    const settings = await buildDefaultStudioInput(post.ai_studio_input);

    try {
      const result = await aiService.generateCaption(
        briefForPost(post, settings),
      );
      return await postsRepository.update(id, {
        ...aiColumnsFor(result, post),
        ai_studio_input: settings,
      });
    } catch (error) {
      // Record the failure rather than leaving the row claiming its last
      // success — the panels read ai_status to decide what to offer, and a
      // stale 'ready' would hide the retry.
      await postsRepository
        .update(id, { ai_status: "failed", ai_studio_input: settings })
        .catch(() => undefined);
      throw error;
    }
  },

  /**
   * Generates for a post using settings chosen on the AI Studio page rather
   * than the user's defaults, and saves both the settings and the result.
   */
  async generateWithSettings(
    id: string,
    settings: AiStudioInput,
  ): Promise<Post> {
    const post = await postsRepository.getById(id);

    try {
      const result = await aiService.generateCaption(
        briefForPost(post, settings),
      );
      return await postsRepository.update(id, {
        ...aiColumnsFor(result, post),
        ai_studio_input: settings,
      });
    } catch (error) {
      await postsRepository
        .update(id, { ai_status: "failed", ai_studio_input: settings })
        .catch(() => undefined);
      throw error;
    }
  },

  /**
   * Writes an already-generated result onto a post.
   *
   * The Create Post page generates *before* the post exists — the user is
   * still deciding whether to keep the caption — so the result and the row
   * meet here, once they hit Save Draft.
   */
  applyAiResult(id: string, result: CaptionResult, post: Post): Promise<Post> {
    return postsRepository.update(id, aiColumnsFor(result, post));
  },

  /**
   * The brief for a post that has not been saved yet: the Create Post form's
   * current values plus the user's default brand voice.
   *
   * Lives here rather than in the form so the form never has to know what a
   * brand voice profile is, or that one is fetched at all.
   */
  async buildBriefFromDraft(draft: {
    /**
     * Which brain writes it, taken from the composer's publishing context.
     * Omitted means Brand — the behaviour every caller had before Personal
     * became its own thing.
     */
    mode?: CaptionMode;
    brandId?: string;
    title: string;
    caption?: string;
    image_url?: string;
    platforms?: string[];
    /** The song already chosen, if any. Never suggested over — see CaptionBrief. */
    music?: string;
    /** Personal only — opt in to audio ideas. See CaptionBrief.suggestSongs. */
    suggestSongs?: boolean;
    /** Omitted means "let the backend pick" — see AudienceRegister. */
    audience?: AudienceRegister;
    /** Brand-context identity, layered over the default voice profile. */
    brand?: { name: string; description?: string } | null;
  }): Promise<CaptionBrief> {
    const settings = await buildDefaultStudioInput();
    const personal = draft.mode === "personal";

    // In a Brand context the AI writes as that brand: its name and description
    // override the voice profile's, while the profile's tone rules still apply.
    const brandVoice = draft.brand
      ? {
          ...settings.brandVoice,
          name: draft.brand.name,
          ...(draft.brand.description && {
            description: draft.brand.description,
          }),
        }
      : settings.brandVoice;

    // A personal post has no marketing brief. The goal, funnel stage, length
    // band, brand voice and feature flags below are all Brand's, and sending
    // them alongside `mode: personal` would only be describing settings the
    // personal prompt does not read — the backend drops them anyway.
    if (personal) {
      return {
        mode: "personal",
        topic: draft.title,
        title: draft.title,
        ...(draft.image_url && { imageUrl: draft.image_url }),
        ...(draft.music?.trim() && { music: draft.music.trim() }),
        ...(draft.suggestSongs && { suggestSongs: true }),
        platforms: draft.platforms ?? [],
        language: settings.language,
        ...(draft.caption?.trim() && { previousCaption: draft.caption }),
      };
    }

    return {
      mode: "brand",
      ...(draft.brandId && { brandId: draft.brandId }),
      topic: draft.title,
      title: draft.title,
      ...(draft.image_url && { imageUrl: draft.image_url }),
      ...(draft.music?.trim() && { music: draft.music.trim() }),
      ...(draft.suggestSongs && { suggestSongs: true }),
      ...(draft.audience && { audience: draft.audience }),
      platforms: draft.platforms ?? [],
      goal: settings.goal,
      funnelStage: settings.funnelStage,
      captionLength: settings.captionLength,
      language: settings.language,
      brandVoice,
      ...(draft.caption?.trim() && { previousCaption: draft.caption }),
    };
  },

  /** Human approval gate — publishing scenarios only touch approved posts. */
  approve(id: string): Promise<Post> {
    return postsRepository.update(id, { approved: true });
  },

  unapprove(id: string): Promise<Post> {
    return postsRepository.update(id, { approved: false });
  },

  reschedule(id: string, date: string): Promise<Post> {
    return postsRepository.update(id, { publish_date: date });
  },

  stats(): Promise<DashboardStats> {
    return postsRepository.countByStatus();
  },

  recent(limit?: number): Promise<Post[]> {
    return postsRepository.recent(limit);
  },

  upcoming(limit?: number): Promise<Post[]> {
    return postsRepository.upcoming(limit);
  },

  activity(days?: number): Promise<Post[]> {
    return postsRepository.activity(days);
  },
};

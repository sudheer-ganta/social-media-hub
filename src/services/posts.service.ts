import dayjs from "dayjs";
import { postsRepository, brandVoicesRepository } from "@/repositories";
import { PromptBuilder } from "@/ai/prompts/PromptBuilder";
import { DEFAULT_BRAND_VOICE, DEFAULT_FEATURE_FLAGS } from "@/ai/types";
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
 * capabilities stay off — they cost an extra AI call each and the user hasn't
 * asked for them here.
 */
async function buildDefaultStudioInput(
  existingInput?: AiStudioInput | null,
): Promise<AiStudioInput> {
  let brandVoice = DEFAULT_BRAND_VOICE;
  let brandVoiceProfileId: string | null = null;

  try {
    const profiles = await brandVoicesRepository.listAll();
    const preferred = profiles.find((p) => p.is_default) ?? profiles[0];
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
 * Business layer for posts. Components and hooks talk to this — the
 * repository underneath is a swappable Supabase implementation.
 */
export const postsService = {
  page(params: PostListParams): Promise<Paginated<Post>> {
    return postsRepository.page(params);
  },

  listAll(): Promise<Post[]> {
    return postsRepository.listAll();
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

  /** Copy an existing post into a fresh draft. */
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
   * Flag a post for AI enrichment. The Supabase database webhook fires on
   * this update; the Make.com scenario filters on ai_status = 'generating',
   * generates content, and writes it back with ai_status = 'ready'.
   */
  /**
   * Start a generation from anywhere that isn't the AI Studio page — the
   * Generate/Regen buttons on the post editor and the studio panel.
   *
   * Automatically attaches the user's default Brand Voice profile from Supabase.
   */
  async requestAiGeneration(id: string): Promise<Post> {
    const post = await postsRepository.getById(id);
    const freshInput = await buildDefaultStudioInput(post.ai_studio_input);
    // Reset first, always. A retry after a failed or stalled run would
    // otherwise write 'generating' over a row that is already 'generating',
    // and Make's filter watches for the transition — no edge, no run. Going
    // through 'pending' guarantees the webhook fires every time.
    await postsRepository.update(id, {
      ai_status: "pending",
      ai_studio_input: freshInput,
    });
    return postsRepository.update(id, { ai_status: "generating" });
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

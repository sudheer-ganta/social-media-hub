import type { AiStudioInput, AiStudioOutput } from "@/ai/types";

/**
 * Mirrors the `post_status` enum in the database (see prisma/schema.prisma).
 * `queued` is written only by the backend publisher — a post it has claimed
 * but not yet started sending — so the UI never sets it, but must be able to
 * read it.
 */
export type PostStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "publishing"
  | "published"
  | "failed";

export type AiStatus = "pending" | "generating" | "ready" | "failed";

/** Derived pipeline stage shown in the UI (combination of status + ai_status + approved). */
export type WorkflowStatus =
  | "draft"
  | "ai_generating"
  | "ai_ready"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type Platform =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "x"
  | "threads";

/**
 * The Personal-vs-Brand publishing context. Every post and every social
 * connection belongs to exactly one, and the two never mix — the backend
 * filters account lists and resolves publish targets by it.
 */
export type PostContext = "personal" | "brand";

/** A `brands` row — a Brand publishing context. Snake_case like every PostgREST row. */
export interface Brand {
  id: string;
  name: string;
  description: string;
  website: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type BrandInsert = Pick<Brand, "name" | "description" | "website">;

export interface PlatformResult {
  url?: string;
  id?: string;
  error?: string;
}

/**
 * Mirrors the `publish_status` enum in the database — one row per network per
 * post, written only by the backend publisher.
 */
export type PublishStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED";

/** One network's publish attempt, as `GET /api/posts/:id/publish` returns it. */
export interface PostPlatformState {
  provider: string;
  /** Resolved from the backend catalogue, so the UI never maps ids to names. */
  providerName: string;
  status: PublishStatus;
  /** The network's own id, e.g. `urn:li:share:…`. Null until published. */
  publishedId: string | null;
  /** A permalink, or null when one cannot be built. Drives "View on LinkedIn". */
  url: string | null;
  /**
   * Already written for a member — the backend translates provider errors
   * before storing them, so this is safe to render as-is.
   */
  errorMessage: string | null;
}

/** Where a post stands across every network. */
export interface PublishState {
  postId: string;
  status: string;
  publishedAt: string | null;
  platforms: PostPlatformState[];
}

/** What a successful `POST /api/posts/:id/publish` resolves with. */
export interface PublishResult {
  postId: string;
  provider: string;
  status: "published";
  publishedId: string;
  url: string | null;
  publishedAt: string;
}

export interface Post {
  id: string;
  title: string;
  caption: string;
  image_url: string;
  platforms: Platform[];
  status: PostStatus;
  publish_date: string;
  publish_time: string;
  /** Publishing context. brand_id is set exactly when context_type is 'brand'. */
  context_type: PostContext;
  brand_id: string | null;
  /** Composer fields. music is display metadata; cta/link_url are Brand-mode. */
  music: string | null;
  cta: string | null;
  link_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Automation pipeline
  ai_status: AiStatus;
  approved: boolean;
  platform_results: Partial<Record<Platform, PlatformResult>>;
  published_at: string | null;
  ai_caption: string | null;
  ai_hashtags: string[] | null;
  ai_platform_content: Partial<Record<Platform, string>> | null;
  // AI Marketing Studio. Read these through the helpers in @/ai/selectors
  // rather than directly — they handle nulls and legacy rows.
  ai_studio_input: AiStudioInput | null;
  ai_studio_output: AiStudioOutput | null;
}

/** Fields the app writes when creating a post; automation fields use DB defaults. */
export type PostInsert = Pick<
  Post,
  | "title"
  | "caption"
  | "image_url"
  | "platforms"
  | "status"
  | "publish_date"
  | "publish_time"
  | "context_type"
  | "brand_id"
  | "music"
  | "cta"
  | "link_url"
>;

export type PostUpdate = Partial<
  Omit<Post, "id" | "created_by" | "created_at" | "updated_at">
>;

export type SortOption =
  | "created_desc"
  | "created_asc"
  | "publish_asc"
  | "publish_desc"
  | "title_asc";

export interface PostFilters {
  search: string;
  status: PostStatus | "all";
  platform: Platform | "all";
  /** 'all' mixes nothing away on the list page; analytics always pick one. */
  context: PostContext | "all";
  /** Narrows a brand context to one brand. Ignored unless context is 'brand'. */
  brandId: string | null;
  from: string;
  to: string;
  sort: SortOption;
}

export interface PostListParams extends PostFilters {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  data: T[];
  count: number;
  page: number;
  pageCount: number;
}

export interface DashboardStats {
  total: number;
  drafts: number;
  scheduled: number;
  published: number;
}

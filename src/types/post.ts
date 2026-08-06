export type PostStatus =
  | "draft"
  | "scheduled"
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

export interface PlatformResult {
  url?: string;
  id?: string;
  error?: string;
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

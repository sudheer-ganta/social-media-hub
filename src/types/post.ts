import type { AiStudioInput, AiStudioOutput } from "@/ai/types";
import type { PlatformCrop, PlatformMedia } from "@/utils/crop";

export type { PlatformCrop, PlatformMedia } from "@/utils/crop";

/**
 * One piece of media attached to a post — an image, a GIF or a video.
 *
 * Position in `Post.media` is publish order — an Instagram carousel, a Facebook
 * multi-photo story and a LinkedIn multi-image post all render in it — so
 * reordering in the composer is a reordering of that array and nothing else.
 *
 * ─── Uploaded kind is not publishing intent ──────────────────────────────────
 *
 * `type` says what the *file* is. It does not say what the post is: a video is
 * a Reel, a Story or a plain video post depending on nothing but what the
 * member chose, and that choice lives in the composer's content type, not here.
 * Deriving one from the other is the guess the whole capability model exists to
 * stop making on someone's behalf.
 *
 * Everything below `type` is measurement, and every field of it is optional
 * because every field of it can genuinely be unknown. An item saved before the
 * uploader recorded it has nulls, and a null is never rounded to zero — a video
 * of unknown length must not validate as one of length nought.
 */
export interface PostMediaItem {
  /** Stable across reorders, crops and reloads. Identifies the item, not its place. */
  id: string;
  /** The stored Cloudinary asset. Never rewritten — crops are delivery settings. */
  url: string;
  /**
   * What the file is. `"image"` covers GIFs — a GIF differs from a photo in
   * what a network will do with it, not in what it is, and that difference is
   * expressed by {@link mimeType} against the provider capabilities.
   */
  type: "image" | "video";
  /**
   * The original's own pixel dimensions, read at upload time. Kept so a crop
   * can be computed, and its softness judged, without re-downloading the asset
   * on every render.
   */
  width: number;
  height: number;
  /**
   * How this item is framed, or null to deliver it whole.
   *
   * Per item, where {@link Post.platform_media} is per network. A post composed
   * with several images frames each one here; a single-image post written
   * before this existed still frames per network, and both still publish.
   *
   * A crop is a *delivery* setting on both: the uploaded master is never
   * rewritten, and the crop becomes a Cloudinary transformation at publish
   * time — for video exactly as for images.
   */
  crop: PlatformCrop | null;

  /** Cloudinary's own answer for the stored file, e.g. `video/mp4`. */
  mimeType?: string;
  /** The master's size in bytes, as Cloudinary measured it. */
  bytes?: number;
  /** How long the video runs. Absent for images, and absent when unmeasured. */
  durationMs?: number;
  /**
   * A still frame for a video, as a delivery URL.
   *
   * Derived by Cloudinary on request, not uploaded — so it costs no storage and
   * leaves the master untouched.
   */
  posterUrl?: string;
}

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
  /**
   * Some networks took it and some didn't. Written only by the scheduler,
   * which is the only thing that publishes a post to several networks in one
   * go — "Instagram yes, X no" is a real outcome and neither `published` nor
   * `failed` tells the truth about it.
   */
  | "partially_published"
  /** A schedule the member called off before it fired. Terminal. */
  | "cancelled"
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
  | "partially_published"
  | "cancelled"
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
export type PublishStatus =
  | "PENDING"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  /** Removed from a schedule, or cancelled with it, before it was attempted. */
  | "CANCELLED";

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
  /**
   * A notice about a publication that *succeeded* — today, only that the
   * network refused the attached media and the text went out alone.
   *
   * Separate from {@link errorMessage} because the post is live: rendering it
   * where failures are rendered would report a broken publish that is not
   * broken. Null on almost every publication.
   */
  notice: string | null;
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

  /**
   * What went out, when it is not what was composed.
   *
   * `text_only_fallback` means the network refused the attached media and the
   * text was published without it. Absent on every ordinary publish.
   */
  publishedAs?: "full" | "text_only_fallback";
  /** True when media the member attached is not on the publication. */
  mediaDropped?: boolean;
  /**
   * Why, already written for a member. Present whenever {@link mediaDropped}
   * is true — media is never dropped without a sentence explaining it.
   */
  reason?: string;
}

/**
 * One network on a scheduled post, as `/api/scheduled-posts` returns it.
 *
 * Richer than {@link PostPlatformState} because a scheduled destination has a
 * *future* as well as a past: how many tries it has left and when the next one
 * happens are the two things a member watching a retry actually wants to know.
 */
export interface ScheduledDestination {
  provider: string;
  /** Resolved from the backend catalogue, so the UI never maps ids to names. */
  providerName: string;
  status: PublishStatus;
  publishedId: string | null;
  url: string | null;
  /** Already written for a member; safe to render as-is. */
  errorMessage: string | null;
  attempts: number;
  /** Automatic tries left. Zero means only a manual retry remains. */
  attemptsRemaining: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  publishedAt: string | null;
}

/** A scheduled post and where it stands on each network it targets. */
export interface ScheduledPost {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  mediaCount: number;
  status: PostStatus;
  /** The canonical UTC instant the worker fires on. */
  scheduledAt: string | null;
  /** The IANA zone the member picked — `Asia/Kolkata`. */
  timezone: string | null;
  /**
   * The wall clock in that zone, `YYYY-MM-DDTHH:mm`. Sent by the server rather
   * than derived here: it is the time the member actually chose, and
   * re-deriving it from the instant in the browser's *current* zone is how an
   * edit silently moves a schedule.
   */
  scheduledLocal: string | null;
  contextType: PostContext;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  destinations: ScheduledDestination[];
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
  /**
   * The canonical UTC instant a scheduled post fires on, or null when it has
   * never been scheduled. Written by the backend from `publish_date` +
   * `publish_time` + a timezone; the worker reads *only* this, so a browser in
   * the wrong zone can never move a publish.
   */
  scheduled_at: string | null;
  /** The IANA zone the schedule was set in. Null on unscheduled posts. */
  timezone: string | null;
  /** Publishing context. brand_id is set exactly when context_type is 'brand'. */
  context_type: PostContext;
  brand_id: string | null;
  /** Composer fields. music is display metadata; cta/link_url are Brand-mode. */
  music: string | null;
  cta: string | null;
  link_url: string | null;
  /**
   * Per-network framing of the single uploaded image, keyed by platform id.
   * Null on every post written before Preview & Adjust existed, and on any
   * post delivered whole. See `utils/crop.ts`.
   */
  platform_media: PlatformMedia | null;
  /**
   * Every image on this post, in publish order.
   *
   * Null on posts written before the multi-image composer, which carry their
   * one image in `image_url` alone. `image_url` is still written on every save
   * as a mirror of `media[0].url`, so the post list, the dashboard, the AI
   * pipeline and any older client keep reading one image exactly as they did.
   */
  media: PostMediaItem[] | null;
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
  | "platform_media"
  | "media"
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

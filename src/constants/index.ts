import type { Platform, SortOption, WorkflowStatus } from "@/types";

export interface PlatformMeta {
  id: Platform;
  name: string;
  description: string;
  color: string;
  charLimit: number;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional network for B2B reach",
    color: "#0A66C2",
    charLimit: 3000,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Visual storytelling & reels",
    color: "#E4405F",
    charLimit: 2200,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Communities, groups & pages",
    color: "#1877F2",
    charLimit: 63206,
  },
  {
    id: "x",
    name: "X",
    description: "Real-time conversation & news",
    color: "#111111",
    charLimit: 280,
  },
  {
    id: "threads",
    name: "Threads",
    description: "Text-first public conversations",
    color: "#464646",
    charLimit: 500,
  },
];

export const PLATFORM_MAP: Record<Platform, PlatformMeta> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
) as Record<Platform, PlatformMeta>;

export const WORKFLOW_META: Record<
  WorkflowStatus,
  { label: string; className: string; dotClassName: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border border-border",
    dotClassName: "bg-muted-foreground",
  },
  ai_generating: {
    label: "AI Generating",
    className: "bg-accent text-accent-foreground border border-primary/20",
    dotClassName: "bg-primary animate-pulse",
  },
  ai_ready: {
    label: "AI Ready",
    className: "bg-primary/10 text-primary border border-primary/20",
    dotClassName: "bg-primary",
  },
  approved: {
    label: "Approved",
    className: "bg-success/10 text-success border border-success/20",
    dotClassName: "bg-success",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-warning/10 text-warning border border-warning/20",
    dotClassName: "bg-warning",
  },
  publishing: {
    label: "Publishing",
    className: "bg-accent text-accent-foreground border border-primary/20",
    dotClassName: "bg-primary animate-pulse",
  },
  published: {
    label: "Published",
    className: "bg-success/10 text-success border border-success/20",
    dotClassName: "bg-success",
  },
  // Warning rather than success or destructive, and the word says which half
  // is which: something is live, something needs fixing.
  partially_published: {
    label: "Partly published",
    className: "bg-warning/10 text-warning border border-warning/20",
    dotClassName: "bg-warning",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border border-border",
    dotClassName: "bg-muted-foreground",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border border-destructive/20",
    dotClassName: "bg-destructive",
  },
};

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "publish_asc", label: "Publish date ↑" },
  { value: "publish_desc", label: "Publish date ↓" },
  { value: "title_asc", label: "Title A–Z" },
];

export const POSTS_PAGE_SIZE = 9;

export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const ACCEPTED_IMAGE_TYPES: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

/**
 * Video the uploader will accept.
 *
 * Deliberately wider than any one network's list: this is what the *browser*
 * hands to Cloudinary, and the member should not be stopped at the file picker
 * because the network they have not chosen yet would refuse it. What each
 * network takes is a capability, checked once the destination and format are
 * known — see `src/utils/content-type.ts`.
 */
export const ACCEPTED_VIDEO_TYPES: Record<string, string[]> = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

/**
 * Everything one "Add media" accepts.
 *
 * One list, because there is one button. Making a member choose "Upload Image"
 * or "Upload Video" before they have picked a file is a developer's question
 * wearing a product's clothes — the file already knows which it is.
 */
export const ACCEPTED_MEDIA_TYPES: Record<string, string[]> = {
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
};

/**
 * The uploader's own byte ceiling for video.
 *
 * Far above {@link MAX_IMAGE_SIZE_BYTES} and deliberately generous — the
 * network's real limit is a capability, and rejecting here would be a second
 * place that has an opinion about it. This exists only to stop an obvious
 * mistake (a 4GB export) before it spends ten minutes uploading.
 */
export const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export const EMOJIS = [
  "🚀", "🔥", "✨", "🎨", "🎯", "💡", "📈", "🎉",
  "❤️", "👏", "🙌", "💪", "🤝", "🌟", "⚡", "🏆",
  "📣", "🗓️", "✅", "🧠", "☕", "🌍", "😄", "🤩",
];

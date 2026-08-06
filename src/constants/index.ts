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
};

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

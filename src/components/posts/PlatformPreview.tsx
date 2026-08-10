import { useEffect, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { CropView } from "./CropView";
import { PLATFORM_MAP } from "@/constants";
import { DEFAULT_MEDIA_CAPABILITY } from "@/constants/integrations";
import { itemAspect, mediaFit } from "@/utils/media";
import { cn } from "@/lib/utils";
import type { MediaCapability } from "@/constants/integrations";
import type { Platform, PostMediaItem } from "@/types";

/**
 * What the post will look like where it lands, and what each network will
 * actually accept.
 *
 * ─── Chrome, not costume ─────────────────────────────────────────────────────
 * An avatar, a handle, a row of icons. The point is not to impersonate each app
 * but to make the *shape* obvious: that LinkedIn shows a wide frame and
 * Instagram a tall one, that the first line of the caption is what survives the
 * fold, that a 4:5 crop cuts something out. Everything is derived from the
 * composer's own state, so it moves as the member types.
 *
 * ─── Nothing here claims a capability ────────────────────────────────────────
 * The carousel controls appear on a network that publishes carousels, and only
 * because the API said it does — `capabilities` comes from `GET /api/integrations`,
 * which reads the same constants the publishers enforce. A network that takes
 * one image previews one image and says so, rather than showing four and losing
 * three at publish time. The audio note is the same principle: Instagram's API
 * has no parameter for attaching a track, so the preview says so.
 */

interface PlatformPreviewProps {
  platforms: Platform[];
  media: PostMediaItem[];
  caption: string;
  music?: string;
  /** Per-network media limits, from the API. Missing entries fall back to one image. */
  capabilities: Partial<Record<Platform, MediaCapability>>;
  /** Which image the composer has selected. The carousel stays in step with it. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  /** Shown as the account name. Falls back to a neutral label. */
  authorName?: string;
  /** Map of connected accounts by platform ID */
  accountMap?: Partial<Record<Platform, { displayName?: string; username?: string; profileImage?: string }>>;
}

/** How much caption each feed shows before it truncates. */
const FOLD: Partial<Record<Platform, number>> = {
  instagram: 125,
  linkedin: 210,
  facebook: 250,
  x: 280,
  threads: 190,
};

function Actions({ platform }: { platform: Platform }) {
  const icons =
    platform === "linkedin" || platform === "facebook"
      ? [ThumbsUp, MessageCircle, Repeat2]
      : platform === "x" || platform === "threads"
        ? [Heart, MessageCircle, Repeat2, Send]
        : [Heart, MessageCircle, Send];

  return (
    <div className="flex items-center gap-3 px-3 pb-2 pt-2 text-muted-foreground">
      {icons.map((Icon, index) => (
        <Icon key={index} className="h-4 w-4" />
      ))}
      {platform === "instagram" && <Bookmark className="ml-auto h-4 w-4" />}
    </div>
  );
}

function CaptionBlock({
  caption,
  platform,
  authorName,
}: {
  caption: string;
  platform: Platform;
  authorName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = FOLD[platform] ?? 200;
  const truncated = caption.length > limit;
  const shown = expanded || !truncated ? caption : caption.slice(0, limit);

  if (!caption.trim()) {
    return (
      <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
        Write something worth sharing…
      </p>
    );
  }

  const isTopText = platform === "linkedin" || platform === "facebook";

  return (
    <p className={cn("whitespace-pre-wrap px-3 text-[11px] leading-relaxed", isTopText ? "pb-2.5 pt-0.5" : "pb-3 pt-2")}>
      {platform === "instagram" && (
        <span className="mr-1.5 font-bold text-foreground">
          {authorName}
        </span>
      )}
      {shown}
      {truncated && !expanded && (
        <>
          …{" "}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-medium text-muted-foreground hover:text-foreground"
          >
            more
          </button>
        </>
      )}
    </p>
  );
}

/**
 * The media area of one preview.
 *
 * Shows only what the network will receive. `delivered` is that number, and
 * when it is smaller than what is attached the carousel simply does not offer
 * the images beyond it — the compatibility list below says why, in words,
 * rather than this quietly implying they will appear.
 */
function PreviewMedia({
  media,
  delivered,
  index,
  onIndexChange,
}: {
  media: PostMediaItem[];
  delivered: number;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const visible = media.slice(0, Math.max(delivered, 0));

  if (visible.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center border-y bg-muted/30 text-[11px] text-muted-foreground">
        No image yet
      </div>
    );
  }

  // A selection past the end — four images attached, one delivered — shows the
  // last one this network gets rather than an empty frame.
  const current = Math.min(index, visible.length - 1);
  const item = visible[current];
  const many = visible.length > 1;

  return (
    <div className="relative border-y bg-black/20">
      <CropView
        imageUrl={item.url}
        crop={item.crop}
        imageAspect={itemAspect(item)}
      />

      {many && (
        <>
          <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white">
            {current + 1}/{visible.length}
          </span>

          <button
            type="button"
            aria-label="Previous image"
            disabled={current === 0}
            onClick={() => onIndexChange(current - 1)}
            className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-opacity hover:bg-black/75 disabled:opacity-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            disabled={current === visible.length - 1}
            onClick={() => onIndexChange(current + 1)}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-opacity hover:bg-black/75 disabled:opacity-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {visible.map((entry, at) => (
              <button
                key={entry.id}
                type="button"
                aria-label={`Go to image ${at + 1}`}
                onClick={() => onIndexChange(at)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  at === current ? "w-4 bg-white" : "w-1.5 bg-white/50",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PlatformPreview({
  platforms = [],
  media = [],
  caption = "",
  music,
  capabilities = {},
  activeIndex = 0,
  onActiveIndexChange = () => {},
  authorName = "Your account",
  accountMap,
}: PlatformPreviewProps) {
  const safePlatforms = Array.isArray(platforms) && platforms.length > 0 ? platforms : ["linkedin" as Platform];
  const safeMedia = Array.isArray(media) ? media : [];
  const [active, setActive] = useState<Platform | null>(safePlatforms[0] ?? null);

  useEffect(() => {
    if (safePlatforms.length === 0) setActive(null);
    else if (!active || !safePlatforms.includes(active)) setActive(safePlatforms[0]);
  }, [safePlatforms, active]);

  const capabilityFor = (platform: Platform) =>
    capabilities[platform] ?? DEFAULT_MEDIA_CAPABILITY;

  const capability = active ? capabilityFor(active) : DEFAULT_MEDIA_CAPABILITY;
  const fit = mediaFit(safeMedia.length, capability);

  // Platform-specific connected account or default author
  const currentAccount = active ? accountMap?.[active] : undefined;
  const activeDisplayName = currentAccount?.displayName || authorName;
  const safeAuthorName = (activeDisplayName && activeDisplayName.trim())
    ? activeDisplayName
    : "Your account";
  const activeProfileImage = currentAccount?.profileImage;
  const activeHandle = currentAccount?.username
    ? (currentAccount.username.startsWith("@") ? currentAccount.username : `@${currentAccount.username}`)
    : `@${safeAuthorName.toLowerCase().replace(/\s+/g, "")}`;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Preview</p>
        <p className="text-xs text-muted-foreground">
          See how your post will look on each platform
        </p>
      </div>

      {platforms.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
          Pick a platform and its preview appears here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setActive(platform)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active === platform
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                {PLATFORM_MAP[platform]?.name ?? platform}
              </button>
            ))}
          </div>

          {active && (
            <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
              {/* Header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  {activeProfileImage && (
                    <AvatarImage src={activeProfileImage} alt={safeAuthorName} />
                  )}
                  <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                    {safeAuthorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="truncate text-xs font-bold leading-tight">
                      {active === "instagram" && currentAccount?.username
                        ? currentAccount.username
                        : safeAuthorName}
                    </p>
                    {(active === "x" || active === "threads") && (
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {activeHandle}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span>
                      {active === "instagram"
                        ? (music?.trim() ? `🎵 ${music}` : "Original audio")
                        : active === "linkedin"
                          ? "1st · Professional Network"
                          : active === "facebook"
                            ? "Public post"
                            : PLATFORM_MAP[active]?.name ?? active}
                    </span>
                    <span>·</span>
                    <span>
                      {fit.delivered > 1
                        ? `${capability.multiLabel ?? "Multiple"} · ${fit.delivered} media`
                        : "Just now"}
                    </span>
                  </p>
                </div>
                <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
              </div>

              {/* LinkedIn & Facebook: Caption comes BEFORE media */}
              {(active === "linkedin" || active === "facebook") && (
                <CaptionBlock
                  caption={caption}
                  platform={active}
                  authorName={safeAuthorName}
                />
              )}

              {/* Media */}
              <PreviewMedia
                media={media}
                delivered={fit.delivered}
                index={activeIndex}
                onIndexChange={onActiveIndexChange}
              />

              {/* Instagram / X / Threads: Caption text comes BEFORE Actions icons */}
              {active !== "linkedin" && active !== "facebook" && (
                <CaptionBlock
                  caption={caption}
                  platform={active}
                  authorName={
                    active === "instagram" && currentAccount?.username
                      ? currentAccount.username
                      : safeAuthorName
                  }
                />
              )}

              {/* Action Buttons (Like, Comment, Share/Retweet, Save) */}
              <Actions platform={active} />

              {/* Instagram Audio Note */}
              {music?.trim() && active === "instagram" && (
                <p className="border-t px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  🎵 {music}
                  <span className="block text-[9px]">
                    Your note — add the audio in Instagram after publishing.
                  </span>
                </p>
              )}
            </div>
          )}

          <PlatformCompatibility
            platforms={platforms}
            count={media.length}
            capabilityFor={capabilityFor}
          />
        </>
      )}
    </div>
  );
}

/**
 * What each selected network will receive, before anything is sent.
 *
 * Every row is derived from the API's capability for that network and the
 * number of images actually attached, so it cannot describe a publish the
 * backend would not perform. A warning row is not cosmetic: the publish *fails*
 * on an over-limit post rather than trimming it, and this is where a member
 * finds that out while it is still cheap to fix.
 */
function PlatformCompatibility({
  platforms,
  count,
  capabilityFor,
}: {
  platforms: Platform[];
  count: number;
  capabilityFor: (platform: Platform) => MediaCapability;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Platform compatibility
      </p>

      {platforms.map((platform) => {
        const capability = capabilityFor(platform);
        const fit = mediaFit(count, capability);
        const problem = fit.overflow > 0 || fit.refusesMedia || fit.missingMedia;

        const detail = fit.refusesMedia
          ? "Takes no images — remove them to publish here"
          : fit.missingMedia
            ? "Needs at least one image"
            : fit.overflow > 0
              ? `Takes ${capability.maxItems} — remove ${fit.overflow}`
              : capability.maxItems > 1
                ? `${capability.multiLabel} (up to ${capability.maxItems})`
                : "Single image";

        return (
          <div
            key={platform}
            className="flex items-start justify-between gap-2 text-xs"
          >
            <span className="flex shrink-0 items-center gap-1.5">
              <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
              {PLATFORM_MAP[platform]?.name ?? platform}
            </span>
            <span
              className={cn(
                "flex items-start gap-1.5 text-right text-[11px]",
                problem ? "text-amber-500" : "text-muted-foreground",
              )}
            >
              {problem ? (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              {detail}
            </span>
          </div>
        );
      })}

      <p className="flex items-start gap-1.5 border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Publishing stops rather than dropping images a network will not take.
      </p>
    </div>
  );
}

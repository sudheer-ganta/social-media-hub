import { useEffect, useState } from "react";
import { Bookmark, Heart, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { CropView } from "./MediaFormatPanel";
import { PLATFORM_MAP } from "@/constants";
import { computeCrop, recommendedRatio, type PlatformMedia } from "@/utils/crop";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

/**
 * What the post will look like where it lands.
 *
 * Chrome only — an avatar, a handle, a row of icons. The point is not to
 * impersonate each app but to make the *shape* obvious: that LinkedIn shows a
 * wide frame and Instagram a tall one, that the first line of the caption is
 * what survives the fold, that a 4:5 crop cuts something out. Everything here
 * is derived from the composer's own state, so it moves as the member types.
 *
 * Nothing in this file claims a capability. The audio note in particular says
 * what FlowPost can and cannot do, because Instagram's publishing API has no
 * parameter for attaching a track — see `providers/meta/instagram/types.ts`.
 */

interface PlatformPreviewProps {
  platforms: Platform[];
  imageUrl: string;
  caption: string;
  music?: string;
  media: PlatformMedia;
  /** Shown as the account name. Falls back to a neutral label. */
  authorName?: string;
}

/** How much caption each feed shows before it truncates. */
const FOLD: Partial<Record<Platform, number>> = {
  instagram: 125,
  linkedin: 210,
  facebook: 250,
  x: 280,
  threads: 190,
};

function Chrome({
  platform,
  authorName,
}: {
  platform: Platform;
  authorName: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
        {authorName.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{authorName}</p>
        <p className="text-[10px] text-muted-foreground">
          {platform === "linkedin" ? "Just now · 🌐" : "Just now"}
        </p>
      </div>
      <PlatformIcon platform={platform} className="ml-auto h-3.5 w-3.5 opacity-60" />
    </div>
  );
}

function Actions({ platform }: { platform: Platform }) {
  const icons =
    platform === "linkedin" || platform === "facebook"
      ? [ThumbsUp, MessageCircle, Repeat2]
      : platform === "x" || platform === "threads"
        ? [Heart, MessageCircle, Repeat2, Send]
        : [Heart, MessageCircle, Send, Bookmark];

  return (
    <div className="flex items-center gap-3 px-3 pb-2 pt-1 text-muted-foreground">
      {icons.map((Icon, index) => (
        <Icon key={index} className="h-3.5 w-3.5" />
      ))}
    </div>
  );
}

function CaptionBlock({
  caption,
  platform,
}: {
  caption: string;
  platform: Platform;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = FOLD[platform] ?? 200;
  const truncated = caption.length > limit;
  const shown = expanded || !truncated ? caption : caption.slice(0, limit);

  if (!caption.trim()) {
    return (
      <p className="px-3 pb-2 text-[11px] italic text-muted-foreground">
        No caption yet.
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap px-3 pb-2 text-[11px] leading-relaxed">
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

function OnePreview({
  platform,
  imageUrl,
  caption,
  music,
  media,
  authorName,
}: {
  platform: Platform;
  imageUrl: string;
  caption: string;
  music?: string;
  media: PlatformMedia;
  authorName: string;
}) {
  const crop = media[platform] ?? computeCrop(recommendedRatio(platform), 1);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <Chrome platform={platform} authorName={authorName} />
      {imageUrl ? (
        <CropView imageUrl={imageUrl} crop={crop} />
      ) : (
        <div className="flex aspect-square items-center justify-center border-y bg-muted/30 text-[11px] text-muted-foreground">
          No image yet
        </div>
      )}
      <Actions platform={platform} />
      <CaptionBlock caption={caption} platform={platform} />

      {/* Instagram is the only network where a member might expect the song to
          travel, so it is the only one that says plainly that it will not. */}
      {music?.trim() && platform === "instagram" && (
        <p className="border-t px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          🎵 {music}
          <span className="block text-[9px]">
            Your note — add the audio in Instagram after publishing.
          </span>
        </p>
      )}
    </div>
  );
}

export function PlatformPreview({
  platforms,
  imageUrl,
  caption,
  music,
  media,
  authorName = "Your account",
}: PlatformPreviewProps) {
  const [active, setActive] = useState<Platform | null>(platforms[0] ?? null);

  useEffect(() => {
    if (platforms.length === 0) setActive(null);
    else if (!active || !platforms.includes(active)) setActive(platforms[0]);
  }, [platforms, active]);

  if (platforms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            Pick a platform and its preview appears here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          How this post will appear. Updates as you edit the crop, caption and
          song.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => setActive(platform)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
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
          <OnePreview
            platform={active}
            imageUrl={imageUrl}
            caption={caption}
            music={music}
            media={media}
            authorName={authorName}
          />
        )}

        {/* The readiness summary. "Ready" means FlowPost has what it needs to
            attempt a publish — an image, since no network here takes a
            text-only post from us — not that the network has accepted it. */}
        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Publishing summary
          </p>
          {platforms.map((platform) => (
            <div
              key={platform}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-1.5">
                <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                {PLATFORM_MAP[platform]?.name ?? platform}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  imageUrl
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-600",
                )}
              >
                {imageUrl ? "Ready" : "Needs an image"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

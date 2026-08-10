import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformPreview } from "@/components/posts/PlatformPreview";
import { formatDisplayDate, formatDisplayTime } from "@/utils/date";
import { PLATFORM_MAP } from "@/constants";
import type { Post, Platform } from "@/types";

interface PostDetailModalProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDetailModal({ post, open, onOpenChange }: PostDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Platform>("linkedin");

  if (!post) return null;

  const currentPlatform = post.platforms.includes(activeTab)
    ? activeTab
    : post.platforms[0] || "linkedin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-2 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusBadge post={post} />
              <Badge variant="outline" className="capitalize text-xs">
                {post.context_type} Mode
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to={`/posts/${post.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit Post
                </Link>
              </Button>
            </div>
          </div>
          <DialogTitle className="text-xl font-bold">{post.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <CalendarClock className="h-3.5 w-3.5" />
            Published on {formatDisplayDate(post.publish_date)} at {formatDisplayTime(post.publish_time)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4">
          {/* Left Column: Post details & metadata */}
          <div className="md:col-span-6 space-y-5">
            {/* Attached media gallery */}
            {post.media && post.media.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Attached Media ({post.media.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {post.media.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                    >
                      <img
                        src={item.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : post.image_url ? (
              <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
                <img
                  src={post.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            {/* Caption */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Post Caption
              </p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {post.caption || <span className="italic text-muted-foreground">No caption written.</span>}
              </div>
            </div>

            {/* Platforms list & Links */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Published Platforms
              </p>
              <div className="flex flex-wrap gap-2">
                {post.platforms.map((platform) => (
                  <div
                    key={platform}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs font-medium"
                  >
                    <PlatformIcon platform={platform} className="h-4 w-4" />
                    <span>{PLATFORM_MAP[platform]?.name ?? platform}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Platform Feed Preview */}
          <div className="md:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Live Feed Appearance
              </p>
              {/* Platform selector tabs */}
              <div className="flex items-center gap-1 rounded-lg border bg-muted p-1">
                {post.platforms.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setActiveTab(platform)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      currentPlatform === platform
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                    <span>{PLATFORM_MAP[platform]?.name ?? platform}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Render platform preview card */}
            <div className="rounded-xl border bg-muted/20 p-3">
              <PlatformPreview
                platforms={post.platforms.length > 0 ? post.platforms : [currentPlatform]}
                media={post.media ?? (post.image_url ? [{ id: "1", url: post.image_url, type: "image", width: 800, height: 600, crop: null }] : [])}
                caption={post.caption}
                music={post.music ?? undefined}
                capabilities={{}}
                activeIndex={0}
                onActiveIndexChange={() => {}}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

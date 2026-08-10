import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Pencil,
  ExternalLink,
  Copy,
  Check,
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
import { toast } from "sonner";
import type { Post, Platform } from "@/types";

interface PostDetailModalProps {
  post: Post | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostDetailModal({ post, open, onOpenChange }: PostDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Platform>("linkedin");
  const [copied, setCopied] = useState(false);

  if (!post) return null;

  const currentPlatform = post.platforms.includes(activeTab)
    ? activeTab
    : post.platforms[0] || "linkedin";

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(post.caption || "");
      setCopied(true);
      toast.success("Caption copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("Failed to copy caption");
    }
  };

  const isPublished = post.status === "published";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl">
        {/* Header */}
        <DialogHeader className="space-y-3 border-b pb-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StatusBadge post={post} />
              <Badge variant="secondary" className="capitalize text-xs font-semibold px-2.5 py-0.5">
                {post.context_type} Mode
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs font-semibold" asChild>
                <Link to={`/posts/${post.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Post
                </Link>
              </Button>
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight">{post.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Scheduled / Published:</span>
            {isPublished ? (
              <span className="flex items-center gap-1.5 text-success font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Published on {formatDisplayDate(post.publish_date)} at {formatDisplayTime(post.publish_time)}
              </span>
            ) : (
              <span className="font-semibold text-foreground">
                {formatDisplayDate(post.publish_date)} at {formatDisplayTime(post.publish_time)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Content columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 min-h-0">
          {/* Left Column: Post details & metadata */}
          <div className="md:col-span-6 space-y-6">
            {/* Unified Post Card */}
            <div className="rounded-2xl border bg-card/30 shadow-sm overflow-hidden flex flex-col">
              {/* Media at the top of the card */}
              {post.media && post.media.length > 0 ? (
                <div className="p-3 border-b bg-muted/10">
                  <div className="grid grid-cols-3 gap-2">
                    {post.media.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="relative aspect-square overflow-hidden rounded-xl border bg-muted/30 shadow-sm group"
                      >
                        <img
                          src={item.url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : post.image_url ? (
                <div className="relative aspect-video overflow-hidden border-b bg-muted/10 group">
                  <img
                    src={post.image_url}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
              ) : null}

              {/* Caption at the bottom of the card */}
              <div className="p-4.5 bg-card/10 relative group/caption">
                {post.caption && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyCaption}
                    className="absolute right-3 top-3 h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1 bg-background/60 hover:bg-background border shadow-sm backdrop-blur-sm rounded-lg opacity-0 group-hover/caption:opacity-100 transition-opacity"
                  >
                    {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 select-text font-normal max-h-[220px] overflow-y-auto pr-8 scrollbar-thin">
                  {post.caption || <span className="italic text-muted-foreground/60">No caption written.</span>}
                </div>
              </div>
            </div>

            {/* Published Destinations */}
            <div className="flex flex-wrap gap-2 mt-2">
                {post.platforms.map((platform) => {
                  const result = post.platform_results?.[platform];
                  const liveUrl = result?.url;

                  const content = (
                    <>
                      <PlatformIcon platform={platform} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-semibold">{PLATFORM_MAP[platform]?.name ?? platform}</span>
                      {liveUrl && (
                        <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 shrink-0 ml-0.5" />
                      )}
                    </>
                  );

                  return liveUrl ? (
                    <a
                      key={platform}
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 rounded-xl border border-success/20 bg-success/5 hover:bg-success/10 hover:border-success/30 px-3.5 py-1.5 text-xs font-medium text-success transition-all shadow-sm"
                    >
                      {content}
                    </a>
                  ) : (
                    <div
                      key={platform}
                      className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground/80"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

          {/* Right Column: Live Platform Feed Preview */}
          <div className="md:col-span-6">
            <div className="rounded-2xl border bg-muted/5 p-4 shadow-sm backdrop-blur-md">
              <PlatformPreview
                platforms={post.platforms}
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

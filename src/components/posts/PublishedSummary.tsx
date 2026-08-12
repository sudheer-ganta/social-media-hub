import { Link } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  Info,
  ListChecks,
  Music,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublishStatus } from "./PublishStatus";
import type { Platform, PostPlatformState, PostMediaItem } from "@/types";

/**
 * What a Personal creator sees the moment a post goes out.
 *
 * Replaces the composer rather than sitting under it. Leaving someone inside a
 * form they have finished with is the state this exists to end: the work is
 * done, the fields are no longer the thing they care about, and the questions
 * they actually have — did it land, where can I see it, how is it doing — are
 * all answered here.
 *
 * Per-network rows come from {@link PublishStatus}, unchanged, so a network
 * that succeeds and one that fails read exactly as they do elsewhere in the app
 * — including the link out to the live post when the network returned one.
 */

interface PublishedSummaryProps {
  imageUrl?: string;
  mediaItem?: PostMediaItem;
  caption: string;
  music?: string;
  platforms: PostPlatformState[];
  /** Back into the composer for the same post. */
  onEdit: () => void;
  /** Retries one network that failed. Only that network is contacted again. */
  onRetry?: (provider: Platform) => void;
  /** The network a retry is currently in flight for, or null. */
  retrying?: Platform | null;
}

export function PublishedSummary({
  imageUrl,
  mediaItem,
  caption,
  music,
  platforms,
  onEdit,
  onRetry,
  retrying,
}: PublishedSummaryProps) {
  const published = platforms.filter((p) => p.status === "PUBLISHED");
  const failed = platforms.filter((p) => p.status === "FAILED");
  const isVideo = mediaItem?.type === "video";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              {/* Partial success is stated as partial. This screen is only
                  reached when at least one network accepted the post — a total
                  failure keeps the composer — so the heading is never a lie,
                  but it must not paper over the ones that did not. */}
              <h2 className="text-lg font-semibold">
                {failed.length > 0 ? "Partly published" : "Published"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Live on {published.map((p) => p.providerName).join(", ")}.
                {failed.length > 0 && (
                  <>
                    {" "}
                    <span className="text-destructive">
                      {failed.map((p) => p.providerName).join(", ")} did not go
                      out — retry below.
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
            {isVideo ? (
              <video
                src={mediaItem?.url || imageUrl}
                poster={mediaItem?.posterUrl ?? undefined}
                controls
                className="w-full max-h-60 rounded-lg border object-cover bg-black"
              />
            ) : (
              imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full rounded-lg border object-cover"
                />
              )
            )}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Caption
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {caption}
                </p>
              </div>

              {/* A song in this field is the member's own note, not something
                  that travelled with the post. The publisher sends image_url,
                  caption and alt_text — there is no audio parameter on the
                  Instagram container, so saying "published with music" here
                  would be a claim about a thing that never happened. See
                  providers/meta/instagram/types.ts. */}
              {music?.trim() && (
                <div className="rounded-md border border-dashed p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Music className="h-3 w-3" />
                    Selected song
                  </p>
                  <p className="mt-1 text-sm">{music}</p>
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">
                        Instagram audio: not attached.
                      </span>{" "}
                      Instagram&apos;s publishing API has no parameter for
                      attaching a track, so this is saved as your note. Add the
                      audio in the Instagram app if you want it on the post.
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PublishStatus platforms={platforms} />

      {/* One button per failed network, never a blanket "retry" — the networks
          that succeeded are already live and must not be sent a second time. */}
      {onRetry && failed.length > 0 && (
        <div className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Retry
          </p>
          {failed.map((row) => (
            <div
              key={row.provider}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.providerName}</p>
                {row.errorMessage && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {row.errorMessage}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={retrying === row.provider}
                onClick={() => onRetry(row.provider as Platform)}
              >
                <RotateCcw />
                Retry {row.providerName}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/analytics">
            <BarChart3 />
            View analytics
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/posts">
            <ListChecks />
            All posts
          </Link>
        </Button>
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil />
          Edit this post
        </Button>
      </div>
    </div>
  );
}

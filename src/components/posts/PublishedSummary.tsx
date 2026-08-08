import { Link } from "react-router-dom";
import { BarChart3, CheckCircle2, ListChecks, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublishStatus } from "./PublishStatus";
import type { PostPlatformState } from "@/types";

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
  caption: string;
  music?: string;
  platforms: PostPlatformState[];
  /** Back into the composer for the same post. */
  onEdit: () => void;
}

export function PublishedSummary({
  imageUrl,
  caption,
  music,
  platforms,
  onEdit,
}: PublishedSummaryProps) {
  const published = platforms.filter((p) => p.status === "PUBLISHED");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Published</h2>
              <p className="text-sm text-muted-foreground">
                {published.length > 0
                  ? `Live on ${published.map((p) => p.providerName).join(", ")}.`
                  : "Your post has left the app — see where it stands below."}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="w-full rounded-lg border object-cover"
              />
            )}
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {caption}
              </p>
              {music?.trim() && (
                <p className="text-xs text-muted-foreground">🎵 {music}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PublishStatus platforms={platforms} />

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

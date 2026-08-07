import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { PostPlatformState, Platform } from "@/types";

/**
 * Where this post stands on each network it has been sent to.
 *
 * Renders `post_platforms` as the backend reports it, one row per network. It
 * makes no judgements of its own: the status, the display name and the error
 * message all arrive from the API already resolved, which is what lets a
 * second network appear here without this file changing.
 *
 * `errorMessage` is rendered verbatim on purpose — the backend translates
 * provider errors into member-facing sentences before storing them, so what is
 * in that column is already what a person should read.
 */

interface PublishStatusProps {
  platforms: PostPlatformState[];
  /**
   * The publish currently in flight, if any. Shown ahead of the stored state
   * because the row still says PENDING until the request comes back.
   */
  publishingProvider?: string | null;
}

const PRESENTATION = {
  PUBLISHED: {
    label: "Published",
    icon: CheckCircle2,
    tone: "text-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  PUBLISHING: {
    label: "Publishing…",
    icon: Loader2,
    tone: "text-sky-500",
    badge: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  },
  FAILED: {
    label: "Failed",
    icon: AlertCircle,
    tone: "text-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/20",
  },
  PENDING: {
    label: "Not published",
    icon: Send,
    tone: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
  },
} as const;

export function PublishStatus({
  platforms,
  publishingProvider,
}: PublishStatusProps) {
  // Nothing has ever been attempted and nothing is in flight — there is no
  // status to report, so the card stays out of the way entirely.
  if (platforms.length === 0 && !publishingProvider) return null;

  const rows = platforms.length
    ? platforms
    : // A publish that started before any row was read back. Rendered from what
      // we know so the user sees "Publishing…" immediately rather than nothing.
      [
        {
          provider: publishingProvider as string,
          providerName: "LinkedIn",
          status: "PUBLISHING" as const,
          publishedId: null,
          url: null,
          errorMessage: null,
        },
      ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing</CardTitle>
        <CardDescription>
          Where this post stands on each connected network.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((platform) => {
          // An in-flight request outranks the stored row: the database still
          // reads PUBLISHING (or PENDING) until the response lands.
          const status =
            publishingProvider === platform.provider &&
            platform.status !== "PUBLISHED"
              ? "PUBLISHING"
              : platform.status;
          const presentation = PRESENTATION[status] ?? PRESENTATION.PENDING;
          const Icon = presentation.icon;

          return (
            <div
              key={platform.provider}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
            >
              <PlatformIcon
                platform={platform.provider as Platform}
                className="h-5 w-5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {platform.providerName}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", presentation.badge)}
                  >
                    {presentation.label}
                  </Badge>
                </div>
                {platform.errorMessage && status === "FAILED" && (
                  <p className="mt-1 text-xs text-destructive">
                    {platform.errorMessage}
                  </p>
                )}
              </div>

              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  presentation.tone,
                  status === "PUBLISHING" && "animate-spin",
                )}
              />

              {/* Only when the network gave us enough to build a link — a
                  "View" button that 404s is worse than no button. */}
              {status === "PUBLISHED" && platform.url && (
                <a
                  href={platform.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  View on {platform.providerName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

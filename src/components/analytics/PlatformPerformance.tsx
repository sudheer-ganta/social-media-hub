import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORMS } from "@/utils/constants";
import { formatCount, formatRate, METRIC_LABELS } from "./metric-display";
import type { PlatformBreakdownEntry } from "@/services/analytics.service";

/**
 * How each network performed — each under its own metric names.
 *
 * ─── Why there is no shared "Views" column ───────────────────────────────────
 *
 * Because Instagram's exposure figure is **reach** (unique accounts) and
 * LinkedIn's is **impressions** (appearances). Putting 1,842 and 7 in one
 * column headed anything at all invites a comparison the data does not support,
 * and the fact that both numbers are real makes it worse rather than better —
 * nothing on screen would look wrong.
 *
 * So each row shows the metrics that network actually reports, labelled with
 * what they are. A metric a network never reports is absent rather than dashed:
 * a row of "—" for figures that were never coming reads as broken.
 */

/** Which metrics to show for a network, given what it reported. */
const SHOWN = ["impressions", "reach", "views", "likes", "comments", "shares"];

export function PlatformPerformance({
  platforms,
  loading,
}: {
  platforms: PlatformBreakdownEntry[] | undefined;
  loading: boolean;
}) {
  const rows = platforms ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform performance</CardTitle>
        <CardDescription>
          Each network under the metrics it actually reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No successful publications yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((entry) => {
              const meta = PLATFORMS.find((p) => p.id === entry.provider);

              // Only metrics something actually reported. `reported > 0` is the
              // test, not `value !== null`: a total of null and a total nothing
              // contributed to are the same absence.
              const measured = SHOWN.filter(
                (metric) => (entry.totals?.[metric]?.reported ?? 0) > 0,
              );

              return (
                <li key={entry.provider} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            meta?.color ?? "hsl(var(--muted-foreground))",
                        }}
                      />
                      {meta?.name ?? entry.provider}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.publications}{" "}
                      {entry.publications === 1 ? "publication" : "publications"}
                      {entry.coverage.measured < entry.publications && (
                        // Coverage, stated. A total from 2 of 5 posts is a real
                        // number describing 2 posts, and presenting it as the
                        // network's total would overstate nothing and
                        // understate everything.
                        <> · {entry.coverage.measured} measured</>
                      )}
                    </span>
                  </div>

                  {measured.length === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {entry.coverage.measured === 0
                        ? "Collecting performance data"
                        : "This network reported no metrics for these posts."}
                    </p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                      {measured.map((metric) => (
                        <span key={metric} className="text-xs">
                          <span className="font-semibold tabular-nums">
                            {formatCount(entry.totals[metric]!.value ?? 0)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {METRIC_LABELS[metric] ?? metric}
                          </span>
                        </span>
                      ))}
                      {entry.engagementRate !== null && (
                        <span className="text-xs">
                          <span className="font-semibold tabular-nums">
                            {formatRate(entry.engagementRate)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            engagement
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

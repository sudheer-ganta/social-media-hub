import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatRate } from "./metric-display";
import { CONFIDENCE_COPY, formatRows } from "./insights";
import type { MediaTypeBreakdownEntry } from "@/services/analytics.service";

/**
 * How each content format is doing, with the sample size beside it.
 *
 * ─── The claim this section refuses to make ──────────────────────────────────
 *
 * "Your audience prefers Reels" is what a table like this wants to say, and from
 * four Reels it is a coincidence with a percentage attached. The server decides
 * whether a bucket has enough *measured* publications to support a claim
 * (`strongSignal`) and that verdict governs the wording here — the numbers are
 * shown either way, but below the threshold they are introduced as an early
 * signal rather than as a finding.
 *
 * Publications and measured publications are both shown, always. "8 published ·
 * 6 measured" is the difference between a rate that describes the format and a
 * rate that describes six posts, and it is not the reader's job to guess which
 * one they are looking at.
 *
 * The window is the last N publications rather than the last N days, so a member
 * who posts twice a month and one who posts daily both get a comparable sample.
 */
export function MediaPerformance({
  mediaTypes,
  loading,
}: {
  mediaTypes: MediaTypeBreakdownEntry[] | undefined;
  loading: boolean;
}) {
  const rows = formatRows(mediaTypes ?? []);

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          Content format
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How images, videos and carousels compare across your recent posts.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="max-w-prose border-t border-border pt-4 text-sm text-muted-foreground">
          Once you've published a few posts, FlowPost will compare their formats
          here and tell you which is landing.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <li
              key={row.mediaType ?? "unknown"}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-meta mt-0.5">
                  {row.publications}{" "}
                  {row.publications === 1 ? "publication" : "publications"}
                  {" · "}
                  {/* Measured, not published. A rate from one of twelve Reels is
                      one data point, and calling it the format's performance
                      would be the strongest wrong claim on the page. */}
                  {row.measured} measured
                </p>
              </div>

              <div className="text-right">
                {row.engagementRate === null ? (
                  <p className="text-xs text-muted-foreground">
                    {row.measured === 0
                      ? "Collecting performance data"
                      : "No engagement rate reported"}
                  </p>
                ) : (
                  <>
                    <p className="font-display text-base font-semibold tnum leading-none">
                      {formatRate(row.engagementRate)}
                    </p>
                    <p className="text-meta mt-1 flex items-center justify-end gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          row.confidence === "strong" && "bg-success",
                          row.confidence === "emerging" && "bg-foreground/50",
                          row.confidence === "early" &&
                            "bg-muted-foreground/40",
                        )}
                        aria-hidden="true"
                      />
                      {CONFIDENCE_COPY[row.confidence]}
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

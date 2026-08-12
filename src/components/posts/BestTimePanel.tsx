import { useState } from "react";
import dayjs from "dayjs";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BestTimeEntry, BestTimeResult } from "@/services/analytics.service";

/**
 * "Here's when I'd post it — and here's why."
 *
 * ─── The one thing this component must never do ──────────────────────────────
 * Show a time it cannot justify. There is no fallback to a general
 * recommendation, no "most accounts do well at 8 PM", and no placeholder while
 * evidence accumulates. When the backend says `confidence: 'none'` this renders
 * its sentence and nothing else — because a generic number shown in the same
 * panel, in the same typeface, under the same heading as a real finding is
 * indistinguishable from one.
 *
 * ─── Why every entry carries its sample ──────────────────────────────────────
 * "Based on 42 measured posts" is the difference between a recommendation a
 * member can weigh and one they must simply trust. It is rendered for every
 * confidence level, including the early ones where the honest reading is "not
 * many".
 *
 * ─── It prefills; it does not schedule ───────────────────────────────────────
 * The action writes a date and a time into the composer's existing schedule
 * fields and stops. There is no second scheduler here — the member still reviews
 * the picker and presses Schedule, and the server still resolves the instant from
 * the wall clock and the zone exactly as it does for a time they typed.
 */

/** `20:30` → `8:30 PM`, in the member's own reading of the clock. */
function clockLabel(time: string): string {
  const parsed = dayjs(`2000-01-01T${time}`);
  return parsed.isValid() ? parsed.format("h:mm A") : time;
}

const CONFIDENCE_BADGE: Record<
  BestTimeEntry["confidence"],
  { label: string; className: string } | null
> = {
  // No badge at all for `none` — there is no finding to grade.
  none: null,
  early: {
    label: "Early signal",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  },
  strong: {
    label: "Strong signal",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  },
};

interface BestTimePanelProps {
  result: BestTimeResult | null;
  isLoading: boolean;
  /**
   * Applies a recommendation to the composer's schedule fields.
   *
   * `localDateTime` is `YYYY-MM-DDTHH:mm` in `timezone` — the backend's own
   * format, and the one the schedule API takes. The composer splits it into its
   * date and time inputs; nothing here converts anything.
   */
  onUse: (localDateTime: string, timezone: string) => void;
  disabled?: boolean;
}

export function BestTimePanel({
  result,
  isLoading,
  onUse,
  disabled,
}: BestTimePanelProps) {
  /** Which network's "choose a day" row is open, if any. */
  const [choosing, setChoosing] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed p-4">
        <p className="text-xs text-muted-foreground">
          Working out when your posts have performed best…
        </p>
      </div>
    );
  }

  // No result at all means the request failed. Rendering nothing is deliberate:
  // the scheduler below works perfectly well without this, and an error box above
  // a working control teaches members that something is broken when nothing is.
  if (!result || result.platforms.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-sm font-semibold">Best time to post</p>
      </div>

      <div className="space-y-2">
        {result.platforms.map((entry) => {
          const badge = CONFIDENCE_BADGE[entry.confidence];
          const hasRecommendation = entry.recommendedTime !== null;
          const isChoosing = choosing === entry.provider;

          return (
            <div
              key={entry.provider}
              className="rounded-xl border bg-card p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold">{entry.label}</span>
                  {badge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold border",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </Badge>
                  )}
                </div>

                {hasRecommendation && (
                  <span className="text-sm font-semibold tabular-nums">
                    {clockLabel(entry.recommendedTime!)}
                  </span>
                )}
              </div>

              {/* The window, and the half hours inside it the member may pick. */}
              {entry.window && (
                <p className="text-[11px] text-muted-foreground">
                  Your strongest window is{" "}
                  <span className="font-medium text-foreground">
                    {clockLabel(entry.window.start)}–{clockLabel(entry.window.end)}
                  </span>
                  {entry.alternatives.length > 0 && (
                    <>
                      {" · also good: "}
                      {entry.alternatives.map(clockLabel).join(", ")}
                    </>
                  )}
                </p>
              )}

              {/*
                The explanation, verbatim from the backend. Composed there rather
                than here on purpose — it is the one place that knows the sample,
                the lift and which evidence licensed the wording, and a second
                copy in the browser would eventually claim something the data does
                not support.
              */}
              <p className="text-[11px] text-muted-foreground">{entry.reason}</p>

              {hasRecommendation && !isChoosing && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {/*
                    Today is offered only when the window is still ahead on the
                    member's clock — the backend returns null for `today`
                    otherwise, and offering a time that has passed would produce a
                    schedule the API rightly refuses.
                  */}
                  {entry.today && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={disabled}
                      onClick={() => onUse(entry.today!, entry.timezone)}
                    >
                      Schedule today at {clockLabel(entry.recommendedTime!)}
                    </Button>
                  )}
                  {entry.tomorrow && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-[11px] text-muted-foreground"
                      disabled={disabled}
                      onClick={() => onUse(entry.tomorrow!, entry.timezone)}
                    >
                      {entry.today ? "Tomorrow" : `Tomorrow at ${clockLabel(entry.recommendedTime!)}`}
                    </Button>
                  )}
                  {entry.slots.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-[11px] text-muted-foreground"
                      disabled={disabled}
                      onClick={() => setChoosing(entry.provider)}
                    >
                      Another time
                    </Button>
                  )}
                </div>
              )}

              {/*
                The window's half hours. A prediction to the minute would be
                false precision, so the member picks inside the window rather than
                being handed a single instant to accept or reject.
              */}
              {isChoosing && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    Anywhere in this window:
                  </span>
                  {entry.slots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] tabular-nums"
                      disabled={disabled}
                      onClick={() => {
                        // Reuse whichever day is available, replacing only the
                        // clock — the date half of the backend's string is
                        // already correct for the member's zone.
                        const base = entry.today ?? entry.tomorrow;
                        if (!base) return;
                        onUse(`${base.slice(0, 10)}T${slot}`, entry.timezone);
                        setChoosing(null);
                      }}
                    >
                      {clockLabel(slot)}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setChoosing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {result.timezone && (
        <p className="text-[10px] text-muted-foreground">
          Times shown in {result.timezone}
          {result.timezoneSource === "history" &&
            " — the zone you usually schedule in"}
          .
        </p>
      )}
    </div>
  );
}

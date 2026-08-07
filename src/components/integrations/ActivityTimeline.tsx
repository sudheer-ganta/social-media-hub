import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/constants/integrations";
import { formatAbsolute, formatCalendarDay } from "@/utils/date";
import dayjs from "dayjs";

interface ActivityTimelineProps {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
}

const TONE_DOT: Record<ActivityEvent["tone"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-muted-foreground/40",
  negative: "bg-red-500",
};

/**
 * Recent integration activity, grouped by day.
 *
 * Built entirely from `activity_logs` rows the app already writes — connecting,
 * disconnecting, refreshing, publishing, failing. The grouping is what makes it
 * scannable: a flat list of timestamps is a log, "Today / Yesterday / Monday"
 * with times underneath is a story.
 *
 * Provider-agnostic like everything else here: the backend supplies the title,
 * the description and the tone, so a new network's events appear without this
 * component learning anything.
 */
export function ActivityTimeline({
  events,
  loading,
  error,
}: ActivityTimelineProps) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Activity</h3>
        <p className="text-xs text-muted-foreground">Recent account events</p>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Connecting an account, refreshing it or publishing a
            post will show up here.
          </p>
        ) : (
          <div className="space-y-5">
            {groupByDay(events).map(([day, dayEvents]) => (
              <div key={day}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {day}
                </p>
                <ol className="mt-2 space-y-3">
                  {dayEvents.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      {/* The rail: a dot per event, coloured by tone. The
                          timestamp beside it carries the meaning, so the colour
                          is never the only signal. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          TONE_DOT[event.tone],
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">
                          {event.title}
                        </p>
                        {event.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        )}
                        <p
                          className="mt-0.5 text-xs text-muted-foreground"
                          title={formatAbsolute(event.createdAt)}
                        >
                          {dayjs(event.createdAt).format("h:mm A")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Buckets events under a day heading, preserving the newest-first order the API
 * returned. A Map is used rather than an object because insertion order is part
 * of the contract here.
 */
function groupByDay(events: ActivityEvent[]): [string, ActivityEvent[]][] {
  const groups = new Map<string, ActivityEvent[]>();

  for (const event of events) {
    const day = formatCalendarDay(event.createdAt);
    const bucket = groups.get(day);
    if (bucket) bucket.push(event);
    else groups.set(day, [event]);
  }

  return [...groups.entries()];
}

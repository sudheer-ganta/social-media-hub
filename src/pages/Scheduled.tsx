import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CircleSlash,
  ExternalLink,
  PenLine,
  RotateCcw,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { WORKFLOW_META } from "@/constants";
import {
  useScheduledPosts,
  useCancelSchedule,
  useRetryDestination,
  useDeleteSchedule,
} from "@/hooks/useScheduledPosts";
import { getWorkflowStatus } from "@/utils/workflow";
import { cn } from "@/lib/utils";
import type { Platform, Post, ScheduledDestination, ScheduledPost } from "@/types";

/**
 * The schedule — everything armed to publish, and everything that already
 * tried.
 *
 * Rules and alignment rather than a grid of identical boxes: each schedule is a
 * row whose media is the only thing in a frame, because the media is the only
 * thing that is physically a card. The list is grouped by outcome and the
 * groups are ordered by what needs a human — failures first, then what is
 * coming, then the archive.
 *
 * Nothing here schedules anything. The database and the worker do that; this
 * screen reads `/api/scheduled-posts` and offers the three things a member can
 * still decide: move it, call it off, or try one network again.
 */

/** The filters, in the order a member scans them. */
const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "failed", label: "Needs attention" },
  { id: "published", label: "Published" },
  { id: "cancelled", label: "Cancelled" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(schedule: ScheduledPost): TabId {
  switch (schedule.status) {
    case "published":
      return "published";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "partially_published":
      return "failed";
    default:
      // draft, scheduled, queued, publishing — all still ahead of the worker.
      return "upcoming";
  }
}

export default function Scheduled() {
  const { data, isLoading, isError, refetch } = useScheduledPosts();
  const [tab, setTab] = useState<TabId>("upcoming");

  const grouped = useMemo(() => {
    const buckets: Record<TabId, ScheduledPost[]> = {
      upcoming: [],
      failed: [],
      published: [],
      cancelled: [],
    };
    for (const schedule of data ?? []) buckets[tabOf(schedule)].push(schedule);
    // Published and cancelled read newest-first; what is still ahead reads
    // soonest-first, because the next thing to go out is the point of the page.
    buckets.published.reverse();
    buckets.cancelled.reverse();
    return buckets;
  }, [data]);

  const shown = grouped[tab];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="w-full min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What FlowPost is going to publish for you, and what it already tried.
          </p>
        </div>

        <nav className="flex flex-wrap gap-1" aria-label="Filter schedules">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                "relative px-3 py-1.5 text-sm transition-colors",
                tab === id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {grouped[id].length}
              </span>
              {tab === id && (
                <motion.span
                  layoutId="schedule-tab-underline"
                  className="absolute inset-x-3 -bottom-px h-0.5 bg-foreground"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                />
              )}
            </button>
          ))}
        </nav>
      </header>

      {isLoading ? (
        <div className="divide-y">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-4 py-5">
              <Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 border-b py-8">
          <p className="text-sm text-muted-foreground">
            Your schedule couldn’t be loaded just now. Nothing has been
            cancelled — the posts are still queued.
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <EmptyStateFor tab={tab} />
      ) : (
        <ul className="space-y-4">
          {shown.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} />
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function EmptyStateFor({ tab }: { tab: TabId }) {
  const navigate = useNavigate();

  const copy: Record<TabId, { title: string; description: string }> = {
    upcoming: {
      title: "Your week is wide open.",
      description:
        "Write a post, pick a time and a timezone, and FlowPost will send it without you being here.",
    },
    failed: {
      title: "Nothing needs you.",
      description: "Every scheduled post so far has gone out.",
    },
    published: {
      title: "Nothing has published on a schedule yet.",
      description: "The first one is the hard one.",
    },
    cancelled: {
      title: "Nothing cancelled.",
      description: "Schedules you call off will be listed here.",
    },
  };

  return (
    <EmptyState
      icon={CalendarClock}
      title={copy[tab].title}
      description={copy[tab].description}
      className="mt-6"
      action={
        tab === "upcoming" ? (
          <Button size="sm" onClick={() => navigate("/posts/new")}>
            <PenLine />
            Compose a post
          </Button>
        ) : undefined
      }
    />
  );
}

// ─── One schedule ────────────────────────────────────────────────────────────

function ScheduleRow({ schedule }: { schedule: ScheduledPost }) {
  const navigate = useNavigate();
  const cancel = useCancelSchedule();
  const remove = useDeleteSchedule();
  const retry = useRetryDestination();

  // `getWorkflowStatus` is the one place that names a pipeline stage, and it
  // takes a Post. Only the three fields it reads are needed here.
  const meta =
    WORKFLOW_META[
      getWorkflowStatus({
        status: schedule.status,
        ai_status: "ready",
        approved: true,
      } as Post)
    ];

  const editable = schedule.status === "scheduled" || schedule.status === "draft";
  const active = schedule.destinations.filter((d) => d.status !== "CANCELLED");

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-soft transition-all hover:border-border/85 hover:shadow-elevated sm:flex-row">
      {/* Fixed-size thumbnail container to prevent black blank space stretching */}
      {schedule.imageUrl ? (
        <div className="w-full h-48 sm:w-28 sm:h-28 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img
            src={schedule.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div>
          {/* Header row: Title + Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="truncate text-base font-semibold text-foreground">{schedule.title}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                meta.className,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClassName)} />
              {meta.label}
            </span>
          </div>

          {/* Caption preview */}
          {schedule.caption && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {schedule.caption}
            </p>
          )}

          {/* Scheduled Time info with Clock icon */}
          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.08em] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <ScheduledFor schedule={schedule} />
          </div>
        </div>

        {/* Footer section: Platforms on the left, action buttons on the right */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {/* Platforms row (rendered horizontally side-by-side) */}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {active.map((destination) => (
              <DestinationRow
                key={destination.provider}
                destination={destination}
                onRetry={() =>
                  retry.mutate({ id: schedule.id, provider: destination.provider })
                }
                retrying={
                  retry.isPending &&
                  retry.variables?.provider === destination.provider &&
                  retry.variables?.id === schedule.id
                }
              />
            ))}
          </ul>

          {/* Action buttons on the right */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/posts/${schedule.id}/edit`)}
              className="h-8 gap-1.5"
            >
              <PenLine className="h-3.5 w-3.5" />
              {editable ? "Edit" : "Open"}
            </Button>

            {editable && (
              <Button
                size="sm"
                variant="ghost"
                loading={cancel.isPending && cancel.variables === schedule.id}
                onClick={() => cancel.mutate(schedule.id)}
                className="h-8 gap-1.5"
              >
                <CircleSlash className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}

            {(schedule.status === "cancelled" || schedule.status === "failed") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                loading={remove.isPending && remove.variables === schedule.id}
                onClick={() => remove.mutate(schedule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * When it goes out, in the zone it was scheduled in.
 *
 * The member's own wall clock is the headline and the browser's is the aside,
 * because "09:30 Asia/Kolkata" is the decision they made — re-rendering it as
 * 05:00 because they happen to be in London today would be technically true
 * and completely unrecognisable.
 */
function ScheduledFor({ schedule }: { schedule: ScheduledPost }) {
  if (!schedule.scheduledAt) return <>Not scheduled</>;

  const local = schedule.scheduledLocal
    ? dayjs(schedule.scheduledLocal)
    : dayjs(schedule.scheduledAt);
  const here = dayjs(schedule.scheduledAt);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const elsewhere = schedule.timezone && schedule.timezone !== browserZone;

  return (
    <>
      {local.format("MMM D, YYYY · h:mm A")}
      {schedule.timezone ? ` ${schedule.timezone}` : ""}
      {elsewhere && (
        <span className="text-muted-foreground">
          {" "}
          — {here.format("h:mm A")} your time
        </span>
      )}
    </>
  );
}

function DestinationRow({
  destination,
  onRetry,
  retrying,
}: {
  destination: ScheduledDestination;
  onRetry: () => void;
  retrying: boolean;
}) {
  const waiting = destination.status === "PENDING";
  const inFlight = destination.status === "PUBLISHING";

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <PlatformIcon
        platform={destination.provider as Platform}
        className="h-3.5 w-3.5 text-muted-foreground"
      />
      <span className="font-medium">{destination.providerName}</span>

      <span
        className={cn(
          "text-meta",
          destination.status === "PUBLISHED" && "text-success",
          destination.status === "FAILED" && "text-destructive",
        )}
      >
        {inFlight
          ? "Publishing"
          : destination.status === "PUBLISHED"
            ? `Published${
                destination.publishedAt
                  ? ` ${dayjs(destination.publishedAt).format("h:mm A")}`
                  : ""
              }`
            : destination.status === "FAILED"
              ? "Failed"
              : waiting && destination.attempts > 0
                ? `Retrying${
                    destination.nextAttemptAt
                      ? ` ${dayjs(destination.nextAttemptAt).format("h:mm A")}`
                      : ""
                  }`
                : "Waiting"}
      </span>

      {destination.url && (
        <a
          href={destination.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-meta underline-offset-2 hover:underline"
        >
          View
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {destination.errorMessage && destination.status !== "PUBLISHED" && (
        <span className="w-full text-xs text-muted-foreground">
          {destination.errorMessage}
          {waiting && destination.attemptsRemaining > 0
            ? ` FlowPost will try ${destination.attemptsRemaining} more time${
                destination.attemptsRemaining === 1 ? "" : "s"
              }.`
            : ""}
        </span>
      )}

      {destination.status === "FAILED" && (
        <Button size="sm" variant="ghost" loading={retrying} onClick={onRetry}>
          <RotateCcw />
          Retry
        </Button>
      )}
    </li>
  );
}

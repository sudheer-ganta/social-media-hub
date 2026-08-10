import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import dayjs, { type Dayjs } from "dayjs";
import isTomorrow from "dayjs/plugin/isTomorrow";
import isToday from "dayjs/plugin/isToday";

dayjs.extend(isTomorrow);
dayjs.extend(isToday);
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  Calendar as CalendarIcon,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { useMovePost } from "@/hooks/usePosts";
import { buildMonthGrid, formatDisplayTime } from "@/utils/date";
import { cn } from "@/lib/utils";
import type { Post, PostStatus } from "@/types";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// ── Status colours ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<
  PostStatus,
  { bg: string; text: string; dot: string }
> = {
  draft: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  scheduled: {
    bg: "bg-warning/15",
    text: "text-warning",
    dot: "bg-warning",
  },
  queued: {
    bg: "bg-primary/15",
    text: "text-primary",
    dot: "bg-primary",
  },
  publishing: {
    bg: "bg-primary/15",
    text: "text-primary",
    dot: "bg-primary",
  },
  published: {
    bg: "bg-success/15",
    text: "text-success",
    dot: "bg-success",
  },
  failed: {
    bg: "bg-destructive/15",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

// ── Upcoming helpers ───────────────────────────────────────────────────────────

function getUpcomingPosts(posts: Post[]): Post[] {
  const now = dayjs();
  return posts
    .filter((p) => {
      const dt = dayjs(`${p.publish_date}T${p.publish_time || "00:00"}`);
      return (
        (p.status === "scheduled" || p.status === "publishing") &&
        dt.isAfter(now)
      );
    })
    .sort((a, b) => {
      const da = `${a.publish_date}T${a.publish_time}`;
      const db = `${b.publish_date}T${b.publish_time}`;
      return da.localeCompare(db);
    })
    .slice(0, 10);
}

function formatUpcomingTime(post: Post): string {
  const dt = dayjs(`${post.publish_date}T${post.publish_time || "00:00"}`);
  if (dt.isToday()) return `Today ${dt.format("h:mm A")}`;
  if (dt.isTomorrow()) return `Tomorrow ${dt.format("h:mm A")}`;
  return dt.format("MMM D, h:mm A");
}

// ── Content summary stats ──────────────────────────────────────────────────────

function getStats(posts: Post[]) {
  return {
    drafts: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    publishing: posts.filter(
      (p) => p.status === "publishing" || p.status === "queued"
    ).length,
    published: posts.filter((p) => p.status === "published").length,
  };
}

// ── Flow Rail ─────────────────────────────────────────────────────────────────

interface FlowRailProps {
  stats: ReturnType<typeof getStats>;
}

function FlowRail({ stats }: FlowRailProps) {
  const steps = [
    { label: "Draft", count: stats.drafts, color: "text-muted-foreground" },
    {
      label: "Scheduled",
      count: stats.scheduled,
      color: "text-warning",
      highlight: true,
    },
    { label: "Publishing", count: stats.publishing, color: "text-primary" },
    { label: "Published", count: stats.published, color: "text-success" },
  ];

  const allDone =
    stats.drafts === 0 &&
    stats.scheduled === 0 &&
    stats.publishing === 0 &&
    stats.published > 0;

  return (
    <div className="border-t bg-card/80 px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">Flow Rail</p>
          <p className="text-[11px] text-muted-foreground">
            Your content journey this month
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex min-w-[60px] flex-col items-center rounded-lg border bg-muted/40 px-3 py-2">
                <span className={cn("text-lg font-bold tabular-nums", step.color)}>
                  {step.count}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              )}
            </div>
          ))}
          {allDone && (
            <div className="ml-2 flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-success">All done!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

interface RightPanelProps {
  posts: Post[];
  stats: ReturnType<typeof getStats>;
}

function RightPanel({ posts, stats }: RightPanelProps) {
  const upcoming = useMemo(() => getUpcomingPosts(posts), [posts]);

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0 xl:w-[300px] lg:h-full lg:min-h-0">
      {/* Upcoming */}
      <div className="rounded-xl border bg-card shadow-sm flex flex-col lg:h-full lg:min-h-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold">Upcoming</h3>
          <Link
            to="/posts"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="divide-y overflow-y-auto flex-1 scrollbar-thin">
          {upcoming.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No upcoming posts scheduled
            </p>
          ) : (
            upcoming.map((post) => (
              <Link
                key={post.id}
                to={`/posts/${post.id}/edit`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                {/* Platform icon or image thumbnail */}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt={post.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                  )}
                  {/* Platform badge */}
                  {post.platforms[0] && (
                    <div className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow">
                      <PlatformIcon
                        platform={post.platforms[0]}
                        className="h-2.5 w-2.5"
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {post.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatUpcomingTime(post)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
        {upcoming.length > 0 && (
          <div className="border-t px-4 py-2.5 shrink-0">
            <Link
              to="/posts"
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              + {Math.max(0, stats.scheduled - upcoming.length)} more scheduled
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items: { label: string; dot: string }[] = [
    { label: "Draft", dot: "bg-muted-foreground/60" },
    { label: "Scheduled", dot: "bg-warning" },
    { label: "Publishing", dot: "bg-primary" },
    { label: "Published", dot: "bg-success" },
    { label: "Failed", dot: "bg-destructive" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", item.dot)} />
          <span className="text-[11px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main CalendarView ─────────────────────────────────────────────────────────

interface CalendarViewProps {
  posts: Post[];
  month: Dayjs;
  onMonthChange: (month: Dayjs) => void;
}

export function CalendarView({ posts, month, onMonthChange }: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const movePost = useMovePost();

  const grid = useMemo(() => buildMonthGrid(month), [month]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const list = map.get(post.publish_date) ?? [];
      list.push(post);
      map.set(post.publish_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.publish_time.localeCompare(b.publish_time));
    }
    return map;
  }, [posts]);

  const stats = useMemo(() => getStats(posts), [posts]);
  const selectedPosts = selectedDay ? (postsByDay.get(selectedDay) ?? []) : [];

  const handleDrop = useCallback(
    (event: React.DragEvent, iso: string) => {
      event.preventDefault();
      setDragOverDay(null);
      const postId = event.dataTransfer.getData("text/post-id");
      const from = event.dataTransfer.getData("text/post-date");
      if (postId && from !== iso) {
        movePost.mutate({ id: postId, date: iso });
      }
    },
    [movePost]
  );

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 flex-1">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{month.format("MMMM YYYY")}</h1>
          <p className="text-xs text-muted-foreground">
            Plan, schedule and track your content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={() => onMonthChange(dayjs().startOf("month"))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            aria-label="Previous month"
            onClick={() => onMonthChange(month.subtract(1, "month"))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            aria-label="Next month"
            onClick={() => onMonthChange(month.add(1, "month"))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
          </Button>
          <Button asChild size="sm" className="gap-1.5 h-8">
            <Link to="/posts/new">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Post</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Main body: calendar + right panel ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-1 lg:min-h-0 lg:items-stretch">
        {/* Calendar card */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm flex flex-col h-full lg:min-h-0">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b bg-muted/30 shrink-0">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
            {grid.map((day) => {
              if (!day.inMonth) {
                return (
                  <div
                    key={day.iso}
                    className="border-b border-r last:border-r-0 bg-muted/5 opacity-40"
                  />
                );
              }
              const dayPosts = postsByDay.get(day.iso) ?? [];
              const isSelected = selectedDay === day.iso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => setSelectedDay(day.iso)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverDay(day.iso);
                  }}
                  onDragLeave={() =>
                    setDragOverDay((d) => (d === day.iso ? null : d))
                  }
                  onDrop={(e) => handleDrop(e, day.iso)}
                  className={cn(
                    "group flex flex-col h-full border-b border-r p-1.5 text-left align-top transition-all last:border-r-0 overflow-hidden",
                    !day.inMonth && "bg-muted/20",
                    dragOverDay === day.iso &&
                      "bg-accent ring-1 ring-inset ring-primary/40",
                    isSelected && "bg-accent/40",
                    "hover:bg-accent/20"
                  )}
                >
                  {/* Cell Header */}
                  <div className="flex items-center justify-between w-full shrink-0 mb-1">
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                        day.isToday
                          ? "bg-primary text-primary-foreground font-bold"
                          : "text-muted-foreground group-hover:text-foreground group-hover:bg-muted"
                      )}
                    >
                      {day.date.date()}
                    </span>
                    {dayPosts.length > 2 && (
                      <span className="text-[9px] font-bold text-muted-foreground/80 bg-muted/60 px-1 py-0.2 rounded font-mono">
                        +{dayPosts.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Post List */}
                  <div className="flex-1 w-full space-y-1 overflow-hidden min-h-0">
                    {dayPosts.slice(0, 2).map((post) => {
                      const s = STATUS_PILL[post.status] ?? STATUS_PILL.draft;
                      return (
                        <div
                          key={post.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/post-id", post.id);
                            e.dataTransfer.setData(
                              "text/post-date",
                              post.publish_date
                            );
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className={cn(
                            "flex cursor-grab items-center gap-1 truncate rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight active:cursor-grabbing border border-transparent hover:border-foreground/5",
                            s.bg,
                            s.text
                          )}
                          title={post.title}
                        >
                          {post.platforms[0] && (
                            <PlatformIcon
                              platform={post.platforms[0]}
                              className="h-2.5 w-2.5 shrink-0 opacity-80"
                            />
                          )}
                          <span className="truncate flex-1">{post.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend + Flow Rail */}
          <div className="border-t shrink-0">
            <div className="px-4 py-2.5">
              <Legend />
            </div>
          </div>
        </div>

        {/* Right panel — hidden on mobile, shown from lg */}
        <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:h-full lg:min-h-0">
          <RightPanel posts={posts} stats={stats} />
        </div>
      </div>

      {/* Mobile right panel (stacked below calendar) */}
      <div className="lg:hidden">
        <RightPanel posts={posts} stats={stats} />
      </div>

      {/* Flow Rail */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <FlowRail stats={stats} />
      </div>

      {/* Day detail dialog */}
      <Dialog
        open={Boolean(selectedDay)}
        onOpenChange={(open) => !open && setSelectedDay(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? dayjs(selectedDay).format("dddd, MMMM D") : ""}
            </DialogTitle>
            <DialogDescription>
              {selectedPosts.length === 0
                ? "No posts on this day yet."
                : `${selectedPosts.length} ${
                    selectedPosts.length === 1 ? "post" : "posts"
                  } planned.`}
            </DialogDescription>
          </DialogHeader>
          <div className="relative pl-6 space-y-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-thin py-2">
            {/* Vertical timeline line */}
            {selectedPosts.length > 1 && (
              <div className="absolute left-[8px] top-4 bottom-4 w-0.5 border-l border-dashed border-border pointer-events-none" />
            )}

            {selectedPosts.map((post) => {
              const s = STATUS_PILL[post.status] ?? STATUS_PILL.draft;
              return (
                <div key={post.id} className="relative flex items-center gap-3 group">
                  {/* Timeline dot */}
                  <div className="absolute left-[-22px] top-1/2 -translate-y-1/2 flex items-center justify-center bg-background p-0.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full border-2 border-background ring-2 ring-transparent transition-all group-hover:scale-125", s.dot)} />
                  </div>

                  {/* Time label */}
                  <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground select-none">
                    {formatDisplayTime(post.publish_time)}
                  </span>

                  {/* Post Card */}
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="flex-1 flex items-center gap-3 rounded-xl border bg-card/40 p-3.5 transition-all duration-200 hover:bg-accent/40 hover:border-foreground/10 hover:translate-x-0.5 shadow-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {post.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {post.platforms.slice(0, 3).map((platform) => (
                        <PlatformIcon
                          key={platform}
                          platform={platform}
                          className="h-3.5 w-3.5 text-muted-foreground/60"
                        />
                      ))}
                    </span>
                    <StatusBadge post={post} className="shrink-0 text-[10px] py-0.5 px-2 font-semibold" />
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-2 border-t shrink-0">
            <Button asChild variant="outline" className="w-full">
              <Link to="/posts/new">
                <Plus className="h-4 w-4" />
                New post on this day
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

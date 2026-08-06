import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs, { type Dayjs } from "dayjs";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import type { Post } from "@/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const selectedPosts = selectedDay ? (postsByDay.get(selectedDay) ?? []) : [];

  const handleDrop = (event: React.DragEvent, iso: string) => {
    event.preventDefault();
    setDragOverDay(null);
    const postId = event.dataTransfer.getData("text/post-id");
    const from = event.dataTransfer.getData("text/post-date");
    if (postId && from !== iso) {
      movePost.mutate({ id: postId, date: iso });
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="text-base font-semibold">{month.format("MMMM YYYY")}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMonthChange(dayjs().startOf("month"))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => onMonthChange(month.subtract(1, "month"))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => onMonthChange(month.add(1, "month"))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {grid.map((day) => {
          const dayPosts = postsByDay.get(day.iso) ?? [];
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => setSelectedDay(day.iso)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDay(day.iso);
              }}
              onDragLeave={() => setDragOverDay((d) => (d === day.iso ? null : d))}
              onDrop={(e) => handleDrop(e, day.iso)}
              className={cn(
                "min-h-[92px] border-b border-r p-1.5 text-left align-top transition-colors last:border-r-0 sm:min-h-[112px]",
                !day.inMonth && "bg-muted/30 text-muted-foreground/60",
                dragOverDay === day.iso && "bg-accent ring-1 ring-inset ring-primary/50",
                "hover:bg-accent/40",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  day.isToday && "bg-primary font-bold text-primary-foreground",
                )}
              >
                {day.date.date()}
              </span>
              <div className="mt-1 space-y-1">
                {dayPosts.slice(0, 2).map((post) => (
                  <div
                    key={post.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/post-id", post.id);
                      e.dataTransfer.setData("text/post-date", post.publish_date);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn(
                      "cursor-grab truncate rounded px-1.5 py-1 text-[11px] font-medium leading-tight active:cursor-grabbing",
                      post.status === "published"
                        ? "bg-success/15 text-success"
                        : post.status === "scheduled"
                          ? "bg-warning/15 text-warning"
                          : post.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : post.status === "publishing"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                    )}
                    title={post.title}
                  >
                    {post.title}
                  </div>
                ))}
                {dayPosts.length > 2 && (
                  <p className="px-1.5 text-[10px] font-medium text-muted-foreground">
                    +{dayPosts.length - 2} more
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail dialog */}
      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? dayjs(selectedDay).format("dddd, MMMM D") : ""}
            </DialogTitle>
            <DialogDescription>
              {selectedPosts.length === 0
                ? "No posts on this day yet."
                : `${selectedPosts.length} ${selectedPosts.length === 1 ? "post" : "posts"} planned.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selectedPosts.map((post) => (
              <Link
                key={post.id}
                to={`/posts/${post.id}/edit`}
                className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
              >
                <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {formatDisplayTime(post.publish_time)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {post.title}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {post.platforms.slice(0, 3).map((platform) => (
                    <PlatformIcon
                      key={platform}
                      platform={platform}
                      className="h-3 w-3 text-muted-foreground"
                    />
                  ))}
                </span>
                <StatusBadge post={post} className="shrink-0" />
              </Link>
            ))}
            <Button asChild variant="outline" className="w-full">
              <Link to="/posts/new">
                <Plus />
                New post on this day
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

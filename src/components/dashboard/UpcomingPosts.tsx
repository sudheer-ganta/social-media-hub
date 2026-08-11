import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDisplayDate, formatDisplayTime, publishDayjs } from "@/utils/date";
import type { Post } from "@/types";

interface UpcomingPostsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

export function UpcomingPosts({ posts, loading }: UpcomingPostsProps) {
  const upcoming = (posts ?? [])
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => publishDayjs(a).valueOf() - publishDayjs(b).valueOf())
    .slice(0, 5);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Today's Queue</CardTitle>
          <CardDescription>Next scheduled posts</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/calendar">
            View calendar
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {loading &&
          Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}

        {!loading && upcoming.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title="Nothing in the queue"
            description="Schedule a post and it will show up here."
            className="py-10"
          />
        )}

        {!loading &&
          upcoming.map((post) => (
            <Link
              key={post.id}
              to={`/posts/${post.id}/edit`}
              className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent/50"
            >
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-accent text-accent-foreground">
                <span className="text-[10px] font-semibold uppercase leading-none">
                  {formatDisplayDate(post.publish_date).slice(0, 3)}
                </span>
                <span className="mt-0.5 text-xs font-bold leading-none">
                  {formatDisplayTime(post.publish_time)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{post.title || "Untitled"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDisplayDate(post.publish_date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {post.platforms.slice(0, 3).map((platform) => (
                  <span
                    key={platform}
                    className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground"
                  >
                    <PlatformIcon platform={platform} className="h-2.5 w-2.5" />
                  </span>
                ))}
              </div>
            </Link>
          ))}
      </CardContent>
    </Card>
  );
}

import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDisplayTime, publishDayjs } from "@/utils/date";
import { PanelEmpty, PanelHeader, PlatformBadge } from "./parts";
import type { Post } from "@/types";

interface UpcomingPostsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

/** Scheduled posts on a timeline: date, a connecting rail, then the post. */
export function UpcomingPosts({ posts, loading }: UpcomingPostsProps) {
  const upcoming = (posts ?? [])
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => publishDayjs(a).valueOf() - publishDayjs(b).valueOf())
    .slice(0, 4);

  return (
    <section className="rd-panel p-6" aria-label="Upcoming posts">
      <PanelHeader title="Upcoming" to="/scheduled" linkLabel="View all" />

      <div className="mt-5">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-rl-line/50" />
            ))}
          </div>
        )}

        {!loading && upcoming.length === 0 && (
          <PanelEmpty
            title="Nothing in the queue"
            body="Schedule a post and the next ones will line up here."
            to="/posts/new"
            action="Schedule a post"
          />
        )}

        {!loading && upcoming.length > 0 && (
          <ol className="relative">
            {/* The rail runs through the dots, behind them. */}
            <span
              aria-hidden="true"
              className="absolute bottom-6 left-[58px] top-6 w-px bg-rl-line"
            />
            {upcoming.map((post) => {
              const day = dayjs(publishDayjs(post));
              const first = post.platforms[0];
              return (
                <li key={post.id}>
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="rd-row -mx-2 flex items-center gap-3 rounded-[12px] px-2 py-3"
                  >
                    <span className="w-9 shrink-0 text-center leading-none">
                      <span className="block text-[12px] text-rl-muted">{day.format("MMM")}</span>
                      <span className="rd-numeral mt-1 block text-[20px]">{day.format("DD")}</span>
                    </span>
                    <span className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-rl-surface bg-rl-muted/70" />
                    {first && <PlatformBadge platform={first} size={34} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold tracking-[-0.02em]">
                        {post.title || "Untitled"}
                      </span>
                      <span className="block text-[12.5px] text-rl-muted">
                        {formatDisplayTime(post.publish_time)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

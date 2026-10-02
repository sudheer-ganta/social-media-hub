import { Link } from "react-router-dom";
import { ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { WORKFLOW_META } from "@/constants";
import { formatDisplayDate } from "@/utils/date";
import { getWorkflowStatus } from "@/utils/workflow";
import { PanelEmpty, PanelHeader, PlatformBadge, stageDot } from "./parts";
import { cn } from "@/lib/utils";
import type { Post } from "@/types";

interface RecentPostsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

export function RecentPosts({ posts, loading }: RecentPostsProps) {
  const recent = (posts ?? []).slice(0, 4);

  return (
    <section className="rd-panel p-6 sm:p-7" aria-label="Recent posts">
      <PanelHeader title="Recent posts" to="/posts" linkLabel="View all" />

      <div className="mt-5">
        {loading && (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full rounded-[14px] bg-rl-line/50" />
            ))}
          </div>
        )}

        {!loading && recent.length === 0 && (
          <PanelEmpty
            title="No posts yet"
            body="Write your first post and it will show up here."
            to="/posts/new"
            action="Write a post"
          />
        )}

        {!loading && recent.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {recent.map((post) => {
              const stage = getWorkflowStatus(post);
              const first = post.platforms[0];
              return (
                <li key={post.id}>
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="group block overflow-hidden rounded-[14px] border border-rl-line bg-rl-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-20px_rgb(0_0_0/0.3)]"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-rl-soft">
                      {post.image_url ? (
                        <img
                          src={post.image_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-rl-accent-strong/50" strokeWidth={1.5} />
                        </div>
                      )}
                      {first && <PlatformBadge platform={first} size={30} className="absolute bottom-2.5 left-2.5" />}
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-[14.5px] font-semibold tracking-[-0.02em]">
                        {post.title || "Untitled"}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 truncate text-[12.5px] text-rl-muted">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stageDot(stage))} />
                        <span className="truncate">
                          {WORKFLOW_META[stage].label}
                          {post.publish_date ? `, ${formatDisplayDate(post.publish_date)}` : ""}
                        </span>
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

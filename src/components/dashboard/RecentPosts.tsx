import { Link } from "react-router-dom";
import { ArrowRight, FileText, ImageIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatRelative } from "@/utils/date";
import { truncate } from "@/utils/text";
import type { Post } from "@/types";

interface RecentPostsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

export function RecentPosts({ posts, loading }: RecentPostsProps) {
  const recent = (posts ?? []).slice(0, 5);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Recent Posts</CardTitle>
          <CardDescription>Latest activity in your workspace</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/posts">
            View all
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {loading &&
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}

        {!loading && recent.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No posts yet"
            description="Create your first post to get things moving."
            className="py-10"
          />
        )}

        {!loading &&
          recent.map((post) => (
            <Link
              key={post.id}
              to={`/posts/${post.id}/edit`}
              className="flex items-center gap-2.5 sm:gap-3 rounded-md border p-2.5 sm:p-3 transition-colors hover:bg-accent/50 min-w-0"
            >
              <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs sm:text-sm font-medium">{post.title}</p>
                <p className="truncate text-[11px] sm:text-xs text-muted-foreground">
                  {truncate(post.caption, 40) || "No caption"} ·{" "}
                  {formatRelative(post.created_at)}
                </p>
              </div>
              <StatusBadge post={post} className="shrink-0 text-[10px] sm:text-xs px-2 py-0.5" />
            </Link>
          ))}
      </CardContent>
    </Card>
  );
}

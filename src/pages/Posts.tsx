import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { RallyPage } from "@/components/layout/RallyPage";
import { PostCard } from "@/components/posts/PostCard";
import { PostDetailModal } from "@/components/posts/PostDetailModal";
import { PostFilters } from "@/components/posts/PostFilters";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardStats } from "@/hooks/useDashboard";
import { getWorkflowStatus } from "@/utils/workflow";
import {
  useAllPosts,
  useDeletePost,
  useDuplicatePost,
  usePostsPage,
  usePublishPost,
} from "@/hooks/usePosts";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { POSTS_PAGE_SIZE } from "@/constants";
import type { Post, PostFilters as Filters } from "@/types";

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "all",
  platform: "all",
  context: "all",
  brandId: null,
  from: "",
  to: "",
  sort: "created_desc",
};

const CHIPS: { value: Filters["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];

export default function Posts() {
  // The Flow Rail navigates here carrying the stage that was clicked, so
  // "8 Scheduled" on the rail lands on those eight and nothing else.
  const railStatus = (useLocation().state as { status?: string } | null)?.status;
  const [filters, setFilters] = useState<Filters>(() =>
    railStatus ? { ...DEFAULT_FILTERS, status: railStatus as Filters["status"] } : DEFAULT_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Post | null>(null);
  const [selectedPostForView, setSelectedPostForView] = useState<Post | null>(null);

  // The rail is on this page too, so a click while already here has to land.
  useEffect(() => {
    if (!railStatus) return;
    setFilters((f) => ({ ...f, status: railStatus as Filters["status"] }));
    setPage(1);
  }, [railStatus]);

  const debouncedSearch = useDebouncedValue(filters.search);

  const params = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
      page,
      pageSize: POSTS_PAGE_SIZE,
    }),
    [filters, debouncedSearch, page],
  );

  const { data, isLoading, isFetching } = usePostsPage(params);
  const deletePost = useDeletePost();
  const duplicatePost = useDuplicatePost();
  const publishPost = usePublishPost();

  const stats = useDashboardStats();
  const everything = useAllPosts();
  const chipCounts: Record<string, number | undefined> = {
    all: stats.data?.total,
    draft: stats.data?.drafts,
    scheduled: stats.data?.scheduled,
    published: stats.data?.published,
    failed: everything.data
      ? everything.data.filter((p) => getWorkflowStatus(p) === "failed").length
      : undefined,
  };

  const posts = data?.data ?? [];
  const pageCount = data?.pageCount ?? 1;
  const total = data?.count ?? 0;

  const handleFiltersChange = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    filters.status !== "all" ||
    filters.platform !== "all" ||
    filters.context !== "all" ||
    Boolean(filters.from || filters.to);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deletePost.mutate(pendingDelete.id, {
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <RallyPage
      title="Library"
      description={
        isLoading ? "Loading your posts." : `${total} ${total === 1 ? "post" : "posts"} in your workspace.`
      }
      actions={
        <Link to="/posts/new" className="rd-cta !h-12 !px-5 !text-[14.5px]">
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          New post
        </Link>
      }
    >
      <div
        role="group"
        aria-label="Filter by status"
        className="scrollbar-none -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors",
              filters.status === chip.value
                ? "border-rl-ink bg-rl-ink text-rl-bg"
                : "border-rl-line bg-rl-surface hover:border-rl-ink",
            )}
            aria-pressed={filters.status === chip.value}
            onClick={() => handleFiltersChange({ ...filters, status: chip.value })}
          >
            {chip.label}
            {chipCounts[chip.value] !== undefined && (
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[12px] font-bold tabular-nums",
                  filters.status === chip.value ? "bg-rl-accent-strong text-white" : "bg-rl-soft text-rl-accent-strong",
                )}
              >
                {chipCounts[chip.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-8">
        <PostFilters value={filters} onChange={handleFiltersChange} hideStatus />
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-[18px] bg-rl-line/50" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rd-panel mx-auto max-w-xl p-10 text-center">
          <p className="text-[30px] font-semibold tracking-[-0.045em]">
            {hasActiveFilters ? "No posts match" : "No posts yet"}
          </p>
          <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-rl-muted">
            {hasActiveFilters
              ? "Try different search terms or clear the filters."
              : "Write your first post and it will show up here."}
          </p>
          <Link to="/posts/new" className="rd-cta mt-6 !h-12 !text-[14.5px]">
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New post
          </Link>
        </div>
      ) : (
        <>
          <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onClick={(p) => setSelectedPostForView(p)}
                    onDelete={setPendingDelete}
                    onDuplicate={(p) => duplicatePost.mutate(p.id)}
                    onPublish={(p) => publishPost.mutate(p.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} className="mt-10" />
        </>
      )}

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              "{pendingDelete?.title}" will be permanently removed. This can't
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deletePost.isPending}
              onClick={confirmDelete}
            >
              Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PostDetailModal
        post={selectedPostForView}
        open={Boolean(selectedPostForView)}
        onOpenChange={(open) => !open && setSelectedPostForView(null)}
      />
    </RallyPage>
  );
}

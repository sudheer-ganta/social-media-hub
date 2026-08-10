import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { FileText, Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PostCard } from "@/components/posts/PostCard";
import { PostDetailModal } from "@/components/posts/PostDetailModal";
import { PostFilters } from "@/components/posts/PostFilters";
import { EmptyState } from "@/components/shared/EmptyState";
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
import {
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
    <PageContainer
      title="Posts"
      description={
        isLoading ? "Loading your posts…" : `${total} ${total === 1 ? "post" : "posts"} in your workspace.`
      }
    >
      <div className="mb-6">
        <PostFilters value={filters} onChange={handleFiltersChange} />
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasActiveFilters ? "No posts match" : "No posts yet"}
          description={
            hasActiveFilters
              ? "Try different search terms or clear the filters."
              : "Create your first post and it will show up here."
          }
          action={
            <Button asChild>
              <Link to="/posts/new">
                <Plus />
                Create Post
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div
            className={
              isFetching ? "opacity-70 transition-opacity" : "transition-opacity"
            }
          >
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
          <Pagination
            page={page}
            pageCount={pageCount}
            onChange={setPage}
            className="mt-8"
          />
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
    </PageContainer>
  );
}

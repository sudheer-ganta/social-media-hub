import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { postsService } from "@/services";
import type { Post, PostInsert, PostListParams, PostUpdate } from "@/types";

export const postKeys = {
  all: ["posts"] as const,
  page: (params: PostListParams) => ["posts", "page", params] as const,
  full: ["posts", "full"] as const,
  month: (month: string) => ["posts", "month", month] as const,
  detail: (id: string) => ["posts", "detail", id] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

function invalidatePostData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: postKeys.all });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
}

export function usePostsPage(params: PostListParams) {
  return useQuery({
    queryKey: postKeys.page(params),
    queryFn: () => postsService.page(params),
    placeholderData: keepPreviousData,
  });
}

export function useAllPosts() {
  return useQuery({
    queryKey: postKeys.full,
    queryFn: () => postsService.listAll(),
  });
}

export function useMonthPosts(monthIso: string) {
  return useQuery({
    queryKey: postKeys.month(monthIso),
    queryFn: () => postsService.listForMonth(monthIso),
    placeholderData: keepPreviousData,
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: postKeys.detail(id ?? ""),
    queryFn: () => postsService.getById(id as string),
    enabled: Boolean(id),
    // Poll while the AI scenario is working so generated content appears
    // without a manual refresh.
    refetchInterval: (query) =>
      query.state.data?.ai_status === "generating" ? 5000 : false,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostInsert) => postsService.create(input),
    onSuccess: () => invalidatePostData(queryClient),
    onError: (error: Error) => {
      toast.error("Failed to create post", { description: error.message });
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PostUpdate }) =>
      postsService.update(id, input),
    onSuccess: (post: Post) => {
      invalidatePostData(queryClient);
      queryClient.setQueryData(postKeys.detail(post.id), post);
    },
    onError: (error: Error) => {
      toast.error("Failed to update post", { description: error.message });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsService.remove(id),
    onSuccess: () => {
      invalidatePostData(queryClient);
      toast.success("Post deleted");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete post", { description: error.message });
    },
  });
}

export function useDuplicatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsService.duplicate(id),
    onSuccess: (post: Post) => {
      invalidatePostData(queryClient);
      toast.success("Post duplicated", { description: post.title });
    },
    onError: (error: Error) => {
      toast.error("Failed to duplicate post", { description: error.message });
    },
  });
}

export function usePublishPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsService.publishNow(id),
    onSuccess: () => {
      invalidatePostData(queryClient);
      toast.success("Post published 🚀");
    },
    onError: (error: Error) => {
      toast.error("Failed to publish post", { description: error.message });
    },
  });
}

export function useRequestAiGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postsService.requestAiGeneration(id),
    onSuccess: (post: Post) => {
      invalidatePostData(queryClient);
      queryClient.setQueryData(postKeys.detail(post.id), post);
      toast.success("AI generation started", {
        description: "Caption, hashtags and per-platform versions are on the way.",
      });
    },
    onError: (error: Error) => {
      toast.error("Couldn't start AI generation", { description: error.message });
    },
  });
}

export function useApprovePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      approved ? postsService.approve(id) : postsService.unapprove(id),
    onSuccess: (post: Post) => {
      invalidatePostData(queryClient);
      queryClient.setQueryData(postKeys.detail(post.id), post);
      toast.success(post.approved ? "Post approved ✅" : "Approval removed");
    },
    onError: (error: Error) => {
      toast.error("Couldn't update approval", { description: error.message });
    },
  });
}

/** Move a post to a new date (calendar drag & drop) with optimistic update. */
export function useMovePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      postsService.reschedule(id, date),
    onMutate: async ({ id, date }) => {
      await queryClient.cancelQueries({ queryKey: postKeys.all });
      const previous = queryClient.getQueriesData<Post[]>({
        queryKey: ["posts", "month"],
      });
      queryClient.setQueriesData<Post[]>(
        { queryKey: ["posts", "month"] },
        (posts) =>
          posts?.map((p) => (p.id === id ? { ...p, publish_date: date } : p)),
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error("Failed to move post", { description: error.message });
    },
    onSettled: () => invalidatePostData(queryClient),
  });
}

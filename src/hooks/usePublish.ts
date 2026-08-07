import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { publishService } from "@/services";
import { postKeys, dashboardKeys } from "./usePosts";
import type { PublishResult, PublishState } from "@/types";

export const publishKeys = {
  state: (postId: string) => ["publish", "state", postId] as const,
};

/**
 * Where a post stands on each network.
 *
 * Fetched rather than derived from `post.status`, because the post row only
 * knows whether *something* was published — `post_platforms` is what knows it
 * was LinkedIn, which URN it got, and what went wrong if it didn't. It is also
 * what makes a publish from another tab visible here.
 */
export function usePublishState(postId: string | undefined) {
  return useQuery({
    queryKey: publishKeys.state(postId ?? ""),
    queryFn: () => publishService.fetchPublishState(postId as string),
    enabled: Boolean(postId),
    // A publish resolves in its own request — there is nothing happening out of
    // band to poll for. The mutation below seeds this cache on success.
    staleTime: 30_000,
  });
}

/**
 * Publishes a saved post.
 *
 * Duplicate requests are guarded in three places, and all three are load
 * bearing: `isPending` disables the button, the mutation refuses to start a
 * second run while one is in flight, and — the only one that actually
 * *guarantees* it — the backend claims the attempt with a conditional write.
 * The first two are courtesy; a double-submit that beats a re-render, a second
 * tab, or a retried request only ever meets the third.
 */
export function usePublishPostToProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      postId,
      provider,
    }: {
      postId: string;
      provider?: string;
    }) => publishService.publishPost(postId, provider),

    onSuccess: (result: PublishResult) => {
      // The post's own row changed server-side (status, published_at), so the
      // cached copies are stale.
      queryClient.invalidateQueries({ queryKey: postKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

      // Patch the platform state straight in rather than refetching: we have
      // the authoritative answer in hand, and the panel should not flicker
      // through a loading state on the way to showing "Published".
      queryClient.setQueryData<PublishState | undefined>(
        publishKeys.state(result.postId),
        (current) => {
          const updated = {
            provider: result.provider,
            providerName: current?.platforms.find(
              (p) => p.provider === result.provider,
            )?.providerName ?? "LinkedIn",
            status: "PUBLISHED" as const,
            publishedId: result.publishedId,
            url: result.url,
            errorMessage: null,
          };

          const platforms = current?.platforms ?? [];
          const known = platforms.some((p) => p.provider === result.provider);

          return {
            postId: result.postId,
            status: "published",
            publishedAt: result.publishedAt,
            platforms: known
              ? platforms.map((p) =>
                  p.provider === result.provider ? updated : p,
                )
              : [...platforms, updated],
          };
        },
      );

      toast.success("Published to LinkedIn 🚀", {
        description: result.url
          ? "Your post is live. Use View on LinkedIn to see it."
          : "Your post is live on LinkedIn.",
      });
    },

    onError: (error: Error) => {
      // The message is the backend's, and it is already written for a member —
      // "Reconnect your LinkedIn account", "This post has already been
      // published". Showing it verbatim is the point.
      toast.error("Couldn't publish", { description: error.message });
    },

    onSettled: (_result, _error, variables) => {
      // Whatever happened, the stored attempt is now the truth. A failure
      // wrote an error message to `post_platforms` that the panel should show.
      queryClient.invalidateQueries({
        queryKey: publishKeys.state(variables.postId),
      });
    },
  });
}

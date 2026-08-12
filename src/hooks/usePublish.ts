import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { publishService } from "@/services";
import { PLATFORM_MAP } from "@/constants";
import { postKeys, dashboardKeys } from "./usePosts";
import type { Platform, PublishResult, PublishState } from "@/types";
import type { ContentType } from "@/types/capabilities";

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
      contentType,
    }: {
      postId: string;
      provider?: string;
      /** The format the member chose for this network. Omit to use count-based inference. */
      contentType?: ContentType;
    }) => {
      console.log("[publish] usePublish mutation received", {
        postId,
        provider,
        contentType: contentType ?? null,
      });
      return publishService.publishPost(postId, provider, contentType);
    },

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
            providerName:
              current?.platforms.find((p) => p.provider === result.provider)
                ?.providerName ??
              PLATFORM_MAP[result.provider as Platform]?.name ??
              result.provider,
            status: "PUBLISHED" as const,
            publishedId: result.publishedId,
            url: result.url,
            errorMessage: null,
            notice: result.reason ?? null,
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

      // Named from the result rather than hardcoded: the same mutation now
      // publishes to LinkedIn and Instagram, and a toast that says the wrong
      // network is worse than one that says none.
      const network =
        PLATFORM_MAP[result.provider as Platform]?.name ?? result.provider;

      // A publish that lost the member's media is not a plain success and must
      // not read as one. It went out, so this is not an error toast — but the
      // headline says what happened and the description is the backend's own
      // sentence, so nobody discovers the missing image by looking at their
      // timeline later.
      if (result.mediaDropped) {
        toast.warning(`Published to ${network} — without your media`, {
          description:
            result.reason ??
            `${network} couldn't attach the media, so FlowPost published the text only.`,
          // Longer than a success toast: this one has to actually be read.
          duration: 10_000,
        });
        return;
      }

      toast.success(`Published to ${network} 🚀`, {
        description: result.url
          ? `Your post is live. Use View on ${network} to see it.`
          : `Your post is live on ${network}.`,
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

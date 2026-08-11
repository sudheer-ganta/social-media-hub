import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { scheduledPostsService } from "@/services";
import type { ScheduleInput } from "@/services/scheduled-posts.service";
import { postKeys, dashboardKeys } from "./usePosts";
import type { ScheduledPost } from "@/types";

export const scheduleKeys = {
  all: ["scheduled-posts"] as const,
  list: () => [...scheduleKeys.all, "list"] as const,
  detail: (id: string) => [...scheduleKeys.all, "detail", id] as const,
};

/**
 * Every scheduled post, soonest first.
 *
 * Polled, unlike almost everything else in this app. A scheduled publish is the
 * one thing that changes with nobody looking — a post fires at 09:30 whether or
 * not the tab is open, and a list that only updated on navigation would show
 * "Scheduled" for a post that went out ten minutes ago. Sixty seconds is well
 * inside the scheduler's own thirty-second tick and costs one indexed query.
 */
export function useScheduledPosts() {
  return useQuery({
    queryKey: scheduleKeys.list(),
    queryFn: scheduledPostsService.listScheduledPosts,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Everything a schedule write invalidates: the list, and the posts it mirrors. */
function useScheduleInvalidation() {
  const queryClient = useQueryClient();

  return (result?: ScheduledPost) => {
    queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    // The post row's own status changed server-side, so the Library, the
    // calendar and the Flow Rail counts are all stale.
    queryClient.invalidateQueries({ queryKey: postKeys.all });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    if (result) {
      queryClient.setQueryData(scheduleKeys.detail(result.id), result);
    }
  };
}

/**
 * Arms a saved post to publish later.
 *
 * Deliberately does not toast on success — the composer says what happened in
 * context and then navigates, and a toast on top of that is noise. Failures do
 * toast, because the composer may not be able to place every error on a field.
 */
export function useSchedulePost() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: (input: ScheduleInput) =>
      scheduledPostsService.schedulePost(input),
    onSuccess: invalidate,
  });
}

export function useCancelSchedule() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: (id: string) => scheduledPostsService.cancelScheduledPost(id),
    onSuccess: (result) => {
      invalidate(result);
      toast.success("Schedule cancelled", {
        description: "The post is still in your library.",
      });
    },
    onError: (error: Error) =>
      toast.error("Couldn't cancel", { description: error.message }),
  });
}

/**
 * Re-arms one network that failed.
 *
 * Per network, never per post: the ones that published are live on someone's
 * feed and must not be sent again. The backend refuses a destination that is
 * not FAILED for the same reason.
 */
export function useRetryDestination() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: ({ id, provider }: { id: string; provider: string }) =>
      scheduledPostsService.retryDestination(id, provider),
    onSuccess: (result) => {
      invalidate(result);
      toast.success("Retrying", {
        description: "It will go out within the next minute.",
      });
    },
    onError: (error: Error) =>
      toast.error("Couldn't retry", { description: error.message }),
  });
}

export function useDeleteSchedule() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: (id: string) => scheduledPostsService.deleteScheduledPost(id),
    onSuccess: () => {
      invalidate();
      toast.success("Removed from the schedule");
    },
    onError: (error: Error) =>
      toast.error("Couldn't remove", { description: error.message }),
  });
}

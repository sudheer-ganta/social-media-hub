import { useQuery } from "@tanstack/react-query";
import { postsService } from "@/services";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => postsService.stats(),
  });
}

export function useRecentPosts(limit = 5) {
  return useQuery({
    queryKey: ["dashboard", "recent", limit],
    queryFn: () => postsService.recent(limit),
  });
}

export function useUpcomingPosts(limit = 5) {
  return useQuery({
    queryKey: ["dashboard", "upcoming", limit],
    queryFn: () => postsService.upcoming(limit),
  });
}

export function useActivityPosts(days = 14) {
  return useQuery({
    queryKey: ["dashboard", "activity", days],
    queryFn: () => postsService.activity(days),
  });
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { analyticsService } from "@/services";
import { formatRelative } from "@/components/analytics/insights";
import type { ReportingDays } from "@/services/analytics.service";
import type { AccountContext } from "@/constants/integrations";

/**
 * The Analytics page's numbers, from the API that knows them.
 *
 * One hook for the whole page on purpose. "Posts Published" and the platform mix
 * have to agree — a page showing zero published beside a chart of nine
 * publications is the bug this replaced — and the surest way to keep numbers
 * consistent is to have one thing fetch them under one eligibility rule, rather
 * than each component deriving its own.
 *
 * Keyed by context *and* period so Personal, each brand and each date range
 * cache separately. The context is also enforced server-side; this key only
 * stops one context's answer being shown under another's heading while a
 * refetch is in flight.
 */
export const analyticsKeys = {
  summary: (context: AccountContext, days: ReportingDays) =>
    [
      "analytics",
      "summary",
      context.contextType,
      context.brandId,
      days,
    ] as const,
  post: (context: AccountContext, postId: string) =>
    ["analytics", "post", context.contextType, context.brandId, postId] as const,
};

export function useAnalyticsSummary(
  context: AccountContext,
  days: ReportingDays = null,
) {
  return useQuery({
    queryKey: analyticsKeys.summary(context, days),
    queryFn: async () => {
      // Together rather than in five hooks: they are one answer at several
      // grains, and fetching them separately would let the cards, the drill-down
      // and the format table render from different moments.
      //
      // The two dimensions are deliberately not shared. Overview and platform
      // take the reporting period the member picked; format and the post feed
      // take the intelligence window, because "what is working lately" is a
      // question about the last N posts and not the last N days.
      const [overview, platforms, posts, mediaTypes, connections] =
        await Promise.all([
          analyticsService.fetchOverview(context, days),
          analyticsService.fetchByPlatform(context, days),
          analyticsService.fetchPosts(context),
          analyticsService.fetchByMediaType(context),
          analyticsService.fetchSyncStatus(context),
        ]);
      return { overview, platforms, posts, mediaTypes, connections };
    },
    // Kept while a period or context switch resolves, so the page dims rather
    // than collapsing to skeletons the member has already read past.
    placeholderData: (previous) => previous,
  });
}

/**
 * One post's full performance, fetched only when a member opens it.
 *
 * Separate from the summary because it is a different question at a different
 * grain — and because it is lifetime, where the summary is windowed. `enabled`
 * keeps it from firing until a post is actually selected, so opening the
 * Analytics page costs one request rather than one per post on screen.
 */
export function usePostPerformance(
  context: AccountContext,
  postId: string | null,
) {
  return useQuery({
    queryKey: analyticsKeys.post(context, postId ?? ""),
    queryFn: () => analyticsService.fetchPostDetail(context, postId!),
    enabled: Boolean(postId),
  });
}

/**
 * How long the manual refresh stays disabled after a run.
 *
 * Not politeness. Every sync spends metered third-party requests — X charges per
 * post read — and a button a member can hold down is a way to burn a rate limit
 * on data that has not changed. The background sweep is the normal path; this is
 * an override, and an override that can be repeated ten times a second is not one.
 */
export const REFRESH_COOLDOWN_MS = 30_000;

/**
 * Manual "collect now", with the cooldown that keeps it from being a hammer.
 *
 * The browser never calls a provider. This asks FlowPost's backend to collect,
 * and then re-reads what the backend stored — which is the only data path the
 * page has, refresh or no refresh.
 */
export function useAnalyticsRefresh(context: AccountContext) {
  const queryClient = useQueryClient();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, forceRender] = useState(0);

  const mutation = useMutation({
    mutationFn: () => analyticsService.syncNow(context),
    onSuccess: async () => {
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      // Every analytics read for every period, because a sync writes snapshots
      // that any of them may now include.
      await queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error: Error) => {
      // Still cool down. A failure that can be retried instantly is a failure
      // that will be retried in a loop.
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      toast.error(error.message || "Couldn't refresh just now.");
    },
  });

  // One timer that re-renders when the cooldown lapses, so the button
  // re-enables itself rather than waiting for the next unrelated render.
  useEffect(() => {
    if (cooldownUntil === 0) return;
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => forceRender((n) => n + 1), remaining);
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  const coolingDown = Date.now() < cooldownUntil;

  return {
    refresh: mutation.mutate,
    refreshing: mutation.isPending,
    /** True while either running or inside the cooldown. Disables the control. */
    disabled: mutation.isPending || coolingDown,
    coolingDown,
  };
}

/**
 * A timestamp as a member reads it, re-rendered as it ages.
 *
 * "Updated 4 min ago" that still says 4 an hour later is worse than no
 * timestamp: it is a freshness claim that has gone stale, on a page whose entire
 * job is to say how fresh things are. The interval is a minute because that is
 * the resolution shown.
 */
export function useRelativeTime(iso: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return formatRelative(iso, now);
}

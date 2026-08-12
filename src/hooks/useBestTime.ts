import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/services/analytics.service";
import type { AccountContext } from "@/constants/integrations";
import type { BestTimeResult } from "@/services/analytics.service";

/**
 * When this account's own posts have performed best.
 *
 * ─── Why the context is in the key ───────────────────────────────────────────
 * Personal and each Brand have entirely separate timing. A member's personal
 * Instagram evening says nothing about Brand A's, and caching them under one key
 * would show one context's answer in the other's composer — which is both wrong
 * and the sort of wrong that looks plausible. The context is therefore part of
 * the key, as it is in `useAnalyticsSummary`.
 *
 * The platforms and the format are in the key too: they change the answer, not
 * just its presentation.
 *
 * ─── It must never block the composer ────────────────────────────────────────
 * `retry: false` and no suspense. A member composing a post while this endpoint
 * is down should see the panel absent, not a spinner that never resolves and
 * certainly not an error. Scheduling works whether or not this answers, which is
 * the whole contract: the recommendation is an enhancement to a scheduler that
 * already works by itself.
 */
export const bestTimeKeys = {
  all: ["best-time"] as const,
  scope: (
    context: AccountContext,
    platforms: readonly string[],
    format: string | null,
  ) =>
    [
      "best-time",
      context.contextType,
      context.brandId ?? "personal",
      // Sorted so ["x","instagram"] and ["instagram","x"] are one cache entry —
      // the answer does not depend on the order they were ticked in.
      [...platforms].sort().join(","),
      format ?? "any",
    ] as const,
};

export interface UseBestTimeOptions {
  /** Networks to answer for. Empty asks about every network with history. */
  platforms?: readonly string[];
  /** The content type being planned, e.g. `REEL`. */
  format?: string | null;
  /**
   * The zone the member is scheduling in, from the composer's own picker.
   *
   * Sent as a hint. The server validates it and prefers it over the zone the
   * member's history recorded, because it is the clock the recommendation will
   * actually be applied on.
   */
  timezone?: string | null;
  enabled?: boolean;
}

export function useBestTime(
  context: AccountContext,
  options: UseBestTimeOptions = {},
) {
  const { platforms = [], format = null, timezone = null, enabled = true } = options;

  const query = useQuery<BestTimeResult>({
    queryKey: bestTimeKeys.scope(context, platforms, format),
    queryFn: () =>
      analyticsService.fetchBestTime(context, { platforms, format, timezone }),
    enabled,
    // The underlying evidence is every publication ever measured, which moves
    // when a sync lands — hours, not seconds. Re-asking on every focus would
    // spend a lifetime query to get the same answer back.
    staleTime: 10 * 60_000,
    // One failure and it stays quiet. See the note above: an absent panel is a
    // better outcome here than a retry loop behind a composer.
    retry: false,
  });

  return {
    result: query.data ?? null,
    isLoading: query.isLoading,
    /** True when the endpoint failed. The panel renders nothing rather than an error. */
    isError: query.isError,
  };
}

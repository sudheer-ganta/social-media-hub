import type {
  AnalyticsOverview,
  MediaTypeBreakdownEntry,
  MetricTotal,
  PlatformBreakdownEntry,
  PostPerformanceRow,
  SyncStatusEntry,
} from "@/services/analytics.service";

/**
 * Builders for the analytics API's shapes, shared by every test on this page.
 *
 * One file rather than a builder per test, because the shapes are wide and the
 * defaults are load-bearing: a fixture that quietly defaults a metric to `0`
 * instead of leaving it absent would make every "null is not zero" test pass
 * against data that never occurs. The defaults here are the *empty* case —
 * nothing measured — so a test has to opt into a number in order to assert on
 * one.
 */

/** A metric the API reported. `reported` is what makes it real, not `value`. */
export function metric(value: number | null, reported = value === null ? 0 : 1): MetricTotal {
  return { value, reported, total: Math.max(reported, 1) };
}

export function overview(
  patch: Partial<AnalyticsOverview> = {},
): AnalyticsOverview {
  return {
    postsPublished: 0,
    publications: 0,
    coverage: { publications: 0, measured: 0 },
    totals: {},
    engagementRate: null,
    audience: [],
    ...patch,
  };
}

export function platform(
  patch: Partial<PlatformBreakdownEntry> & { provider: string },
): PlatformBreakdownEntry {
  return {
    publications: 1,
    coverage: { publications: 1, measured: 0 },
    engagementRate: null,
    totals: {},
    exposureMetric: null,
    exposureLabel: null,
    ...patch,
  };
}

export function post(
  patch: Partial<PostPerformanceRow> = {},
): PostPerformanceRow {
  return {
    postId: "post-1",
    postPlatformId: "pp-1",
    provider: "instagram",
    permalink: null,
    publishedAt: "2026-08-12T06:00:00.000Z",
    mediaType: "IMAGE",
    mediaTypeConfirmed: false,
    title: "fun",
    caption: "a caption",
    metrics: {},
    engagement: null,
    engagementRate: null,
    measured: false,
    lastCapturedAt: null,
    exposure: { metric: null, label: null, value: null },
    reportsMetrics: [],
    thumbnailUrl: null,
    mediaShape: "Image",
    ...patch,
  };
}

export function mediaType(
  patch: Partial<MediaTypeBreakdownEntry> & { mediaType: string | null },
): MediaTypeBreakdownEntry {
  return {
    publications: 1,
    coverage: { publications: 1, measured: 0 },
    totals: {},
    engagementRate: null,
    averageEngagement: null,
    confirmed: 0,
    inferred: 1,
    strongSignal: false,
    ...patch,
  };
}

export function connection(
  patch: Partial<SyncStatusEntry> & { provider: string },
): SyncStatusEntry {
  return {
    socialAccountId: `acc-${patch.provider}`,
    displayName: null,
    username: null,
    status: "connected",
    analyticsSupported: true,
    analyticsEnabled: true,
    missingScopes: [],
    lastSyncAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    lastError: null,
    ...patch,
  };
}

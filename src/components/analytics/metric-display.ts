import type {
  PublicationPerformance,
  PostPerformanceRow,
} from "@/services/analytics.service";

/**
 * How a metric becomes text, and the four states that must never look alike.
 *
 * ─── The rule ────────────────────────────────────────────────────────────────
 *
 *   7            the provider said 7
 *   0            the provider said 0 — a measurement, not a gap
 *   —            the provider does not report this metric, ever
 *   Collecting   published, readable, nothing observed yet
 *
 * `null !== 0` is the whole contract, and it survives all the way from the
 * adapter to this file. Rendering an unreported metric as `0` is the single
 * easiest way to make every average on the page wrong while looking correct,
 * because a zero enters a mean and a null does not.
 *
 * The last two are the pair most often collapsed, and they are the most
 * different: "—" is permanent and "Collecting" resolves on its own. A member
 * who sees "—" on a metric that is about to arrive stops trusting the page; one
 * who sees a spinner on a metric that will never arrive waits forever.
 */

/** What a single metric cell should render. */
export type MetricCell =
  | { kind: "value"; text: string; value: number }
  | { kind: "unreported" }
  | { kind: "collecting" };

/**
 * Formats one metric for one publication.
 *
 * Needs the publication rather than just the number, because the number alone
 * cannot distinguish the three null cases — that requires knowing whether this
 * network reports the metric at all, and whether anything has been observed.
 */
export function metricCell(
  publication: Pick<
    PublicationPerformance,
    "metrics" | "reportsMetrics" | "state"
  >,
  metric: string,
): MetricCell {
  // Permanent. X reports no unique reach; Instagram reports no impressions.
  // Neither is pending and neither will ever arrive.
  if (!publication.reportsMetrics.includes(metric)) {
    return { kind: "unreported" };
  }

  const value = publication.metrics[metric];

  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "value", text: formatCount(value), value };
  }

  // The network reports it and we have not read it yet. Resolves on its own.
  if (publication.state === "collecting") return { kind: "collecting" };

  // Observed, and this metric was absent from the response.
  return { kind: "unreported" };
}

/** The text for a cell. "—" for anything not measured. */
export function metricText(cell: MetricCell): string {
  if (cell.kind === "value") return cell.text;
  if (cell.kind === "collecting") return "…";
  return "—";
}

/** "1,842", "12.4k", "1.2M" — counts as a person reads them. */
export function formatCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

/** "6.8%", or "—" when the rate could not be computed from real numbers. */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * What to say about a publication with no numbers.
 *
 * Never "0 engagement". A post nobody has measured and a post nobody engaged
 * with are different facts, and only one of them is about the post.
 */
export function stateLabel(state: PublicationPerformance["state"]): string {
  if (state === "collecting") return "Collecting performance data";
  if (state === "unavailable") return "Analytics unavailable for this account";
  return "";
}

/**
 * The metrics worth showing for one publication, in a stable order.
 *
 * Filtered to what this network actually reports, so a card does not carry four
 * dashes for metrics that were never coming. Exposure is handled separately —
 * it gets its own label because reach and impressions are not interchangeable.
 */
const ENGAGEMENT_METRICS = [
  "likes",
  "comments",
  "shares",
  "reposts",
  "saves",
  "clicks",
] as const;

export function engagementMetricsFor(
  publication: Pick<PublicationPerformance, "reportsMetrics">,
): string[] {
  return ENGAGEMENT_METRICS.filter((metric) =>
    publication.reportsMetrics.includes(metric),
  );
}

/** "Likes", "Comments", "Reposts" — the member's word for each column. */
export const METRIC_LABELS: Record<string, string> = {
  impressions: "Impressions",
  reach: "Reach",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  reposts: "Reposts",
  saves: "Saves",
  clicks: "Clicks",
  videoViews: "Video views",
  watchTimeMs: "Watch time",
};

/**
 * How a media-type bucket should be introduced.
 *
 * Below the sample threshold the backend sets `strongSignal: false`, and the
 * language has to change with it: "Early signal" invites a look, where "your
 * audience prefers Reels" is a claim four posts cannot support.
 */
export function signalLabel(strongSignal: boolean): string {
  return strongSignal ? "" : "Early signal";
}

/**
 * Groups the publication feed back into content items.
 *
 * The feed is one row per (post × network) because that is the grain metrics
 * live at. "Top posts" is a question about *content*, so the rows are regrouped
 * here rather than the API returning a second pre-grouped shape.
 *
 * Ordered by total engagement across networks, with unmeasured content last —
 * a post nobody has read yet is not a post that did badly, and it must not sort
 * as though it were.
 */
export interface ContentRow {
  postId: string;
  title: string;
  caption: string;
  publishedAt: string | null;
  providers: string[];
  mediaType: string | null;
  mediaTypeConfirmed: boolean;
  /** Null when no network reported anything. Never 0 in that case. */
  engagement: number | null;
  measured: boolean;
}

export function groupByPost(rows: PostPerformanceRow[]): ContentRow[] {
  const byPost = new Map<string, PostPerformanceRow[]>();
  for (const row of rows) {
    const existing = byPost.get(row.postId);
    if (existing) existing.push(row);
    else byPost.set(row.postId, [row]);
  }

  return [...byPost.values()]
    .map((group) => {
      const first = group[0]!;
      const measuredRows = group.filter((row) => row.measured);
      const engagements = group
        .map((row) => row.engagement)
        .filter((value): value is number => typeof value === "number");

      // A confirmed format anywhere wins over an inferred one everywhere.
      const confirmed = group.find((row) => row.mediaTypeConfirmed);

      return {
        postId: first.postId,
        title: first.title,
        caption: first.caption,
        publishedAt:
          group
            .map((row) => row.publishedAt)
            .filter(Boolean)
            .sort()[0] ?? null,
        providers: [...new Set(group.map((row) => row.provider))],
        mediaType: (confirmed ?? first).mediaType,
        mediaTypeConfirmed: Boolean(confirmed),
        engagement: engagements.length > 0 ? sum(engagements) : null,
        measured: measuredRows.length > 0,
      };
    })
    .sort((a, b) => {
      // Unmeasured last, whatever their (absent) numbers.
      if (a.measured !== b.measured) return a.measured ? -1 : 1;
      return (b.engagement ?? 0) - (a.engagement ?? 0);
    });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

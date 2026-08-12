import { describe, expect, it } from "vitest";
import {
  engagementMetricsFor,
  formatRate,
  groupByPost,
  metricCell,
  metricText,
} from "./metric-display";
import { post } from "./fixtures";
import type { PostPerformanceRow } from "@/services/analytics.service";

/**
 * The four states a metric can be in, and why they must never render alike.
 *
 *   7            the provider said 7
 *   0            the provider said 0 — a measurement, not a gap
 *   —            the provider does not report this metric, ever
 *   …            published and readable, nothing observed yet
 *
 * The last two are the pair most often collapsed and the most different: "—" is
 * permanent, "…" resolves on its own. A member who sees a dash on a metric that
 * is about to arrive stops trusting the page; one who sees a spinner on a
 * metric that will never arrive waits forever.
 *
 * Run: npx vitest run src/components/analytics/metric-display.test.ts
 */

function publication(overrides: Partial<Parameters<typeof metricCell>[0]> = {}) {
  return {
    metrics: {} as Record<string, number | null>,
    reportsMetrics: ["impressions", "likes", "comments"],
    state: "measured" as const,
    ...overrides,
  };
}

describe("metricCell", () => {
  it("renders a reported number", () => {
    const cell = metricCell(publication({ metrics: { likes: 7 } }), "likes");
    expect(cell).toMatchObject({ kind: "value", value: 7 });
    expect(metricText(cell)).toBe("7");
  });

  it("renders a reported zero as 0, not as unavailable", () => {
    // A genuine measurement of nothing.
    const cell = metricCell(publication({ metrics: { likes: 0 } }), "likes");
    expect(cell).toMatchObject({ kind: "value", value: 0 });
    expect(metricText(cell)).toBe("0");
  });

  it("renders a metric the network never reports as —", () => {
    // X reports no unique reach. Permanent, not pending.
    const cell = metricCell(publication({ state: "collecting" }), "reach");
    expect(cell.kind).toBe("unreported");
    expect(metricText(cell)).toBe("—");
  });

  it("renders a reportable-but-unobserved metric as collecting", () => {
    const cell = metricCell(publication({ state: "collecting" }), "likes");
    expect(cell.kind).toBe("collecting");
    expect(metricText(cell)).toBe("…");
  });

  it("renders a metric absent from an observed response as —", () => {
    // We looked, and the network sent nothing for it. Not pending.
    const cell = metricCell(
      publication({ state: "measured", metrics: { impressions: 5 } }),
      "likes",
    );
    expect(cell.kind).toBe("unreported");
  });

  it("never turns a null into a zero", () => {
    const cell = metricCell(publication({ metrics: { likes: null } }), "likes");
    expect(metricText(cell)).not.toBe("0");
  });
});

describe("engagementMetricsFor", () => {
  it("offers only the metrics a network reports", () => {
    // No row of dashes for figures that were never coming.
    expect(
      engagementMetricsFor({ reportsMetrics: ["likes", "comments", "saves"] }),
    ).toEqual(["likes", "comments", "saves"]);
  });

  it("omits everything for a network that reports nothing", () => {
    expect(engagementMetricsFor({ reportsMetrics: [] })).toEqual([]);
  });
});

describe("formatRate", () => {
  it("renders a real rate", () => {
    expect(formatRate(0.068)).toBe("6.8%");
  });

  it("renders an uncomputable rate as —, never 0%", () => {
    // 0% reads as "nobody engaged"; the truth is "we cannot compute this".
    expect(formatRate(null)).toBe("—");
  });
});

describe("groupByPost", () => {
  // The shared builder's defaults are the *unmeasured* case, which is the one
  // most tests here want to opt out of rather than into.
  function row(overrides: Partial<PostPerformanceRow> = {}): PostPerformanceRow {
    return post({
      title: "corporate drama",
      engagement: 10,
      measured: true,
      lastCapturedAt: "2026-08-12T07:00:00.000Z",
      ...overrides,
    });
  }

  it("collapses one post's publications into one content row", () => {
    const [content] = groupByPost([
      row({ provider: "instagram", postPlatformId: "a", engagement: 10 }),
      row({ provider: "linkedin", postPlatformId: "b", engagement: 5 }),
      row({ provider: "facebook", postPlatformId: "c", engagement: 2 }),
    ]);

    // One piece of content, three badges — not three competing rows.
    expect(content.postId).toBe("post-1");
    expect(content.providers).toEqual(["instagram", "linkedin", "facebook"]);
    expect(content.engagement).toBe(17);
  });

  it("prefers a platform-confirmed format over an inferred one", () => {
    const [content] = groupByPost([
      row({ postPlatformId: "a", mediaType: "VIDEO", mediaTypeConfirmed: false }),
      row({
        postPlatformId: "b",
        provider: "instagram",
        mediaType: "REEL",
        mediaTypeConfirmed: true,
      }),
    ]);

    // Instagram's word beats our inference, and the row says which it is.
    expect(content.mediaType).toBe("REEL");
    expect(content.mediaTypeConfirmed).toBe(true);
  });

  it("keeps engagement null when nothing reported any", () => {
    const [content] = groupByPost([
      row({ engagement: null, measured: false }),
      row({ postPlatformId: "b", provider: "linkedin", engagement: null, measured: false }),
    ]);

    // Not 0 — nothing has been measured, which is a different fact.
    expect(content.engagement).toBeNull();
    expect(content.measured).toBe(false);
  });

  it("sorts unmeasured content last rather than lowest", () => {
    const rows = groupByPost([
      row({ postId: "measured-low", postPlatformId: "a", engagement: 1 }),
      row({
        postId: "unmeasured",
        postPlatformId: "b",
        engagement: null,
        measured: false,
      }),
      row({ postId: "measured-high", postPlatformId: "c", engagement: 99 }),
    ]);

    // "We have not looked" must not present as "it did badly".
    expect(rows.map((r) => r.postId)).toEqual([
      "measured-high",
      "measured-low",
      "unmeasured",
    ]);
  });

  it("keeps different posts apart", () => {
    const rows = groupByPost([
      row({ postId: "a", postPlatformId: "1" }),
      row({ postId: "b", postPlatformId: "2" }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

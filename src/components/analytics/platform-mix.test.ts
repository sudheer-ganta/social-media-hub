import { describe, expect, it } from "vitest";
import { buildPlatformSeries } from "./AnalyticsCharts";
import { overviewCards } from "./insights";
import { overview, platform } from "./fixtures";
import type { PlatformBreakdownEntry } from "@/services/analytics.service";

/**
 * The Analytics page reports what published, and never what was intended.
 *
 * ─── The bug ─────────────────────────────────────────────────────────────────
 *
 * "Posts Published: 0" rendered beside "LinkedIn 3, Instagram 3, Facebook 2,
 * X 1". Two different wrong rules, side by side:
 *
 *   • the card counted `post.status === 'published'` — a whole-post workspace
 *     status that goes to FAILED when any one destination fails;
 *   • the chart counted `post.platforms` — the destinations ticked in the
 *     composer, a list with no status on it at all.
 *
 * Neither component may derive a publication count from a post row again. Both
 * now render what the API reports, under one server-side rule. These tests fail
 * if either goes back to counting locally.
 *
 * Run: npx vitest run src/components/analytics/platform-mix.test.ts
 */

function entry(provider: string, publications: number): PlatformBreakdownEntry {
  return platform({
    provider,
    publications,
    coverage: { publications, measured: 0 },
  });
}

/** The published card, as the page renders it. */
function publishedCard(postsPublished: number, publications: number) {
  return overviewCards(
    overview({ postsPublished, publications }),
    [],
    [],
  ).find((card) => card.key === "published")!;
}

describe("platform mix", () => {
  it("renders one slice per network that actually published", () => {
    const series = buildPlatformSeries([
      entry("linkedin", 1),
      entry("instagram", 1),
      entry("facebook", 1),
    ]);

    expect(series.map((s) => s.name)).toEqual([
      "LinkedIn",
      "Instagram",
      "Facebook",
    ]);
    expect(series.every((s) => s.value === 1)).toBe(true);
  });

  it("is empty when nothing has published", () => {
    // The API returns no entry for a network with no successful publication —
    // failed, pending and draft destinations never reach this function at all.
    expect(buildPlatformSeries([])).toEqual([]);
  });

  it("drops a network the API reports with zero publications", () => {
    expect(buildPlatformSeries([entry("x", 0)])).toEqual([]);
  });

  it("renders an unknown provider under its own id rather than dropping it", () => {
    // PLATFORMS is a label-and-colour lookup, not a filter. A publication we
    // have no glyph for is still a publication.
    const [slice] = buildPlatformSeries([entry("youtube", 2)]);

    expect(slice.name).toBe("youtube");
    expect(slice.value).toBe(2);
    expect(slice.color).toBeTruthy();
  });

  it("takes its counts from the API verbatim", () => {
    // Not recomputed, not re-filtered. If the number is wrong the fix belongs
    // in the repository, which is where the rule lives.
    expect(buildPlatformSeries([entry("linkedin", 7)])[0].value).toBe(7);
  });
});

describe("posts published", () => {
  it("reports the API's count of distinct published posts", () => {
    // The production case: one post that reached three networks and failed on a
    // fourth. Its workspace status is FAILED; it published, and counts.
    expect(publishedCard(1, 3).value).toBe(1);
  });

  it("keeps the two grains distinct", () => {
    // One piece of content, three platform results. Both true, and the card
    // says both so that neither looks like an error.
    const card = publishedCard(1, 3);

    expect(card.value).toBe(1);
    expect(card.lines.join(" ")).toContain("3 platform publications");
  });

  it("reads null, not zero, before the API has answered", () => {
    // "—" while loading. A hard 0 would state that nothing published, which is
    // a claim we cannot make until the answer arrives.
    const card = overviewCards(undefined, [], []).find(
      (c) => c.key === "published",
    )!;

    expect(card.value).toBeNull();
  });

  it("does not fabricate engagement, reach, clicks or growth", () => {
    // Nothing synced yet: null all the way through, never estimated from post
    // volume the way these cards once were.
    const cards = overviewCards(overview({ postsPublished: 1, publications: 3 }), [], []);

    for (const key of ["engagement", "reach", "clicks", "growth"] as const) {
      expect(cards.find((card) => card.key === key)!.value).toBeNull();
    }
  });
});

describe("the cards and the chart cannot disagree", () => {
  it.each([
    ["nothing published", 0, 0, [] as PlatformBreakdownEntry[]],
    [
      "one post, three networks",
      1,
      3,
      [entry("linkedin", 1), entry("instagram", 1), entry("facebook", 1)],
    ],
    ["one post, one network", 1, 1, [entry("x", 1)]],
  ])("%s", (_name, postsPublished, publications, platforms) => {
    const series = buildPlatformSeries(platforms);

    // The invariant the page broke: a non-empty mix implies published posts,
    // and an empty mix implies none.
    expect(series.length > 0).toBe(postsPublished > 0);

    // And the slices sum to the publication count the card reports.
    const sliceTotal = series.reduce((sum, slice) => sum + slice.value, 0);
    expect(sliceTotal).toBe(publications);
    expect(publishedCard(postsPublished, publications).value).toBe(
      postsPublished,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  attentionState,
  confidenceFor,
  connectionState,
  engagementByContentType,
  engagementByKind,
  engagementByPlatform,
  exposureTotal,
  formatRelative,
  formatRows,
  lastUpdatedAt,
  netFollowerChange,
  overviewCards,
  topPosts,
  visibilityByPlatform,
  whatsWorking,
  type CardKey,
} from "./insights";
import {
  connection,
  mediaType,
  metric,
  overview,
  platform,
  post,
} from "./fixtures";

/**
 * What the Analytics page is allowed to claim.
 *
 * ─── Why these tests are the important ones ──────────────────────────────────
 *
 * This page now draws conclusions — "your strongest format", "everything is up
 * to date", "7 total interactions" — and a stated conclusion is trusted in a way
 * a table of numbers is not. Every one of those sentences comes out of
 * `insights.ts`, so this file is where the product's honesty is actually
 * enforced.
 *
 * Three properties are asserted over and over, deliberately:
 *
 *   • **null ≠ 0.** A metric nobody reported is absent. A zero enters an average
 *     and an absence does not, so collapsing them makes every rate on the page
 *     wrong while looking right.
 *   • **No fabrication.** No benchmark, no estimate, no projection, no growth
 *     inferred from post volume. If it was not measured, it is not a number.
 *   • **Sample size governs language.** Two measured posts and twenty produce
 *     the same headline unless something says otherwise; that something is here.
 *
 * Run: npx vitest run src/components/analytics/insights.test.ts
 */

function card(cards: ReturnType<typeof overviewCards>, key: CardKey) {
  return cards.find((entry) => entry.key === key)!;
}

// ─── Overview cards ──────────────────────────────────────────────────────────

describe("overview cards", () => {
  it("shows total interactions, not just likes", () => {
    // The card used to read `totals.likes` and label it "Engagement", so a post
    // with 3 likes, 1 comment and 3 clicks reported "3".
    const cards = overviewCards(
      overview({
        totals: {
          engagement: metric(7, 2),
          likes: metric(3, 2),
          comments: metric(1, 1),
          clicks: metric(3, 1),
        },
      }),
      [],
      [],
    );

    expect(card(cards, "engagement").value).toBe(7);
    expect(card(cards, "engagement").unit).toBe("total interactions");
  });

  it("spells out what the interactions were", () => {
    const cards = overviewCards(
      overview({
        totals: {
          engagement: metric(4, 1),
          likes: metric(3, 1),
          comments: metric(1, 1),
        },
      }),
      [platform({ provider: "instagram", totals: { engagement: metric(4, 1) } })],
      [],
    );

    const lines = card(cards, "engagement").lines.join(" | ");
    expect(lines).toContain("3 likes");
    expect(lines).toContain("1 comment");
    expect(lines).toContain("Across 1 platform");
  });

  it("omits an interaction kind nothing reported, rather than showing it as 0", () => {
    const cards = overviewCards(
      overview({ totals: { engagement: metric(3, 1), likes: metric(3, 1) } }),
      [],
      [],
    );

    // Shares were never reported. "0 shares" would claim we looked and found
    // none, which is a different fact from not having looked.
    expect(card(cards, "engagement").lines.join(" ")).not.toContain("share");
  });

  it("labels the exposure card by what actually contributed to it", () => {
    const reachOnly = exposureTotal([
      platform({
        provider: "instagram",
        exposureMetric: "reach",
        exposureLabel: "Reach",
        totals: { reach: metric(19, 1) },
      }),
    ]);
    expect(reachOnly).toEqual({ value: 19, label: "Reach", mixed: false });

    // Instagram reach plus LinkedIn impressions is genuinely two measurements
    // added together, and the label has to say so.
    const mixed = exposureTotal([
      platform({
        provider: "instagram",
        exposureMetric: "reach",
        exposureLabel: "Reach",
        totals: { reach: metric(19, 1) },
      }),
      platform({
        provider: "linkedin",
        exposureMetric: "impressions",
        exposureLabel: "Impressions",
        totals: { impressions: metric(7, 1) },
      }),
    ]);
    expect(mixed.value).toBe(26);
    expect(mixed.label).toBe("Reach / Impressions");
    expect(mixed.mixed).toBe(true);
  });

  it("counts one figure per network, never two of the same post's audience", () => {
    // Instagram reports reach *and* views for the same post. Adding both would
    // count one post's audience twice and produce a headline larger than
    // anything that happened.
    const total = exposureTotal([
      platform({
        provider: "instagram",
        exposureMetric: "reach",
        exposureLabel: "Reach",
        totals: { reach: metric(19, 1), views: metric(52, 1) },
      }),
    ]);

    expect(total.value).toBe(19);
    expect(total.mixed).toBe(false);
  });

  it("ignores a network that reports no exposure metric at all", () => {
    // Facebook has had none since Graph v26. It contributes nothing rather
    // than a zero, which would drag the label along with it.
    expect(
      exposureTotal([platform({ provider: "facebook", exposureMetric: null })]),
    ).toEqual({ value: null, label: "Reach / impressions", mixed: false });
  });

  it("warns when the exposure total mixes two measurements", () => {
    const cards = overviewCards(
      overview(),
      [
        platform({
          provider: "instagram",
          exposureMetric: "reach",
          exposureLabel: "Reach",
          totals: { reach: metric(19, 1) },
        }),
        platform({
          provider: "linkedin",
          exposureMetric: "impressions",
          exposureLabel: "Impressions",
          totals: { impressions: metric(7, 1) },
        }),
      ],
      [],
    );

    expect(card(cards, "reach").lines.join(" ")).toContain(
      "Reach counts people",
    );
  });

  it("reports no exposure as null with a label still in place", () => {
    const cards = overviewCards(overview(), [], []);

    expect(card(cards, "reach").value).toBeNull();
    expect(card(cards, "reach").label).toBe("Reach / impressions");
  });

  it("does not invent growth from post volume", () => {
    const cards = overviewCards(
      overview({ postsPublished: 12, publications: 30 }),
      [],
      [],
    );

    expect(card(cards, "growth").value).toBeNull();
    expect(card(cards, "growth").emptyCopy).toBe("Not enough history yet.");
  });

  it("sums follows gained, and only where both ends of the series exist", () => {
    expect(
      netFollowerChange([
        {
          provider: "instagram",
          providerAccountId: "1",
          followers: 120,
          capturedAt: null,
          firstFollowers: 108,
          firstCapturedAt: null,
          change: 12,
          changeRate: 0.11,
        },
        {
          // Observed once. A count, not growth — and never a change of 0.
          provider: "x",
          providerAccountId: "2",
          followers: 40,
          capturedAt: null,
          firstFollowers: null,
          firstCapturedAt: null,
          change: null,
          changeRate: null,
        },
      ]),
    ).toBe(12);

    expect(netFollowerChange([])).toBeNull();
  });

  it("says clicks are unavailable rather than pending when nothing reports them", () => {
    const cards = overviewCards(
      overview(),
      [platform({ provider: "instagram" })],
      [connection({ provider: "instagram" })],
    );

    // Instagram never reports link clicks. "Collecting" would promise an
    // arrival that is not coming.
    expect(card(cards, "clicks").value).toBeNull();
    expect(card(cards, "clicks").state).toBe("unavailable");
  });

  it("asks for a permission rather than showing a spinner when nothing is readable", () => {
    const cards = overviewCards(
      overview(),
      [],
      [connection({ provider: "facebook", analyticsEnabled: false })],
    );

    expect(card(cards, "engagement").state).toBe("permission_required");
  });
});

// ─── Connection states ───────────────────────────────────────────────────────

describe("connection state", () => {
  it("separates the four reasons a number can be missing", () => {
    expect(
      connectionState(connection({ provider: "x", analyticsSupported: false })),
    ).toBe("unavailable");

    expect(
      connectionState(
        connection({ provider: "facebook", analyticsEnabled: false }),
      ),
    ).toBe("permission_required");

    expect(
      connectionState(
        connection({
          provider: "linkedin",
          consecutiveFailures: 2,
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
      ),
    ).toBe("failed");

    // Readable, never read. Resolves on its own — the one state that is a wait.
    expect(connectionState(connection({ provider: "instagram" }))).toBe(
      "collecting",
    );

    expect(
      connectionState(
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
      ),
    ).toBe("live");
  });
});

// ─── Breakdowns ──────────────────────────────────────────────────────────────

describe("engagement breakdown", () => {
  it("lists only kinds something reported", () => {
    const rows = engagementByKind(
      overview({
        totals: {
          likes: metric(3, 2),
          comments: metric(1, 1),
          // Reported as a real zero: the network looked and there were none.
          shares: metric(0, 2),
        },
      }),
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Likes",
      "Comments",
      "Shares",
    ]);
    // A measured zero stays. It is a fact about the post.
    expect(rows.find((row) => row.label === "Shares")!.value).toBe(0);
    expect(rows.find((row) => row.label === "Saves")).toBeUndefined();
  });

  it("keeps an unmeasured platform in the list, carrying a state not a zero", () => {
    const rows = engagementByPlatform(
      [
        platform({
          provider: "instagram",
          totals: { engagement: metric(4, 1) },
        }),
        platform({ provider: "linkedin" }),
      ],
      [
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
        connection({ provider: "linkedin" }),
      ],
    );

    expect(rows[0]).toMatchObject({ label: "Instagram", value: 4, share: 1 });
    // Dropping it would make a platform we haven't read look like one that got
    // nothing; showing 0 would say the same thing louder.
    expect(rows[1]).toMatchObject({
      label: "LinkedIn",
      value: null,
      state: "collecting",
    });
  });

  it("groups interactions by content type from real engagement only", () => {
    const rows = engagementByContentType([
      post({ postId: "a", mediaType: "IMAGE", engagement: 4, measured: true }),
      post({ postId: "b", mediaType: "REEL", engagement: 2, measured: true }),
      post({ postId: "c", mediaType: "IMAGE", engagement: 1, measured: true }),
      // Unmeasured: contributes nothing rather than a zero.
      post({ postId: "d", mediaType: "CAROUSEL" }),
    ]);

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Image", 5],
      ["Reel", 2],
    ]);
  });
});

describe("visibility breakdown", () => {
  it("shows each network under its own metric name", () => {
    const rows = visibilityByPlatform(
      [
        platform({
          provider: "instagram",
          exposureMetric: "reach",
          exposureLabel: "Reach",
          totals: { reach: metric(19, 1) },
        }),
        platform({
          provider: "linkedin",
          exposureMetric: "impressions",
          exposureLabel: "Impressions",
        }),
      ],
      [
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
        connection({ provider: "linkedin" }),
      ],
    );

    expect(rows[0]).toMatchObject({
      label: "Instagram",
      value: 19,
      metricLabel: "Reach",
      state: "live",
    });
    // Published, readable, unread. Not a reach of zero.
    expect(rows[1]).toMatchObject({
      label: "LinkedIn",
      value: null,
      metricLabel: "Impressions",
      state: "collecting",
    });
  });

  it("includes a connected network with nothing published", () => {
    const rows = visibilityByPlatform(
      [platform({ provider: "instagram" })],
      [connection({ provider: "instagram" }), connection({ provider: "x" })],
    );

    // "You never posted here" and "this got no reach" are different answers.
    expect(rows.map((row) => row.provider)).toContain("x");
    expect(rows.find((row) => row.provider === "x")!.value).toBeNull();
  });

  it("calls a network that reports no exposure at all unavailable", () => {
    const [row] = visibilityByPlatform(
      [platform({ provider: "facebook", exposureMetric: null })],
      [connection({ provider: "facebook" })],
    );

    // Facebook has no exposure metric since Graph v26 — permanently, not
    // pending. A spinner here would never resolve.
    expect(row.state).toBe("unavailable");
  });
});

// ─── What's working ──────────────────────────────────────────────────────────

describe("what's working", () => {
  it("names the best post by rate, and says which network it was", () => {
    const [finding] = whatsWorking(
      [
        post({
          postId: "a",
          title: "fun",
          engagement: 4,
          engagementRate: 0.077,
          measured: true,
        }),
        post({
          postId: "b",
          title: "game indian",
          engagement: 9,
          engagementRate: 0.02,
          measured: true,
        }),
      ],
      [],
      [],
    );

    // Ranked by rate, not by raw interactions — the nine-interaction post
    // reached far more people to get them.
    expect(finding).toMatchObject({
      kind: "post",
      headline: "fun",
      postId: "a",
    });
    expect(finding.detail).toContain("7.7%");
    expect(finding.detail).toContain("Instagram");
  });

  it("falls back to interactions when no network reported exposure", () => {
    const [finding] = whatsWorking(
      [
        post({ postId: "a", title: "one", engagement: 2, measured: true }),
        post({ postId: "b", title: "two", engagement: 9, measured: true }),
      ],
      [],
      [],
    );

    expect(finding.headline).toBe("two");
    expect(finding.detail).toContain("9 interactions");
  });

  it("says nothing at all when nothing has been measured", () => {
    // Fewer findings rather than weaker ones. A page that always fills three
    // slots pads the third with a claim it cannot support.
    expect(whatsWorking([post({ postId: "a" })], [], [])).toEqual([]);
  });

  it("will not name a strongest format when there is only one format", () => {
    const findings = whatsWorking(
      [post({ postId: "a", engagement: 4, engagementRate: 0.05, measured: true })],
      [
        mediaType({
          mediaType: "IMAGE",
          engagementRate: 0.054,
          coverage: { publications: 8, measured: 6 },
        }),
      ],
      [],
    );

    // "Images are your strongest format" when images are your only format is
    // not a finding, it is a description of your posting habits.
    expect(findings.some((f) => f.kind === "format")).toBe(false);
  });

  it("downgrades a format claim the sample cannot support", () => {
    const findings = whatsWorking(
      [],
      [
        mediaType({
          mediaType: "REEL",
          engagementRate: 0.081,
          coverage: { publications: 4, measured: 2 },
          strongSignal: false,
        }),
        mediaType({
          mediaType: "IMAGE",
          engagementRate: 0.054,
          coverage: { publications: 8, measured: 6 },
          strongSignal: true,
        }),
      ],
      [],
    );

    const format = findings.find((f) => f.kind === "format")!;
    expect(format.headline).toBe("Reels");
    // Two measured Reels is a hint, and the wording has to be a hint too.
    expect(format.confidence).toBe("early");
  });

  it("ranks platforms by measured interactions, never by rate", () => {
    const findings = whatsWorking(
      [],
      [],
      [
        platform({
          provider: "instagram",
          coverage: { publications: 6, measured: 6 },
          engagementRate: 0.02,
          totals: { engagement: metric(40, 6) },
        }),
        platform({
          provider: "linkedin",
          coverage: { publications: 1, measured: 1 },
          engagementRate: 0.5,
          totals: { engagement: metric(3, 1) },
        }),
      ],
    );

    // LinkedIn's 50% comes from one post shown to six people. Two networks'
    // rates have different denominators over different audiences.
    const found = findings.find((f) => f.kind === "platform")!;
    expect(found.headline).toBe("Instagram");
  });

  it("does not call a single platform the strongest one", () => {
    const findings = whatsWorking(
      [],
      [],
      [
        platform({
          provider: "instagram",
          coverage: { publications: 2, measured: 2 },
          totals: { engagement: metric(7, 2) },
        }),
      ],
    );

    expect(findings.find((f) => f.kind === "platform")!.heading).toBe(
      "Where your engagement comes from",
    );
  });

  it("scales confidence with the measured sample", () => {
    expect(confidenceFor(2)).toBe("early");
    expect(confidenceFor(5)).toBe("emerging");
    expect(confidenceFor(12)).toBe("strong");
  });
});

// ─── Top posts ───────────────────────────────────────────────────────────────

describe("top posts", () => {
  it("collapses a post's publications into one row and keeps exposures apart", () => {
    const [row] = topPosts([
      post({
        postId: "a",
        postPlatformId: "1",
        provider: "instagram",
        engagement: 4,
        engagementRate: 0.077,
        measured: true,
        exposure: { metric: "reach", label: "Reach", value: 19 },
        thumbnailUrl: "https://example.test/a.jpg",
      }),
      post({
        postId: "a",
        postPlatformId: "2",
        provider: "linkedin",
        engagement: 3,
        engagementRate: 0.03,
        measured: true,
        exposure: { metric: "impressions", label: "Impressions", value: 100 },
      }),
    ]);

    expect(row.providers).toEqual(["instagram", "linkedin"]);
    expect(row.engagement).toBe(7);
    // Two measurements, two rows. Never 119 of anything.
    expect(row.exposures).toEqual([
      { provider: "instagram", label: "Reach", value: 19 },
      { provider: "linkedin", label: "Impressions", value: 100 },
    ]);
    expect(row.bestRate).toEqual({ provider: "instagram", rate: 0.077 });
    expect(row.thumbnailUrl).toBe("https://example.test/a.jpg");
  });

  it("names the measure it ranked by", () => {
    const [rated] = topPosts([
      post({ postId: "a", engagement: 4, engagementRate: 0.07, measured: true }),
    ]);
    expect(rated.rankedBy).toBe("rate");

    const [counted] = topPosts([
      post({ postId: "b", engagement: 4, measured: true }),
    ]);
    expect(counted.rankedBy).toBe("interactions");
  });

  it("sorts unmeasured content last and labels it, rather than lowest", () => {
    const rows = topPosts([
      post({ postId: "pending", title: "pending" }),
      post({
        postId: "measured",
        title: "measured",
        engagement: 1,
        measured: true,
      }),
    ]);

    // A post nobody has read yet is not a post that did badly.
    expect(rows.map((row) => row.postId)).toEqual(["measured", "pending"]);
    expect(rows[1].rankedBy).toBe("unmeasured");
    expect(rows[1].engagement).toBeNull();
  });
});

// ─── Content format table ────────────────────────────────────────────────────

describe("format rows", () => {
  it("shows published and measured counts separately", () => {
    const [row] = formatRows([
      mediaType({
        mediaType: "IMAGE",
        publications: 8,
        coverage: { publications: 8, measured: 6 },
        engagementRate: 0.054,
        strongSignal: true,
      }),
    ]);

    // A rate from 6 of 8 describes six posts. Presenting it as the format's
    // performance would overstate nothing and understate everything.
    expect(row).toMatchObject({
      label: "Images",
      publications: 8,
      measured: 6,
      confidence: "emerging",
    });
  });

  it("sorts unmeasured formats last", () => {
    const rows = formatRows([
      mediaType({ mediaType: "STORY", publications: 9 }),
      mediaType({
        mediaType: "REEL",
        publications: 2,
        coverage: { publications: 2, measured: 2 },
        engagementRate: 0.081,
      }),
    ]);

    expect(rows.map((row) => row.mediaType)).toEqual(["REEL", "STORY"]);
  });

  it("gives the unknown-format bucket a sentence rather than a blank", () => {
    const [row] = formatRows([mediaType({ mediaType: null })]);
    expect(row.label).toBe("Format not known yet");
  });
});

// ─── Do I need to do anything? ───────────────────────────────────────────────

describe("attention state", () => {
  it("asks for a permission before anything else", () => {
    const state = attentionState(
      [
        connection({ provider: "facebook", analyticsEnabled: false }),
        connection({ provider: "instagram", consecutiveFailures: 3 }),
      ],
      overview(),
    );

    // A permission is a minute's work; a retry is not the member's to make.
    expect(state.tone).toBe("action");
    expect(state.message).toContain("Facebook");
    expect(state.providers).toEqual(["facebook"]);
  });

  it("never shows a provider's own error text", () => {
    const state = attentionState(
      [
        connection({
          provider: "linkedin",
          consecutiveFailures: 2,
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
          lastError: "HTTP 500 {\"serviceErrorCode\":65600}",
        }),
      ],
      overview(),
    );

    expect(state.message).not.toContain("65600");
    expect(state.message).toContain("try again automatically");
  });

  it("says posts are live and being collected when nothing is measured yet", () => {
    const state = attentionState(
      [
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
      ],
      overview({
        publications: 2,
        coverage: { publications: 2, measured: 0 },
      }),
    );

    expect(state.tone).toBe("waiting");
    expect(state.message).toContain("collecting");
  });

  it("only says everything is up to date when it is", () => {
    const state = attentionState(
      [
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
      ],
      overview({
        publications: 2,
        coverage: { publications: 2, measured: 2 },
      }),
    );

    expect(state.tone).toBe("ok");
    expect(state.message).toContain("up to date");
  });

  it("asks for a connection when there is none", () => {
    expect(attentionState([], undefined).tone).toBe("action");
  });
});

// ─── Freshness ───────────────────────────────────────────────────────────────

describe("freshness", () => {
  it("reports the most recent successful collection across connections", () => {
    expect(
      lastUpdatedAt([
        connection({
          provider: "instagram",
          lastSuccessAt: "2026-08-12T05:00:00.000Z",
        }),
        connection({
          provider: "linkedin",
          lastSuccessAt: "2026-08-12T07:30:00.000Z",
        }),
        connection({ provider: "x" }),
      ]),
    ).toBe("2026-08-12T07:30:00.000Z");
  });

  it("is null when nothing has ever been collected", () => {
    // Rendered as "Collecting your first performance update", never as a
    // timestamp of zero or an epoch date.
    expect(lastUpdatedAt([connection({ provider: "x" })])).toBeNull();
  });

  it("reads a timestamp the way a person would", () => {
    const now = new Date("2026-08-12T12:00:00.000Z").getTime();

    expect(formatRelative("2026-08-12T11:59:40.000Z", now)).toBe("just now");
    expect(formatRelative("2026-08-12T11:56:00.000Z", now)).toBe("4 min ago");
    expect(formatRelative("2026-08-12T09:00:00.000Z", now)).toBe("3 h ago");
    expect(formatRelative(null, now)).toBeNull();
  });
});

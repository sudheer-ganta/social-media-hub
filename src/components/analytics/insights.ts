import type {
  AnalyticsOverview,
  AudiencePoint,
  MediaTypeBreakdownEntry,
  PlatformBreakdownEntry,
  PostPerformanceRow,
  SyncStatusEntry,
} from "@/services/analytics.service";
import { PLATFORMS } from "@/constants";
import { formatCount, formatRate, groupByPost } from "./metric-display";

/**
 * Everything the Analytics page concludes, as functions of the data.
 *
 * ─── Why this is one file, and why it is pure ────────────────────────────────
 *
 * The product principle for this page is that the member should not have to
 * think: they should not add up interactions, compare platforms by eye, or work
 * out whether a number is good. So FlowPost does that work — which means FlowPost
 * is now making *claims*, and a claim rendered inline in JSX is a claim nobody
 * can test.
 *
 * Every sentence the page asserts is produced here, from the API's own numbers,
 * with no component allowed to compute one of its own. The tests beside this
 * file are what stop a confident sentence being built on four data points.
 *
 * ─── The three rules nothing here may break ──────────────────────────────────
 *
 *   1. **Null is not zero.** A metric nobody reported is absent, and absent is
 *      rendered as a state ("Collecting", "—"), never as 0. A zero enters an
 *      average and an absence does not, so collapsing them makes every rate on
 *      the page quietly wrong while looking right.
 *   2. **No benchmark, no estimate, no projection.** There is no "industry
 *      average", no extrapolation from post volume, no filled-in trend. If it
 *      was not measured for this member, it is not on screen.
 *   3. **Sample size governs language.** Below the server's `strongSignal`
 *      threshold a finding is introduced as an early signal, not as a fact. The
 *      numbers are shown either way; only the sentence around them changes.
 */

// ─── Data states ─────────────────────────────────────────────────────────────

/**
 * What FlowPost can currently say about a number, and the sentence for each.
 *
 * Six states that must never render alike. The pair most often collapsed is
 * `collecting` and `unavailable`, and they are the most different: one resolves
 * on its own, the other never will. A member who sees "—" on a metric that is
 * about to arrive stops trusting the page; one who sees a spinner on a metric
 * that is never coming waits forever.
 */
export type DataState =
  | "live"
  | "collecting"
  | "permission_required"
  | "unavailable"
  | "failed"
  | "rate_limited";

/** The member-facing sentence for a state. Never a provider's own error text. */
export const STATE_COPY: Record<DataState, string> = {
  live: "",
  collecting: "Collecting performance data…",
  permission_required: "Connect analytics access to see this.",
  unavailable: "This platform doesn't report this yet.",
  failed: "Couldn't update yet. We'll try again automatically.",
  rate_limited: "Updating later.",
};

/**
 * What a connection's analytics can do right now.
 *
 * Read from `sync-status` rather than inferred from missing numbers, because
 * missing numbers are the one thing every state has in common.
 */
export function connectionState(entry: SyncStatusEntry): DataState {
  if (!entry.analyticsSupported) return "unavailable";
  if (!entry.analyticsEnabled) return "permission_required";
  if (entry.consecutiveFailures > 0) return "failed";
  if (entry.lastSuccessAt === null) return "collecting";
  return "live";
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/** A network's display name, or its own id when we have no glyph for it. */
export function platformName(provider: string): string {
  return PLATFORMS.find((p) => p.id === provider)?.name ?? provider;
}

export function platformColor(provider: string): string {
  return (
    PLATFORMS.find((p) => p.id === provider)?.color ??
    "hsl(var(--muted-foreground))"
  );
}

/**
 * A stored media type as a member would say it.
 *
 * Null is a real bucket and gets a sentence rather than a blank: a publication
 * whose format the network has not confirmed yet is not a publication with no
 * format.
 */
export function mediaTypeLabel(mediaType: string | null): string {
  const labels: Record<string, string> = {
    IMAGE: "Images",
    VIDEO: "Videos",
    CAROUSEL: "Carousels",
    REEL: "Reels",
    STORY: "Stories",
    TEXT: "Text posts",
    OTHER: "Other formats",
  };
  return mediaType ? (labels[mediaType] ?? mediaType) : "Format not known yet";
}

/** The singular form, for a single post's badge. */
export function mediaTypeSingular(mediaType: string | null): string {
  const labels: Record<string, string> = {
    IMAGE: "Image",
    VIDEO: "Video",
    CAROUSEL: "Carousel",
    REEL: "Reel",
    STORY: "Story",
    TEXT: "Text",
    OTHER: "Other",
  };
  return mediaType ? (labels[mediaType] ?? mediaType) : "Format pending";
}

// ─── The five overview cards ─────────────────────────────────────────────────

export type CardKey =
  | "published"
  | "engagement"
  | "reach"
  | "clicks"
  | "growth";

/**
 * One overview card, already answered.
 *
 * `value` is the headline number or null; `unit` is what it counts, in the
 * member's words. `lines` are the supporting facts that stop the headline
 * needing interpretation — "7" means nothing, "7 total interactions · 3 likes,
 * 1 comment" means something.
 */
export interface OverviewCard {
  key: CardKey;
  label: string;
  value: number | null;
  /** Shown under the number: "Total interactions", "Link clicks". */
  unit: string;
  /** Supporting detail. Empty when there is nothing honest to add. */
  lines: string[];
  /** The sentence to show instead of a number when there isn't one. */
  emptyCopy: string;
  state: DataState;
}

/** The interaction components, in the order a member thinks of them. */
const INTERACTIONS = [
  ["likes", "like", "likes"],
  ["comments", "comment", "comments"],
  ["shares", "share", "shares"],
  ["reposts", "repost", "reposts"],
  ["saves", "save", "saves"],
  ["clicks", "link click", "link clicks"],
] as const;

/** `totals[key].value`, or null. Never coerced — an absent total is not zero. */
function total(
  overview: AnalyticsOverview | undefined,
  key: string,
): number | null {
  return overview?.totals?.[key]?.value ?? null;
}

/** How many publications reported this metric at all. */
function reported(
  overview: AnalyticsOverview | undefined,
  key: string,
): number {
  return overview?.totals?.[key]?.reported ?? 0;
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * Total follows gained across connected accounts.
 *
 * Sums `change`, never `followers`. Follower *counts* on two networks overlap —
 * the same person twice — and adding them produces an audience figure that
 * cannot be reconciled with anything either platform reports. A *follow* is a
 * distinct event on a distinct network, so the deltas do add up honestly.
 *
 * Null when no account has both ends of a series, which is "not enough history
 * yet" and is not a growth of zero.
 */
export function netFollowerChange(audience: AudiencePoint[]): number | null {
  const changes = audience
    .map((point) => point.change)
    .filter((change): change is number => typeof change === "number");
  return changes.length === 0
    ? null
    : changes.reduce((sum, change) => sum + change, 0);
}

/**
 * The exposure total, and what it is actually made of.
 *
 * Instagram counts unique accounts (reach) and LinkedIn counts appearances
 * (impressions). Summing them is what the member is asking for — "how many saw
 * my stuff" — but the sum is not one measurement, so the *label* changes with
 * its ingredients and the per-platform rows underneath always disambiguate. A
 * single number under a single invented heading is the version of this that
 * lies.
 */
export function exposureTotal(platforms: PlatformBreakdownEntry[]): {
  value: number | null;
  label: string;
  mixed: boolean;
} {
  // One figure per network — the one that network declares as its exposure
  // metric. Instagram reports *both* reach and views for the same post, so
  // summing every exposure-shaped total would count one post's audience twice
  // and produce a headline larger than anything that happened.
  const parts: Array<{ label: string; value: number }> = [];

  for (const entry of platforms) {
    const metric = entry.exposureMetric;
    if (!metric) continue;
    const totals = entry.totals?.[metric];
    if (!totals || totals.reported === 0 || totals.value === null) continue;
    parts.push({ label: entry.exposureLabel ?? "Reach", value: totals.value });
  }

  if (parts.length === 0) {
    return { value: null, label: "Reach / impressions", mixed: false };
  }

  const labels = [...new Set(parts.map((part) => part.label))];

  return {
    value: parts.reduce((sum, part) => sum + part.value, 0),
    label: labels.join(" / "),
    mixed: labels.length > 1,
  };
}

/**
 * The five cards, answered.
 *
 * Everything the top of the page says, decided here so a component never
 * computes a claim and a test can check every one of them.
 */
export function overviewCards(
  overview: AnalyticsOverview | undefined,
  platforms: PlatformBreakdownEntry[],
  connections: SyncStatusEntry[],
): OverviewCard[] {
  const anyReadable = connections.some(
    (entry) => connectionState(entry) === "live" ||
      connectionState(entry) === "collecting",
  );
  // Nothing to collect versus nothing collected yet: a member with no readable
  // connection is not waiting, they have something to do.
  const pending: DataState = anyReadable ? "collecting" : "permission_required";

  const publications = overview?.publications ?? null;
  const engagement = total(overview, "engagement");
  const exposure = exposureTotal(platforms);
  const clicks = total(overview, "clicks");
  const growth = netFollowerChange(overview?.audience ?? []);

  const interactionLines = INTERACTIONS.flatMap(([key, one, many]) => {
    const value = total(overview, key);
    return value === null || value === 0 ? [] : [plural(value, one, many)];
  });

  const platformsWithEngagement = platforms.filter(
    (entry) => (entry.totals?.engagement?.reported ?? 0) > 0,
  ).length;

  return [
    {
      key: "published",
      label: "Posts published",
      value: overview?.postsPublished ?? null,
      unit:
        (overview?.postsPublished ?? 0) === 1 ? "post went live" : "posts went live",
      // Both grains, because both are true and picking one makes the other look
      // like an error: one piece of content, three platform results.
      lines:
        publications === null
          ? []
          : [`${plural(publications, "platform publication", "platform publications")}`],
      emptyCopy: "Nothing has published yet.",
      state: "live",
    },
    {
      key: "engagement",
      label: "Engagement",
      value: engagement,
      unit: "total interactions",
      lines:
        interactionLines.length > 0
          ? [
              interactionLines.join(" · "),
              platformsWithEngagement > 0
                ? `Across ${platformsWithEngagement} ${
                    platformsWithEngagement === 1 ? "platform" : "platforms"
                  }`
                : "",
            ].filter(Boolean)
          : [],
      emptyCopy: "Collecting your first interactions.",
      state: engagement === null ? pending : "live",
    },
    {
      key: "reach",
      label: exposure.label,
      value: exposure.value,
      unit: "across supported platforms",
      // Said out loud when the total mixes two measurements, because the number
      // is genuinely two different things added together.
      lines: exposure.mixed
        ? ["Reach counts people; impressions count appearances."]
        : [],
      emptyCopy: "Collecting your first visibility numbers.",
      state: exposure.value === null ? pending : "live",
    },
    {
      key: "clicks",
      label: "Clicks",
      value: clicks,
      unit: "link clicks",
      lines: [],
      // Not every network reports clicks at all, so "no data yet" would promise
      // an arrival that may never come.
      emptyCopy: reportsClicksAnywhere(platforms)
        ? "Collecting click data."
        : "No connected platform reports clicks.",
      state: clicks === null ? (reportsClicksAnywhere(platforms) ? pending : "unavailable") : "live",
    },
    {
      key: "growth",
      label: "Growth",
      value: growth,
      unit: growth === 1 ? "new follow" : "new follows",
      lines: [],
      emptyCopy: "Not enough history yet.",
      state: growth === null ? pending : "live",
    },
  ];
}

/** Whether any connected network has ever reported a click. */
function reportsClicksAnywhere(platforms: PlatformBreakdownEntry[]): boolean {
  return platforms.some((entry) => (entry.totals?.clicks?.reported ?? 0) > 0);
}

// ─── Engagement breakdown ────────────────────────────────────────────────────

/** One labelled row with a real number and a share of the whole. */
export interface BreakdownRow {
  label: string;
  value: number | null;
  /** 0–1 of the largest row, for a bar width. Null rows have no bar. */
  share: number;
  /** A colour when the row is a platform. Absent otherwise. */
  color?: string;
  state?: DataState;
}

function withShare(
  rows: Array<{ label: string; value: number | null; color?: string; state?: DataState }>,
): BreakdownRow[] {
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => typeof value === "number");
  const max = values.length > 0 ? Math.max(...values) : 0;

  return rows.map((row) => ({
    ...row,
    // Relative to the largest row, not to the total: a bar that fills the row it
    // leads is readable at a glance, where 3-of-7 as 43% of the width is not.
    share: typeof row.value === "number" && max > 0 ? row.value / max : 0,
  }));
}

/** Interactions by kind. Only kinds something actually reported. */
export function engagementByKind(
  overview: AnalyticsOverview | undefined,
): BreakdownRow[] {
  return withShare(
    INTERACTIONS.flatMap(([key, , many]) =>
      reported(overview, key) === 0
        ? []
        : [
            {
              label: many.charAt(0).toUpperCase() + many.slice(1),
              value: total(overview, key),
            },
          ],
    ),
  );
}

/**
 * Interactions by network.
 *
 * A network with no measurement keeps its row and carries a state instead of a
 * number. Dropping it would make a platform that has not been read yet look
 * like a platform that got nothing.
 */
export function engagementByPlatform(
  platforms: PlatformBreakdownEntry[],
  connections: SyncStatusEntry[],
): BreakdownRow[] {
  const stateFor = connectionStates(connections);

  return withShare(
    platforms.map((entry) => ({
      label: platformName(entry.provider),
      value:
        (entry.totals?.engagement?.reported ?? 0) > 0
          ? (entry.totals.engagement.value ?? null)
          : null,
      color: platformColor(entry.provider),
      state:
        (entry.totals?.engagement?.reported ?? 0) > 0
          ? ("live" as DataState)
          : (stateFor.get(entry.provider) ?? "collecting"),
    })),
  );
}

/** The worst state across a provider's connections — the one needing action. */
function connectionStates(
  connections: SyncStatusEntry[],
): Map<string, DataState> {
  const severity: DataState[] = [
    "live",
    "collecting",
    "rate_limited",
    "failed",
    "permission_required",
    "unavailable",
  ];
  const worst = new Map<string, DataState>();

  for (const entry of connections) {
    const state = connectionState(entry);
    const existing = worst.get(entry.provider);
    if (!existing || severity.indexOf(state) > severity.indexOf(existing)) {
      worst.set(entry.provider, state);
    }
  }
  return worst;
}

/**
 * Interactions by content format, from the publication feed.
 *
 * Grouped on the feed rather than on the format breakdown because this answers
 * "where did my interactions come from", which is a sum — where the format table
 * answers "which format performs", which is a rate. Same data, two questions,
 * and a single row of numbers cannot serve both.
 */
export function engagementByContentType(
  posts: PostPerformanceRow[],
): BreakdownRow[] {
  const byType = new Map<string | null, number>();

  for (const row of posts) {
    if (typeof row.engagement !== "number") continue;
    const key = row.mediaType;
    byType.set(key, (byType.get(key) ?? 0) + row.engagement);
  }

  return withShare(
    [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mediaType, value]) => ({
        label: mediaTypeSingular(mediaType),
        value,
      })),
  );
}

// ─── Visibility, per network under its own name ──────────────────────────────

export interface VisibilityRow {
  provider: string;
  label: string;
  /** "19 reach", "— / collecting", "Not published". */
  value: number | null;
  /** What this network calls it. Null when it reports no exposure at all. */
  metricLabel: string | null;
  state: DataState;
  color: string;
}

/**
 * Every connected network's exposure, under that network's own metric name.
 *
 * Includes networks with no publication in range — as "Not published", not as
 * zero. The member's question is "where is my content being seen", and a network
 * they never posted to is a different answer from one that reached nobody.
 */
export function visibilityByPlatform(
  platforms: PlatformBreakdownEntry[],
  connections: SyncStatusEntry[],
): VisibilityRow[] {
  const states = connectionStates(connections);
  const seen = new Set(platforms.map((entry) => entry.provider));

  const published: VisibilityRow[] = platforms.map((entry) => {
    const metric = entry.exposureMetric;
    const measured = metric ? (entry.totals?.[metric]?.reported ?? 0) > 0 : false;

    return {
      provider: entry.provider,
      label: platformName(entry.provider),
      value: measured ? (entry.totals[metric!].value ?? null) : null,
      metricLabel: entry.exposureLabel,
      color: platformColor(entry.provider),
      state: measured
        ? "live"
        : metric === null
          ? "unavailable"
          : (states.get(entry.provider) ?? "collecting"),
    };
  });

  // Connected but nothing published in this period. A real answer, and the one
  // the member needs in order to know the platform is not broken.
  const idle: VisibilityRow[] = connections
    .filter((entry) => !seen.has(entry.provider))
    .map((entry) => ({
      provider: entry.provider,
      label: platformName(entry.provider),
      value: null,
      metricLabel: null,
      color: platformColor(entry.provider),
      state: connectionState(entry),
    }))
    // One row per network, not per connected account.
    .filter(
      (row, index, all) =>
        all.findIndex((other) => other.provider === row.provider) === index,
    );

  return [...published, ...idle];
}

/** "Not published" for an idle network; the state's own sentence otherwise. */
export function visibilityCopy(row: VisibilityRow, published: boolean): string {
  if (!published) return "Nothing published here yet";
  return STATE_COPY[row.state] || "";
}

// ─── What's working ──────────────────────────────────────────────────────────

/**
 * How much weight a finding can carry.
 *
 * The whole point of showing this scale: a claim from two measured posts and a
 * claim from twenty read identically unless the page says otherwise, and the
 * first one is usually wrong.
 */
export type Confidence = "early" | "emerging" | "strong";

export const CONFIDENCE_COPY: Record<Confidence, string> = {
  early: "Early signal",
  emerging: "Emerging pattern",
  strong: "Strong signal",
};

/** Two measured posts is a hint, five is a pattern, ten is a finding. */
export function confidenceFor(measured: number): Confidence {
  if (measured >= 10) return "strong";
  if (measured >= 5) return "emerging";
  return "early";
}

export interface Finding {
  kind: "post" | "format" | "platform";
  /** "Your best post", "Your strongest format". */
  heading: string;
  /** The answer: a caption, "Images", "Instagram". */
  headline: string;
  /** The measured fact behind it: "7.7% engagement", "19 reach". */
  detail: string;
  confidence: Confidence;
  /** Set on a post finding, so the row opens that post. */
  postId?: string;
}

/**
 * The two or three things worth telling the member, from their own data.
 *
 * Returns fewer findings rather than weaker ones. A page that always shows three
 * boxes will fill the third with something it cannot support, and that one
 * sentence is what makes the other two untrustworthy.
 *
 * Nothing here compares the member against anybody else. There is no benchmark
 * data in FlowPost and there will not be one invented for a headline.
 */
export function whatsWorking(
  posts: PostPerformanceRow[],
  mediaTypes: MediaTypeBreakdownEntry[],
  platforms: PlatformBreakdownEntry[],
): Finding[] {
  const findings: Finding[] = [];

  // ── Best post: ranked by engagement rate where exposure is known, and by
  // interactions where it is not. Never by a blended invented score.
  const measured = posts.filter((row) => row.measured);
  const rated = measured.filter((row) => typeof row.engagementRate === "number");
  const best =
    rated.length > 0
      ? rated.reduce((a, b) => (b.engagementRate! > a.engagementRate! ? b : a))
      : measured
          .filter((row) => typeof row.engagement === "number")
          .reduce<PostPerformanceRow | null>(
            (a, b) => (a === null || b.engagement! > a.engagement! ? b : a),
            null,
          );

  if (best) {
    findings.push({
      kind: "post",
      heading: "Your best post",
      headline: postLabel(best),
      detail:
        typeof best.engagementRate === "number"
          ? `${formatRate(best.engagementRate)} engagement on ${platformName(best.provider)}`
          : `${plural(best.engagement ?? 0, "interaction", "interactions")} on ${platformName(best.provider)}`,
      confidence: confidenceFor(measured.length),
      postId: best.postId,
    });
  }

  // ── Strongest format: only among formats that have actually been measured,
  // and only when there is more than one to be strongest *of*. "Images are your
  // best format" when images are your only format is not a finding.
  const comparableFormats = mediaTypes.filter(
    (entry) =>
      entry.coverage.measured > 0 && typeof entry.engagementRate === "number",
  );

  if (comparableFormats.length > 1) {
    const bestFormat = comparableFormats.reduce((a, b) =>
      b.engagementRate! > a.engagementRate! ? b : a,
    );
    findings.push({
      kind: "format",
      heading: "Your strongest format",
      headline: mediaTypeLabel(bestFormat.mediaType),
      detail: `${formatRate(bestFormat.engagementRate)} engagement from ${plural(
        bestFormat.coverage.measured,
        "measured post",
        "measured posts",
      )}`,
      confidence: bestFormat.strongSignal
        ? confidenceFor(bestFormat.coverage.measured)
        : "early",
    });
  }

  // ── Strongest platform: by measured interactions, never by rate. Two networks'
  // rates come from different denominators over different audiences, so the one
  // with the higher percentage is not necessarily the one doing more for you.
  const measuredPlatforms = platforms.filter(
    (entry) => (entry.totals?.engagement?.reported ?? 0) > 0,
  );

  if (measuredPlatforms.length > 0) {
    const bestPlatform = measuredPlatforms.reduce((a, b) =>
      (b.totals.engagement.value ?? 0) > (a.totals.engagement.value ?? 0) ? b : a,
    );
    findings.push({
      kind: "platform",
      heading:
        measuredPlatforms.length === 1
          ? "Where your engagement comes from"
          : "Your strongest platform",
      headline: platformName(bestPlatform.provider),
      detail: `${plural(
        bestPlatform.totals.engagement.value ?? 0,
        "interaction",
        "interactions",
      )} from ${plural(bestPlatform.coverage.measured, "measured post", "measured posts")}`,
      confidence: confidenceFor(bestPlatform.coverage.measured),
    });
  }

  return findings;
}

/** A post's own words, or its title, or an honest placeholder. */
export function postLabel(row: {
  title: string;
  caption: string;
}): string {
  const text = row.title?.trim() || row.caption?.trim();
  if (!text) return "Untitled post";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

// ─── Content format table ────────────────────────────────────────────────────

export interface FormatRow {
  mediaType: string | null;
  label: string;
  publications: number;
  measured: number;
  engagementRate: number | null;
  confidence: Confidence;
  /** True once the sample supports a claim rather than a hint. */
  strongSignal: boolean;
}

/**
 * Every format the member has published, with what is known about each.
 *
 * Sorted by rate where measured, and unmeasured formats last — a format nobody
 * has read yet is not a format that failed, and sorting it among the losers
 * would say that it was.
 */
export function formatRows(mediaTypes: MediaTypeBreakdownEntry[]): FormatRow[] {
  return mediaTypes
    .map((entry) => ({
      mediaType: entry.mediaType,
      label: mediaTypeLabel(entry.mediaType),
      publications: entry.publications,
      measured: entry.coverage.measured,
      engagementRate: entry.engagementRate,
      confidence: entry.strongSignal
        ? confidenceFor(entry.coverage.measured)
        : "early",
      strongSignal: entry.strongSignal,
    }))
    .sort((a, b) => {
      const aRated = typeof a.engagementRate === "number";
      const bRated = typeof b.engagementRate === "number";
      if (aRated !== bRated) return aRated ? -1 : 1;
      if (aRated && bRated) return b.engagementRate! - a.engagementRate!;
      return b.publications - a.publications;
    });
}

// ─── Do I need to do anything? ───────────────────────────────────────────────

export interface Attention {
  tone: "ok" | "waiting" | "action";
  message: string;
  /** The networks the member has to do something about. */
  providers: string[];
}

/**
 * The one line that tells the member whether this page needs them.
 *
 * Ranked by what they can act on: a permission they can grant beats a wait they
 * cannot shorten. "Everything is up to date" is only said when it is true for
 * every connection — a single reassuring sentence covering a broken one is worse
 * than no sentence.
 */
export function attentionState(
  connections: SyncStatusEntry[],
  overview: AnalyticsOverview | undefined,
): Attention {
  if (connections.length === 0) {
    return {
      tone: "action",
      message: "Connect a social account and FlowPost will start tracking it.",
      providers: [],
    };
  }

  const byState = new Map<DataState, string[]>();
  for (const entry of connections) {
    const state = connectionState(entry);
    byState.set(state, [...(byState.get(state) ?? []), entry.provider]);
  }

  const needsPermission = byState.get("permission_required") ?? [];
  if (needsPermission.length > 0) {
    return {
      tone: "action",
      message: `Connect analytics access for ${listNames(needsPermission)}.`,
      providers: needsPermission,
    };
  }

  const failing = byState.get("failed") ?? [];
  if (failing.length > 0) {
    return {
      tone: "waiting",
      message: `Couldn't update ${listNames(failing)} yet. FlowPost will try again automatically.`,
      providers: failing,
    };
  }

  // Published, readable, and nothing observed yet — the honest wait.
  const coverage = overview?.coverage;
  if (coverage && coverage.publications > coverage.measured) {
    const outstanding = coverage.publications - coverage.measured;
    return {
      tone: "waiting",
      message:
        coverage.measured === 0
          ? "Your posts are live. We're collecting their first performance update."
          : `Collecting performance data for ${plural(outstanding, "more post", "more posts")}.`,
      providers: [],
    };
  }

  const collecting = byState.get("collecting") ?? [];
  if (collecting.length > 0 && (overview?.publications ?? 0) === 0) {
    return {
      tone: "ok",
      message: "FlowPost is tracking automatically. Publish a post to start.",
      providers: [],
    };
  }

  return {
    tone: "ok",
    message: "Everything is up to date. FlowPost is tracking this automatically.",
    providers: [],
  };
}

/** "Facebook", "Facebook and X", "Facebook, X and LinkedIn". */
function listNames(providers: string[]): string {
  const names = [...new Set(providers)].map(platformName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ─── Freshness ───────────────────────────────────────────────────────────────

/**
 * The most recent successful collection across every connection.
 *
 * One timestamp for the page rather than one per metric. "Updated 4 min ago"
 * repeated beside twenty numbers is noise; grouped per section it is context.
 */
export function lastUpdatedAt(connections: SyncStatusEntry[]): string | null {
  const times = connections
    .map((entry) => entry.lastSuccessAt)
    .filter((value): value is string => typeof value === "string")
    .sort();
  return times[times.length - 1] ?? null;
}

/**
 * A timestamp as a member reads it.
 *
 * "just now", "4 min ago", "3 h ago", then a date. Null when there is no time —
 * which the caller renders as "Collecting your first update", never as a
 * timestamp of zero.
 */
export function formatRelative(
  iso: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

// ─── Top posts ───────────────────────────────────────────────────────────────

export interface TopPost {
  postId: string;
  title: string;
  caption: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  providers: string[];
  mediaType: string | null;
  mediaTypeConfirmed: boolean;
  /** Every network's own headline figure, kept apart. Never summed. */
  exposures: Array<{ provider: string; label: string; value: number }>;
  /** Interactions across networks. Null when nothing was reported anywhere. */
  engagement: number | null;
  /** The best rate any single network reported, with that network's name. */
  bestRate: { provider: string; rate: number } | null;
  measured: boolean;
  /** Which measure the ranking used, said out loud. */
  rankedBy: "rate" | "interactions" | "unmeasured";
}

/**
 * Content, ranked by something real, with the measure named.
 *
 * ─── Why there is no score ───────────────────────────────────────────────────
 *
 * A single 0–100 "performance score" blended across networks would rank every
 * post and mean nothing: it would weight a LinkedIn impression against an
 * Instagram reach and hide the weighting. So posts are ranked by engagement rate
 * where exposure is known and by interactions where it is not, and the row says
 * which one it used.
 *
 * Unmeasured posts sort last and are labelled. A post nobody has read yet is not
 * a post that did badly.
 */
export function topPosts(rows: PostPerformanceRow[]): TopPost[] {
  const grouped = groupByPost(rows);
  const byPost = new Map<string, PostPerformanceRow[]>();
  for (const row of rows) {
    byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row]);
  }

  return grouped
    .map((content) => {
      const group = byPost.get(content.postId) ?? [];
      const rates = group
        .filter((row) => typeof row.engagementRate === "number")
        .map((row) => ({ provider: row.provider, rate: row.engagementRate! }));

      return {
        postId: content.postId,
        title: content.title,
        caption: content.caption,
        thumbnailUrl:
          group.find((row) => row.thumbnailUrl)?.thumbnailUrl ?? null,
        publishedAt: content.publishedAt,
        providers: content.providers,
        mediaType: content.mediaType,
        mediaTypeConfirmed: content.mediaTypeConfirmed,
        exposures: group.flatMap((row) =>
          typeof row.exposure?.value === "number" && row.exposure.label
            ? [
                {
                  provider: row.provider,
                  label: row.exposure.label,
                  value: row.exposure.value,
                },
              ]
            : [],
        ),
        engagement: content.engagement,
        bestRate:
          rates.length > 0
            ? rates.reduce((a, b) => (b.rate > a.rate ? b : a))
            : null,
        measured: content.measured,
        rankedBy: !content.measured
          ? ("unmeasured" as const)
          : rates.length > 0
            ? ("rate" as const)
            : ("interactions" as const),
      };
    })
    .sort((a, b) => {
      if (a.measured !== b.measured) return a.measured ? -1 : 1;
      const aRate = a.bestRate?.rate ?? null;
      const bRate = b.bestRate?.rate ?? null;
      if (aRate !== null && bRate !== null) return bRate - aRate;
      if (aRate !== null) return -1;
      if (bRate !== null) return 1;
      return (b.engagement ?? 0) - (a.engagement ?? 0);
    });
}

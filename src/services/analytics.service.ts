import { getSupabase } from "@/lib/supabase";
import { API_BASE_URL, type AccountContext } from "@/constants/integrations";

/**
 * The browser's side of the analytics API.
 *
 * ─── Why this exists at all ──────────────────────────────────────────────────
 *
 * Because the Analytics page used to compute its own numbers from the `posts`
 * list, and a post row cannot answer the question the page asks. Two of those
 * computations were wrong in ways that contradicted each other on screen:
 *
 *   • "Posts Published" counted `post.status === 'published'`. That is a
 *     *workspace* status covering the whole post, and it is FAILED the moment
 *     any single destination fails — so a post that published to three networks
 *     and missed a fourth counted as zero.
 *   • "Platform mix" counted `post.platforms`, which is the list of
 *     destinations the member *ticked in the composer*. It has no status at
 *     all, so drafts, failed attempts and posts still publishing all counted.
 *
 * Hence 0 published beside a chart showing nine publications.
 *
 * The authoritative fact — did this destination actually publish — lives in
 * `post_platforms.status` / `published_id` / `published_at`, which the browser
 * cannot see and must not guess at. `post.platform_results` is a legacy JSON
 * mirror carrying a url and an error, not a status, and is not a substitute.
 * So the numbers are asked for rather than derived, and both come from one
 * backend rule (`PUBLISHED_PREDICATE`) that no client can drift from.
 *
 * Scope is enforced server-side. The `?context=`/`?brandId=` below is what the
 * page means, not what it is trusted on — the API 404s a brand the caller does
 * not own before it reads anything.
 */

/**
 * `?context=…&brandId=…`, plus whatever the endpoint needs.
 *
 * Personal is the backend default, so it sends nothing for it. `extra` carries
 * the endpoint's own dimension — `days` for a reporting period, `window` for the
 * intelligence window. They are deliberately different parameters on different
 * endpoints; see `server/src/analytics/window.ts` on why one shared date filter
 * would collapse three different questions into one wrong answer.
 */
function contextQuery(
  context: AccountContext,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  if (context.contextType === "brand" && context.brandId) {
    params.set("context", "brand");
    params.set("brandId", context.brandId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * How far back the reporting cards look.
 *
 * `null` is "all time" and sends no parameter at all, which is the backend's own
 * default. It is offered because a period that happens to be empty is the one
 * state that makes a working page look broken — a member who published five
 * weeks ago and opens a 30-day view has published nothing, truthfully and
 * uselessly. The empty state links here.
 */
export type ReportingDays = 7 | 30 | 90 | null;

function periodParams(days: ReportingDays): Record<string, string> {
  return days === null ? {} : { days: String(days) };
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to be signed in to view analytics.");
  }
  return session.access_token;
}

async function request<T>(
  path: string,
  fallback: string,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/analytics${path}`, {
    method,
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : fallback;
    throw new Error(message);
  }

  return body as T;
}

/**
 * How much of a total was actually measured.
 *
 * `publications` is how many publications are in scope; `measured` is how many
 * of them have ever been synced. The two differ constantly — a post published
 * an hour ago is real and unmeasured — and a total shown without its coverage
 * reads as though it described everything.
 */
export interface AnalyticsCoverage {
  publications: number;
  measured: number;
}

/** One metric's total. `value` is null when nothing reported it — never 0. */
export interface MetricTotal {
  value: number | null;
  reported: number;
  total: number;
}

/**
 * One connected account's audience, and how it has moved.
 *
 * Never summed into a single "total audience" here or anywhere: followers on
 * Instagram and followers on X overlap, and adding them counts the same person
 * twice. The Growth card sums `change` instead — a follow is a distinct event on
 * a distinct network, so "you gained 12 follows" survives the overlap that
 * "you have 900 followers" does not.
 */
export interface AudiencePoint {
  provider: string;
  providerAccountId: string;
  followers: number | null;
  capturedAt: string | null;
  firstFollowers: number | null;
  firstCapturedAt: string | null;
  /** Null unless both ends of the series are real. Never 0 in that case. */
  change: number | null;
  changeRate: number | null;
}

export interface AnalyticsOverview {
  /**
   * Distinct posts that published successfully to at least one network.
   *
   * Not a count of `posts` rows and not a count of destinations: a post that
   * went to three networks is one post here and three in
   * {@link publications}.
   */
  postsPublished: number;
  /** Successful (post × network) publications. The platform-mix denominator. */
  publications: number;
  coverage: AnalyticsCoverage;
  totals: Record<string, MetricTotal>;
  engagementRate: number | null;
  audience: AudiencePoint[];
}

export interface PlatformBreakdownEntry {
  provider: string;
  /** Successful publications on this network. Never intended destinations. */
  publications: number;
  coverage: AnalyticsCoverage;
  engagementRate: number | null;
  totals: Record<string, MetricTotal>;
  /** What this network calls exposure, known before any number arrives. */
  exposureMetric: "reach" | "impressions" | "views" | null;
  exposureLabel: string | null;
}

/**
 * One content format, over the intelligence window.
 *
 * `strongSignal` is the server's sample-size verdict and it governs *language*,
 * never data: below it a format is introduced as "Early signal" rather than as a
 * finding. Four posts is a coincidence with a percentage attached.
 */
export interface MediaTypeBreakdownEntry {
  /** Null is a real bucket — publications whose format is not yet known. */
  mediaType: string | null;
  publications: number;
  coverage: AnalyticsCoverage;
  totals: Record<string, MetricTotal>;
  engagementRate: number | null;
  averageEngagement: number | null;
  confirmed: number;
  inferred: number;
  strongSignal: boolean;
}

/**
 * Whether a connection's analytics can be read at all.
 *
 * The difference between "collecting" and "we will never be able to look" — a
 * spinner versus a Reconnect prompt. Nothing else on the page can tell them
 * apart, so nothing else may guess.
 */
export interface SyncStatusEntry {
  provider: string;
  socialAccountId: string;
  displayName: string | null;
  username: string | null;
  status: string;
  /** False when this network has no analytics adapter at all. */
  analyticsSupported: boolean;
  /** False with `analyticsSupported: true` is exactly "reconnect to enable". */
  analyticsEnabled: boolean;
  missingScopes: string[];
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
}

/** One observation in a publication's history. */
export interface SnapshotPoint {
  capturedAt: string;
  source: string;
  metrics: Record<string, number | null>;
  engagement: number | null;
}

/**
 * A network's exposure figure, under its own name.
 *
 * The reason Instagram's reach and LinkedIn's impressions are never rendered in
 * one column: unique people and appearances are different measurements, and a
 * shared header would compare them as if they were not.
 */
export interface ExposureReading {
  metric: "reach" | "impressions" | "views" | null;
  label: string | null;
  value: number | null;
}

export interface PublicationPerformance {
  postPlatformId: string;
  provider: string;
  platformPostId: string | null;
  permalink: string | null;
  publishedAt: string | null;
  contentType: string | null;
  mediaType: string | null;
  /** True when the network confirmed the format; false when we inferred it. */
  mediaTypeConfirmed: boolean;
  exposure: ExposureReading;
  metrics: Record<string, number | null>;
  engagement: number | null;
  engagementRate: number | null;
  /** Which metrics this network ever reports. Anything else renders as "—". */
  reportsMetrics: string[];
  /**
   * `measured` — we have numbers. `collecting` — published, nothing observed
   * yet. `unavailable` — this network cannot be read for this connection.
   * Three different sentences; never all rendered as zero.
   */
  state: "measured" | "collecting" | "unavailable";
  lastCapturedAt: string | null;
  history: SnapshotPoint[];
  notice: string | null;
}

/** A destination that produced no publication. Never a performance row. */
export interface UnpublishedDestination {
  provider: string;
  status: string;
  errorMessage: string | null;
}

/** One media asset, described. Never carrying platform metrics. */
export interface MediaAssetSummary {
  id: string | null;
  position: number;
  kind: "image" | "video" | "unknown";
  mimeType: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  aspectRatioLabel: string | null;
  durationMs: number | null;
  byteLength: number | null;
  posterUrl: string | null;
  url: string | null;
  cropped: boolean;
}

export interface MediaLevelSupport {
  provider: string;
  /** False on every network today — none returns per-asset metrics. */
  available: boolean;
  note: string;
}

export interface PostDetail {
  postId: string;
  title: string;
  caption: string;
  status: string;
  contextType: string;
  brandId: string | null;
  createdAt: string;
  publishedAt: string | null;
  media: MediaAssetSummary[];
  mediaShape: string;
  published: PublicationPerformance[];
  notPublished: UnpublishedDestination[];
  mediaLevel: MediaLevelSupport[];
}

/** One row of the publication feed. */
export interface PostPerformanceRow {
  postId: string;
  postPlatformId: string;
  provider: string;
  permalink: string | null;
  publishedAt: string | null;
  mediaType: string | null;
  mediaTypeConfirmed: boolean;
  title: string;
  caption: string;
  metrics: Record<string, number | null>;
  engagement: number | null;
  engagementRate: number | null;
  measured: boolean;
  lastCapturedAt: string | null;
  /** The exposure figure under this network's own name. Never a shared column. */
  exposure: ExposureReading;
  /** Which metrics this network ever reports. Anything else is "—". */
  reportsMetrics: string[];
  thumbnailUrl: string | null;
  mediaShape: string;
}

export async function fetchOverview(
  context: AccountContext,
  days: ReportingDays = null,
): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>(
    `/overview${contextQuery(context, periodParams(days))}`,
    "Analytics could not be loaded.",
  );
}

export async function fetchByPlatform(
  context: AccountContext,
  days: ReportingDays = null,
): Promise<PlatformBreakdownEntry[]> {
  const body = await request<{ platforms: PlatformBreakdownEntry[] }>(
    `/by-platform${contextQuery(context, periodParams(days))}`,
    "The platform breakdown could not be loaded.",
  );
  return body.platforms ?? [];
}

/**
 * Per-format performance, over the intelligence window rather than a period.
 *
 * "Which format works" is a question about *now*, and a window of publications
 * asks it independently of publishing cadence — somebody who posts twice a month
 * and somebody who posts daily both get twenty posts' worth of signal.
 */
export async function fetchByMediaType(
  context: AccountContext,
): Promise<MediaTypeBreakdownEntry[]> {
  const body = await request<{ mediaTypes: MediaTypeBreakdownEntry[] }>(
    `/by-media-type${contextQuery(context)}`,
    "Content format performance could not be loaded.",
  );
  return body.mediaTypes ?? [];
}

/** What can be read, and what needs the member to do something. */
export async function fetchSyncStatus(
  context: AccountContext,
): Promise<SyncStatusEntry[]> {
  const body = await request<{ connections: SyncStatusEntry[] }>(
    `/sync-status${contextQuery(context)}`,
    "Connection status could not be loaded.",
  );
  return body.connections ?? [];
}

/**
 * Collect now, for this context only.
 *
 * A POST because it writes and because it spends metered third-party calls — the
 * browser never talks to a network itself. FlowPost's backend collects,
 * stores and then this page re-reads what was stored; the UI has no path to a
 * provider API and must not grow one.
 */
export async function syncNow(context: AccountContext): Promise<void> {
  await request<unknown>(
    `/sync${contextQuery(context)}`,
    "The refresh could not be started.",
    "POST",
  );
}

/**
 * The publication feed for the intelligence window.
 *
 * One row per (post × network), so a post published to three networks is three
 * rows. The Content Performance list groups them back into content — see
 * `topPosts` in `components/analytics/insights.ts` — rather than the API
 * pre-grouping,
 * because the same feed also answers per-publication questions.
 */
export async function fetchPosts(
  context: AccountContext,
): Promise<PostPerformanceRow[]> {
  const query = contextQuery(context);
  const body = await request<{ posts: PostPerformanceRow[] }>(
    `/posts${query}`,
    "Post performance could not be loaded.",
  );
  return body.posts ?? [];
}

/**
 * One post, everywhere it went.
 *
 * Lifetime by construction — a single post's history is never narrowed by the
 * intelligence window. 404s for a post that is not the caller's, with the same
 * message as one that does not exist.
 */
export async function fetchPostDetail(
  context: AccountContext,
  postId: string,
): Promise<PostDetail> {
  return request<PostDetail>(
    `/posts/${encodeURIComponent(postId)}${contextQuery(context)}`,
    "That post's performance could not be loaded.",
  );
}

// ─── Best time to post ───────────────────────────────────────────────────────

/**
 * How much to believe a timing recommendation.
 *
 * `none` is a real answer, and the common one before an account has published
 * thirty measured posts. The UI must render it as "not enough history yet" and
 * never fall back to a general recommendation — a generic 8 PM presented in the
 * same panel as evidence would be indistinguishable from a personal finding.
 */
export type TimingConfidence = "none" | "early" | "strong";

/** Which slice of history the answer came from. Disclosed, never hidden. */
export type TimingBasis = "content_type" | "media_type" | "platform";

/**
 * Where the authority comes from.
 *
 * Only `audience_activity` licenses "your followers are most active then".
 * Nothing produces it today — no connected network exposes follower-activity
 * timing through FlowPost's integration — so every recommendation arrives as
 * `publish_history`, whose honest claim is about the posts and not the people.
 */
export type TimingEvidence = "publish_history" | "audience_activity";

export interface BestTimeEntry {
  provider: string;
  label: string;
  confidence: TimingConfidence;
  basis: TimingBasis | null;
  metric: "engagement_rate" | "engagement" | null;
  evidence: TimingEvidence;
  /** The IANA zone every clock time below is expressed in. */
  timezone: string;
  /** Measured publications behind it. Quoted to the member verbatim. */
  sampleSize: number;
  /** `20:30`, or null when there is no recommendation. */
  recommendedTime: string | null;
  window: { start: string; end: string } | null;
  /** The half-hour choices spanning the window, e.g. `["20:00","20:30","21:00"]`. */
  slots: string[];
  alternatives: string[];
  /** Whole percent above the member's own median. Null when unclaimable. */
  liftPercent: number | null;
  weekdaysObserved: number[];
  reason: string;
  /**
   * Local wall clock, `YYYY-MM-DDTHH:mm` — exactly what the scheduler takes.
   * `today` is null once the window has passed on the member's clock.
   */
  today: string | null;
  tomorrow: string | null;
}

export interface BestTimeResult {
  timezone: string | null;
  timezoneSource: "request" | "history" | "none";
  gates: { early: number; strong: number };
  platforms: BestTimeEntry[];
}

/**
 * When this account's own posts have performed best, per network.
 *
 * Per network because the same post has a different best time on Instagram and
 * LinkedIn, and forcing one time on both would be wrong on at least one.
 *
 * `timezone` is sent as a *hint* — the zone the member is scheduling in right
 * now, which the server validates and prefers over the one their history
 * recorded. The browser cannot be trusted to do the clock arithmetic (it does not
 * know which zone the member schedules in, only which one their laptop is in),
 * so it sends the hint and renders whatever comes back.
 */
export async function fetchBestTime(
  context: AccountContext,
  options: {
    platforms?: readonly string[];
    /** The content type being planned, e.g. `REEL`. */
    format?: string | null;
    timezone?: string | null;
  } = {},
): Promise<BestTimeResult> {
  const extra: Record<string, string> = {};
  if (options.platforms && options.platforms.length > 0) {
    extra.platforms = options.platforms.join(",");
  }
  if (options.format) extra.format = options.format;
  if (options.timezone) extra.timezone = options.timezone;

  return request<BestTimeResult>(
    `/best-time${contextQuery(context, extra)}`,
    "The best time to post could not be worked out.",
  );
}

// ─── Brand Intelligence ──────────────────────────────────────────────────────

export interface VoiceMixEntry {
  register: "professional" | "playful" | "gen_z" | "educational" | "premium";
  /** Whole percent. Entries sum to 100. */
  percent: number;
}

export interface LearnedSignal {
  id: string;
  strength: "early" | "emerging" | "strong";
  detail: string;
  observations: number;
}

export interface HashtagObservation {
  tag: string;
  uses: number;
  lift: number | null;
  strength: "early" | "emerging" | "strong" | "insufficient";
}

export interface BrandIntelligenceView {
  voice: {
    entries: VoiceMixEntry[];
    sampleCount: number;
    /**
     * What the percentages are a reading *of*. Rendered, because "Playful 42%"
     * beside no basis reads as a confidence score, which it is not.
     */
    basis: "measured_caption_shape";
  };
  style: {
    confidence: "none" | "low" | "medium" | "high";
    sampleCount: number;
    builtAt: string | null;
    themes: Array<{ situation: string; posts: number }>;
  };
  performance: {
    platforms: Array<{
      provider: string;
      label: string;
      metric: "engagement_rate" | "engagement";
      sampleSize: number;
      signals: LearnedSignal[];
    }>;
    sampleSize: number;
  };
  hashtags: {
    frequent: HashtagObservation[];
    strongerPosts: HashtagObservation[];
    noDifference: HashtagObservation[];
    sampleSize: number;
  };
  sampleSize: number;
}

/** What FlowPost has worked out about how this context writes, and what worked. */
export async function fetchBrandIntelligence(
  context: AccountContext,
): Promise<BrandIntelligenceView> {
  return request<BrandIntelligenceView>(
    `/brand-intelligence${contextQuery(context)}`,
    "Brand intelligence could not be loaded.",
  );
}

/**
 * Forgets the learned voice for this context.
 *
 * Only the derived reading goes — the posts stay, so the next generation rebuilds
 * from the same history. Worth saying in the confirmation copy: members reasonably
 * fear that "reset learning" deletes their work.
 */
export async function resetBrandLearning(
  context: AccountContext,
): Promise<{ cleared: boolean }> {
  return request<{ cleared: boolean }>(
    `/brand-intelligence/reset${contextQuery(context)}`,
    "The learned voice could not be reset.",
    "POST",
  );
}

export const analyticsService = {
  fetchOverview,
  fetchByPlatform,
  fetchByMediaType,
  fetchPosts,
  fetchPostDetail,
  fetchSyncStatus,
  syncNow,
  fetchBestTime,
  fetchBrandIntelligence,
  resetBrandLearning,
};

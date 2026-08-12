import axios from 'axios';
import { facebookConfig, FACEBOOK_ANALYTICS_SCOPE } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type {
  NormalizedAccountMetrics,
  NormalizedPostMetrics,
  ProviderAccountMetrics,
  ProviderAccountMetricsRequest,
  ProviderAnalytics,
  ProviderMediaType,
  ProviderMetricsRequest,
  ProviderPostMetrics,
} from '../../provider.interface';
import type {
  FacebookInsightNode,
  FacebookInsightsResponse,
  FacebookPageMetricsNode,
  FacebookPostInsightNode,
} from './types';

/**
 * Reading a Facebook Page's performance data.
 *
 * ─── Two sources, and why both ───────────────────────────────────────────────
 *
 * Engagement counts — comments, shares, reactions — come off the **post node**.
 * Clicks, reactions-by-type and the video metrics come off the **insights
 * edge**, which needs `read_insights`.
 *
 * Reading both is what makes a partial grant useful instead of useless, and the
 * split now runs one level deeper: the node itself is read twice, because its
 * *engagement* fields need `pages_read_user_content` on top of
 * `pages_read_engagement` and Meta refuses the whole field list when one part
 * is not permitted. Three permission levels, three degrees of answer, and the
 * metrics at each level that were not granted stay null rather than absent.
 *
 * ─── Metrics deprecate, and this has already been bitten ─────────────────────
 *
 * Meta retires Page Insights metrics on its own schedule and does not degrade:
 * one removed name fails the whole request with `(#100) The value must be a
 * valid insights metric`. `post_impressions` and `post_impressions_unique` went
 * that way, and because the fallback set was made of the same two names, the
 * retry failed identically — Facebook produced no insights at all, silently,
 * for every post.
 *
 * So the lists below hold only names checked against the live API, the fallback
 * is a genuine subset of the full set, and nothing is estimated from a sibling
 * metric: a metric this API version no longer serves is *unavailable*, which is
 * a different fact from zero.
 *
 * ─── Reels are not modelled ──────────────────────────────────────────────────
 *
 * FlowPost does not publish Facebook Reels — there is no REEL entry in
 * `capabilities.ts` — so no Reel-specific metric is requested here. A Reel
 * published by other means that happened to be synced would return whatever the
 * ordinary post metrics gave and its `mediaType` would come back as VIDEO. It
 * is deliberately not guessed at more precisely than that: Reel insights use
 * different metric names, and assuming a Page post's names apply to them is the
 * assumption this note exists to refuse.
 */

/**
 * The scopes these calls need.
 *
 * `pages_read_engagement` reads the post node, `read_insights` the insights
 * edge. Both are listed because the adapter is only offered when the *complete*
 * read is possible — a connection holding one but not the other is reported as
 * "reconnect to enable analytics" rather than silently producing half a series
 * whose gaps look like zeros in a chart.
 */
const REQUIRED_SCOPES = [
  'pages_read_engagement',
  FACEBOOK_ANALYTICS_SCOPE,
] as const;

function hasRequiredScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

/**
 * The node read is per post, because the batched form is gone.
 *
 * Meta retired `?ids=` and answers it with an **HTTP 500** — `code 100, "The
 * ids query parameter is deprecated in v26.0+"` — on `graph.facebook.com`
 * exactly as on `graph.instagram.com`, and regardless of the version pinned in
 * the URL. A 500 classifies as temporary, so the account's post sync failed and
 * retried forever instead of reading anything.
 */

/**
 * The node fields that need no permission beyond the connection itself.
 *
 * Split from the engagement summaries below because Meta refuses the *whole*
 * field list when one part is not permitted: asking for `comments.summary` on a
 * connection without `pages_read_user_content` fails the read that would
 * otherwise have returned the format and the timestamp.
 */
const NODE_FIELDS = 'id,created_time,status_type,attachments{media_type,subattachments}';

/**
 * Comment and reaction counts, which are *user* content on the Page.
 *
 * `pages_read_engagement` is not enough for these — Meta requires
 * `pages_read_user_content` (or Page Public Content Access) and answers `(#10)`
 * without it. Requested in a second read so that a connection lacking the
 * permission still gets the format, the timestamp and every insights metric,
 * with likes and comments null rather than the whole publication missing.
 */
const ENGAGEMENT_FIELDS = 'id,comments.summary(true),shares,reactions.summary(true)';

/**
 * How far back Page post insights are served.
 *
 * Meta serves lifetime post insights for as long as the post exists, but a
 * two-year-old Page post has not moved in a very long time. Stated so the
 * weekly tail stops rather than re-reading a Page's whole history forever.
 */
const POST_INSIGHTS_MAX_AGE_DAYS = 730;

/**
 * The post-level insights worth asking for.
 *
 * **Every name here was checked against the live API** — Meta validates metric
 * names before it checks permissions, so `(#100) The value must be a valid
 * insights metric` is a definitive answer about the name and nothing else.
 *
 *  • `post_clicks`                  — any click on the post, link or otherwise.
 *  • `post_reactions_by_type_total` — the reaction breakdown. Summed for
 *                                     `likes`, and the *only* route to a
 *                                     reaction count for a connection without
 *                                     `pages_read_user_content`.
 *  • `post_video_views`             — 3-second views. Absent on a photo post.
 *  • `post_video_view_time`         — total milliseconds watched, Meta's unit.
 *
 * ─── What is deliberately absent ─────────────────────────────────────────────
 *
 * `post_impressions`, `post_impressions_unique`, `post_impressions_organic` and
 * `post_engaged_users` are **no longer valid metric names** at v26. They are not
 * requested, because one invalid name fails the entire request — which is what
 * was happening: the full set 400'd, the fallback was made of the same two dead
 * names and 400'd too, and Facebook produced no insights at all.
 *
 * So Facebook has no post exposure figure at present, and `impressions` and
 * `reach` are null for it. That is a fact about Meta's API, recorded in
 * `analytics/metric-support.ts` so the UI says "—" rather than "0".
 */
const POST_METRICS = [
  'post_clicks',
  'post_reactions_by_type_total',
  'post_video_views',
  'post_video_view_time',
] as const;

/**
 * The subset that applies to every post, video or not.
 *
 * The fallback when the full set is refused — a photo post that will not answer
 * for a video metric, or the next name Meta retires. Reactions and clicks are
 * what remain worth having.
 */
const CORE_POST_METRICS = ['post_clicks', 'post_reactions_by_type_total'] as const;

/**
 * Page-level, for the account series. Also checked live: `page_impressions` and
 * `page_impressions_unique` are invalid at v26, and `page_fans` with them. The
 * follower count comes off the Page node instead, which still serves it.
 */
const PAGE_METRICS = ['page_views_total', 'page_follows', 'page_post_engagements'] as const;

/** A number Meta actually sent, or null. Never a substituted zero. */
function metric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads one metric out of the Page Insights time-series envelope.
 *
 * A lifetime post metric has exactly one entry in `values`; a period metric has
 * one per period and the newest is last. Taking the last entry is correct for
 * both. A `value` that is an object — the reaction breakdown is one — is not a
 * number and comes back null rather than as `NaN`.
 */
function readInsight(nodes: FacebookInsightNode[], name: string): number | null {
  const node = nodes.find((entry) => entry?.name === name);
  if (!node) return null;

  const values = node.values ?? [];
  if (values.length === 0) return null;

  return metric(values[values.length - 1]?.value);
}

/**
 * Totals a metric whose value is a breakdown object rather than a number.
 *
 * `post_reactions_by_type_total` is `{like: 3, love: 1, wow: 0}` — the only
 * reaction figure available to a connection without `pages_read_user_content`.
 * Summed rather than reported per type because the normalised schema has one
 * `likes` column, and the untouched breakdown is kept in the snapshot's `raw`.
 *
 * Null when the metric is absent, and null when it is present but holds nothing
 * numeric: an empty breakdown is a metric we could not read, not zero reactions.
 */
function sumInsightBreakdown(
  nodes: FacebookInsightNode[],
  name: string,
): number | null {
  const node = nodes.find((entry) => entry?.name === name);
  const value = (node?.values ?? []).at(-1)?.value;
  if (typeof value !== 'object' || value === null) return null;

  const counts = Object.values(value as Record<string, unknown>).filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
  );

  return counts.length > 0 ? counts.reduce((total, n) => total + n, 0) : null;
}

/**
 * What Meta says this post is.
 *
 * Read from the attachment rather than from `status_type`, which describes how
 * the post was *made* ("added_photos", "shared_story") rather than what it
 * carries. `subattachments` is the multi-photo tell: Meta reports a set of
 * photos as one `photo` attachment with children, and the child count is the
 * only thing distinguishing it from a single image.
 *
 * Null when there is no attachment data at all — that is "unknown", and it
 * leaves whatever was inferred at publish time standing.
 */
function mediaTypeOf(node: FacebookPostInsightNode): ProviderMediaType | null {
  const attachment = node.attachments?.data?.[0];

  if (!attachment) {
    // No attachment *and* Meta answered the node read. On a Page post that is a
    // genuine text status, not a missing answer.
    return node.id ? 'TEXT' : null;
  }

  const children = attachment.subattachments?.data?.length ?? 0;
  if (children > 1) return 'CAROUSEL';

  switch (attachment.media_type) {
    case 'photo':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'link':
    case 'share':
      return 'TEXT';
    default:
      return 'OTHER';
  }
}

/**
 * One post's numbers, from both sources.
 *
 * The mapping decisions worth stating:
 *
 *  • `likes` is the **total reaction count**, not just the thumbs-up. Meta's
 *    `reactions.summary.total_count` covers every reaction type, which is the
 *    number a member reads as "likes" on the post itself.
 *  • `shares.count` absent means zero, uniquely on this API. Meta omits the
 *    `shares` object entirely on a post with no shares rather than sending
 *    `{count: 0}` — so absence here really is a reported zero, and this is the
 *    one place in the codebase where a missing field becomes 0 rather than
 *    null. It is only correct because the *node itself came back*: had the read
 *    failed there would be no entry at all.
 *  • `saves` is null, permanently. Facebook does not expose a save count for
 *    Page posts through any organic endpoint.
 *  • `views` is null and `videoViews` carries the video figure. They are not
 *    the same measurement and Meta reports only the second.
 */
function normalizeMetrics(
  node: FacebookPostInsightNode,
  insights: FacebookInsightNode[],
): NormalizedPostMetrics {
  return {
    // No valid name for either at v26 — see POST_METRICS. Null, permanently,
    // rather than substituted from a metric that measures something else.
    impressions: null,
    reach: null,
    views: null,
    // The node's count when the connection may read it, and the insights
    // breakdown when it may not. Both are Meta's own total across every
    // reaction type; neither is derived from the other.
    likes:
      metric(node.reactions?.summary?.total_count) ??
      sumInsightBreakdown(insights, 'post_reactions_by_type_total'),
    comments: metric(node.comments?.summary?.total_count),
    // See the note above: Meta omits the object rather than sending a zero.
    // Only meaningful when the engagement read succeeded — `shares` is one of
    // its fields, so a refused read must stay null rather than become 0.
    shares: node.shares
      ? metric(node.shares.count)
      : node.reactions || node.comments
        ? 0
        : null,
    // Facebook has no repost distinct from a share.
    reposts: null,
    saves: null,
    clicks: readInsight(insights, 'post_clicks'),
    videoViews: readInsight(insights, 'post_video_views'),
    // Meta reports this one in milliseconds already.
    watchTimeMs: readInsight(insights, 'post_video_view_time'),
  };
}

/**
 * One post's node: what it is, and — if the connection may read them — its
 * engagement counts.
 *
 * Two reads rather than one, for the reason given on {@link ENGAGEMENT_FIELDS}.
 * The second is best-effort: a `(#10)` refusal leaves comments, shares and
 * reactions null and keeps everything else, which is the honest description of
 * a connection that can see its post but not who engaged with it.
 *
 * Returns null when the post itself cannot be read — deleted from the Page.
 * That is an absence, and the caller omits it.
 */
async function fetchPostNode(
  accessToken: string,
  id: string,
): Promise<FacebookPostInsightNode | null> {
  const read = (fields: string) =>
    axios.get<FacebookPostInsightNode>(`${facebookConfig.graphUrl}/${id}`, {
      params: { fields, access_token: accessToken },
      timeout: REQUEST_TIMEOUT_MS,
    });

  let node: FacebookPostInsightNode;
  try {
    node = (await read(NODE_FIELDS)).data;
    if (!node || typeof node !== 'object') return null;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 400 || status === 404) return null;
    throw toProviderError(error, 'post node request');
  }

  try {
    const engagement = (await read(ENGAGEMENT_FIELDS)).data;
    if (engagement && typeof engagement === 'object') {
      node = { ...node, ...engagement };
    }
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    // 400 carries `(#10) requires pages_read_user_content`; 403 is the same
    // refusal under a different code. Both leave the counts unread, which is
    // null — never zero. Anything else is a real failure and must back off.
    if (status !== 400 && status !== 403) {
      throw toProviderError(error, 'post engagement request');
    }
  }

  return node;
}

/**
 * One post's insights, with the deprecation fallback applied.
 *
 * Returns an empty list rather than throwing when Meta refuses even the core
 * set. That is the partial-grant case: the node read already produced real
 * engagement counts, and losing them because the exposure metrics were
 * unavailable would be a worse answer than reporting the exposure as null.
 */
async function fetchPostInsights(
  accessToken: string,
  postId: string,
): Promise<FacebookInsightNode[]> {
  const request = (metrics: readonly string[]) =>
    axios.get<FacebookInsightsResponse>(
      `${facebookConfig.graphUrl}/${postId}/insights`,
      {
        params: { metric: metrics.join(','), access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

  try {
    const response = await request(POST_METRICS);
    return response.data?.data ?? [];
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    // 400 is a deprecated or inapplicable metric name; 403 is the insights
    // permission missing on this Page specifically. Both mean "ask for less".
    // Anything else — a dead token, a rate limit, Meta down — must reach the
    // sync service, which is the only thing that knows how to back off.
    if (status !== 400 && status !== 403) {
      throw toProviderError(error, 'post insights request');
    }

    try {
      const response = await request(CORE_POST_METRICS);
      return response.data?.data ?? [];
    } catch (fallbackError) {
      const fallbackStatus = axios.isAxiosError(fallbackError)
        ? fallbackError.response?.status
        : undefined;
      if (fallbackStatus === 400 || fallbackStatus === 403) return [];
      throw toProviderError(fallbackError, 'post insights request');
    }
  }
}

/**
 * Reads performance for posts on this Page.
 *
 * Returns one entry per post Meta answered the *node* read for. A post deleted
 * from the Page simply does not come back, which is an absence rather than an
 * error. Callers key on `platformPostId`.
 */
export async function fetchPostMetrics(
  input: ProviderMetricsRequest,
): Promise<ProviderPostMetrics[]> {
  const ids = input.platformPostIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];

  const results: ProviderPostMetrics[] = [];

  for (const id of ids) {
    const node = await fetchPostNode(input.accessToken, id);
    if (!node) continue;

    const insights = await fetchPostInsights(input.accessToken, id);

    results.push({
      platformPostId: id,
      mediaType: mediaTypeOf(node),
      metrics: normalizeMetrics(node, insights),
      raw: { node, insights },
    });
  }

  return results;
}

/**
 * Reads the Page's own audience.
 *
 * `followers_count` and `fan_count` are different numbers on a Page — follows
 * and likes are separate actions — and `followers_count` is the one that
 * answers "how many people see this Page's posts". `fan_count` is carried in
 * `raw` rather than blended into it.
 */
export async function fetchAccountMetrics(
  input: ProviderAccountMetricsRequest,
): Promise<ProviderAccountMetrics> {
  let node: FacebookPageMetricsNode;

  try {
    const response = await axios.get<FacebookPageMetricsNode>(
      `${facebookConfig.graphUrl}/${input.providerAccountId}`,
      {
        params: {
          fields: 'id,followers_count,fan_count',
          access_token: input.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    node = response.data ?? {};
  } catch (error) {
    throw toProviderError(error, 'page metrics request');
  }

  // Best-effort, for the same reason as the post insights: losing the follower
  // count because the insights edge was unavailable would be the worse answer.
  let insights: FacebookInsightNode[] = [];
  try {
    const response = await axios.get<FacebookInsightsResponse>(
      `${facebookConfig.graphUrl}/${input.providerAccountId}/insights`,
      {
        params: {
          metric: PAGE_METRICS.join(','),
          period: 'day',
          access_token: input.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    insights = response.data?.data ?? [];
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status !== 400 && status !== 403) {
      throw toProviderError(error, 'page insights request');
    }
  }

  const metrics: NormalizedAccountMetrics = {
    followers: metric(node.followers_count),
    // A Page follows nothing. Null rather than 0: it is not a measurement.
    following: null,
    // The Page node carries no post count without a separate edge read, which
    // is a request spent on a number nothing displays.
    postCount: null,
    // `page_impressions` and `page_impressions_unique` are not valid names at
    // v26 and are no longer asked for. Null, not substituted from page views.
    impressions: null,
    reach: null,
    profileViews: readInsight(insights, 'page_views_total'),
  };

  return { metrics, raw: { node, insights } };
}

export const facebookAnalytics: ProviderAnalytics = {
  requiredScopes: REQUIRED_SCOPES,
  postMetricsMaxAgeDays: POST_INSIGHTS_MAX_AGE_DAYS,
  // No batch size: there is no batched form left to size. See `fetchPostNode`.
  hasRequiredScopes,
  fetchPostMetrics,
  fetchAccountMetrics,
};

// Exported for the unit tests, which drive the pure normalisation without a
// network. The HTTP shell above is what a test cannot reach without one.
export const __testables = {
  mediaTypeOf,
  normalizeMetrics,
  readInsight,
  sumInsightBreakdown,
  hasRequiredScopes,
  POST_METRICS,
  PAGE_METRICS,
};

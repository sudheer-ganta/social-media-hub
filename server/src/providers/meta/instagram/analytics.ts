import axios from 'axios';
import { instagramConfig, INSTAGRAM_ANALYTICS_SCOPE } from './config';
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
  InstagramAccountNode,
  InstagramInsightNode,
  InstagramInsightsResponse,
  InstagramMediaInfoNode,
  InstagramMediaProductType,
} from './types';

/**
 * Reading Instagram's performance data.
 *
 * ─── Two requests, and why it cannot be one ──────────────────────────────────
 *
 * Instagram's insights edge does not take a list of media ids, and the metrics
 * a piece of media accepts depend on *what it is*: asking a Story for `saved`
 * or a Reel for `navigation` does not return null for that metric, it fails the
 * whole request with an error naming nothing else. So the format has to be
 * known before the metrics can be asked for.
 *
 * That gives the shape here — a node read that resolves each id's
 * `media_product_type`, then an insights call for that publication with the
 * metric list that type actually accepts. Two requests per publication, and the
 * count is bounded by the cadence: a post is read at four staged points and
 * then weekly, so this is a handful of requests per account per tick rather
 * than per post per hour. (It used to be one *batched* node read for all ids;
 * Meta retired that form — see `fetchMediaInfo`.)
 *
 * ─── `impressions` is gone, and is not substituted ───────────────────────────
 *
 * Meta removed `impressions` for media in v22 and replaced it with `views`.
 * This adapter asks for `views` and leaves `impressions` null — permanently,
 * for every Instagram publication. Copying `views` into `impressions` so a
 * column looks populated would make Instagram and X's impression figures look
 * comparable when they measure different things, which is exactly the invented
 * number the null convention exists to prevent.
 *
 * ─── The scope ───────────────────────────────────────────────────────────────
 *
 * `instagram_business_manage_insights`, which is behind App Review and is not
 * requested unless the deployment declares the app approved — see
 * `providers/analytics-scopes.ts`. A connection without it is reported as
 * "reconnect to enable analytics", never as an account with no engagement.
 */

/**
 * The scopes these calls need.
 *
 * `instagram_business_basic` is what identifies the account and is granted on
 * every connection; the insights permission is the one that has to be asked for
 * and can be declined.
 */
const REQUIRED_SCOPES = [
  'instagram_business_basic',
  INSTAGRAM_ANALYTICS_SCOPE,
] as const;

function hasRequiredScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

/**
 * There is no batched node read any more.
 *
 * Meta retired the `?ids=` multi-node form and now answers it with an **HTTP
 * 500** — `IGApiException code 100, "The ids query parameter is deprecated in
 * v26.0+"` — regardless of the version pinned in the URL. A 500 classifies as a
 * temporary failure, so the whole account's post sync failed, backed off, and
 * retried forever without ever reaching the insights calls that work fine.
 *
 * The replacement is one node read per publication. That is not the cost it
 * looks like: the insights call below was already one per publication, because
 * the metric list depends on the format. This turns 1+N requests into 2N, on an
 * N bounded by the cadence — a handful per account per tick.
 */

/**
 * How far back media insights are served.
 *
 * Meta does not publish a hard cliff for media insights the way X does for
 * organic metrics, but it does not serve them for media older than about two
 * years, and a post that old has not moved in eighteen months. Stated so the
 * sync service stops asking rather than re-requesting a member's whole history
 * on every weekly tail pass.
 */
const MEDIA_INSIGHTS_MAX_AGE_DAYS = 730;

/**
 * The metrics each surface actually accepts.
 *
 * Written per product type because Meta rejects the whole request for one
 * unsupported name. Every list is the intersection of what the API serves and
 * what FlowPost has a column for — nothing is requested that is then discarded.
 *
 *  • FEED   — images, carousels and feed video. `saved` and `shares` are the
 *             two that separate a post people keep from one they scroll past.
 *  • REELS  — the same engagement set plus watch time. No `saved` distinction
 *             at the surface level beyond the shared metric, and no
 *             `navigation`, which is a Story concept.
 *  • STORY  — no likes and no saves, because a Story has neither. `replies` is
 *             the engagement that exists here and nowhere else, and it is
 *             mapped to `comments` rather than invented as a new column.
 */
const FEED_METRICS = [
  'reach',
  'views',
  'likes',
  'comments',
  'saved',
  'shares',
  'total_interactions',
  'profile_visits',
  'follows',
] as const;

const REELS_METRICS = [
  'reach',
  'views',
  'likes',
  'comments',
  'saved',
  'shares',
  'total_interactions',
  'ig_reels_avg_watch_time',
  'ig_reels_video_view_total_time',
] as const;

const STORY_METRICS = [
  'reach',
  'views',
  'replies',
  'shares',
  'total_interactions',
  'profile_visits',
  'follows',
  'navigation',
] as const;

/**
 * The subset every surface serves.
 *
 * The fallback when a full request is refused. Meta deprecates media metrics on
 * its own schedule and names the offending one in an error we cannot map back
 * to a column reliably — so rather than parsing the message, the request is
 * retried with the four metrics that have survived every version to date. A
 * member gets reach and interactions instead of nothing, and the metrics that
 * did not come back stay null.
 */
const CORE_METRICS = ['reach', 'views', 'likes', 'comments'] as const;

function metricsFor(productType: InstagramMediaProductType | undefined): string[] {
  if (productType === 'STORY') return [...STORY_METRICS];
  if (productType === 'REELS') return [...REELS_METRICS];
  return [...FEED_METRICS];
}

/**
 * Instagram's vocabulary mapped to ours.
 *
 * `media_product_type` wins over `media_type` because it is the more specific
 * fact: a video with `REELS` and a video with `FEED` are both `VIDEO` on the
 * other axis, and only the first is a Reel. Null when Meta said neither — which
 * leaves whatever was inferred at publish time standing rather than replacing
 * it with a guess.
 */
function mediaTypeOf(node: InstagramMediaInfoNode): ProviderMediaType | null {
  switch (node.media_product_type) {
    case 'STORY':
      return 'STORY';
    case 'REELS':
      return 'REEL';
    default:
      break;
  }

  switch (node.media_type) {
    case 'CAROUSEL_ALBUM':
      return 'CAROUSEL';
    case 'VIDEO':
      return 'VIDEO';
    case 'IMAGE':
      return 'IMAGE';
    default:
      // Meta answered with a format we do not model, or with none at all. Both
      // are "unknown", and unknown is null — never TEXT, which Instagram cannot
      // even publish.
      return null;
  }
}

/** A number Meta actually sent, or null. Never a substituted zero. */
function metric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads one metric out of whichever envelope Meta used.
 *
 * `total_value.value` is the newer per-metric total; `values[0].value` is the
 * older time-series form. A metric absent from both is null.
 */
function readInsight(nodes: InstagramInsightNode[], name: string): number | null {
  const node = nodes.find((entry) => entry?.name === name);
  if (!node) return null;

  const total = metric(node.total_value?.value);
  if (total !== null) return total;

  return metric(node.values?.[0]?.value);
}

/**
 * One publication's numbers.
 *
 * The mapping decisions worth stating:
 *
 *  • `impressions` — always null. See the header: Meta removed it and `views`
 *    is not the same measurement.
 *  • `views` populates both `views` and `videoViews`. On a Reel they are the
 *    same number by Meta's own definition, and leaving `videoViews` null would
 *    make a Reel look unwatched in a video-specific view.
 *  • `replies` on a Story becomes `comments`. It is the same behaviour — a
 *    person writing back — under the name that surface uses.
 *  • `total_interactions`, `profile_visits`, `follows` and `navigation` have no
 *    normalised column. They are not dropped: the whole response is stored
 *    verbatim in the snapshot's `raw`, which is what the next phase reads.
 */
function normalizeMetrics(
  nodes: InstagramInsightNode[],
  productType: InstagramMediaProductType | undefined,
): NormalizedPostMetrics {
  const views = readInsight(nodes, 'views');
  const isReel = productType === 'REELS';

  return {
    // Removed from the media insights API in v22. Not derived from views.
    impressions: null,
    reach: readInsight(nodes, 'reach'),
    views,
    likes: readInsight(nodes, 'likes'),
    comments:
      productType === 'STORY'
        ? readInsight(nodes, 'replies')
        : readInsight(nodes, 'comments'),
    shares: readInsight(nodes, 'shares'),
    // Instagram has no repost concept the API reports. Null, permanently.
    reposts: null,
    saves: readInsight(nodes, 'saved'),
    // No click metric for organic media. `profile_visits` is a different
    // action — a tap through to the profile, not a link click — and filing it
    // as `clicks` would put it beside X's link clicks as if they matched.
    clicks: null,
    videoViews: isReel ? views : null,
    // Seconds on the wire; the column is milliseconds.
    watchTimeMs: (() => {
      const seconds = readInsight(nodes, 'ig_reels_video_view_total_time');
      return seconds === null ? null : seconds * 1000;
    })(),
  };
}

/**
 * What each publication is — one node read per id.
 *
 * A 400 or 404 is media that is gone: deleted since publication, or a Story
 * past its window. That is an absence, so the id is simply left out of the map
 * and the caller skips it, exactly as the batched form's omission used to mean.
 * Anything else — a dead token, a rate limit, Meta down — is rethrown so the
 * sync service can back off, because swallowing it would turn an outage into a
 * silent gap in the series.
 */
async function fetchMediaInfo(
  accessToken: string,
  ids: string[],
): Promise<Map<string, InstagramMediaInfoNode>> {
  const byId = new Map<string, InstagramMediaInfoNode>();

  for (const id of ids) {
    try {
      const response = await axios.get<InstagramMediaInfoNode>(
        `${instagramConfig.graphUrl}/${id}`,
        {
          params: {
            fields: 'id,media_type,media_product_type,timestamp',
            access_token: accessToken,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      const node = response.data;
      if (node && typeof node === 'object') byId.set(id, node);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 400 && status !== 404) {
        throw toProviderError(error, 'media info request');
      }
    }
  }

  return byId;
}

/**
 * One publication's insights, with the deprecation fallback applied.
 *
 * Returns null when this media has no readable insights at all — a Story past
 * its 24 hours, or a post deleted since it was published. That is an absence
 * and the caller omits the entry, exactly as X omits a deleted post: it must
 * not become a snapshot of zeroes.
 */
async function fetchInsights(
  accessToken: string,
  mediaId: string,
  productType: InstagramMediaProductType | undefined,
): Promise<InstagramInsightNode[] | null> {
  const request = (metrics: string[]) =>
    axios.get<InstagramInsightsResponse>(
      `${instagramConfig.graphUrl}/${mediaId}/insights`,
      {
        params: { metric: metrics.join(','), access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

  try {
    const response = await request(metricsFor(productType));
    return response.data?.data ?? [];
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    // 400 is what Meta answers both for a metric this media does not support
    // and for media whose insights window has closed. Anything else — a dead
    // token, a rate limit, Meta being down — is a real failure and must reach
    // the sync service, which knows how to back off. Swallowing it here would
    // turn an outage into a silent gap in the series.
    if (status !== 400) throw toProviderError(error, 'media insights request');

    try {
      const response = await request([...CORE_METRICS]);
      return response.data?.data ?? [];
    } catch (fallbackError) {
      const fallbackStatus = axios.isAxiosError(fallbackError)
        ? fallbackError.response?.status
        : undefined;

      // Even the core set was refused. This media cannot be read — expired
      // Story, deleted post — which is an absence, not an error.
      if (fallbackStatus === 400) return null;
      throw toProviderError(fallbackError, 'media insights request');
    }
  }
}

/**
 * Reads performance for media this account published.
 *
 * Returns one entry per publication Instagram answered for, which is routinely
 * fewer than were asked for. Callers key on `platformPostId`.
 */
export async function fetchPostMetrics(
  input: ProviderMetricsRequest,
): Promise<ProviderPostMetrics[]> {
  const ids = input.platformPostIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];

  const results: ProviderPostMetrics[] = [];
  const info = await fetchMediaInfo(input.accessToken, ids);

  for (const id of ids) {
    // Not in the node response at all: deleted since publication. Meta simply
    // omits it, and so do we.
    const node = info.get(id);
    if (!node) continue;

    const productType = node.media_product_type;
    const insights = await fetchInsights(input.accessToken, id, productType);
    if (insights === null) continue;

    results.push({
      platformPostId: id,
      mediaType: mediaTypeOf(node),
      metrics: normalizeMetrics(insights, productType),
      // Both halves, because the format is as much a fact about this
      // observation as the numbers are.
      raw: { node, insights },
    });
  }

  return results;
}

/**
 * Reads the connected account's audience.
 *
 * Follower counts come off the user node, which `instagram_business_basic`
 * already covers. Account-level reach and profile views live on the insights
 * edge and need the permission — and are read in a separate call that is
 * allowed to fail without costing us the follower count, because a partial
 * answer is worth more than none and the missing half stays null.
 */
export async function fetchAccountMetrics(
  input: ProviderAccountMetricsRequest,
): Promise<ProviderAccountMetrics> {
  let node: InstagramAccountNode;

  try {
    const response = await axios.get<InstagramAccountNode>(
      `${instagramConfig.graphUrl}/${input.providerAccountId}`,
      {
        params: {
          fields: 'id,followers_count,follows_count,media_count',
          access_token: input.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    node = response.data ?? {};
  } catch (error) {
    throw toProviderError(error, 'account metrics request');
  }

  // Best-effort. A 400 here means the insights edge is unavailable for this
  // account type, which is a smaller fact than "the sync failed".
  let insights: InstagramInsightNode[] = [];
  try {
    const response = await axios.get<InstagramInsightsResponse>(
      `${instagramConfig.graphUrl}/${input.providerAccountId}/insights`,
      {
        params: {
          metric: 'reach',
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
      throw toProviderError(error, 'account insights request');
    }
  }

  const metrics: NormalizedAccountMetrics = {
    followers: metric(node.followers_count),
    following: metric(node.follows_count),
    postCount: metric(node.media_count),
    // Removed from the account insights API alongside the media one.
    impressions: null,
    reach: readInsight(insights, 'reach'),
    // `profile_views` is served only for some account types and periods, and is
    // not requested rather than requested-and-usually-refused.
    profileViews: null,
  };

  return { metrics, raw: { node, insights } };
}

export const instagramAnalytics: ProviderAnalytics = {
  requiredScopes: REQUIRED_SCOPES,
  postMetricsMaxAgeDays: MEDIA_INSIGHTS_MAX_AGE_DAYS,
  // No batch size: there is no batched form left to size. See `fetchMediaInfo`.
  hasRequiredScopes,
  fetchPostMetrics,
  fetchAccountMetrics,
};

// Exported for the unit tests, which drive the pure normalisation without a
// network. The HTTP shell above is what a test cannot reach without one.
export const __testables = {
  mediaTypeOf,
  metricsFor,
  normalizeMetrics,
  readInsight,
  hasRequiredScopes,
};

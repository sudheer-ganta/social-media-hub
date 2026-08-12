import axios from 'axios';
import { LINKEDIN_ANALYTICS_SCOPE } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError, versionedHeaders } from './http';
import type {
  NormalizedAccountMetrics,
  NormalizedPostMetrics,
  ProviderAccountMetrics,
  ProviderAccountMetricsRequest,
  ProviderAnalytics,
  ProviderMediaType,
  ProviderMetricsRequest,
  ProviderPostMetrics,
} from '../provider.interface';
import type {
  LinkedInPostAnalyticsElement,
  LinkedInPostAnalyticsResponse,
  LinkedInSocialActionNode,
  LinkedInSocialActionsResponse,
} from './types';

/**
 * Reading LinkedIn's member post analytics.
 *
 * ─── Two endpoints, and the reason it is not one ─────────────────────────────
 *
 * LinkedIn splits a post's numbers across two surfaces with two different
 * permissions:
 *
 *  • `/rest/socialActions` — reactions and comments. Covered by
 *    `w_member_social`, which every connection already holds, and **batched**:
 *    one request answers for many posts.
 *  • `/rest/memberPostAnalytics` — impressions, unique impressions, clicks.
 *    Behind `r_member_postAnalytics`, and one request per post.
 *
 * Reading the batched one first is what keeps this from being an API explosion.
 * A sweep of twelve due posts is one socialActions call plus twelve analytics
 * calls, not twenty-four — and on a connection that never granted the analytics
 * permission it is exactly one call, because the second endpoint is not
 * attempted at all.
 *
 * That split is also what makes a partial grant useful. A member who declined
 * the analytics scope still gets real reaction and comment counts; only the
 * exposure metrics stay null.
 *
 * ─── Absent stays absent ─────────────────────────────────────────────────────
 *
 * `memberPostAnalytics` is a versioned surface and LinkedIn moves fields
 * between releases. Every field on the response type is optional and every read
 * goes through a narrowing helper, so a release that renames a metric produces
 * a null rather than a wrong number or a crash. Nothing here is derived from a
 * sibling metric and nothing is estimated.
 */

const LINKEDIN_REST_URL = 'https://api.linkedin.com/rest';

/**
 * The scopes these calls need.
 *
 * `w_member_social` is the reaction and comment read and is held by every
 * connection; the analytics permission is the one behind App Review and the one
 * a member can decline. Both are required because the adapter is only offered
 * when the complete read is possible — a connection holding one but not the
 * other is reported as "reconnect to enable analytics" rather than producing a
 * series whose gaps would read as zeros.
 */
const REQUIRED_SCOPES = ['w_member_social', LINKEDIN_ANALYTICS_SCOPE] as const;

function hasRequiredScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

/**
 * How many URNs one `socialActions` batch may carry.
 *
 * LinkedIn's documented ceiling for a batch GET. It bounds only the engagement
 * read; the analytics reads that follow are one per post regardless, which is
 * why the sync cadence rather than this number is what keeps the volume down.
 */
const MAX_IDS_PER_REQUEST = 50;

/**
 * How far back post analytics are served.
 *
 * LinkedIn does not publish a hard cliff, but a year-old share has not moved in
 * months. Stated so the weekly tail terminates rather than re-reading a
 * member's whole publishing history on every pass.
 */
const POST_ANALYTICS_MAX_AGE_DAYS = 365;

/** A number LinkedIn actually sent, or null. Never a substituted zero. */
function metric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The first of these LinkedIn reported, or null when it reported none. */
function firstReported(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = metric(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * One post's numbers, from whichever of the two endpoints answered.
 *
 * The mapping decisions worth stating:
 *
 *  • `likes` is the **total reaction count**. LinkedIn's `likesSummary` covers
 *    every reaction type, which is the number shown on the post itself.
 *  • `shares` and `reposts` are the same action on LinkedIn — a repost *is* the
 *    share — so the count goes in `reposts` and `shares` stays null rather than
 *    being written into both, which would double it in any sum across them.
 *  • `reach` takes `uniqueImpressionsCount`: unique members, which is what
 *    reach means everywhere else in this system. It is never derived from
 *    `impressionCount`.
 *  • `saves` is null, permanently. LinkedIn exposes no save count.
 */
function normalizeMetrics(
  social: LinkedInSocialActionNode | undefined,
  analytics: LinkedInPostAnalyticsElement | null | undefined,
): NormalizedPostMetrics {
  return {
    impressions: metric(analytics?.impressionCount),
    reach: metric(analytics?.uniqueImpressionsCount),
    views: null,
    // The batched engagement read wins: it is the live count on the post, where
    // the analytics element's copy can lag a release behind.
    likes: firstReported(
      social?.likesSummary?.totalLikes,
      social?.likesSummary?.aggregatedTotalLikes,
      analytics?.reactionCount,
    ),
    comments: firstReported(
      social?.commentsSummary?.aggregatedTotalComments,
      social?.commentsSummary?.totalFirstLevelComments,
      analytics?.commentCount,
    ),
    // A repost is LinkedIn's share. Counted once, under one name.
    shares: null,
    reposts: metric(analytics?.shareCount),
    saves: null,
    clicks: metric(analytics?.clickCount),
    videoViews: metric(analytics?.videoViewCount),
    watchTimeMs: metric(analytics?.videoWatchTime),
  };
}

/**
 * What LinkedIn's URN says this publication is.
 *
 * Deliberately thin. A URN carries the *container* — a share, a UGC post — and
 * says nothing about whether it holds one image, nine, or a video, and neither
 * endpoint here returns the media. So this returns null for everything except
 * the case a URN genuinely settles, which leaves the format inferred at publish
 * time standing. Guessing IMAGE from a `urn:li:share:` would overwrite a
 * correct CAROUSEL with a wrong single-image label on the first sync.
 */
function mediaTypeOf(_urn: string): ProviderMediaType | null {
  return null;
}

/**
 * The batched engagement read.
 *
 * ─── The URNs inside `List()` must be percent-encoded ────────────────────────
 *
 * Rest.li parses the list before it decodes the values, so a raw
 * `urn:li:share:123` puts colons where it expects delimiters and the whole
 * request is refused with `400 ILLEGAL_ARGUMENT — Invalid query parameters`.
 * Encoded, the same call reaches the resource. That is verifiable without any
 * permission to read the data: the encoded form's error is about *permission*
 * (`403 partnerApiSocialActions.BATCH_GET`), the raw form's is about the
 * *arguments*, and only one of those is a request LinkedIn understood.
 *
 * Axios's default serializer leaves `:` alone, so the encoding has to be done
 * here rather than left to it.
 *
 * LinkedIn returns `results` keyed by the URN it was asked under, encoded. The
 * keys are therefore decoded before matching rather than compared verbatim,
 * which is the difference between this working and it silently returning
 * nothing for every post.
 */
async function fetchSocialActions(
  accessToken: string,
  urns: string[],
): Promise<Map<string, LinkedInSocialActionNode>> {
  const byUrn = new Map<string, LinkedInSocialActionNode>();

  let body: LinkedInSocialActionsResponse;
  try {
    const response = await axios.get<LinkedInSocialActionsResponse>(
      `${LINKEDIN_REST_URL}/socialActions`,
      {
        params: { ids: `List(${urns.map(encodeURIComponent).join(',')})` },
        headers: versionedHeaders(accessToken),
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    body = response.data;
  } catch (error) {
    throw toProviderError(error, 'social actions request');
  }

  for (const [key, node] of Object.entries(body?.results ?? {})) {
    if (!node || typeof node !== 'object') continue;

    // The key comes back percent-encoded. `decodeURIComponent` on a value that
    // was not encoded is a no-op, so this is safe either way — but a malformed
    // sequence throws, and one bad key must not lose the whole batch.
    let urn = key;
    try {
      urn = decodeURIComponent(key);
    } catch {
      urn = key;
    }

    byUrn.set(urn, node);
  }

  return byUrn;
}

/**
 * One post's exposure metrics.
 *
 * Returns null — not an error, and not zeros — when LinkedIn will not serve
 * them. A 403 is the permission missing on this connection specifically and a
 * 404 is a post LinkedIn no longer has analytics for; both leave the engagement
 * half of the answer intact and the exposure half null, which is the honest
 * description of what we know.
 */
async function fetchPostAnalytics(
  accessToken: string,
  urn: string,
): Promise<LinkedInPostAnalyticsElement | null> {
  try {
    const response = await axios.get<LinkedInPostAnalyticsResponse>(
      `${LINKEDIN_REST_URL}/memberPostAnalytics`,
      {
        params: { q: 'post', post: urn },
        headers: versionedHeaders(accessToken),
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return response.data?.elements?.[0] ?? null;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    // 400 covers a version that no longer serves this query shape. All three
    // are "LinkedIn will not answer this", which is an absence. Anything else —
    // a dead token, a rate limit, LinkedIn down — must reach the sync service,
    // which is the only thing that knows how to back off.
    if (status === 400 || status === 403 || status === 404) return null;
    throw toProviderError(error, 'post analytics request');
  }
}

/**
 * Reads performance for posts this member published.
 *
 * Returns one entry per post either endpoint answered for. A post deleted from
 * LinkedIn comes back in `errors` rather than `results` and is omitted, which
 * is a normal outcome. Callers key on `platformPostId`.
 */
export async function fetchPostMetrics(
  input: ProviderMetricsRequest,
): Promise<ProviderPostMetrics[]> {
  const urns = input.platformPostIds.filter((id) => id.trim().length > 0);
  if (urns.length === 0) return [];

  const results: ProviderPostMetrics[] = [];

  for (let start = 0; start < urns.length; start += MAX_IDS_PER_REQUEST) {
    const batch = urns.slice(start, start + MAX_IDS_PER_REQUEST);
    const social = await fetchSocialActions(input.accessToken, batch);

    for (const urn of batch) {
      const engagement = social.get(urn);
      const analytics = await fetchPostAnalytics(input.accessToken, urn);

      // Neither endpoint had anything. Deleted, or never visible to this token
      // — an absence, and writing a snapshot of nulls for it would put a row in
      // the series claiming we observed something.
      if (!engagement && !analytics) continue;

      results.push({
        platformPostId: urn,
        mediaType: mediaTypeOf(urn),
        metrics: normalizeMetrics(engagement, analytics),
        raw: { socialActions: engagement ?? null, analytics },
      });
    }
  }

  return results;
}

/**
 * LinkedIn reports no member-level audience figures.
 *
 * Follower counts exist for *organization* pages, behind
 * `r_organization_social` and an admin relationship FlowPost does not have —
 * member connections are personal profiles, and LinkedIn exposes no connection
 * or follower count for one through any API this app can reach.
 *
 * So this returns nulls rather than being absent. The distinction matters: an
 * absent `fetchAccountMetrics` would mean "not implemented yet", where this
 * says "asked and answered — LinkedIn does not report these". Nothing is
 * fabricated to fill the row, and the sync service records the observation as
 * the honest empty it is.
 */
export async function fetchAccountMetrics(
  _input: ProviderAccountMetricsRequest,
): Promise<ProviderAccountMetrics> {
  const metrics: NormalizedAccountMetrics = {
    followers: null,
    following: null,
    postCount: null,
    impressions: null,
    reach: null,
    profileViews: null,
  };

  return { metrics, raw: null };
}

export const linkedinAnalytics: ProviderAnalytics = {
  requiredScopes: REQUIRED_SCOPES,
  postMetricsMaxAgeDays: POST_ANALYTICS_MAX_AGE_DAYS,
  postMetricsBatchSize: MAX_IDS_PER_REQUEST,
  hasRequiredScopes,
  fetchPostMetrics,
  // Deliberately absent. There is nothing to read — see the note above — and
  // registering a function that returns a row of nulls every day would fill
  // `account_metric_snapshots` with observations that observed nothing.
};

// Exported for the unit tests, which drive the pure normalisation without a
// network. The HTTP shell above is what a test cannot reach without one.
export const __testables = {
  mediaTypeOf,
  normalizeMetrics,
  hasRequiredScopes,
  fetchAccountMetrics,
};

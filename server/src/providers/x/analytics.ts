import axios from 'axios';
import { xConfig } from './config';
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
} from '../provider.interface';
import type {
  XAccountMetricsResponse,
  XMediaNode,
  XPostMetrics,
  XTweetNode,
  XTweetsResponse,
} from './types';

/**
 * Reading X's performance data.
 *
 * X was the first network FlowPost could do this for, and is still the only one
 * that works on a connection nobody had to remake — not because it is the
 * easiest, but because its *already granted* scopes permit it. `tweet.read` and
 * `users.read` are requested for publishing and profile display and happen to
 * be exactly what the metrics endpoints need.
 *
 * Instagram, Facebook and LinkedIn now have adapters too, each behind a
 * permission that has to be approved and granted before it will answer — see
 * `providers/analytics-scopes.ts`. Nothing about X's path changed when they
 * arrived, which was the point of the `ProviderAnalytics` contract.
 *
 * ─── What is real here, and what is absent ───────────────────────────────────
 * Every number below is copied from X's response. Nothing is derived, filled
 * in, or estimated. A metric X does not return becomes `null`, propagated all
 * the way to the API, and the UI's job is to say "unavailable" rather than
 * "0" — see `NormalizedPostMetrics`.
 *
 * ─── The 30-day cliff ────────────────────────────────────────────────────────
 * `public_metrics` works forever. `organic_metrics` and `non_public_metrics` —
 * which is where link clicks, profile clicks and author-side impressions live —
 * are served only for posts created in the last 30 days, and asking for them on
 * an older post makes X reject the *whole request*, including the public
 * metrics that would have been fine.
 *
 * So this module asks twice: once for everything, and if that is refused, once
 * for public metrics alone. A 31-day-old post therefore still yields real like
 * and repost counts, with nulls where the private metrics would have been. The
 * alternative — one request that fails — would mean a member's analytics
 * silently stopping a month after they connected.
 *
 * Nothing in this module touches Prisma or our tables. It takes a token and
 * ids, and hands back normalised numbers.
 */

/** Everything worth having about a post, in one request. */
const TWEET_FIELDS_PUBLIC = 'created_at,public_metrics,attachments';

/**
 * The same plus the author-only envelopes. Tried first; falls back to
 * {@link TWEET_FIELDS_PUBLIC} when X refuses — see the 30-day note above.
 */
const TWEET_FIELDS_FULL = `${TWEET_FIELDS_PUBLIC},organic_metrics,non_public_metrics`;

/** Resolves `attachments.media_keys` into the media's actual type. */
const MEDIA_EXPANSION = 'attachments.media_keys';
const MEDIA_FIELDS = 'type';

/**
 * How many ids `GET /2/tweets` accepts in one call. X's documented ceiling.
 *
 * Worth respecting rather than exceeding-and-retrying: X charges per post read,
 * so a rejected oversized batch is a request that costs nothing and achieves
 * nothing, and the retry pays twice.
 */
const MAX_IDS_PER_REQUEST = 100;

/**
 * Past this age X will not serve organic metrics at all.
 *
 * The sync service reads this to stop requesting posts it can never get a full
 * answer for. Public metrics survive beyond it, which is why this is advisory
 * to the *scheduler* rather than a hard filter here.
 */
const ORGANIC_METRICS_WINDOW_DAYS = 30;

/**
 * The scopes these calls need.
 *
 * `tweet.read` covers the post lookup and `users.read` the account lookup. Both
 * are already in `X_SCOPES` and have been since before analytics existed, which
 * is the entire reason X ships first. A connection made before those scopes
 * were requested — or by a member who declined one — is caught by
 * {@link hasRequiredScopes} and reported as "reconnect", never as zero.
 */
const REQUIRED_SCOPES = ['tweet.read', 'users.read'] as const;

function hasRequiredScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

/**
 * A number X actually sent, or null.
 *
 * The distinction this function exists to preserve: `undefined` means X did not
 * report the metric, and must stay null all the way to the client. A real zero
 * — a post that genuinely got no likes — passes through as 0. Collapsing the
 * two would put "not measured" into an average as if it were "measured none",
 * which is how a reach figure ends up quietly wrong.
 */
function metric(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Prefers the author-side figure, falls back to the public one.
 *
 * Only impressions need this. X reports them in `non_public_metrics` (author
 * view, last 30 days) and also, for newer posts, in `public_metrics`. The two
 * agree closely and the author-side one is the more complete, so it wins when
 * present.
 */
function firstReported(...values: Array<number | undefined>): number | null {
  for (const value of values) {
    const parsed = metric(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * X's media vocabulary, mapped to ours.
 *
 * `animated_gif` is filed as VIDEO deliberately: it autoplays, loops and is
 * measured with video metrics, so grouping it with static images would blur the
 * one comparison media-type analytics exists to make. More than one photo
 * becomes CAROUSEL — X calls it a multi-photo post, but it swipes, and the
 * question a member is asking is "does a swipeable post do better than a single
 * image", which is the same question on every network.
 */
function mediaTypeOf(
  tweet: XTweetNode,
  mediaByKey: Map<string, XMediaNode>,
): ProviderMediaType | null {
  const keys = tweet.attachments?.media_keys ?? [];
  if (keys.length === 0) {
    // No attachments is a genuine format, not a missing answer: on X that is a
    // text post, and X told us so by returning the post without media keys.
    return 'TEXT';
  }

  const types = keys
    .map((key) => mediaByKey.get(key)?.type)
    .filter((type): type is string => typeof type === 'string');

  // Keys we could not resolve. X gave us attachments but not what they are, so
  // the honest answer is "unknown" — which leaves whatever was inferred at
  // publish time standing rather than overwriting it with a guess.
  if (types.length === 0) return null;

  if (types.some((type) => type === 'video' || type === 'animated_gif')) {
    return 'VIDEO';
  }
  if (types.length > 1) return 'CAROUSEL';
  if (types[0] === 'photo') return 'IMAGE';

  return 'OTHER';
}

/**
 * One post's numbers, from whichever envelopes came back.
 *
 * `reach` is absent on purpose and always null: X does not report unique reach
 * for a post, only impressions. Deriving one from the other — even with a
 * plausible ratio — would be exactly the invented number this system was built
 * to remove.
 */
function normalizeMetrics(tweet: XTweetNode): NormalizedPostMetrics {
  const pub: XPostMetrics = tweet.public_metrics ?? {};
  const organic: XPostMetrics = tweet.organic_metrics ?? {};
  const nonPublic: XPostMetrics = tweet.non_public_metrics ?? {};

  return {
    impressions: firstReported(
      nonPublic.impression_count,
      organic.impression_count,
      pub.impression_count,
    ),
    // X reports impressions, never unique reach. Null, permanently.
    reach: null,
    views: null,
    likes: firstReported(organic.like_count, pub.like_count),
    comments: firstReported(organic.reply_count, pub.reply_count),
    // A quote is a share of the post with commentary; a retweet is a repost.
    // Kept in separate columns because they are separate behaviours and
    // summing them would double-count a quote-retweet.
    shares: metric(pub.quote_count),
    reposts: firstReported(organic.retweet_count, pub.retweet_count),
    saves: metric(pub.bookmark_count),
    clicks: firstReported(organic.url_link_clicks, nonPublic.url_link_clicks),
    // Video metrics need a separate `media.fields=public_metrics` read against
    // the media object; not requested yet, so honestly null rather than zero.
    videoViews: null,
    watchTimeMs: null,
  };
}

/** One page of ids, with the organic-metrics fallback applied. */
async function fetchBatch(
  accessToken: string,
  ids: string[],
): Promise<XTweetsResponse> {
  const request = (fields: string) =>
    axios.get<XTweetsResponse>(`${xConfig.apiUrl}/tweets`, {
      params: {
        ids: ids.join(','),
        'tweet.fields': fields,
        expansions: MEDIA_EXPANSION,
        'media.fields': MEDIA_FIELDS,
      },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: REQUEST_TIMEOUT_MS,
    });

  try {
    const response = await request(TWEET_FIELDS_FULL);
    return response.data;
  } catch (error) {
    // 400 and 403 are what X answers when a batch contains a post too old for
    // organic metrics, or when the app is not entitled to them at all. Both are
    // recoverable by asking for less. Anything else — a dead token, a rate
    // limit, X being down — is a real failure and must not be swallowed into a
    // half-answer that looks like a complete one.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status !== 400 && status !== 403) {
      throw toProviderError(error, 'post metrics request');
    }

    try {
      const response = await request(TWEET_FIELDS_PUBLIC);
      return response.data;
    } catch (fallbackError) {
      throw toProviderError(fallbackError, 'post metrics request');
    }
  }
}

/**
 * Reads performance for posts this account published.
 *
 * Returns one entry per post X answered for, which is routinely fewer than were
 * asked for — a deleted post comes back in `errors` rather than `data`, and
 * that is a normal outcome. Callers key on `platformPostId`.
 */
export async function fetchPostMetrics(
  input: ProviderMetricsRequest,
): Promise<ProviderPostMetrics[]> {
  const ids = input.platformPostIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return [];

  const results: ProviderPostMetrics[] = [];

  for (let start = 0; start < ids.length; start += MAX_IDS_PER_REQUEST) {
    const batch = ids.slice(start, start + MAX_IDS_PER_REQUEST);
    const body = await fetchBatch(input.accessToken, batch);

    const mediaByKey = new Map<string, XMediaNode>(
      (body.includes?.media ?? [])
        .filter((node): node is XMediaNode & { media_key: string } =>
          typeof node?.media_key === 'string',
        )
        .map((node) => [node.media_key, node]),
    );

    for (const tweet of body.data ?? []) {
      const platformPostId = tweet?.id?.trim();
      if (!platformPostId) continue;

      results.push({
        platformPostId,
        mediaType: mediaTypeOf(tweet, mediaByKey),
        metrics: normalizeMetrics(tweet),
        raw: tweet,
      });
    }
  }

  return results;
}

/**
 * Reads the connected account's audience.
 *
 * `/2/users/me` rather than a lookup by id: the token *is* the account, and
 * asking by id would work equally well right up until a token and a stored
 * `providerAccountId` disagreed, at which point it would silently return
 * somebody else's follower count.
 */
export async function fetchAccountMetrics(
  input: ProviderAccountMetricsRequest,
): Promise<ProviderAccountMetrics> {
  let body: XAccountMetricsResponse;

  try {
    const response = await axios.get<XAccountMetricsResponse>(
      `${xConfig.apiUrl}/users/me`,
      {
        params: { 'user.fields': 'public_metrics' },
        headers: { Authorization: `Bearer ${input.accessToken}` },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    body = response.data;
  } catch (error) {
    throw toProviderError(error, 'account metrics request');
  }

  const counts = body?.data?.public_metrics ?? {};

  const metrics: NormalizedAccountMetrics = {
    followers: metric(counts.followers_count),
    following: metric(counts.following_count),
    postCount: metric(counts.tweet_count),
    // X exposes no account-level impressions, reach or profile-view totals
    // through the v2 user endpoint. Null, and they stay null.
    impressions: null,
    reach: null,
    profileViews: null,
  };

  return { metrics, raw: body?.data ?? null };
}

export const xAnalytics: ProviderAnalytics = {
  requiredScopes: REQUIRED_SCOPES,
  postMetricsMaxAgeDays: ORGANIC_METRICS_WINDOW_DAYS,
  postMetricsBatchSize: MAX_IDS_PER_REQUEST,
  hasRequiredScopes,
  fetchPostMetrics,
  fetchAccountMetrics,
};

// Exported for the unit tests, which drive the pure normalisation without a
// network. The HTTP shell above is what a test cannot reach without one.
export const __testables = { mediaTypeOf, normalizeMetrics, hasRequiredScopes };

import type { ProviderId } from '../providers/provider.interface';

/**
 * What each network actually measures, so nothing is compared that should not be.
 *
 * ─── Why this has to be written down ─────────────────────────────────────────
 *
 * "1,842" beside "7" invites a conclusion, and on this data the conclusion
 * would be wrong: Instagram's 1,842 is **reach** — unique accounts — and
 * LinkedIn's 7 is **impressions** — appearances. They are different
 * measurements of different things, and a column headed "Views" containing both
 * is a chart that lies without a single fabricated number in it.
 *
 * So every exposure figure carries the name of what it actually is, sourced
 * here rather than guessed at render time. This file is derived from the
 * adapters — each entry matches what the provider's own `analytics.ts`
 * genuinely populates — and it is the adapters, not this, that decide what gets
 * stored. Nothing here fills a gap; it only labels one.
 *
 * ─── Media-level analytics ───────────────────────────────────────────────────
 *
 * No network FlowPost integrates returns per-asset metrics for a multi-image
 * post. Instagram reports a carousel's numbers on the *container*, not on its
 * children; LinkedIn and Facebook report on the post. That is a fact about
 * their APIs, not a gap in our sync, and the honest answer is to say so.
 *
 * The temptation this exists to refuse is dividing a post's engagement across
 * its assets — 126 interactions over 3 slides becoming "42 each". That number
 * would be fabricated, it would look plausible, and it would be the basis of
 * every "which image works" answer the product later gives.
 */

/**
 * Which metric a network reports for "how many saw this".
 *
 * `reach` is unique people; `impressions` is appearances. A network that
 * reports neither has no exposure figure at all and is honest about it.
 */
export type ExposureMetric = 'reach' | 'impressions' | 'views' | null;

export interface ProviderMetricSupport {
  /** The exposure metric this network reports, and what to call it on screen. */
  exposure: ExposureMetric;
  /** The member-facing label for {@link exposure}. Null when there is none. */
  exposureLabel: string | null;
  /**
   * Metrics this network genuinely reports for a post, out of the normalised
   * set. Anything absent is permanently null for this provider — not missing,
   * not pending, not zero.
   */
  reports: readonly MetricName[];
  /**
   * Whether the network returns metrics for individual media assets within one
   * publication.
   *
   * False everywhere today. Kept as a declared capability rather than an
   * assumption so that the day Instagram ships per-child insights, one entry
   * changes and the UI stops saying "unavailable" — instead of the answer being
   * hardcoded into a component.
   */
  mediaLevel: boolean;
  /** Why media-level analytics are unavailable, written for a member. */
  mediaLevelNote: string;
}

export type MetricName =
  | 'impressions'
  | 'reach'
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'reposts'
  | 'saves'
  | 'clicks'
  | 'videoViews'
  | 'watchTimeMs';

const NO_MEDIA_LEVEL =
  'This platform reports metrics for the post, not for individual media.';

export const PROVIDER_METRIC_SUPPORT: Record<ProviderId, ProviderMetricSupport> = {
  instagram: {
    // Meta removed media `impressions` in v22 and replaced it with `views`;
    // `reach` survived and is the unique-accounts figure. Reach is therefore
    // the exposure metric here, and impressions is permanently absent.
    exposure: 'reach',
    exposureLabel: 'Reach',
    reports: [
      'reach',
      'views',
      'likes',
      'comments',
      'shares',
      'saves',
      'videoViews',
      'watchTimeMs',
    ],
    mediaLevel: false,
    // Carousels are the case members ask about most: Instagram reports on the
    // container, so the numbers belong to the post and not to slide three.
    mediaLevelNote:
      'Instagram reports metrics for the whole post, including carousels — not per image.',
  },

  facebook: {
    // No exposure metric at all, as of Graph v26.
    //
    // `post_impressions` and `post_impressions_unique` are not valid metric
    // names any more — Meta rejects the request that names them rather than
    // returning them empty — so there is nothing to read and nothing to label.
    // Recorded here so the UI renders "—" for Facebook exposure: permanently
    // unreported, which is neither "collecting" nor zero. Restore both the day
    // Meta ships replacements, and change `providers/meta/facebook/analytics.ts`
    // in the same commit — this file only ever labels what that one populates.
    exposure: null,
    exposureLabel: null,
    reports: ['likes', 'comments', 'shares', 'clicks', 'videoViews', 'watchTimeMs'],
    mediaLevel: false,
    mediaLevelNote: NO_MEDIA_LEVEL,
  },

  linkedin: {
    exposure: 'impressions',
    exposureLabel: 'Impressions',
    reports: ['impressions', 'reach', 'likes', 'comments', 'reposts', 'clicks'],
    mediaLevel: false,
    mediaLevelNote: NO_MEDIA_LEVEL,
  },

  x: {
    // X reports impressions and never unique reach — see `providers/x/analytics.ts`,
    // where `reach` is permanently null rather than derived from impressions.
    exposure: 'impressions',
    exposureLabel: 'Impressions',
    reports: [
      'impressions',
      'likes',
      'comments',
      'shares',
      'reposts',
      'saves',
      'clicks',
    ],
    mediaLevel: false,
    mediaLevelNote: NO_MEDIA_LEVEL,
  },

  youtube: {
    // No adapter. Nothing is claimed.
    exposure: null,
    exposureLabel: null,
    reports: [],
    mediaLevel: false,
    mediaLevelNote: NO_MEDIA_LEVEL,
  },
};

/** What one network measures. Everything unknown reports nothing. */
export function metricSupportFor(provider: string): ProviderMetricSupport {
  return (
    PROVIDER_METRIC_SUPPORT[provider as ProviderId] ?? {
      exposure: null,
      exposureLabel: null,
      reports: [],
      mediaLevel: false,
      mediaLevelNote: NO_MEDIA_LEVEL,
    }
  );
}

/**
 * Whether this network ever reports this metric.
 *
 * The distinction a caller needs to render honestly: a metric the network never
 * reports is "—" permanently, where one it does report but has not yet sent is
 * "collecting". Both are null in the data and they are not the same sentence.
 */
export function reportsMetric(provider: string, metric: MetricName): boolean {
  return metricSupportFor(provider).reports.includes(metric);
}

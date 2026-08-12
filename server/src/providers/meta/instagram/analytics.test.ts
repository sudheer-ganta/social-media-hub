import { describe, expect, it } from 'vitest';
import { __testables, instagramAnalytics } from './analytics';
import type { InstagramInsightNode, InstagramMediaInfoNode } from './types';

const { mediaTypeOf, metricsFor, normalizeMetrics, readInsight, hasRequiredScopes } =
  __testables;

/**
 * The pure half of the Instagram adapter: what Meta's response shapes become.
 *
 * The HTTP shell around it needs a network and is exercised by the sync path;
 * what matters here is that nothing invents a metric Meta did not send, and
 * that a Story is never asked for a metric a Story does not have.
 */

/** The newer per-metric total envelope. */
function total(name: string, value: unknown): InstagramInsightNode {
  return { name, total_value: { value } };
}

/** The older time-series envelope. Both are live on this API. */
function series(name: string, value: unknown): InstagramInsightNode {
  return { name, values: [{ value }] };
}

describe('hasRequiredScopes', () => {
  it('needs the insights permission, not just the publishing one', () => {
    // A connection made before the analytics scope existed holds exactly this,
    // and must be reported as "reconnect" rather than as an account with no
    // engagement.
    expect(
      hasRequiredScopes([
        'instagram_business_basic',
        'instagram_business_content_publish',
      ]),
    ).toBe(false);
  });

  it('accepts a connection that granted insights', () => {
    expect(
      hasRequiredScopes([
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_insights',
      ]),
    ).toBe(true);
  });

  it('refuses an empty grant rather than failing later on a 403', () => {
    expect(hasRequiredScopes([])).toBe(false);
  });
});

describe('metricsFor', () => {
  it('never asks a Story for saves or likes — the request would fail entirely', () => {
    // Meta does not null out an unsupported metric; it rejects the whole call.
    const story = metricsFor('STORY');
    expect(story).not.toContain('saved');
    expect(story).not.toContain('likes');
    expect(story).toContain('replies');
    expect(story).toContain('navigation');
  });

  it('never asks a Reel for navigation, which is a Story concept', () => {
    const reel = metricsFor('REELS');
    expect(reel).not.toContain('navigation');
    expect(reel).toContain('ig_reels_video_view_total_time');
  });

  it('treats an unknown or absent product type as feed', () => {
    // A safe default: the feed set is the one every non-Story surface accepts.
    expect(metricsFor(undefined)).toEqual(metricsFor('FEED'));
    expect(metricsFor('AD')).toEqual(metricsFor('FEED'));
  });

  it('never asks for impressions — Meta removed it in v22', () => {
    for (const type of ['FEED', 'REELS', 'STORY'] as const) {
      expect(metricsFor(type)).not.toContain('impressions');
    }
  });
});

describe('readInsight', () => {
  it('reads the newer total_value envelope', () => {
    expect(readInsight([total('reach', 412)], 'reach')).toBe(412);
  });

  it('reads the older values[] envelope', () => {
    expect(readInsight([series('reach', 412)], 'reach')).toBe(412);
  });

  it('returns null for a metric Meta did not send', () => {
    expect(readInsight([total('reach', 10)], 'saved')).toBeNull();
  });

  it('preserves a genuine zero rather than collapsing it to null', () => {
    // The whole point of the convention: 0 saves is a measurement, and it must
    // not read the same as "Instagram did not tell us".
    expect(readInsight([total('saved', 0)], 'saved')).toBe(0);
  });

  it('returns null for a non-numeric value rather than NaN', () => {
    expect(readInsight([total('reach', 'lots')], 'reach')).toBeNull();
  });
});

describe('mediaTypeOf', () => {
  it('files a REELS product as a Reel, whatever the media type says', () => {
    // Both axes say "video"; only media_product_type says which surface.
    const node: InstagramMediaInfoNode = {
      media_type: 'VIDEO',
      media_product_type: 'REELS',
    };
    expect(mediaTypeOf(node)).toBe('REEL');
  });

  it('files the same video on the feed as VIDEO, not REEL', () => {
    expect(
      mediaTypeOf({ media_type: 'VIDEO', media_product_type: 'FEED' }),
    ).toBe('VIDEO');
  });

  it('files a STORY as STORY', () => {
    expect(
      mediaTypeOf({ media_type: 'IMAGE', media_product_type: 'STORY' }),
    ).toBe('STORY');
  });

  it('files a carousel album as CAROUSEL', () => {
    expect(
      mediaTypeOf({ media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED' }),
    ).toBe('CAROUSEL');
  });

  it('files a single feed image as IMAGE', () => {
    expect(
      mediaTypeOf({ media_type: 'IMAGE', media_product_type: 'FEED' }),
    ).toBe('IMAGE');
  });

  it('returns null — never TEXT — when Meta said nothing', () => {
    // Instagram cannot publish a text post, so TEXT would be a claim about a
    // format that does not exist here. Null leaves the publish-time inference
    // standing.
    expect(mediaTypeOf({})).toBeNull();
  });
});

describe('normalizeMetrics', () => {
  it('leaves impressions null and does not substitute views', () => {
    // Meta removed media impressions in v22. Copying views into it would make
    // Instagram and X's impression figures look comparable when they are not.
    const metrics = normalizeMetrics([total('views', 5000)], 'FEED');
    expect(metrics.impressions).toBeNull();
    expect(metrics.views).toBe(5000);
  });

  it('reads a feed post the way Meta reports it', () => {
    const metrics = normalizeMetrics(
      [
        total('reach', 1200),
        total('views', 1500),
        total('likes', 84),
        total('comments', 7),
        total('saved', 12),
        total('shares', 3),
      ],
      'FEED',
    );

    expect(metrics.reach).toBe(1200);
    expect(metrics.likes).toBe(84);
    expect(metrics.comments).toBe(7);
    expect(metrics.saves).toBe(12);
    expect(metrics.shares).toBe(3);
    // Not a video, so no video view figure is claimed.
    expect(metrics.videoViews).toBeNull();
  });

  it('maps a Story reply to comments rather than inventing a column', () => {
    const metrics = normalizeMetrics(
      [total('reach', 300), total('views', 340), total('replies', 5)],
      'STORY',
    );
    expect(metrics.comments).toBe(5);
    // A Story has neither, and asking for them would have failed the request.
    expect(metrics.likes).toBeNull();
    expect(metrics.saves).toBeNull();
  });

  it('carries a Reel’s views into videoViews and converts watch time to ms', () => {
    const metrics = normalizeMetrics(
      [total('views', 9000), total('ig_reels_video_view_total_time', 45)],
      'REELS',
    );
    expect(metrics.views).toBe(9000);
    expect(metrics.videoViews).toBe(9000);
    // Seconds on the wire, milliseconds in the column.
    expect(metrics.watchTimeMs).toBe(45_000);
  });

  it('nulls every metric Meta omitted instead of zeroing them', () => {
    const metrics = normalizeMetrics([total('reach', 10)], 'FEED');

    expect(metrics.likes).toBeNull();
    expect(metrics.comments).toBeNull();
    expect(metrics.saves).toBeNull();
    expect(metrics.shares).toBeNull();
    expect(metrics.watchTimeMs).toBeNull();
  });

  it('keeps clicks and reposts permanently null — Instagram reports neither', () => {
    const metrics = normalizeMetrics(
      [total('profile_visits', 40), total('reach', 10)],
      'FEED',
    );
    // profile_visits is a tap through to the profile, not a link click. Filing
    // it as `clicks` would put it beside X's link clicks as if they matched.
    expect(metrics.clicks).toBeNull();
    expect(metrics.reposts).toBeNull();
  });

  it('preserves a reported zero', () => {
    const metrics = normalizeMetrics([total('likes', 0)], 'FEED');
    expect(metrics.likes).toBe(0);
  });
});

describe('the adapter contract', () => {
  it('declares the scope and horizon the sync service reads', () => {
    expect(instagramAnalytics.requiredScopes).toContain(
      'instagram_business_manage_insights',
    );
    expect(instagramAnalytics.postMetricsMaxAgeDays).toBeGreaterThan(0);
    // No `postMetricsBatchSize`: Meta retired the batched `?ids=` node read and
    // now answers it with HTTP 500. Each publication is read on its own.
    expect(instagramAnalytics.postMetricsBatchSize).toBeUndefined();
    expect(instagramAnalytics.fetchPostMetrics).toBeTypeOf('function');
    expect(instagramAnalytics.fetchAccountMetrics).toBeTypeOf('function');
  });
});

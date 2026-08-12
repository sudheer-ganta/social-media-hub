import { describe, expect, it } from 'vitest';
import { __testables, facebookAnalytics } from './analytics';
import type { FacebookInsightNode, FacebookPostInsightNode } from './types';

const { mediaTypeOf, normalizeMetrics, readInsight, hasRequiredScopes } =
  __testables;

/**
 * The pure half of the Facebook adapter: what Page Insights becomes.
 *
 * Two things are being defended here. That a metric this API version no longer
 * serves stays null rather than becoming zero — and that the one place a
 * missing field legitimately *is* zero (`shares`, which Meta omits entirely on
 * an unshared post) is the only such place.
 */

function insight(name: string, value: unknown): FacebookInsightNode {
  return { name, period: 'lifetime', values: [{ value }] };
}

describe('hasRequiredScopes', () => {
  it('needs read_insights, not just the publishing permissions', () => {
    // What every connection made before this phase holds.
    expect(
      hasRequiredScopes([
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
      ]),
    ).toBe(false);
  });

  it('accepts a connection that granted insights', () => {
    expect(
      hasRequiredScopes([
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'read_insights',
      ]),
    ).toBe(true);
  });

  it('refuses read_insights without pages_read_engagement', () => {
    // Half the read. Reported as "reconnect" rather than as a series whose
    // engagement gaps would render as zeros.
    expect(hasRequiredScopes(['read_insights'])).toBe(false);
  });
});

describe('readInsight', () => {
  it('reads the lifetime value out of the time-series envelope', () => {
    expect(readInsight([insight('post_impressions', 890)], 'post_impressions')).toBe(
      890,
    );
  });

  it('takes the newest entry when a metric has several periods', () => {
    const node: FacebookInsightNode = {
      name: 'page_impressions',
      period: 'day',
      values: [{ value: 10 }, { value: 20 }, { value: 30 }],
    };
    expect(readInsight([node], 'page_impressions')).toBe(30);
  });

  it('returns null for a metric this API version no longer serves', () => {
    // The deprecation case. Absent must not become zero.
    expect(readInsight([insight('post_impressions', 5)], 'post_clicks')).toBeNull();
  });

  it('returns null rather than NaN for a breakdown object', () => {
    // post_reactions_by_type_total is `{like: 12, love: 3}`, not a number.
    expect(
      readInsight([insight('post_reactions_by_type_total', { like: 12 })], 'post_reactions_by_type_total'),
    ).toBeNull();
  });

  it('preserves a reported zero', () => {
    expect(readInsight([insight('post_clicks', 0)], 'post_clicks')).toBe(0);
  });

  it('returns null for an empty values array', () => {
    expect(readInsight([{ name: 'post_impressions', values: [] }], 'post_impressions'))
      .toBeNull();
  });
});

describe('mediaTypeOf', () => {
  it('files a post with no attachment as TEXT', () => {
    // Meta answered the node read and there was nothing attached. On a Page
    // that is a genuine text status, not a missing answer.
    expect(mediaTypeOf({ id: '1_2', status_type: 'mobile_status_update' })).toBe(
      'TEXT',
    );
  });

  it('files a single photo as IMAGE', () => {
    const node: FacebookPostInsightNode = {
      id: '1_2',
      attachments: { data: [{ media_type: 'photo' }] },
    };
    expect(mediaTypeOf(node)).toBe('IMAGE');
  });

  it('files a multi-photo post as CAROUSEL on the subattachment count', () => {
    // Meta reports a photo set as one `photo` attachment with children — the
    // child count is the only thing distinguishing it from a single image.
    const node: FacebookPostInsightNode = {
      id: '1_2',
      attachments: {
        data: [{ media_type: 'photo', subattachments: { data: [{}, {}, {}] } }],
      },
    };
    expect(mediaTypeOf(node)).toBe('CAROUSEL');
  });

  it('does not call a one-child attachment a carousel', () => {
    const node: FacebookPostInsightNode = {
      id: '1_2',
      attachments: {
        data: [{ media_type: 'photo', subattachments: { data: [{}] } }],
      },
    };
    expect(mediaTypeOf(node)).toBe('IMAGE');
  });

  it('files video as VIDEO — never REEL, which FlowPost does not publish', () => {
    const node: FacebookPostInsightNode = {
      id: '1_2',
      attachments: { data: [{ media_type: 'video' }] },
    };
    // Reel insights use different metric names; assuming a Page post's names
    // apply to them is the assumption the adapter refuses to make.
    expect(mediaTypeOf(node)).toBe('VIDEO');
  });

  it('returns null when the node itself never came back', () => {
    expect(mediaTypeOf({})).toBeNull();
  });
});

describe('normalizeMetrics', () => {
  const node: FacebookPostInsightNode = {
    id: '1_2',
    comments: { summary: { total_count: 9 } },
    shares: { count: 4 },
    reactions: { summary: { total_count: 51 } },
  };

  it('reads engagement from the node and clicks from insights', () => {
    const metrics = normalizeMetrics(node, [insight('post_clicks', 87)]);

    // The whole reason both sources are read.
    expect(metrics.likes).toBe(51);
    expect(metrics.comments).toBe(9);
    expect(metrics.reposts).toBeNull();
    expect(metrics.shares).toBe(4);
    expect(metrics.clicks).toBe(87);
  });

  it('leaves impressions and reach null — v26 serves neither', () => {
    // `post_impressions` and `post_impressions_unique` are not valid metric
    // names any more: Meta answers `(#100) The value must be a valid insights
    // metric` and refuses the whole request. They are no longer requested, so
    // there is nothing to read and nothing may be substituted for them.
    const metrics = normalizeMetrics(node, [
      insight('post_impressions', 3000),
      insight('post_impressions_unique', 2100),
    ]);

    expect(metrics.impressions).toBeNull();
    expect(metrics.reach).toBeNull();
  });

  it('falls back to the reaction breakdown when the node counts were refused', () => {
    // A connection without `pages_read_user_content` gets no `reactions`
    // summary — the insights breakdown is the only reaction figure left, and
    // it is Meta's own total rather than anything derived.
    const metrics = normalizeMetrics({ id: '1_2' }, [
      { name: 'post_reactions_by_type_total', values: [{ value: { like: 3, love: 1, wow: 0 } }] },
    ] as never);

    expect(metrics.likes).toBe(4);
  });

  it('prefers the node count over the breakdown when both are present', () => {
    const metrics = normalizeMetrics(node, [
      { name: 'post_reactions_by_type_total', values: [{ value: { like: 2 } }] },
    ] as never);

    expect(metrics.likes).toBe(51);
  });

  it('still reports engagement when the insights half was refused', () => {
    // The partial-grant case: read_insights declined on this Page. Real comment
    // and share counts beat a row of nulls.
    const metrics = normalizeMetrics(node, []);

    expect(metrics.likes).toBe(51);
    expect(metrics.comments).toBe(9);
    expect(metrics.shares).toBe(4);
    expect(metrics.impressions).toBeNull();
    expect(metrics.reach).toBeNull();
    expect(metrics.clicks).toBeNull();
  });

  it('treats an omitted shares object as a reported zero', () => {
    // The one place in this codebase a missing field becomes 0 rather than
    // null, and only because the *engagement read* came back: Meta omits
    // `shares` entirely on a post nobody shared rather than sending {count: 0}.
    // Evidenced by a sibling field of that same read being present.
    const metrics = normalizeMetrics(
      { id: '1_2', comments: { summary: { total_count: 0 } } },
      [],
    );
    expect(metrics.shares).toBe(0);
  });

  it('leaves shares null when the engagement read was refused', () => {
    // `pages_read_user_content` missing: the post node came back, its comment
    // and reaction counts did not. An unread share count is not zero shares.
    const metrics = normalizeMetrics({ id: '1_2' }, []);
    expect(metrics.shares).toBeNull();
  });

  it('leaves shares null when the node never came back at all', () => {
    const metrics = normalizeMetrics({}, []);
    expect(metrics.shares).toBeNull();
  });

  it('keeps saves and views permanently null — Facebook reports neither', () => {
    const metrics = normalizeMetrics(node, [insight('post_clicks', 10)]);
    expect(metrics.saves).toBeNull();
    expect(metrics.views).toBeNull();
  });

  it('carries video watch time in Meta’s own unit without converting', () => {
    const metrics = normalizeMetrics(node, [
      insight('post_video_views', 640),
      insight('post_video_view_time', 128_000),
    ]);
    expect(metrics.videoViews).toBe(640);
    // Already milliseconds on this API — unlike Instagram's seconds.
    expect(metrics.watchTimeMs).toBe(128_000);
  });

  it('nulls a metric that was not returned instead of zeroing it', () => {
    const metrics = normalizeMetrics(node, [insight('post_clicks', 100)]);
    expect(metrics.clicks).toBe(100);
    expect(metrics.videoViews).toBeNull();
    expect(metrics.watchTimeMs).toBeNull();
  });

  it('preserves a reported zero', () => {
    const metrics = normalizeMetrics(
      { id: '1_2', reactions: { summary: { total_count: 0 } } },
      [insight('post_clicks', 0)],
    );
    expect(metrics.likes).toBe(0);
    expect(metrics.clicks).toBe(0);
  });
});

describe('deprecated API regression', () => {
  // Meta answers the batched `?ids=` form with HTTP 500 —
  // `code 100, "The ids query parameter is deprecated in v26.0+"` — which
  // classifies as a temporary failure and silently ended every Facebook post
  // sync. Verified against the live API on 2026-08-12.
  it('requests no metric name Meta has retired', () => {
    for (const dead of [
      'post_impressions',
      'post_impressions_unique',
      'post_impressions_organic',
      'post_engaged_users',
    ]) {
      expect(__testables.POST_METRICS).not.toContain(dead);
    }

    for (const dead of ['page_impressions', 'page_impressions_unique', 'page_fans']) {
      expect(__testables.PAGE_METRICS).not.toContain(dead);
    }
  });

  it('sums a reaction breakdown and refuses to invent one', () => {
    const read = (values: unknown[]) =>
      __testables.sumInsightBreakdown(
        [{ name: 'post_reactions_by_type_total', values }] as never,
        'post_reactions_by_type_total',
      );

    expect(read([{ value: { like: 5, love: 2 } }])).toBe(7);
    // An empty breakdown is a metric we could not read, not zero reactions.
    expect(read([{ value: {} }])).toBeNull();
    expect(read([])).toBeNull();
  });
});

describe('the adapter contract', () => {
  it('declares the scope and horizon the sync service reads', () => {
    expect(facebookAnalytics.requiredScopes).toContain('read_insights');
    expect(facebookAnalytics.postMetricsMaxAgeDays).toBeGreaterThan(0);
    // No `postMetricsBatchSize`: there is no batched form left to size.
    expect(facebookAnalytics.postMetricsBatchSize).toBeUndefined();
    expect(facebookAnalytics.fetchPostMetrics).toBeTypeOf('function');
    expect(facebookAnalytics.fetchAccountMetrics).toBeTypeOf('function');
  });
});

import { describe, expect, it } from 'vitest';
import { __testables, xAnalytics } from './analytics';
import type { XMediaNode, XTweetNode } from './types';

const { mediaTypeOf, normalizeMetrics, hasRequiredScopes } = __testables;

/**
 * The pure half of the X adapter: what X's response shapes become.
 *
 * The HTTP shell around it needs a network and is exercised by the sync path;
 * what matters here is that nothing invents a metric X did not send.
 */

function mediaMap(...nodes: XMediaNode[]) {
  return new Map(nodes.map((node) => [node.media_key!, node]));
}

describe('hasRequiredScopes', () => {
  it('accepts the scopes X connections have always been granted', () => {
    // This is why X ships first: tweet.read and users.read were requested for
    // publishing and profile display long before analytics existed.
    expect(
      hasRequiredScopes([
        'tweet.read',
        'tweet.write',
        'users.read',
        'media.write',
        'offline.access',
      ]),
    ).toBe(true);
  });

  it('refuses a connection missing one, rather than failing later on a 403', () => {
    expect(hasRequiredScopes(['tweet.read', 'tweet.write'])).toBe(false);
    expect(hasRequiredScopes([])).toBe(false);
  });
});

describe('normalizeMetrics', () => {
  it('keeps reach null — X reports impressions, never unique reach', () => {
    // Deriving reach from impressions with a plausible ratio is exactly the
    // invented number this system exists to remove.
    const metrics = normalizeMetrics({ public_metrics: { impression_count: 900 } });
    expect(metrics.impressions).toBe(900);
    expect(metrics.reach).toBeNull();
  });

  it('prefers the author-side impression count when X sends both', () => {
    const metrics = normalizeMetrics({
      public_metrics: { impression_count: 100 },
      non_public_metrics: { impression_count: 140 },
    });
    expect(metrics.impressions).toBe(140);
  });

  it('nulls every metric X omitted instead of zeroing them', () => {
    // A 31-day-old post gets public metrics only. Link clicks are genuinely
    // unknown, and 0 clicks would be a different — and false — claim.
    const metrics = normalizeMetrics({
      public_metrics: { like_count: 4, reply_count: 1 },
    });
    expect(metrics.likes).toBe(4);
    expect(metrics.comments).toBe(1);
    expect(metrics.clicks).toBeNull();
    expect(metrics.saves).toBeNull();
    expect(metrics.videoViews).toBeNull();
  });

  it('keeps quotes and reposts apart so a quote-retweet is not counted twice', () => {
    const metrics = normalizeMetrics({
      public_metrics: { quote_count: 2, retweet_count: 7 },
    });
    expect(metrics.shares).toBe(2);
    expect(metrics.reposts).toBe(7);
  });

  it('preserves a genuine zero', () => {
    const metrics = normalizeMetrics({ public_metrics: { like_count: 0 } });
    expect(metrics.likes).toBe(0);
  });
});

describe('mediaTypeOf', () => {
  it('reads a post with no attachments as TEXT', () => {
    // X told us: it returned the post without media keys. That is a format,
    // not a missing answer.
    expect(mediaTypeOf({}, mediaMap())).toBe('TEXT');
  });

  it('reads one photo as IMAGE and several as CAROUSEL', () => {
    const tweet: XTweetNode = { attachments: { media_keys: ['a'] } };
    expect(
      mediaTypeOf(tweet, mediaMap({ media_key: 'a', type: 'photo' })),
    ).toBe('IMAGE');

    const many: XTweetNode = { attachments: { media_keys: ['a', 'b'] } };
    expect(
      mediaTypeOf(
        many,
        mediaMap(
          { media_key: 'a', type: 'photo' },
          { media_key: 'b', type: 'photo' },
        ),
      ),
    ).toBe('CAROUSEL');
  });

  it('files an animated gif as VIDEO', () => {
    const tweet: XTweetNode = { attachments: { media_keys: ['a'] } };
    expect(
      mediaTypeOf(tweet, mediaMap({ media_key: 'a', type: 'animated_gif' })),
    ).toBe('VIDEO');
  });

  it('returns null when attachments could not be resolved', () => {
    // X gave us keys but not what they are. Null leaves whatever was inferred
    // at publish time standing rather than overwriting it with a guess — and
    // crucially it does not claim TEXT, which would be wrong.
    const tweet: XTweetNode = { attachments: { media_keys: ['missing'] } };
    expect(mediaTypeOf(tweet, mediaMap())).toBeNull();
  });
});

describe('the adapter contract', () => {
  it('declares the 30-day organic-metrics window so syncs stop asking', () => {
    expect(xAnalytics.postMetricsMaxAgeDays).toBe(30);
  });

  it('declares a batch size, so a sync cannot exceed what X accepts', () => {
    expect(xAnalytics.postMetricsBatchSize).toBe(100);
  });
});

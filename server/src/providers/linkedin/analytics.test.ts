import { describe, expect, it } from 'vitest';
import { __testables, linkedinAnalytics } from './analytics';
import type {
  LinkedInPostAnalyticsElement,
  LinkedInSocialActionNode,
} from './types';

const { mediaTypeOf, normalizeMetrics, hasRequiredScopes, fetchAccountMetrics } =
  __testables;

/**
 * The pure half of the LinkedIn adapter: what its two endpoints become.
 *
 * The split is what is being defended here. Reactions and comments come from
 * `socialActions`, which every connection can read; impressions and clicks come
 * from `memberPostAnalytics`, which needs a scope a member can decline. A post
 * with only the first must still produce real engagement numbers with null
 * exposure — not a row of zeros, and not nothing at all.
 */

const social: LinkedInSocialActionNode = {
  likesSummary: { totalLikes: 34 },
  commentsSummary: { aggregatedTotalComments: 6 },
};

const analytics: LinkedInPostAnalyticsElement = {
  impressionCount: 2400,
  uniqueImpressionsCount: 1800,
  shareCount: 5,
  clickCount: 41,
};

describe('hasRequiredScopes', () => {
  it('needs the analytics scope, not just the publishing one', () => {
    // What every LinkedIn connection made before this phase holds.
    expect(hasRequiredScopes(['openid', 'profile', 'w_member_social'])).toBe(false);
  });

  it('accepts a connection that granted post analytics', () => {
    expect(
      hasRequiredScopes([
        'openid',
        'profile',
        'w_member_social',
        'r_member_postAnalytics',
      ]),
    ).toBe(true);
  });

  it('refuses the analytics scope alone — the engagement read needs the other', () => {
    expect(hasRequiredScopes(['r_member_postAnalytics'])).toBe(false);
  });
});

describe('mediaTypeOf', () => {
  it('never claims a format from a URN alone', () => {
    // A URN carries the container, not the contents. Guessing IMAGE from
    // `urn:li:share:` would overwrite a correct CAROUSEL with a wrong label on
    // the very first sync — so null, which leaves the publish-time inference
    // standing.
    expect(mediaTypeOf('urn:li:share:7123456789')).toBeNull();
    expect(mediaTypeOf('urn:li:ugcPost:7123456789')).toBeNull();
  });
});

describe('normalizeMetrics', () => {
  it('reads both endpoints when both answered', () => {
    const metrics = normalizeMetrics(social, analytics);

    expect(metrics.likes).toBe(34);
    expect(metrics.comments).toBe(6);
    expect(metrics.impressions).toBe(2400);
    expect(metrics.reach).toBe(1800);
    expect(metrics.clicks).toBe(41);
  });

  it('counts a repost once, under one name', () => {
    // A repost *is* the share on LinkedIn. Writing the count into both columns
    // would double it in any sum across them.
    const metrics = normalizeMetrics(social, analytics);
    expect(metrics.reposts).toBe(5);
    expect(metrics.shares).toBeNull();
  });

  it('still reports engagement when the analytics half was refused', () => {
    // The partial-grant and deprecated-shape cases both land here.
    const metrics = normalizeMetrics(social, null);

    expect(metrics.likes).toBe(34);
    expect(metrics.comments).toBe(6);
    expect(metrics.impressions).toBeNull();
    expect(metrics.reach).toBeNull();
    expect(metrics.clicks).toBeNull();
    expect(metrics.reposts).toBeNull();
  });

  it('falls back to the analytics element when socialActions said nothing', () => {
    const metrics = normalizeMetrics(undefined, {
      ...analytics,
      reactionCount: 30,
      commentCount: 4,
    });
    expect(metrics.likes).toBe(30);
    expect(metrics.comments).toBe(4);
  });

  it('prefers the live engagement read over the analytics copy', () => {
    // The analytics element's copy can lag a release behind the post itself.
    const metrics = normalizeMetrics(social, {
      ...analytics,
      reactionCount: 12,
      commentCount: 1,
    });
    expect(metrics.likes).toBe(34);
    expect(metrics.comments).toBe(6);
  });

  it('accepts the older aggregatedTotalLikes field name', () => {
    const metrics = normalizeMetrics(
      { likesSummary: { aggregatedTotalLikes: 19 } },
      null,
    );
    expect(metrics.likes).toBe(19);
  });

  it('nulls everything when neither endpoint reported anything', () => {
    const metrics = normalizeMetrics(undefined, undefined);

    for (const value of Object.values(metrics)) {
      expect(value).toBeNull();
    }
  });

  it('keeps saves and views permanently null — LinkedIn exposes neither', () => {
    const metrics = normalizeMetrics(social, analytics);
    expect(metrics.saves).toBeNull();
    expect(metrics.views).toBeNull();
  });

  it('nulls a renamed field rather than crashing or guessing', () => {
    // A versioned surface that moved a metric. The defence is that every read
    // narrows, so a shape change produces a null and never a wrong number.
    const metrics = normalizeMetrics(social, {
      impressionCount: 'many' as unknown as number,
    });
    expect(metrics.impressions).toBeNull();
    expect(metrics.likes).toBe(34);
  });

  it('preserves a reported zero', () => {
    const metrics = normalizeMetrics(
      { likesSummary: { totalLikes: 0 } },
      { impressionCount: 0 },
    );
    expect(metrics.likes).toBe(0);
    expect(metrics.impressions).toBe(0);
  });
});

describe('account metrics', () => {
  it('reports nulls rather than fabricating a member follower count', () => {
    // LinkedIn exposes no follower or connection count for a personal profile
    // through any API this app can reach.
    return fetchAccountMetrics({
      accessToken: 'token',
      providerAccountId: 'sub',
    }).then((result) => {
      for (const value of Object.values(result.metrics)) {
        expect(value).toBeNull();
      }
    });
  });
});

describe('the adapter contract', () => {
  it('declares the scope, horizon and batch size the sync service reads', () => {
    expect(linkedinAnalytics.requiredScopes).toContain('r_member_postAnalytics');
    expect(linkedinAnalytics.postMetricsMaxAgeDays).toBeGreaterThan(0);
    expect(linkedinAnalytics.postMetricsBatchSize).toBeGreaterThan(0);
    expect(linkedinAnalytics.fetchPostMetrics).toBeTypeOf('function');
  });

  it('registers no account-metrics reader, because there is nothing to read', () => {
    // Absent rather than a function returning nulls: registering one would fill
    // account_metric_snapshots with daily observations that observed nothing.
    expect(linkedinAnalytics.fetchAccountMetrics).toBeUndefined();
  });
});

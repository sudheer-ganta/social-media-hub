/**
 * The regression that cost a member every post metric they had.
 *
 * Meta retired the batched `?ids=` multi-node read on **both** hosts and now
 * answers it with an HTTP 500 rather than a 4xx:
 *
 *   graph.instagram.com → IGApiException      code 100
 *   graph.facebook.com  → FacebookApiException code 100
 *   "The ids query parameter is deprecated in v26.0+"
 *
 * A 500 classifies as `temporary` (see `analytics/sync-errors.ts`), so both
 * adapters failed the *first* call of the post sync, backed off, retried, and
 * never reached the insights endpoints — which work perfectly. Nothing was
 * logged as broken because a retryable failure is, by design, not alarming.
 *
 * Verified against the live API on 2026-08-12 with a real connection: the
 * batched form 500s and the per-id form returns 200. These tests pin the shape
 * of the request so a future refactor cannot reintroduce it.
 *
 * Run: cd server && npx vitest run src/providers/deprecated-node-reads.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const get = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: { get, isAxiosError: (e: unknown) => Boolean((e as any)?.isAxiosError) },
  isAxiosError: (e: unknown) => Boolean((e as any)?.isAxiosError),
}));

import { fetchPostMetrics as instagramPostMetrics } from './meta/instagram/analytics';
import { fetchPostMetrics as facebookPostMetrics } from './meta/facebook/analytics';

/** Every URL and param set the adapter asked for, in order. */
const calls = () => get.mock.calls.map(([url, cfg]) => ({ url, params: cfg?.params ?? {} }));

beforeEach(() => {
  get.mockReset();
});

describe('Instagram post metrics', () => {
  beforeEach(() => {
    get.mockImplementation(async (url: string) =>
      url.endsWith('/insights')
        ? { data: { data: [{ name: 'reach', total_value: { value: 3 } }] } }
        : { data: { id: '18376', media_type: 'IMAGE', media_product_type: 'FEED' } },
    );
  });

  it('never sends the retired ids parameter', async () => {
    await instagramPostMetrics({ accessToken: 't', platformPostIds: ['18376', '18377'] });

    expect(calls().length).toBeGreaterThan(0);
    for (const call of calls()) {
      expect(call.params).not.toHaveProperty('ids');
    }
  });

  it('reads each publication as its own node', async () => {
    await instagramPostMetrics({ accessToken: 't', platformPostIds: ['18376', '18377'] });

    const nodeReads = calls().filter((c) => !c.url.endsWith('/insights'));
    expect(nodeReads).toHaveLength(2);
    expect(nodeReads[0]!.url).toContain('18376');
    expect(nodeReads[1]!.url).toContain('18377');
  });

  it('still returns the metrics the insights call answered with', async () => {
    const results = await instagramPostMetrics({
      accessToken: 't',
      platformPostIds: ['18376'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.metrics.reach).toBe(3);
    // Never substituted from reach, whatever the shape of the response.
    expect(results[0]!.metrics.impressions).toBeNull();
  });

  it('omits media that is gone without failing the whole account', async () => {
    // 400/404 on the node read is a deleted post or an expired Story. The
    // absence must not become a failure that stands the whole account down.
    get.mockImplementation(async (url: string) => {
      if (url.includes('18377')) throw notFound(400);
      return url.endsWith('/insights')
        ? { data: { data: [{ name: 'reach', total_value: { value: 3 } }] } }
        : { data: { id: '18376', media_type: 'IMAGE', media_product_type: 'FEED' } };
    });

    const results = await instagramPostMetrics({
      accessToken: 't',
      platformPostIds: ['18376', '18377'],
    });

    expect(results.map((r) => r.platformPostId)).toEqual(['18376']);
  });

  it('lets a real failure reach the sync service, which knows how to back off', async () => {
    // The exact failure this file is named for, in case Meta ever serves it
    // again from somewhere else: a 500 must propagate, not be swallowed as an
    // absence — otherwise an outage looks like an account with no posts.
    get.mockRejectedValue(notFound(500));

    await expect(
      instagramPostMetrics({ accessToken: 't', platformPostIds: ['18376'] }),
    ).rejects.toThrow();
  });
});

describe('Facebook post metrics', () => {
  beforeEach(() => {
    get.mockImplementation(async (url: string, cfg: any) => {
      if (url.endsWith('/insights')) {
        return { data: { data: [{ name: 'post_clicks', values: [{ value: 5 }] }] } };
      }
      return String(cfg?.params?.fields).includes('comments')
        ? { data: { id: '1_2', comments: { summary: { total_count: 9 } }, shares: { count: 4 } } }
        : { data: { id: '1_2', created_time: '2026-08-12T07:17:28+0000' } };
    });
  });

  it('never sends the retired ids parameter', async () => {
    await facebookPostMetrics({ accessToken: 't', platformPostIds: ['1_2'] });

    expect(calls().length).toBeGreaterThan(0);
    for (const call of calls()) {
      expect(call.params).not.toHaveProperty('ids');
    }
  });

  it('asks for no metric name Meta has retired', async () => {
    await facebookPostMetrics({ accessToken: 't', platformPostIds: ['1_2'] });

    const requested = calls()
      .map((c) => String(c.params.metric ?? ''))
      .join(',');

    // Each of these fails the *entire* request with `(#100) The value must be
    // a valid insights metric`, which is how Facebook came to have no insights
    // at all rather than a missing column.
    for (const dead of [
      'post_impressions',
      'post_impressions_unique',
      'post_impressions_organic',
      'post_engaged_users',
    ]) {
      expect(requested).not.toContain(dead);
    }
  });

  it('keeps the publication when the engagement fields are refused', async () => {
    // `pages_read_user_content` missing: Meta refuses the comment and reaction
    // summaries. The format, the timestamp and every insights metric are still
    // real, and the counts we could not read stay null rather than becoming 0.
    get.mockImplementation(async (url: string, cfg: any) => {
      if (url.endsWith('/insights')) {
        return { data: { data: [{ name: 'post_clicks', values: [{ value: 5 }] }] } };
      }
      if (String(cfg?.params?.fields).includes('comments')) throw notFound(400);
      return { data: { id: '1_2', created_time: '2026-08-12T07:17:28+0000' } };
    });

    const results = await facebookPostMetrics({ accessToken: 't', platformPostIds: ['1_2'] });

    expect(results).toHaveLength(1);
    expect(results[0]!.metrics.clicks).toBe(5);
    expect(results[0]!.metrics.likes).toBeNull();
    expect(results[0]!.metrics.comments).toBeNull();
    expect(results[0]!.metrics.shares).toBeNull();
  });
});

/** An axios-shaped rejection the adapters can classify. */
function notFound(status: number) {
  return { isAxiosError: true, response: { status, data: {} }, message: `HTTP ${status}` };
}

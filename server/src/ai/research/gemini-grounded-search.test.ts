import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gemini + Google Search grounding — request shape and response parsing.
 *
 * The response fixtures below are copied from a real probe against the live
 * API while building this (not guessed from docs): `groundingChunks[].web`
 * carries `uri` as a Google redirect link and `title` as, in practice, the
 * bare domain — see the header of gemini-grounded-search.ts.
 *
 * Run: cd server && npx vitest run src/ai/research/gemini-grounded-search.test.ts
 */

vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

const post = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { post } }));

import { groundedSearch, isGroundedSearchConfigured } from './gemini-grounded-search';

beforeEach(() => {
  post.mockReset();
});

const REAL_SHAPE_RESPONSE = {
  data: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: 'A major viral marketing trend for restaurants in 2026 relies on authentic behind-the-scenes short-form video.',
            },
          ],
        },
        finishReason: 'STOP',
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', title: 'nrn.com' } },
            { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', title: 'youtube.com' } },
          ],
          webSearchQueries: ['restaurant viral marketing trends 2026', 'viral marketing trends for restaurants 2026'],
        },
      },
    ],
  },
};

describe('isGroundedSearchConfigured', () => {
  it('is true whenever GEMINI_API_KEY is set — no separate research key required', () => {
    expect(isGroundedSearchConfigured()).toBe(true);
  });
});

describe('groundedSearch', () => {
  it('sends the googleSearch tool and no responseSchema — Gemini rejects the two combined', async () => {
    post.mockResolvedValueOnce(REAL_SHAPE_RESPONSE);
    await groundedSearch('system', 'prompt');

    const [, body] = post.mock.calls[0];
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.generationConfig.responseSchema).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it('parses grounding chunks into sources, using the domain-shaped title as domain', async () => {
    post.mockResolvedValueOnce(REAL_SHAPE_RESPONSE);
    const result = await groundedSearch('system', 'prompt');

    expect(result?.text).toContain('viral marketing trend');
    expect(result?.sources).toEqual([
      { title: 'nrn.com', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA', domain: 'nrn.com' },
      { title: 'youtube.com', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB', domain: 'youtube.com' },
    ]);
  });

  it('dedupes sources that share the same redirect URL', async () => {
    post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: { parts: [{ text: 'note' }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://x.test/a', title: 'a.com' } },
                { web: { uri: 'https://x.test/a', title: 'a.com' } },
              ],
            },
          },
        ],
      },
    });

    const result = await groundedSearch('system', 'prompt');
    expect(result?.sources).toHaveLength(1);
  });

  it('returns null, not throws, on a transport failure — never blocks generation', async () => {
    post.mockRejectedValueOnce(new Error('network down'));
    const result = await groundedSearch('system', 'prompt');
    expect(result).toBeNull();
  });

  it('returns null when the prompt is blocked', async () => {
    post.mockResolvedValueOnce({ data: { promptFeedback: { blockReason: 'SAFETY' } } });
    const result = await groundedSearch('system', 'prompt');
    expect(result).toBeNull();
  });

  it('returns null when there is no usable text, even with a 200', async () => {
    post.mockResolvedValueOnce({ data: { candidates: [{ content: { parts: [] } }] } });
    const result = await groundedSearch('system', 'prompt');
    expect(result).toBeNull();
  });
});

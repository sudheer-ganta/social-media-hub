import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, post } };
});

import { GeminiProvider } from './gemini.provider';

const truncated = { data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a":' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8192 } } };
const ok = { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } };

// The provider reuses one request body and changes it between attempts, so what each
// attempt sent has to be recorded when the call is made, not read back afterwards.
const caps: number[] = [];
const timeouts: number[] = [];
const respond = (...replies: unknown[]) => {
  let n = 0;
  post.mockImplementation(async (_url: string, body: { generationConfig: { maxOutputTokens: number } }, config: { timeout: number }) => {
    caps.push(body.generationConfig.maxOutputTokens);
    timeouts.push(config.timeout);
    return replies[Math.min(n++, replies.length - 1)];
  });
};
const cap = (call: number) => caps[call];
const timeout = (call: number) => timeouts[call];

describe('GeminiProvider.generateJson on a truncated reply', () => {
  beforeEach(() => { post.mockReset(); caps.length = 0; timeouts.length = 0; });

  it('retries with twice the room instead of the same cap that already failed', async () => {
    respond(truncated, ok);
    const provider = new GeminiProvider('key', 'gemini-test');
    await expect(provider.generateJson({ systemInstruction: 's', prompt: 'p' })).resolves.toEqual({ a: 1 });
    expect(cap(0)).toBe(8192);
    expect(cap(1)).toBe(16_384);
  });

  it('doubles from an explicit cap too, and never past the ceiling', async () => {
    respond(truncated, ok);
    const provider = new GeminiProvider('key', 'gemini-test');
    await provider.generateJson({ systemInstruction: 's', prompt: 'p', maxOutputTokens: 30_000 });
    expect(cap(0)).toBe(30_000);
    expect(cap(1)).toBe(32_768);
  });

  it('gives up with an error when it is still truncated after the last attempt', async () => {
    respond(truncated);
    const provider = new GeminiProvider('key', 'gemini-test');
    await expect(provider.generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toMatchObject({ status: 502 });
    expect(post).toHaveBeenCalledTimes(3);
    expect(caps).toEqual([8192, 16_384, 32_768]);
  });
});

describe('GeminiProvider.generateJson timeout', () => {
  beforeEach(() => { post.mockReset(); caps.length = 0; timeouts.length = 0; });

  it('uses the default timeout unless the call asks for more', async () => {
    respond(ok);
    const provider = new GeminiProvider('key', 'gemini-test');
    await provider.generateJson({ systemInstruction: 's', prompt: 'p' });
    await provider.generateJson({ systemInstruction: 's', prompt: 'p', timeoutMs: 90_000 });
    expect(timeout(0)).toBe(45_000);
    expect(timeout(1)).toBe(90_000);
  });
});

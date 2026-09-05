import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini.provider';

vi.mock('axios');

describe('Gemini Developer API authentication', () => {
  afterEach(() => vi.clearAllMocks());

  it('sends the API key in x-goog-api-key and never as a bearer token', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      },
    });

    const provider = new GeminiProvider('AQ.test-authorization-key', 'gemini-2.5-flash');
    await provider.generateJson({
      systemInstruction: 'Test',
      prompt: 'Respond with JSON.',
      responseSchema: { type: 'object' },
    });

    const [url, , config] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(config?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'AQ.test-authorization-key',
    });
    expect(config?.headers).not.toHaveProperty('Authorization');
  });
});

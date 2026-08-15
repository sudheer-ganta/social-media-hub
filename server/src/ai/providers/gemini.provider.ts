import axios, { AxiosError } from 'axios';
import { env } from '../../config/env';
import {
  AiProviderError,
  type AiTextProvider,
  type GenerateJsonOptions,
} from './provider.interface';

/**
 * Gemini, over the Generative Language REST API.
 *
 * Called with `axios` rather than `@google/generative-ai`: the SDK would be a
 * dependency to keep patched for one POST, and the backend already carries
 * axios for the LinkedIn provider. The request shape is the documented
 * `generateContent` body — see `make/gemini-request-body.json`, which is the
 * same call the retired Make scenario made.
 *
 * ─── Where the key lives ─────────────────────────────────────────────────────
 * `GEMINI_API_KEY` is read from the server's environment and never leaves this
 * file. It is not in any response body, not in a log line, and not reachable
 * from the browser — the SPA's only route to a model is `POST /api/ai/caption`.
 */

/** Generative Language API base. Versioned path, so pin it here not in env. */
const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

/** A slow model still beats a hung request holding an Express worker. */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Generous on purpose. Three captions, a hashtag list and a caption per
 * platform is a lot of JSON, and on a thinking model the reasoning tokens come
 * out of the same budget — 2048 truncated a routine three-variation request
 * mid-string, which surfaces as an unparseable payload rather than an obvious
 * limit error. Output is billed by what is used, not by this ceiling.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * Thinking models bill for reasoning before answering, and a caption is a
 * writing task, not a reasoning one — latency here is watched by a user with
 * a spinner in front of them.
 *
 * The knob is generation-dependent, and the two dialects are mutually
 * exclusive — never send both fields in one request:
 *  - Gemini 3.x cannot disable thinking (budget 0 is a 422: "This model only
 *    works in thinking mode") and takes `thinkingLevel` instead.
 *    `GEMINI_THINKING_LEVEL` defaults to "low", the fastest level it allows.
 *  - Gemini 2.5 takes a token count via `GEMINI_THINKING_BUDGET`; 0 skips the
 *    reasoning pass entirely, -1 hands the decision back to the model.
 *  - Older models reject either field with a 400, so they get neither.
 */
function thinkingConfigFor(
  model: string,
): { thinkingLevel: string } | { thinkingBudget: number } | undefined {
  if (/^gemini-[3-9]/.test(model)) {
    return { thinkingLevel: env.GEMINI_THINKING_LEVEL };
  }
  if (/^gemini-2\.5/.test(model)) {
    const configured = Number.parseInt(env.GEMINI_THINKING_BUDGET, 10);
    return { thinkingBudget: Number.isFinite(configured) ? configured : 0 };
  }
  return undefined;
}

/** One retry, and only for failures that are plausibly transient. */
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 800;

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Pulls the JSON object out of a completion.
 *
 * `responseMimeType: application/json` normally makes this a plain
 * `JSON.parse`, but a model that ignores it wraps the object in a ```json
 * fence, and a truncated reply produces neither. Both are handled here so the
 * generator above only ever sees "parsed object" or "AiProviderError".
 */
function parseJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    // Last resort: the model prefixed prose. Take the outermost braces.
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AiProviderError(
      'The AI returned a response we could not read. Please try again.',
      502,
      true,
      `unparseable payload: ${unfenced.slice(0, 300)}`,
    );
  }
}

/** Maps a transport failure to the answer the member should see. */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;

  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  const status = axiosError.response?.status;
  const vendorMessage =
    axiosError.response?.data?.error?.message ?? axiosError.message;

  if (axiosError.code === 'ECONNABORTED') {
    return new AiProviderError(
      'The AI took too long to respond. Please try again.',
      504,
      true,
      vendorMessage,
    );
  }

  // 401/403 is our key, not the member's problem — say so without leaking why.
  if (status === 401 || status === 403) {
    return new AiProviderError(
      'AI generation is not configured correctly. Please contact support.',
      500,
      false,
      vendorMessage,
    );
  }

  if (status === 429) {
    return new AiProviderError(
      'The AI is busy right now. Please try again in a moment.',
      429,
      true,
      vendorMessage,
    );
  }

  if (status && status >= 500) {
    return new AiProviderError(
      'The AI service is temporarily unavailable. Please try again.',
      502,
      true,
      vendorMessage,
    );
  }

  if (status === 400) {
    return new AiProviderError(
      'The AI rejected this request. Try rephrasing your title or topic.',
      422,
      false,
      vendorMessage,
    );
  }

  return new AiProviderError(
    'AI generation failed. Please try again.',
    502,
    true,
    vendorMessage,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiProvider implements AiTextProvider {
  readonly id = 'gemini';

  /**
   * Every Gemini model this app can be pointed at is multimodal, so an image
   * part is always understood. Kept as a flag rather than assumed, because the
   * generator asks the provider before it pays to download an image.
   */
  readonly supportsVision = true;

  constructor(
    private readonly apiKey: string = env.GEMINI_API_KEY,
    readonly model: string = env.GEMINI_MODEL,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateJson(options: GenerateJsonOptions): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new AiProviderError(
        'AI generation is not available — no model is configured.',
        503,
        false,
        'GEMINI_API_KEY is empty',
      );
    }

    const body = {
      systemInstruction: {
        parts: [{ text: options.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          // Images first. Gemini attends to a question asked *after* the
          // picture more reliably than one asked before it, and the prompt is
          // the question in both stages.
          parts: [
            ...(options.images ?? []).map((image) => ({
              inlineData: { mimeType: image.mimeType, data: image.data },
            })),
            { text: options.prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.9,
        maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        // Native structured output. The generator still validates the result:
        // schema enforcement constrains the shape, not the sense.
        responseMimeType: 'application/json',
        responseSchema: options.responseSchema,
        ...(thinkingConfigFor(this.model) && {
          thinkingConfig: thinkingConfigFor(this.model),
        }),
      },
    };

    let lastError: AiProviderError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const { data } = await axios.post<GeminiResponse>(
          `${GEMINI_API_BASE}/${this.model}:generateContent`,
          body,
          {
            timeout: REQUEST_TIMEOUT_MS,
            // The key rides in a header, not the query string, so it cannot
            // end up in a proxy's access log.
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
          },
        );

        if (data.promptFeedback?.blockReason) {
          // Not retryable and not our bug: the request itself was refused.
          throw new AiProviderError(
            'The AI declined to write about this. Try a different topic or wording.',
            422,
            false,
            `blocked: ${data.promptFeedback.blockReason}`,
          );
        }

        const candidate = data.candidates?.[0];

        // Caught before parsing, because a truncated reply is *almost* valid
        // JSON and would otherwise be reported as "we could not read the
        // response" — which sends whoever debugs it looking in the wrong place.
        if (candidate?.finishReason === 'MAX_TOKENS') {
          throw new AiProviderError(
            'The AI ran out of room before it finished. Try a shorter caption length or fewer options.',
            502,
            true,
            `hit maxOutputTokens on ${this.model}`,
          );
        }

        const text = candidate?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim();

        if (!text) {
          throw new AiProviderError(
            'The AI returned an empty response. Please try again.',
            502,
            true,
            `finishReason: ${candidate?.finishReason ?? 'none'}`,
          );
        }

        return parseJsonPayload(text);
      } catch (error) {
        lastError = toProviderError(error);

        if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;

        console.warn('[ai] gemini attempt failed, retrying', {
          attempt,
          model: this.model,
          detail: lastError.detail,
        });
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }

    console.error('[ai] gemini generation failed', {
      model: this.model,
      status: lastError?.status,
      detail: lastError?.detail,
    });
    throw lastError ?? new AiProviderError('AI generation failed.', 502, true);
  }
}

// One instance per workload, same key, different model. Which generator gets
// which instance is decided by `providerForRole` in `providers/index.ts` —
// nothing else should import these directly.
export const geminiProvider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
export const geminiCaptionProvider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_CAPTION_MODEL);
export const geminiVisionProvider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_VISION_MODEL);
export const geminiMarketingProvider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MARKETING_MODEL);
export const geminiLightProvider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_LIGHT_MODEL);
export const geminiFastProvider = new GeminiProvider(env.GEMINI_API_KEY, env.FAST_TEXT_MODEL);
export const geminiCreativeProvider = new GeminiProvider(env.GEMINI_API_KEY, env.CREATIVE_TEXT_MODEL);

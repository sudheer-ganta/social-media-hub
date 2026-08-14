import axios, { AxiosError } from 'axios';
import { env } from '../../config/env';
import { AiProviderError } from './provider.interface';
import type {
  AiImageProvider,
  GenerateImageOptions,
  GeneratedImagePart,
} from './image-provider.interface';

/**
 * Gemini's image-output mode, over the same Generative Language REST API
 * `gemini.provider.ts` already calls — `generateContent`, same auth header,
 * same axios dependency. The only real difference is the response modality:
 * text generation asks for `responseMimeType: application/json` and reads a
 * string back; this asks for `responseModalities: ["IMAGE"]` and reads
 * `inlineData` image parts back instead.
 *
 * Pinned to a Flash Image model (`gemini-2.5-flash-image` by default) rather
 * than Imagen, because it is the only Gemini image model that accepts
 * reference images alongside the prompt — a product photo or logo rides in
 * `referenceImages` the same way vision's `images` do, and the model is asked
 * to preserve what it's shown rather than invent a replacement. Imagen's
 * `generateContent`-compatible surface is text-to-image only.
 */

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

/** Image generation runs slower than a JSON caption call. */
const REQUEST_TIMEOUT_MS = 60_000;

const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 800;

interface GeminiImagePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiImageCandidate {
  content?: { parts?: GeminiImagePart[] };
  finishReason?: string;
}

interface GeminiImageResponse {
  candidates?: GeminiImageCandidate[];
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Maps a transport failure to the answer the member should see. Mirrors gemini.provider.ts. */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;

  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  const status = axiosError.response?.status;
  const vendorMessage =
    axiosError.response?.data?.error?.message ?? axiosError.message;

  if (axiosError.code === 'ECONNABORTED') {
    return new AiProviderError(
      'Image generation took too long. Please try again.',
      504,
      true,
      vendorMessage,
    );
  }

  if (status === 401 || status === 403) {
    return new AiProviderError(
      'Image generation is not configured correctly. Please contact support.',
      500,
      false,
      vendorMessage,
    );
  }

  if (status === 429) {
    return new AiProviderError(
      'Image generation is busy right now. Please try again in a moment.',
      429,
      true,
      vendorMessage,
    );
  }

  if (status && status >= 500) {
    return new AiProviderError(
      'The image service is temporarily unavailable. Please try again.',
      502,
      true,
      vendorMessage,
    );
  }

  if (status === 400) {
    return new AiProviderError(
      'The image request was rejected. Try a different prompt or reference image.',
      422,
      false,
      vendorMessage,
    );
  }

  return new AiProviderError(
    'Image generation failed. Please try again.',
    502,
    true,
    vendorMessage,
  );
}

/** Ratios Gemini's image_config actually accepts. FlowPost's platform vocabulary includes ones it doesn't (e.g. LinkedIn's 1.91:1 → 422), so anything else snaps to the numerically nearest supported ratio; the renderer's final canvas still uses the requested ratio and covers the difference. */
const GEMINI_ASPECT_RATIOS = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];

export function snapAspectRatio(requested: string): string {
  const trimmed = requested.trim();
  if (GEMINI_ASPECT_RATIOS.includes(trimmed)) return trimmed;
  const parse = (ratio: string): number => {
    const [w, h] = ratio.split(':').map(Number);
    return w / h;
  };
  const target = /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(trimmed) ? parse(trimmed) : 1;
  return GEMINI_ASPECT_RATIOS.reduce((best, candidate) =>
    Math.abs(parse(candidate) - target) < Math.abs(parse(best) - target) ? candidate : best,
  );
}

export class GeminiImageProvider implements AiImageProvider {
  readonly id = 'gemini';

  constructor(
    private readonly apiKey: string = env.GEMINI_API_KEY,
    readonly model: string = env.GEMINI_IMAGE_MODEL,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateImage(options: GenerateImageOptions): Promise<GeneratedImagePart[]> {
    if (!this.isConfigured()) {
      throw new AiProviderError(
        'Image generation is not available — no model is configured.',
        503,
        false,
        'GEMINI_API_KEY is empty',
      );
    }

    const body = {
      contents: [
        {
          role: 'user',
          // References first, same reasoning as gemini.provider.ts: the model
          // attends to a request made *after* the pixels more reliably than
          // one made before them.
          parts: [
            ...(options.referenceImages ?? []).map((image) => ({
              inlineData: { mimeType: image.mimeType, data: image.data },
            })),
            { text: options.prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(options.aspectRatio && {
          imageConfig: { aspectRatio: snapAspectRatio(options.aspectRatio) },
        }),
        ...(options.count && options.count > 1 && {
          candidateCount: Math.min(options.count, 4),
        }),
      },
    };

    let lastError: AiProviderError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const { data } = await axios.post<GeminiImageResponse>(
          `${GEMINI_API_BASE}/${this.model}:generateContent`,
          body,
          {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
          },
        );

        if (data.promptFeedback?.blockReason) {
          throw new AiProviderError(
            'The AI declined to generate this image. Try a different prompt.',
            422,
            false,
            `blocked: ${data.promptFeedback.blockReason}`,
          );
        }

        const images: GeneratedImagePart[] = (data.candidates ?? [])
          .flatMap((candidate) => candidate.content?.parts ?? [])
          .filter(
            (part): part is GeminiImagePart & { inlineData: { mimeType: string; data: string } } =>
              Boolean(part.inlineData?.data && part.inlineData?.mimeType),
          )
          .map((part) => ({
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
          }));

        if (images.length === 0) {
          throw new AiProviderError(
            'The AI did not return an image. Please try again.',
            502,
            true,
            `finishReason: ${data.candidates?.[0]?.finishReason ?? 'none'}`,
          );
        }

        return images;
      } catch (error) {
        lastError = toProviderError(error);

        if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;

        console.warn('[ai] gemini image attempt failed, retrying', {
          attempt,
          model: this.model,
          detail: lastError.detail,
        });
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }

    console.error('[ai] gemini image generation failed', {
      model: this.model,
      status: lastError?.status,
      detail: lastError?.detail,
    });
    throw lastError ?? new AiProviderError('Image generation failed.', 502, true);
  }
}

export const geminiImageProvider = new GeminiImageProvider(
  env.GEMINI_API_KEY,
  env.GEMINI_IMAGE_MODEL,
);

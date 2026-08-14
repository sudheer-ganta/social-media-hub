import axios, { AxiosError } from 'axios';
import { env } from '../../config/env';

/**
 * Gemini + Google Search grounding, over the same `generateContent` REST
 * endpoint `gemini.provider.ts` calls — one more axios POST, no new SDK.
 *
 * ─── Why this is its own function, not a `generateJson` call ────────────────
 * Gemini's API does not allow combining native structured output
 * (`responseSchema`/`responseMimeType`) with a tool like `googleSearch` in the
 * same request — confirmed live against the real API while building this,
 * not assumed from docs. So creative research is genuinely two calls:
 *
 *   1. THIS function — grounded, free-text, tool-enabled. Gemini decides how
 *      many searches to run (`webSearchQueries` in the response can be more
 *      than one) and returns prose plus the sources it drew on.
 *   2. `creative-research.generator.ts`'s ordinary `generateJson` call —
 *      ungrounded, schema-constrained — turns that prose into the structured
 *      `CreativeResearch` object.
 *
 * That is "one research operation, multiple queries, one synthesis step",
 * not three independent Gemini requests.
 *
 * ─── The source URLs are redirect links, not the article ────────────────────
 * `groundingChunks[].web.uri` points at
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/…` — Google's own
 * attribution proxy, not the source. `.web.title` is, in practice, the bare
 * domain ("nrn.com"), which is what this module treats as the domain rather
 * than parsing a hostname out of the redirect URL — that would only ever
 * resolve to `vertexaisearch.cloud.google.com`.
 *
 * Never throws. A failed or unavailable grounding call is a smaller problem
 * than a blocked generation — the caller degrades to reasoning from the
 * model's own knowledge, the same tolerance Vision has for a failed fetch.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 2048;

export interface GroundedSource {
  title: string;
  url: string;
  domain: string;
}

export interface GroundedResearchResult {
  text: string;
  sources: GroundedSource[];
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GeminiGroundedResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
  }>;
  promptFeedback?: { blockReason?: string };
}

export function isGroundedSearchConfigured(): boolean {
  return env.GEMINI_API_KEY.length > 0;
}

function dedupeByUrl(sources: GroundedSource[]): GroundedSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/**
 * Runs one grounded research query. Returns `null` on any failure or when
 * grounding is not configured — never throws, so a caller can `??`
 * straight into "generate without research" without a try/catch of its own.
 */
export async function groundedSearch(
  systemInstruction: string,
  prompt: string,
): Promise<GroundedResearchResult | null> {
  if (!isGroundedSearchConfigured()) return null;

  try {
    const { data } = await axios.post<GeminiGroundedResponse>(
      `${GEMINI_API_BASE}/${env.GEMINI_RESEARCH_MODEL}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Grounding is a lookup-then-summarise task, not a reasoning one —
          // "low" keeps latency down the same way it does for captions. See
          // gemini.provider.ts's thinkingConfigFor for why this only applies
          // to the 3.x family.
          ...(/^gemini-[3-9]/.test(env.GEMINI_RESEARCH_MODEL) && {
            thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL },
          }),
        },
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      },
    );

    if (data.promptFeedback?.blockReason) {
      console.warn('[creative] grounded research blocked', {
        reason: data.promptFeedback.blockReason,
      });
      return null;
    }

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) return null;

    const sources = dedupeByUrl(
      (candidate?.groundingMetadata?.groundingChunks ?? [])
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title: string } => Boolean(web?.uri))
        .map((web) => ({ title: web.title || web.uri, url: web.uri, domain: web.title || 'web' })),
    );

    return { text, sources };
  } catch (error) {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    console.warn('[creative] grounded research failed, continuing without it', {
      status: axiosError.response?.status,
      detail: axiosError.response?.data?.error?.message ?? axiosError.message,
    });
    return null;
  }
}

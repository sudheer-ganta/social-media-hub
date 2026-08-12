import { getSupabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/constants/api";
import type { CaptionBrief, CaptionResult } from "@/ai/caption";
import type { AnalysisBrief, CaptionAnalysis } from "@/ai/analysis";
import type { ImprovementBrief, TargetedImprovement } from "@/ai/improve";
import type { HashtagBrief, HashtagResult } from "@/ai/hashtags";

/**
 * The browser's side of the AI API.
 *
 * One rule governs this file: **the browser never talks to a model.** It talks
 * to `POST /api/ai/caption`, and the Express backend holds the Gemini key.
 * There is no `VITE_GEMINI_*` variable anywhere in this app, and there must
 * never be one — a `VITE_` prefix is what puts a value in the bundle.
 *
 * This replaces the Make.com trigger, which reached Gemini by writing
 * `ai_status = 'generating'` to Supabase and waiting for a webhook to write
 * results back. That indirection is gone: a request now owns its own response.
 */

const AI_ENDPOINT = "/api/ai";

/**
 * Generation is a model call, not a database round trip — give it room.
 *
 * A post with an image is now three round trips inside one request: download
 * the image, analyse it, then write from the analysis. 60s was enough for the
 * single-call flow and is not reliably enough for this one.
 */
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * The current Supabase access token. Throws when there is no session: every
 * route here is user-scoped and rate-attributed, so an anonymous request has
 * no meaningful answer.
 */
async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to be signed in to generate content.");
  }
  return session.access_token;
}

/**
 * One authenticated call to the AI API.
 *
 * The backend answers errors as `{ error }` with a message written for a
 * member — "the AI is busy", "tell us what the post is about" — so that
 * message is preferred over a generic one whenever it is there. Mirrors
 * `services/integrations.service.ts`, which does the same for its own routes.
 */
async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${AI_ENDPOINT}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });
  } catch (cause) {
    // An abort here is our own timeout firing, not the user navigating away.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("Generation took too long. Please try again.");
    }
    throw new Error(
      "Could not reach the AI service. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : fallback;
    throw new Error(message);
  }

  return body as T;
}

/**
 * Writes captions for one brief.
 *
 * Synchronous from the caller's point of view: the promise resolves with the
 * captions themselves. Nothing is saved — the result goes into the editor, the
 * user edits it, and the existing posts API saves whatever they settle on.
 */
export async function generateCaption(
  brief: CaptionBrief,
): Promise<CaptionResult> {
  return request<CaptionResult>(
    "/caption",
    { method: "POST", body: JSON.stringify(brief) },
    "Could not generate a caption. Please try again.",
  );
}

/**
 * Scores one caption — Marketing Intelligence.
 *
 * Takes whatever is in the editor rather than whatever was generated, which is
 * the entire reason this is a separate endpoint from `/caption`. Nothing is
 * saved: the result comes back, the caller folds it into the studio envelope
 * with `withAnalysis`, and the existing posts API stores it with the post.
 *
 * Cheaper and faster than a generation — one model call, no image download —
 * so it is fine to run after every meaningful edit.
 */
export async function analyzeCaption(
  brief: AnalysisBrief,
): Promise<CaptionAnalysis> {
  return request<CaptionAnalysis>(
    "/analyse",
    { method: "POST", body: JSON.stringify(brief) },
    "Could not analyse this caption. Please try again.",
  );
}

/**
 * Regenerates one flagged part of a post — the Reach & Visibility "Regenerate".
 *
 * Returns a *proposal*. Unlike `/caption`, whose result the composer may adopt
 * wholesale, nothing here reaches the caption until the member accepts it.
 */
export async function improveCaption(
  brief: ImprovementBrief,
): Promise<TargetedImprovement> {
  return request<TargetedImprovement>(
    "/improve",
    { method: "POST", body: JSON.stringify(brief) },
    "Could not generate an improvement. Please try again.",
  );
}

/**
 * Chooses hashtags for the caption as it stands.
 *
 * A separate call from `/caption` for the reason that makes it useful: the tags
 * worth having are chosen against the text that will actually publish, which
 * after any editing is not the text `/caption` returned. It also means tags can
 * be re-rolled without rewriting the post.
 *
 * An empty `primary` is a **success**, not a failure to retry — some posts read
 * worse with hashtags, and `note` says why. Callers must render the note rather
 * than treating the empty list as an error.
 */
export async function generateHashtags(
  brief: HashtagBrief,
): Promise<HashtagResult> {
  return request<HashtagResult>(
    "/hashtags",
    { method: "POST", body: JSON.stringify(brief) },
    "Could not choose hashtags. Please try again.",
  );
}

/**
 * Tells the backend what the member did with a set of suggestions.
 *
 * ─── Fire and forget, deliberately ───────────────────────────────────────────
 * Nothing awaits this and nothing can fail because of it. It is a hint that
 * feeds a style profile built hours later, and the member has no idea it exists
 * — so a network blip must not produce an error toast on top of a click that
 * plainly worked, and a slow response must not delay a caption landing in the
 * editor.
 *
 * Only two events go through here. Everything else the system learns about how
 * somebody writes is derived from the saved post: which option they kept,
 * whether they edited it first, which they ignored. These two — a selection
 * they never saved, and a regenerate — leave no trace in the post row.
 */
export function recordCaptionFeedback(feedback: {
  action: "selected" | "regenerated";
  mode: "personal" | "brand";
  caption: string;
  brandId?: string | null;
  postId?: string | null;
  variationIndex?: number;
}): void {
  void request("/caption/feedback", {
    method: "POST",
    body: JSON.stringify(feedback),
  }, "").catch(() => {
    // Swallowed on purpose. See above.
  });
}

/** Whether this server can generate at all, and with which model. */
export async function fetchAiStatus(): Promise<{
  configured: boolean;
  provider: string;
  model: string;
}> {
  return request(
    "/status",
    { method: "GET" },
    "Could not check whether AI generation is available.",
  );
}

export const aiService = {
  generateCaption,
  analyzeCaption,
  improveCaption,
  generateHashtags,
  recordCaptionFeedback,
  fetchAiStatus,
};

import { getSupabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/constants/api";
import type { PublishResult, PublishState } from "@/types";
import type { ContentType } from "@/types/capabilities";

/**
 * The browser's side of the publish API.
 *
 * One rule, and it is the same one the AI service follows: **the browser never
 * talks to LinkedIn.** It asks `POST /api/posts/:id/publish` and the backend
 * does everything else — decrypting the token, formatting the text, calling
 * LinkedIn, recording the result. There is no LinkedIn client in this bundle
 * and there must never be one; an access token that reached the browser would
 * be an access token in every user's devtools.
 *
 * Note what this file does *not* send: the caption. The server publishes what
 * is stored on the post, so what goes out is always what was saved and
 * reviewed — not whatever the client happened to put in the request.
 */

const PUBLISH_ENDPOINT = "/api/posts";

/**
 * Publishing is a round trip to LinkedIn, not just to our database. Generous,
 * but bounded: a request left hanging forever gives the user no way to tell a
 * slow publish from a broken one.
 */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * The current Supabase access token. Throws when there is no session: publish
 * is user-scoped and ownership-checked, so an anonymous request has no
 * meaningful answer.
 */
async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to be signed in to publish.");
  }
  return session.access_token;
}

/**
 * One authenticated call to the publish API.
 *
 * The backend answers errors as `{ error }` with a message already written for
 * a member — "Reconnect your LinkedIn account", "This post has already been
 * published" — so that message is always preferred. Nothing LinkedIn itself
 * said ever reaches here; the server translates before it answers.
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
    response = await fetch(`${API_BASE_URL}${PUBLISH_ENDPOINT}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      // Deliberately ambiguous, because the truth is ambiguous: the request
      // timed out on our side, and the post may well have gone out. Telling
      // the user it failed would invite a second publish. The status call on
      // the next render resolves it.
      throw new Error(
        "Publishing is taking longer than expected. Check your post before trying again.",
      );
    }
    throw new Error(
      "Could not reach the publishing service. Check your connection and try again.",
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
    console.error(`[Publish API Error ${response.status}]:`, message, body);
    throw new Error(message);
  }

  return body as T;
}

/**
 * Publishes a saved post to a network.
 *
 * The post must already exist — publishing is something you do *to* a draft,
 * not a way of creating one. The form saves first and then calls this.
 *
 * `contentType` is the format the member explicitly selected in the composer.
 * When absent the backend resolves it from the media count — the pre-content-
 * type behaviour that every existing post relies on. Passing it explicitly is
 * what makes a video publish as a Reel rather than as an IMAGE.
 */
export async function publishPost(
  postId: string,
  provider = "linkedin",
  contentType?: ContentType,
): Promise<PublishResult> {
  const body = {
    provider,
    ...(contentType !== undefined && { contentType }),
  };
  console.log("[publish] publish.service request body", body);
  return request<PublishResult>(
    `/${postId}/publish`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    "Could not publish this post. Please try again.",
  );
}

/** Where a post stands on each network it has been sent to. */
export async function fetchPublishState(
  postId: string,
): Promise<PublishState> {
  return request<PublishState>(
    `/${postId}/publish`,
    { method: "GET" },
    "Could not check this post's publishing status.",
  );
}

export const publishService = { publishPost, fetchPublishState };

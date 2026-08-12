import { getSupabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/constants/api";
import type { ScheduledPost } from "@/types";

/**
 * The browser's side of the scheduling API.
 *
 * Same rule as the publish service, and it is the reason this file is so
 * small: **the browser never sends content.** It sends a post id, an instant
 * and a list of networks. What actually goes out is what is stored on the row,
 * so scheduling cannot be used to post arbitrary text to someone's feed with an
 * id you happen to own — and what publishes at 9am is what was saved and
 * reviewed, not whatever a request body claimed hours earlier.
 *
 * Two fields carry the time, and both are required. `scheduledAt` is a local
 * wall clock and means nothing without `timezone`; the backend resolves the
 * pair into the UTC instant it fires on. Sending an instant from here instead
 * would put DST arithmetic in the browser, where it would be done in whatever
 * zone the laptop happens to be set to.
 */

const ENDPOINT = "/api/scheduled-posts";

/** Scheduling is a database write, not a round trip to a network. */
const REQUEST_TIMEOUT_MS = 20_000;

/** The machine-readable half of an error, for a caller that branches on it. */
export class ScheduleApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScheduleApiError";
  }
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to be signed in to schedule a post.");
  }
  return session.access_token;
}

async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${ENDPOINT}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });
  } catch (cause) {
    throw new ScheduleApiError(
      cause instanceof DOMException && cause.name === "AbortError"
        ? "Scheduling is taking longer than expected. Check your scheduled posts before trying again."
        : "Could not reach the scheduling service. Check your connection and try again.",
      "NETWORK_ERROR",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // The backend's message is already written for a member; the code is what
    // the composer branches on — SCHEDULE_TIME_IN_PAST belongs on the date
    // field, ACCOUNT_NOT_CONNECTED next to a link to Accounts.
    throw new ScheduleApiError(
      typeof body?.error === "string" ? body.error : fallback,
      typeof body?.code === "string" ? body.code : "UNKNOWN",
      response.status,
    );
  }

  return body as T;
}

export interface ScheduleInput {
  postId: string;
  /** Local wall clock, `YYYY-MM-DDTHH:mm`. */
  scheduledAt: string;
  /** IANA zone the wall clock is in. */
  timezone: string;
  providers?: string[];
  /**
   * What to publish as, per network — `{ instagram: "REEL" }`.
   *
   * Omitted, or omitted for one network, is the backward-compatible path: that
   * destination resolves its format from the media count at publish time,
   * exactly as every schedule armed before this existed does.
   */
  contentTypes?: Record<string, string>;
}

function toClientScheduledPost(post: ScheduledPost): ScheduledPost {
  return {
    ...post,
    status: post.status ? (post.status.toLowerCase() as any) : post.status,
  };
}

export function schedulePost(input: ScheduleInput): Promise<ScheduledPost> {
  return request<ScheduledPost>(
    "",
    { method: "POST", body: JSON.stringify(input) },
    "Could not schedule this post. Please try again.",
  ).then(toClientScheduledPost);
}

export function listScheduledPosts(): Promise<ScheduledPost[]> {
  return request<ScheduledPost[]>(
    "",
    { method: "GET" },
    "Could not load your scheduled posts.",
  ).then((posts) => posts.map(toClientScheduledPost));
}

export function fetchScheduledPost(id: string): Promise<ScheduledPost> {
  return request<ScheduledPost>(
    `/${id}`,
    { method: "GET" },
    "Could not load this scheduled post.",
  ).then(toClientScheduledPost);
}

export function updateScheduledPost(
  id: string,
  input: Partial<Omit<ScheduleInput, "postId">>,
): Promise<ScheduledPost> {
  return request<ScheduledPost>(
    `/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    "Could not update this schedule.",
  ).then(toClientScheduledPost);
}

export function cancelScheduledPost(id: string): Promise<ScheduledPost> {
  return request<ScheduledPost>(
    `/${id}/cancel`,
    { method: "POST" },
    "Could not cancel this schedule.",
  ).then(toClientScheduledPost);
}

/** Re-arms one network that failed. The ones that published are untouched. */
export function retryDestination(
  id: string,
  provider: string,
): Promise<ScheduledPost> {
  return request<ScheduledPost>(
    `/${id}/retry`,
    { method: "POST", body: JSON.stringify({ provider }) },
    "Could not retry this network.",
  ).then(toClientScheduledPost);
}

export function deleteScheduledPost(id: string): Promise<void> {
  return request<void>(
    `/${id}`,
    { method: "DELETE" },
    "Could not remove this schedule.",
  );
}

export const scheduledPostsService = {
  schedulePost,
  listScheduledPosts,
  fetchScheduledPost,
  updateScheduledPost,
  cancelScheduledPost,
  retryDestination,
  deleteScheduledPost,
};

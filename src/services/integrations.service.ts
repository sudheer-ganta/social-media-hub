import { getSupabase } from "@/lib/supabase";
import {
  API_BASE_URL,
  INTEGRATIONS_ENDPOINT,
  type ActivityEvent,
  type Integration,
  type IntegrationId,
} from "@/constants/integrations";

/**
 * The browser's side of the integrations API.
 *
 * Everything here talks to the Express backend, not to Supabase's PostgREST:
 * `social_accounts` has RLS enabled with no policies precisely so the browser
 * cannot read it directly, encrypted token columns and all.
 *
 * Provider-agnostic throughout — every function takes a provider id as data.
 * There is no `connectLinkedIn`, and there never should be.
 */

/** Name and lifetime of the OAuth handoff cookie. Mirrors the backend constant. */
const OAUTH_SESSION_COOKIE = "fp_oauth_session";
const OAUTH_SESSION_COOKIE_MAX_AGE_SECONDS = 120;

/**
 * The current Supabase access token. Throws when there is no session — every
 * route here is user-scoped, and a request without an identity has no
 * meaningful answer.
 */
async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  if (!session?.access_token) {
    throw new Error("You need to be signed in to manage integrations.");
  }
  return session.access_token;
}

/**
 * One authenticated call to the integrations API.
 *
 * The backend answers errors as `{ error }` with a message written for a
 * member, so that message is preferred over a generic one whenever it is there.
 * A non-JSON body (a proxy error page, say) falls back to `fallback`.
 */
async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${INTEGRATIONS_ENDPOINT}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${await getAccessToken()}`,
    },
  });

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
 * Starts the OAuth flow: a plain top-level navigation to the backend, which
 * 302s on to the provider. That is the flow every OAuth provider expects, and
 * it is identical for every network we add.
 *
 * The one thing a navigation cannot carry is an `Authorization` header, and the
 * backend has to know *whose* account this will be. So the session token is
 * handed over in a short-lived cookie set immediately before the jump — cookies
 * ignore port, so `:5173` and `:5000` share a jar, and in production a
 * `Domain=` cookie spans the app and API subdomains.
 *
 * Deliberately not a `?token=` query parameter: that would put the JWT in the
 * backend's access log, the browser's history, and the `Referer` sent to the
 * provider. The backend expires the cookie the moment it reads it.
 */
export async function startConnect(integration: Integration): Promise<void> {
  if (!integration.connectPath) {
    throw new Error(`${integration.displayName} is not available yet.`);
  }

  const token = await getAccessToken();
  document.cookie =
    `${OAUTH_SESSION_COOKIE}=${encodeURIComponent(token)}` +
    `; Path=/; Max-Age=${OAUTH_SESSION_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;

  window.location.href = `${API_BASE_URL}${integration.connectPath}`;
}

/**
 * Every network the backend catalogues, with its connection when there is one.
 * A single call regardless of how many networks exist.
 */
export async function fetchIntegrations(): Promise<Integration[]> {
  const { integrations } = await request<{ integrations?: Integration[] }>(
    "",
    { method: "GET" },
    "Could not load your connected accounts.",
  );
  return integrations ?? [];
}

/**
 * Asks the backend to verify one connection against the provider and returns
 * the rebuilt card.
 *
 * `verified` is false for both "the token is dead" and "the provider was
 * unreachable" — the two are genuinely different, and `message` is what
 * distinguishes them for the member, so show it either way.
 */
export async function refreshIntegration(provider: IntegrationId): Promise<{
  integration: Integration;
  verified: boolean;
  message: string;
}> {
  return request(
    `/${provider}/refresh`,
    { method: "POST" },
    "Could not check that connection.",
  );
}

/** Disconnects a network and deletes its stored tokens. Posts are untouched. */
export async function disconnectIntegration(provider: IntegrationId): Promise<{
  integration: Integration;
  message: string;
}> {
  return request(
    `/${provider}`,
    { method: "DELETE" },
    "Could not disconnect that account.",
  );
}

/** The activity timeline, newest first. */
export async function fetchActivity(
  options: { provider?: IntegrationId; limit?: number } = {},
): Promise<ActivityEvent[]> {
  const query = new URLSearchParams();
  if (options.provider) query.set("provider", options.provider);
  if (options.limit) query.set("limit", String(options.limit));

  const suffix = query.toString() ? `?${query}` : "";
  const { events } = await request<{ events?: ActivityEvent[] }>(
    `/activity${suffix}`,
    { method: "GET" },
    "Could not load recent activity.",
  );
  return events ?? [];
}

export const integrationsService = {
  startConnect,
  fetchIntegrations,
  refreshIntegration,
  disconnectIntegration,
  fetchActivity,
};

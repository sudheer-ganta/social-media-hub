import { getSupabase } from "@/lib/supabase";
import {
  API_BASE_URL,
  INTEGRATIONS_ENDPOINT,
  type AccountContext,
  type ActivityEvent,
  type Integration,
  type IntegrationId,
} from "@/constants/integrations";

/**
 * `?context=…&brandId=…` for one publishing context. Personal is the backend
 * default, so it sends nothing — which also keeps old bookmarks working.
 */
function contextQuery(context: AccountContext): string {
  if (context.contextType !== "brand" || !context.brandId) return "";
  const query = new URLSearchParams({
    context: "brand",
    brandId: context.brandId,
  });
  return `?${query}`;
}

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
 * Starts the OAuth flow: one authenticated request for the provider's
 * authorization URL, then a plain navigation to it. Identical for every network
 * we add — `connectPath` is the only thing that differs, and it comes from the
 * API.
 *
 * The request is what carries the identity, and it has to be a request rather
 * than a navigation: the backend must know *whose* account this will be, and it
 * binds that user into the OAuth `state` it mints here — the provider's
 * redirect back carries no identity of ours, so `state` is the only thread
 * connecting the two halves.
 *
 * This used to navigate straight to `connectPath` with the token in a
 * short-lived cookie, which worked only while the API shared a host with the
 * app (`localhost`, where cookies ignore port). A cookie set on the app's
 * origin is never sent to the API's, and `onrender.com` is a public suffix so
 * no `Domain=` can span the two — the backend saw an anonymous request and
 * logged "connect attempted without a FlowPost session".
 *
 * Still deliberately not a `?token=` query parameter: that would put the JWT in
 * the backend's access log, the browser's history, and the `Referer` sent to
 * the provider.
 */
export async function startConnect(
  integration: Integration,
  context: AccountContext,
): Promise<void> {
  if (!integration.connectPath) {
    throw new Error(`${integration.displayName} is not available yet.`);
  }

  // The context rides the authenticated connect request, where the backend
  // validates brand ownership and binds it into the OAuth state.
  const response = await fetch(
    `${API_BASE_URL}${integration.connectPath}${contextQuery(context)}`,
    {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    // Not for sending anything — for *receiving*. The backend answers this
    // request with the signed OAuth-state cookie, and a cross-origin fetch
    // without this flag makes the browser discard the `Set-Cookie` silently.
    // The callback then finds no cookie and reports "OAuth state mismatch".
    // Requires the API to name this origin in CORS and send
    // `Access-Control-Allow-Credentials: true` — see server/src/app.ts.
    credentials: "include",
    // The provider's authorization URL must never be *fetched*, only navigated
    // to — instagram.com and linkedin.com send no CORS headers, so a followed
    // redirect fails as an opaque network error that names neither the backend
    // nor the real problem. `manual` stops the browser at the 302 instead, and
    // the check below turns it into a sentence someone can act on. This is the
    // only thing standing between a backend still serving the old redirect and
    // an unreadable console error.
    redirect: "manual",
  });

  if (response.type === "opaqueredirect") {
    throw new Error(
      `The API redirected instead of returning a ${integration.displayName} ` +
        "authorization URL — it is running an older build. Redeploy the backend.",
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok || typeof body?.url !== "string") {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Could not start the ${integration.displayName} connection.`,
    );
  }

  // A top-level navigation, not `window.open` and not a fetch: the consent
  // screen has to replace the tab so the provider's redirect back lands on the
  // Integrations page the member is already looking at.
  window.location.assign(body.url);
}

/**
 * Every network the backend catalogues, with its connection when there is one.
 * A single call regardless of how many networks exist.
 */
export async function fetchIntegrations(
  context: AccountContext,
): Promise<Integration[]> {
  const { integrations } = await request<{ integrations?: Integration[] }>(
    contextQuery(context),
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
export async function refreshIntegration(
  provider: IntegrationId,
  context: AccountContext,
): Promise<{
  integration: Integration;
  verified: boolean;
  message: string;
}> {
  return request(
    `/${provider}/refresh${contextQuery(context)}`,
    { method: "POST" },
    "Could not check that connection.",
  );
}

/**
 * Disconnects a network in one context and deletes its stored tokens. Posts
 * are untouched, and so is the same provider's connection in any other
 * context.
 */
export async function disconnectIntegration(
  provider: IntegrationId,
  context: AccountContext,
): Promise<{
  integration: Integration;
  message: string;
}> {
  return request(
    `/${provider}${contextQuery(context)}`,
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

// ─── Facebook Page selection ─────────────────────────────────────────────────
//
// The one flow that does not fit the provider-agnostic shape above, and the
// reason is Facebook's alone: OAuth identifies the *member*, not the account
// to publish to, and a member can manage any number of Pages. So the callback
// parks its result and sends the browser back with `status=select&selection=…`,
// and these two calls finish the job.
//
// Deliberately kept to the two calls and no more. There is no `connectFacebook`
// and there should not be — connecting still goes through `startConnect` like
// every other network.

/** One Page offered by a pending selection. Never carries an access token. */
export interface FacebookPageChoice {
  id: string;
  name: string;
  username: string | null;
  profileImage: string | null;
}

/**
 * One authenticated call to the Facebook OAuth routes.
 *
 * A separate helper from {@link request} because these live under
 * `/auth/facebook`, not under `/api/integrations` — the selection is part of
 * the OAuth dance, not part of the connections API.
 */
async function facebookRequest<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/auth/facebook${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${await getAccessToken()}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : fallback,
    );
  }

  return body as T;
}

/**
 * The Pages a pending selection is offering.
 *
 * The `selection` id is a lookup key, not a credential: the request is
 * authenticated, and the backend additionally checks the selection belongs to
 * the signed-in member.
 */
export async function fetchPendingPages(
  selection: string,
): Promise<FacebookPageChoice[]> {
  const { pages } = await facebookRequest<{ pages?: FacebookPageChoice[] }>(
    `/pages?selection=${encodeURIComponent(selection)}`,
    { method: "GET" },
    "Could not load your Facebook Pages.",
  );
  return pages ?? [];
}

/**
 * Finishes the connection with the chosen Page.
 *
 * Note what is *not* sent: no publishing context. The backend took it from the
 * OAuth state at the start of the flow and will not accept a different one
 * here, which is what stops a Personal connect from being finished into a
 * Brand.
 */
export async function selectFacebookPage(
  selection: string,
  pageId: string,
): Promise<{ displayName: string | null }> {
  const { account } = await facebookRequest<{
    account?: { displayName: string | null };
  }>(
    "/pages/select",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection, pageId }),
    },
    "Could not connect that Facebook Page.",
  );
  return { displayName: account?.displayName ?? null };
}

export const integrationsService = {
  startConnect,
  fetchIntegrations,
  refreshIntegration,
  disconnectIntegration,
  fetchActivity,
  fetchPendingPages,
  selectFacebookPage,
};

import { getSupabase } from "./supabase";

/**
 * Returns a guaranteed valid Supabase access token, proactively refreshing
 * the session if it is expired or expiring within 60 seconds.
 */
export async function getValidAccessToken(
  errorMessage = "You need to be signed in.",
): Promise<string> {
  const supabase = getSupabase();
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If token has expired or is expiring in less than 60s, refresh session
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session) {
        session = refreshed.session;
      }
    } catch {
      // Continue with current session if refresh network call fails
    }
  }

  if (!session?.access_token) {
    throw new Error(errorMessage);
  }
  return session.access_token;
}

/**
 * An authenticated fetch that attaches the Bearer token, automatically
 * refreshes expiring tokens, and performs a single transparent retry if the
 * backend responds with 401 Unauthorized.
 */
export async function authenticatedFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  errorMessage = "You need to be signed in.",
): Promise<Response> {
  const token = await getValidAccessToken(errorMessage);

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // If the backend returns 401, attempt one token refresh and retry
  if (response.status === 401) {
    try {
      const supabase = getSupabase();
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session?.access_token) {
        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set("Authorization", `Bearer ${refreshed.session.access_token}`);
        return fetch(input, {
          ...init,
          headers: retryHeaders,
        });
      }
    } catch {
      // Fall through to returning the original 401 response
    }
  }

  return response;
}

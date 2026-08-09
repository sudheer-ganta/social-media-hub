import { env } from '../config/env';

/**
 * Where an OAuth flow drops the browser when it is over.
 *
 * Shared by every provider so success and failure always land on the same page
 * with the same two query params, and so the frontend has exactly one contract
 * to read:
 *
 *   {FRONTEND_URL}/integrations?provider=<id>&status=connected|failed
 *
 * The URL is built from the environment, never from anything on the request —
 * an attacker-supplied `redirect` parameter is how OAuth callbacks turn into
 * open redirects.
 */

/**
 * `select` is Facebook's only. Its callback cannot finish the connection — the
 * member manages *n* Pages and has to choose one — so it lands on the same page
 * with a pending-selection id instead of a completed account. Every other
 * provider only ever reports `connected` or `failed`, and the frontend treats
 * an unrecognised status as a failure.
 */
export type OAuthRedirectStatus = 'connected' | 'failed' | 'select';

const INTEGRATIONS_PATH = '/integrations';

export function buildIntegrationsRedirect(
  provider: string,
  status: OAuthRedirectStatus,
  /**
   * Extra query params for flows that do not end at the callback.
   *
   * Added for Facebook, whose OAuth callback finishes with a *question* — which
   * of your Pages? — rather than a connection, and so has to hand the browser a
   * pending-selection id to redeem. Optional and additive: LinkedIn and
   * Instagram pass nothing and their redirects are byte-for-byte what they were.
   *
   * Only ids and statuses belong here. Nothing the provider told us, and
   * certainly no token, is ever echoed into a URL the browser will keep in its
   * history.
   */
  extra: Record<string, string> = {},
): string {
  const url = new URL(INTEGRATIONS_PATH, env.FRONTEND_URL);
  url.searchParams.set('provider', provider);
  url.searchParams.set('status', status);
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

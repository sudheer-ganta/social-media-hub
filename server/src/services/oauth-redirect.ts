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

export type OAuthRedirectStatus = 'connected' | 'failed';

const INTEGRATIONS_PATH = '/integrations';

export function buildIntegrationsRedirect(
  provider: string,
  status: OAuthRedirectStatus,
): string {
  const url = new URL(INTEGRATIONS_PATH, env.FRONTEND_URL);
  url.searchParams.set('provider', provider);
  url.searchParams.set('status', status);
  return url.toString();
}

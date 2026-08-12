import { env } from '../config/env';
import type { ProviderId } from './provider.interface';

/**
 * Which networks may ask for their analytics scope.
 *
 * ─── Why this is a switch and not a constant ─────────────────────────────────
 *
 * Every one of the three scopes below is behind App Review. Requesting one the
 * app has not been granted is not a degraded read — it breaks the *entire*
 * authorization: LinkedIn answers `unauthorized_scope_error` and refuses the
 * whole request, Meta rejects the login. A deployment that hardcoded
 * `r_member_postAnalytics` to enable a read would lose the ability to connect
 * LinkedIn at all, publishing included.
 *
 * So the switch tracks *approval*, not intent, and defaults to off. The adapters
 * ship enabled-capable and dormant; a deployment whose app has the permission
 * sets `ANALYTICS_SCOPES=instagram,facebook,linkedin` and the scope joins the
 * consent screen on the next connect.
 *
 * ─── What happens to a connection made before the flag ───────────────────────
 *
 * Nothing, and that is the point. It holds the scopes it was granted, which do
 * not include this one, so `hasRequiredScopes` is false and the sync service
 * reports `missing_scopes` — "Reconnect to enable analytics". It is never
 * reported as zero engagement, and it is never quietly skipped.
 */

/** Networks named in `ANALYTICS_SCOPES`. Unknown names are ignored. */
const ENABLED: ReadonlySet<string> = new Set(
  env.ANALYTICS_SCOPES.split(/[\s,]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Whether this network's analytics scope may be requested at connect time.
 *
 * Read only by the OAuth scope builders. The *adapters* never consult it —
 * they check the scopes a connection actually holds, which is the only fact
 * that matters once a token exists and is what keeps a member who granted the
 * permission before the flag was flipped from being told they had not.
 */
export function analyticsScopeEnabled(provider: ProviderId): boolean {
  return ENABLED.has(provider);
}

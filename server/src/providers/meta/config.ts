import { env } from '../../config/env';

/**
 * What every Meta-family provider shares.
 *
 * Instagram is the first of three — Facebook Pages and Threads sit alongside it
 * under `providers/meta/` — and the parts they genuinely have in common are the
 * Graph API version and the shape of a Graph error. Everything else (hosts,
 * scopes, endpoints, credentials) differs per surface and lives in that
 * surface's own config, because assuming they are the same is exactly the
 * mistake that makes a "Meta client" impossible to extend.
 *
 * ─── The two Instagram authentication models ─────────────────────────────────
 *
 * Meta ships two, and they are not interchangeable:
 *
 *   • **Instagram API with Instagram Login** — the member signs in with their
 *     Instagram account, no Facebook Page required. Credentials are the
 *     *Instagram* App ID and Secret, which are distinct values from the Meta
 *     app's own App ID and Secret. Tokens are Instagram User access tokens and
 *     calls go to `graph.instagram.com`.
 *
 *   • **Instagram API with Facebook Login** — the member signs in with
 *     Facebook, the Instagram professional account must be linked to a Page,
 *     credentials are the Meta App ID/Secret, and calls go to
 *     `graph.facebook.com`.
 *
 * FlowPost implements the **first**. That is what the app's "Manage messaging &
 * content on Instagram" use case configures, and it is the one whose dashboard
 * surfaces an Instagram App ID and Instagram App Secret — the values this
 * integration reads. Facebook Pages, when it arrives, will use the second model
 * and its own credentials; that is why they are not shared here.
 */

/**
 * The Graph API version every Meta call is pinned to.
 *
 * In the environment because it expires. Meta ships a new version roughly
 * quarterly and each one runs about two years before it is sunset, at which
 * point unversioned or stale-versioned calls start failing. Bumping a deployed
 * backend must not require a code change and a redeploy — same reasoning as
 * `LINKEDIN_API_VERSION`.
 */
export const META_API_VERSION = env.META_API_VERSION;

/** Meta's error envelope. Every Graph surface returns this shape on failure. */
export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    /** Meta's own member-safe text, when it provides one. Often absent. */
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

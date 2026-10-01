/**
 * Small helpers shared by every provider's OAuth routes.
 *
 * This file used to hold an in-memory store of pending OAuth `state` values.
 * It is gone: a server-side Map binds a flow to a Rally *user* but not to a
 * *browser*, which allowed forced account linking (an attacker mints a connect
 * URL from their own session and hands it to a victim), and it also lost every
 * in-flight connect on a restart or second instance. All four providers now keep
 * state in a signed HttpOnly cookie — see `oauth-state-cookie.ts`.
 */

/**
 * Express types a query value as string | string[] | ParsedQs. A repeated
 * `?code=a&code=b` is not something a legitimate redirect does, so anything
 * that is not a plain string is discarded rather than coerced.
 */
export function firstQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

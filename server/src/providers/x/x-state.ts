import type { Request, Response } from 'express';
import { xConfig } from './config';
import {
  createCookieStateStore,
  type PendingCookieState,
} from '../oauth-state-cookie';

/**
 * X OAuth state — the signed-cookie store, configured for X.
 *
 * All of the mechanism (HMAC, expiry, single-use, cookie attributes) lives in
 * `providers/oauth-state-cookie.ts`; this file is only the X-shaped wrapper
 * around it, the way `meta/instagram/instagram-state.ts` is Instagram's. Its own
 * cookie name and path mean a state minted here can never satisfy an Instagram
 * or Facebook callback, and vice versa.
 *
 * The one thing X adds is the PKCE `code_verifier`, which the shared store now
 * carries as an optional field in the same signed payload. It is *not* a second
 * cookie: binding the verifier to the state means the pair is single-use,
 * expiring and tamper-evident for free, and there is exactly one place that has
 * to get those three right.
 */

/** Cookie name. Scoped so it cannot collide with the Meta providers'. */
export const X_STATE_COOKIE = 'x_oauth_state';

/** Callback route. The cookie's Path attribute is scoped here. */
const CALLBACK_PATH = '/auth/x/callback';

/** Ten minutes — long enough for a consent screen, short enough to bound replay. */
export const X_STATE_TTL_MS = xConfig.stateTtlMs;

export type PendingXState = PendingCookieState;

const store = createCookieStateStore({
  cookieName: X_STATE_COOKIE,
  callbackPath: CALLBACK_PATH,
  redirectUri: xConfig.redirectUri,
  ttlMs: X_STATE_TTL_MS,
});

/**
 * Mints the state and stores it — with the PKCE verifier — in the signed
 * cookie. Returns only the state token to embed in X's authorization URL; the
 * verifier never appears in a URL, a log or a response body.
 */
export function createXState(
  res: Response,
  userId: string,
  context: { contextType: string; brandId: string | null },
  codeVerifier: string,
  ttlMs: number = X_STATE_TTL_MS,
): string {
  return store.create(res, userId, context, ttlMs, codeVerifier);
}

/**
 * Reads, verifies and clears the state cookie. Null for a missing, tampered,
 * expired or mismatched cookie — the caller cannot tell those apart, and
 * neither should an attacker.
 */
export function consumeXState(
  req: Request,
  res: Response,
  stateParam: string | undefined,
): PendingXState | null {
  return store.consume(req, res, stateParam);
}

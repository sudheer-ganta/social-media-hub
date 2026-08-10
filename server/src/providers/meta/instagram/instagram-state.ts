import type { Request, Response } from 'express';
import { instagramConfig } from './config';
import {
  createCookieStateStore,
  DEFAULT_COOKIE_STATE_TTL_MS,
  type PendingCookieState,
} from '../../oauth-state-cookie';

/**
 * Instagram OAuth state — the signed-cookie store, configured for Instagram.
 *
 * All of the mechanism (HMAC, expiry, single-use, cookie attributes) lives in
 * `providers/oauth-state-cookie.ts`; this file is only the Instagram-shaped
 * wrapper around it, kept so the provider's imports read the way LinkedIn's and
 * Facebook's do. Facebook has the same store with its own cookie name and path,
 * so a state minted here can never satisfy a Facebook callback.
 */

/** Cookie name. Short and scoped to avoid confusion with any future additions. */
export const INSTAGRAM_STATE_COOKIE = 'ig_oauth_state';

/** Callback route. The cookie's Path attribute is scoped here. */
const CALLBACK_PATH = '/auth/instagram/callback';

/** Ten minutes — long enough for a consent screen, short enough to bound replay. */
export const INSTAGRAM_STATE_TTL_MS = DEFAULT_COOKIE_STATE_TTL_MS;

export type PendingInstagramState = PendingCookieState;

const store = createCookieStateStore({
  cookieName: INSTAGRAM_STATE_COOKIE,
  callbackPath: CALLBACK_PATH,
  redirectUri: instagramConfig.redirectUri,
  ttlMs: INSTAGRAM_STATE_TTL_MS,
});

export function createInstagramState(
  res: Response,
  userId: string,
  context: { contextType: string; brandId: string | null },
  ttlMs: number = INSTAGRAM_STATE_TTL_MS,
): string {
  return store.create(res, userId, context, ttlMs);
}

export function consumeInstagramState(
  req: Request,
  res: Response,
  stateParam: string | undefined,
): PendingInstagramState | null {
  return store.consume(req, res, stateParam);
}

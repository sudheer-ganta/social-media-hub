import type { Request, Response } from 'express';
import { linkedinConfig } from './config';
import {
  createCookieStateStore,
  type PendingCookieState,
} from '../oauth-state-cookie';

/**
 * LinkedIn OAuth state — the signed-cookie store, configured for LinkedIn.
 *
 * Instagram, Facebook and X already used this; LinkedIn alone kept the
 * in-memory `oauth-state.ts` Map, and that was not only a restart/second-instance
 * problem. A server-side Map binds the state to a *user* but not to a *browser*:
 * anyone signed in could call `/connect`, get a valid authorization URL, and
 * send it to somebody else. If that person approved it, the callback would
 * attach **their** LinkedIn account to the **attacker's** Rally user — forced
 * account linking, which hands the attacker the ability to post as the victim.
 *
 * A signed HttpOnly cookie closes that: it is set on the response to the
 * member's own `/connect` fetch, so only that browser can present it at the
 * callback. All the mechanism (HMAC, expiry, single-use, cookie attributes) is
 * in `providers/oauth-state-cookie.ts`; this file only names LinkedIn's cookie
 * and callback path, so a state minted here can never satisfy another
 * provider's callback.
 */

/** Cookie name. Scoped so it cannot collide with the other providers'. */
export const LINKEDIN_STATE_COOKIE = 'li_oauth_state';

/** Callback route. The cookie's Path attribute is scoped here. */
const CALLBACK_PATH = '/auth/linkedin/callback';

export type PendingLinkedInState = PendingCookieState;

const store = createCookieStateStore({
  cookieName: LINKEDIN_STATE_COOKIE,
  callbackPath: CALLBACK_PATH,
  redirectUri: linkedinConfig.redirectUri,
  ttlMs: linkedinConfig.stateTtlMs,
});

export function createLinkedInState(
  res: Response,
  userId: string,
  context: { contextType: string; brandId: string | null },
): string {
  return store.create(res, userId, context);
}

export function consumeLinkedInState(
  req: Request,
  res: Response,
  stateParam: string | undefined,
): PendingLinkedInState | null {
  return store.consume(req, res, stateParam);
}

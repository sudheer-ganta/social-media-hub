import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../../../config/env';

/**
 * Instagram OAuth — signed-cookie state store.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * The shared `providers/oauth-state.ts` store is an in-memory Map. Its own
 * comment (L15–17) documents the failure mode:
 *
 *   "Still in-memory: a restart or a second instance drops in-flight connects."
 *
 * On Render's free tier the backend spins down between requests and starts a
 * fresh process on the next one. The Map that held the minted state is gone by
 * the time Instagram's redirect arrives. Result: every production callback
 * returns "OAuth state mismatch".
 *
 * ─── Solution ───────────────────────────────────────────────────────────────
 *
 * Encode the whole state payload into an HMAC-signed HTTP cookie.
 *
 *   • connect()  → signs {state, userId, contextType, brandId, exp} → Set-Cookie
 *   • callback() → reads cookie, verifies HMAC, checks expiry, checks state
 *                  param matches → clears cookie (single-use) → returns payload
 *
 * No external infrastructure required. Any instance can verify (stateless).
 * A restart loses nothing — the payload rides the browser.
 *
 * ─── Cookie attributes ──────────────────────────────────────────────────────
 *
 *   HttpOnly        — JS cannot read it (irrelevant here since the SPA is on a
 *                     different origin, but good hygiene).
 *   Secure          — only sent over HTTPS; omitted in HTTP dev so local flows
 *                     still work.
 *   SameSite=None   — REQUIRED. The callback arrives as a cross-site navigation
 *                     from www.instagram.com → onrender.com. Lax would suppress
 *                     the cookie on that redirect, reproducing the exact
 *                     mismatch this fix is meant to solve.
 *   Path            — scoped to the callback route only.
 *   Max-Age         — equal to the state TTL (10 min). Belt-and-suspenders with
 *                     the payload's own `exp` field.
 *
 * ─── Security properties ────────────────────────────────────────────────────
 *
 *   CSRF protection is maintained: an attacker who cannot read the HttpOnly
 *   cookie cannot forge a valid HMAC, and cannot learn the `state` param that
 *   was embedded in the Instagram URL (it is in the signed cookie, not a
 *   separate store an attacker could race against).
 *
 *   Single-use: the cookie is cleared (Max-Age=0) on every callback path —
 *   success and failure — before the redirect fires, so a captured redirect URL
 *   cannot be replayed.
 *
 * ─── What is NOT logged ─────────────────────────────────────────────────────
 *
 *   The state value, the cookie content, the HMAC and any token are never
 *   written to console by this module.
 */

/** Cookie name. Short and scoped to avoid confusion with any future additions. */
export const INSTAGRAM_STATE_COOKIE = 'ig_oauth_state';

/** Callback route. The cookie's Path attribute is scoped here. */
const CALLBACK_PATH = '/auth/instagram/callback';

/** Ten minutes — long enough for a consent screen, short enough to bound replay. */
export const INSTAGRAM_STATE_TTL_MS = 10 * 60 * 1_000;

/** The JSON structure baked into the signed cookie. */
interface StateCookiePayload {
  /** The random CSRF token — must match the `state` query param on callback. */
  s: string;
  /** FlowPost user id. */
  u: string;
  /** 'personal' | 'brand' */
  ct: string;
  /** Brand id, or null. */
  b: string | null;
  /** Absolute expiry — milliseconds since Unix epoch. */
  exp: number;
}

/** What a successful consume() returns to the caller (mirrors PendingOAuthState). */
export interface PendingInstagramState {
  userId: string;
  contextType: string;
  brandId: string | null;
}

// ─── HMAC helpers ────────────────────────────────────────────────────────────

/**
 * Signs `data` with HMAC-SHA256 using TOKEN_ENCRYPTION_KEY.
 *
 * TOKEN_ENCRYPTION_KEY is already used by the encryption service for token
 * storage, so it is always present in production. Using the same key here is
 * deliberate: one secret to rotate, one secret to audit.
 */
function sign(data: string): string {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set — Instagram OAuth state cannot be signed.',
    );
  }
  return crypto.createHmac('sha256', key).update(data).digest('base64url');
}

/**
 * Compares two base64url HMAC digests in constant time.
 *
 * `crypto.timingSafeEqual` requires equal-length Buffers. Both sides are
 * HMAC-SHA256 output so they are always 32 bytes / 43 base64url chars, but
 * a length mismatch is also a tamper signal and must return false rather than
 * throw.
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const aBuffer = Buffer.from(a, 'base64url');
    const bBuffer = Buffer.from(b, 'base64url');
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

// ─── Cookie serialise / parse ─────────────────────────────────────────────────

/**
 * Produces the raw `Set-Cookie` string.
 *
 * Format on the wire:  `<name>=<payload>.<sig>; …attributes`
 *
 * `payload` is the base64url-encoded JSON; `sig` is the HMAC of that encoded
 * string. The dot separator is not a base64url character so it cannot appear
 * inside either field, making the split unambiguous.
 */
function buildCookieString(
  payload: StateCookiePayload,
  ttlSeconds: number,
  secure: boolean,
): string {
  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = Buffer.from(payloadJson).toString('base64url');
  const sig = sign(payloadEncoded);
  const value = `${payloadEncoded}.${sig}`;

  const attributes = [
    `${INSTAGRAM_STATE_COOKIE}=${value}`,
    `HttpOnly`,
    `Path=${CALLBACK_PATH}`,
    `SameSite=None`,
    `Max-Age=${ttlSeconds}`,
    ...(secure ? ['Secure'] : []),
  ];

  return attributes.join('; ');
}

/**
 * Parses and verifies a raw cookie header string.
 *
 * Returns the verified payload, or null for any failure — tampered signature,
 * malformed JSON, wrong cookie name, missing cookie, etc.
 *
 * Nothing about the failure reason is logged here; the caller decides what to
 * surface (and what stays in a log).
 */
function parseCookieHeader(cookieHeader: string | undefined): StateCookiePayload | null {
  if (!cookieHeader) return null;

  // Parse the Cookie header manually — we deliberately avoid cookie-parser as
  // a dependency for a single HttpOnly cookie we wrote ourselves.
  const pair = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${INSTAGRAM_STATE_COOKIE}=`));

  if (!pair) return null;

  const raw = pair.slice(INSTAGRAM_STATE_COOKIE.length + 1);
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx === -1) return null;

  const payloadEncoded = raw.slice(0, dotIdx);
  const receivedSig = raw.slice(dotIdx + 1);

  // Constant-time HMAC check — must happen before any decode.
  let expectedSig: string;
  try {
    expectedSig = sign(payloadEncoded);
  } catch {
    // TOKEN_ENCRYPTION_KEY not configured.
    return null;
  }
  if (!safeEqual(expectedSig, receivedSig)) return null;

  // Signature verified — now safe to decode.
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString());
  } catch {
    return null;
  }

  if (!isStateCookiePayload(payload)) return null;
  return payload;
}

function isStateCookiePayload(v: unknown): v is StateCookiePayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.s === 'string' &&
    typeof p.u === 'string' &&
    typeof p.ct === 'string' &&
    (p.b === null || typeof p.b === 'string') &&
    typeof p.exp === 'number'
  );
}

// ─── Clear-cookie helper ──────────────────────────────────────────────────────

/**
 * Expires the state cookie immediately.
 *
 * Called on every callback exit path — success and failure — so the cookie
 * cannot be replayed even if a captured redirect URL is resubmitted.
 */
function clearCookieHeader(secure: boolean): string {
  return [
    `${INSTAGRAM_STATE_COOKIE}=`,
    `HttpOnly`,
    `Path=${CALLBACK_PATH}`,
    `SameSite=None`,
    `Max-Age=0`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Whether the runtime is in a context that can use Secure cookies.
 *
 * In local HTTP development `Secure` cookies are never sent by the browser,
 * so we omit the attribute. In all other cases (including Render) we include it.
 * This is determined by the NODE_ENV and the INSTAGRAM_REDIRECT_URI scheme, so
 * it is never a runtime decision an attacker can influence.
 */
function isSecureContext(): boolean {
  if (process.env.NODE_ENV === 'development') return false;
  // Also detect local dev when NODE_ENV is not set but the redirect URI is http.
  const redirectUri = env.INSTAGRAM_REDIRECT_URI ?? '';
  if (redirectUri.startsWith('http://')) return false;
  return true;
}

/**
 * Mints a random OAuth state, signs it into a cookie set on `res`, and returns
 * the state string to embed in the Instagram authorization URL.
 *
 * The state is NOT stored anywhere on the server — it lives only in the signed
 * cookie that the browser will return on callback.
 */
export function createInstagramState(
  res: Response,
  userId: string,
  context: { contextType: string; brandId: string | null },
  ttlMs: number = INSTAGRAM_STATE_TTL_MS,
): string {
  const state = crypto.randomBytes(32).toString('base64url');
  const exp = Date.now() + ttlMs;

  const payload: StateCookiePayload = {
    s: state,
    u: userId,
    ct: context.contextType,
    b: context.brandId,
    exp,
  };

  const secure = isSecureContext();
  const ttlSeconds = Math.ceil(ttlMs / 1_000);
  const cookieStr = buildCookieString(payload, ttlSeconds, secure);

  // Express's res.setHeader accepts an array for multiple Set-Cookie headers.
  // We use append (via the raw header) to avoid overwriting any existing
  // Set-Cookie (e.g. a CORS preflight cookie set by other middleware).
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }

  return state;
}

/**
 * Reads, verifies and clears the Instagram OAuth state cookie.
 *
 * Returns the verified pending state, or null for any of:
 *   • missing cookie
 *   • tampered or invalid signature
 *   • expired payload
 *   • state param does not match the cookie's `s` field
 *
 * The cookie is always cleared, regardless of the outcome, so a replayed
 * callback URL cannot succeed on a second attempt.
 *
 * `stateParam` is the `state` query param from the callback request —
 * comparing it against the cookie's `s` field is what makes this a CSRF check,
 * not just an authentication check.
 */
export function consumeInstagramState(
  req: Request,
  res: Response,
  stateParam: string | undefined,
): PendingInstagramState | null {
  const secure = isSecureContext();

  // Always clear the cookie — single-use by construction.
  const existing = res.getHeader('Set-Cookie');
  const clearStr = clearCookieHeader(secure);
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, clearStr]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, clearStr]);
  } else {
    res.setHeader('Set-Cookie', clearStr);
  }

  if (!stateParam) return null;

  const payload = parseCookieHeader(req.headers.cookie);
  if (!payload) return null;

  // Expiry check.
  if (payload.exp <= Date.now()) return null;

  // State param must match what we embedded in the cookie — this is the CSRF
  // binding. Constant-time compare is not strictly necessary here (both values
  // are already base64url from our own crypto) but we are consistent.
  if (!crypto.timingSafeEqual(Buffer.from(stateParam), Buffer.from(payload.s))) {
    return null;
  }

  return {
    userId: payload.u,
    contextType: payload.ct,
    brandId: payload.b,
  };
}

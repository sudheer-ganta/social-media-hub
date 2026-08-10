import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';

/**
 * OAuth `state` carried in an HMAC-signed HttpOnly cookie.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 *
 * The sibling `oauth-state.ts` store is an in-memory Map, and its own comment
 * documents the failure mode: "a restart or a second instance drops in-flight
 * connects." On Render the backend spins down between requests and starts a
 * fresh process on the next one, so the Map that held the minted state is gone
 * by the time the provider's redirect arrives. Every production callback then
 * answers "OAuth state mismatch".
 *
 * Encoding the whole payload into a signed cookie makes verification stateless:
 * any instance can verify, a restart loses nothing, no Redis required.
 *
 *   create()  → signs {state, userId, contextType, brandId, exp} → Set-Cookie
 *   consume() → reads cookie, verifies HMAC, checks expiry, checks the state
 *               param matches → clears the cookie → returns the payload
 *
 * Written once, per provider instance, for the same reason `oauth-state.ts` is:
 * a second copy of a CSRF check is a second place to get single-use, expiry or
 * entropy wrong. Each provider takes its own store — its own cookie name and
 * its own callback path — so a state minted for Instagram can never satisfy a
 * Facebook callback.
 *
 * ─── Cookie attributes ──────────────────────────────────────────────────────
 *
 *   HttpOnly        — JS cannot read it.
 *   Secure          — only sent over HTTPS; omitted in HTTP dev so local flows
 *                     still work.
 *   SameSite=None   — REQUIRED. The callback arrives as a cross-site navigation
 *                     from the provider's domain. `Lax` would suppress the
 *                     cookie on that redirect, reproducing the exact mismatch
 *                     this exists to fix.
 *   Path            — scoped to the callback route only.
 *   Max-Age         — the state TTL. Belt-and-braces with the payload's `exp`.
 *
 * Note the cookie is only ever *stored* by the browser if the `/connect` fetch
 * was made with `credentials: "include"` and CORS answered with an explicit
 * origin plus `Access-Control-Allow-Credentials: true` — a wildcard origin
 * silently drops it. See `app.ts` and the frontend's `startConnect`.
 *
 * ─── Security properties ────────────────────────────────────────────────────
 *
 *   CSRF: an attacker who cannot read the HttpOnly cookie cannot forge a valid
 *   HMAC, and cannot learn the `state` param that was embedded in the provider
 *   URL — it lives in the signed cookie, not in a store they could race.
 *
 *   Single-use: the cookie is cleared (Max-Age=0) on every callback path,
 *   success and failure alike, before the redirect fires, so a captured
 *   redirect URL cannot be replayed.
 *
 * ─── What is NOT logged ─────────────────────────────────────────────────────
 *
 *   The state value, the cookie content, the HMAC and any token are never
 *   written to console by this module.
 */

/** What a successful consume() returns — mirrors `PendingOAuthState`. */
export interface PendingCookieState {
  userId: string;
  contextType: string;
  brandId: string | null;
}

/** Ten minutes. Long enough for a consent screen, short enough to bound replay. */
export const DEFAULT_COOKIE_STATE_TTL_MS = 10 * 60 * 1_000;

/** The JSON structure baked into the signed cookie. Short keys — cookies are small. */
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

export interface CookieStateStore {
  /**
   * Mints a random state, signs it into a cookie set on `res`, and returns the
   * state string to embed in the provider's authorization URL. The state is not
   * stored server-side — it lives only in the cookie the browser returns.
   */
  create(
    res: Response,
    userId: string,
    context: { contextType: string; brandId: string | null },
    ttlMs?: number,
  ): string;
  /**
   * Reads, verifies and clears the state cookie. Returns null for a missing,
   * tampered, expired or mismatched cookie — the caller cannot tell those
   * apart, and neither should an attacker.
   */
  consume(
    req: Request,
    res: Response,
    stateParam: string | undefined,
  ): PendingCookieState | null;
}

export interface CookieStateOptions {
  /** Cookie name, e.g. `ig_oauth_state`. */
  cookieName: string;
  /** The callback route the cookie's `Path` is scoped to. */
  callbackPath: string;
  /**
   * The provider's configured redirect URI. Only read to decide whether
   * `Secure` applies — an `http://` redirect means local development, where a
   * Secure cookie would never be sent back. Never a value from the request, so
   * it is not something an attacker can influence.
   */
  redirectUri: string;
  ttlMs?: number;
}

/**
 * Signs `data` with HMAC-SHA256 using TOKEN_ENCRYPTION_KEY.
 *
 * That key is already used by the encryption service for token storage, so it
 * is always present in production. Reusing it is deliberate: one secret to
 * rotate, one secret to audit.
 */
function sign(data: string): string {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set — OAuth state cannot be signed.',
    );
  }
  return crypto.createHmac('sha256', key).update(data).digest('base64url');
}

/**
 * Constant-time compare of two base64url digests.
 *
 * `timingSafeEqual` requires equal-length Buffers. Both sides are HMAC-SHA256
 * output so they always match, but a length mismatch is itself a tamper signal
 * and must return false rather than throw.
 */
function safeEqual(a: string, b: string): boolean {
  try {
    // utf8, not base64url: base64url decoding is lenient enough that two
    // different strings can decode to the same bytes, and these values are
    // compared as the exact strings that travelled on the wire.
    const aBuffer = Buffer.from(a, 'utf8');
    const bBuffer = Buffer.from(b, 'utf8');
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
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

/** Appends a Set-Cookie without clobbering one another handler already wrote. */
function appendSetCookie(res: Response, cookieStr: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

export function createCookieStateStore(
  options: CookieStateOptions,
): CookieStateStore {
  const { cookieName, callbackPath, redirectUri } = options;
  const defaultTtlMs = options.ttlMs ?? DEFAULT_COOKIE_STATE_TTL_MS;

  /**
   * Whether the runtime can use Secure cookies. Local HTTP development cannot —
   * the browser never sends them back — so the attribute is omitted there.
   */
  function isSecureContext(): boolean {
    if (process.env.NODE_ENV === 'development') return false;
    if (redirectUri.startsWith('http://')) return false;
    return true;
  }

  function attributes(value: string, maxAge: number): string {
    return [
      `${cookieName}=${value}`,
      'HttpOnly',
      `Path=${callbackPath}`,
      'SameSite=None',
      `Max-Age=${maxAge}`,
      ...(isSecureContext() ? ['Secure'] : []),
    ].join('; ');
  }

  /**
   * Parses and verifies the Cookie header.
   *
   * Wire format: `<name>=<payload>.<sig>`. `payload` is base64url-encoded JSON
   * and `sig` is the HMAC of that encoded string. The dot is not a base64url
   * character, so the split is unambiguous.
   *
   * Nothing about the failure reason is logged here; the caller decides what to
   * surface and what stays in a log.
   */
  function parseCookieHeader(
    cookieHeader: string | undefined,
  ): StateCookiePayload | null {
    if (!cookieHeader) return null;

    // Parsed by hand rather than adding cookie-parser for one cookie we wrote
    // ourselves.
    const pair = cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`));

    if (!pair) return null;

    const raw = pair.slice(cookieName.length + 1);
    const dotIdx = raw.lastIndexOf('.');
    if (dotIdx === -1) return null;

    const payloadEncoded = raw.slice(0, dotIdx);
    const receivedSig = raw.slice(dotIdx + 1);

    // Constant-time HMAC check — before any decode.
    let expectedSig: string;
    try {
      expectedSig = sign(payloadEncoded);
    } catch {
      // TOKEN_ENCRYPTION_KEY not configured.
      return null;
    }
    if (!safeEqual(expectedSig, receivedSig)) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString());
    } catch {
      return null;
    }

    if (!isStateCookiePayload(payload)) return null;
    return payload;
  }

  return {
    create(res, userId, context, ttlMs = defaultTtlMs) {
      const state = crypto.randomBytes(32).toString('base64url');
      const payload: StateCookiePayload = {
        s: state,
        u: userId,
        ct: context.contextType,
        b: context.brandId,
        exp: Date.now() + ttlMs,
      };

      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const value = `${payloadEncoded}.${sign(payloadEncoded)}`;
      appendSetCookie(res, attributes(value, Math.ceil(ttlMs / 1_000)));

      return state;
    },

    consume(req, res, stateParam) {
      // Always clear — single-use by construction, on every exit path.
      appendSetCookie(res, attributes('', 0));

      if (!stateParam) return null;

      const payload = parseCookieHeader(req.headers.cookie);
      if (!payload) return null;

      if (payload.exp <= Date.now()) return null;

      // The state param must match what we embedded in the cookie — this is the
      // CSRF binding, not just an authentication check. Constant-time for
      // consistency; both values are our own base64url output.
      if (!safeEqual(stateParam, payload.s)) return null;

      return {
        userId: payload.u,
        contextType: payload.ct,
        brandId: payload.b,
      };
    },
  };
}

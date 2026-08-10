/**
 * Instagram OAuth cookie state store — unit tests.
 *
 * Tests the HMAC-signed cookie that replaces the in-memory Map.
 * No database, no HTTP server, no Supabase — all logic tested directly.
 *
 * Run: cd server && npx vitest run src/providers/meta/instagram/instagram-state.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import type { Request, Response } from 'express';

// ─── Environment setup ───────────────────────────────────────────────────────
// Must happen before the module under test is loaded because `env` is read at
// module load time (dotenv.config runs on import).
process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
process.env.INSTAGRAM_REDIRECT_URI = 'https://example.com/auth/instagram/callback';
// Mark as production so Secure cookies are used (avoids NODE_ENV branch).
process.env.NODE_ENV = 'production';

import {
  createInstagramState,
  consumeInstagramState,
  INSTAGRAM_STATE_COOKIE,
  INSTAGRAM_STATE_TTL_MS,
} from './instagram-state';

// ─── Minimal Express request/response mocks ───────────────────────────────────

function makeRes(): Response & { _headers: Record<string, string | string[]> } {
  const headers: Record<string, string | string[]> = {};
  return {
    _headers: headers,
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },
  } as unknown as Response & { _headers: Record<string, string | string[]> };
}

function makeReq(cookie?: string): Request {
  return {
    headers: {
      cookie,
    },
  } as unknown as Request;
}

/** Extract the raw Set-Cookie string for the ig_oauth_state cookie from a response. */
function getSetCookieValue(res: ReturnType<typeof makeRes>): string | undefined {
  const header = res._headers['set-cookie'];
  if (!header) return undefined;
  const entries = Array.isArray(header) ? header : [header];
  return entries.find((e) => e.startsWith(`${INSTAGRAM_STATE_COOKIE}=`));
}

/** Extract the raw cookie value (the name=value part before the first ';'). */
function extractCookiePair(setCookieStr: string): string {
  return setCookieStr.split(';')[0];
}

/** Build a Cookie header string from a Set-Cookie header string. */
function toCookieHeader(setCookieStr: string): string {
  return extractCookiePair(setCookieStr);
}

// ─── Shared test context ──────────────────────────────────────────────────────

const USER_ID = 'user-abc-123';
const CONTEXT_PERSONAL = { contextType: 'personal', brandId: null } as const;
const CONTEXT_BRAND = { contextType: 'brand', brandId: 'brand-uuid-456' } as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createInstagramState', () => {
  it('returns a non-empty base64url state string', () => {
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThan(20);
  });

  it('sets a Set-Cookie header with the cookie name', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const cookie = getSetCookieValue(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain(`${INSTAGRAM_STATE_COOKIE}=`);
  });

  it('sets HttpOnly on the cookie', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const cookie = getSetCookieValue(res);
    expect(cookie?.toLowerCase()).toContain('httponly');
  });

  it('sets SameSite=None on the cookie', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const cookie = getSetCookieValue(res);
    expect(cookie?.toLowerCase()).toContain('samesite=none');
  });

  it('sets Secure on the cookie in production', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const cookie = getSetCookieValue(res);
    expect(cookie?.toLowerCase()).toContain('secure');
  });

  it('scopes Path to /auth/instagram/callback', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const cookie = getSetCookieValue(res);
    expect(cookie).toContain('Path=/auth/instagram/callback');
  });

  it('produces distinct states on two calls (no collision)', () => {
    const res1 = makeRes();
    const res2 = makeRes();
    const s1 = createInstagramState(res1, USER_ID, CONTEXT_PERSONAL);
    const s2 = createInstagramState(res2, USER_ID, CONTEXT_PERSONAL);
    expect(s1).not.toBe(s2);
  });

  it('does not log the state value', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const calls = spy.mock.calls.map((c) => JSON.stringify(c));
    spy.mockRestore();
    for (const call of calls) {
      expect(call).not.toContain(state);
    }
  });
});

describe('consumeInstagramState — happy path', () => {
  it('returns the correct pending state for a personal context', () => {
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();

    const pending = consumeInstagramState(req, resB, state);

    expect(pending).not.toBeNull();
    expect(pending?.userId).toBe(USER_ID);
    expect(pending?.contextType).toBe('personal');
    expect(pending?.brandId).toBeNull();
  });

  it('returns the correct pending state for a brand context', () => {
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_BRAND);
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();

    const pending = consumeInstagramState(req, resB, state);

    expect(pending).not.toBeNull();
    expect(pending?.userId).toBe(USER_ID);
    expect(pending?.contextType).toBe('brand');
    expect(pending?.brandId).toBe(CONTEXT_BRAND.brandId);
  });

  it('clears the cookie on success (sets Max-Age=0)', () => {
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();

    consumeInstagramState(req, resB, state);

    // The callback response must contain a clearing Set-Cookie.
    const clearEntry = (() => {
      const h = resB._headers['set-cookie'];
      const entries = Array.isArray(h) ? h : [h ?? ''];
      return entries.find(
        (e) => e.startsWith(`${INSTAGRAM_STATE_COOKIE}=`) && e.includes('Max-Age=0'),
      );
    })();
    expect(clearEntry).toBeTruthy();
  });
});

describe('consumeInstagramState — rejection cases', () => {
  it('returns null when state param is undefined', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();

    const result = consumeInstagramState(req, resB, undefined);
    expect(result).toBeNull();
  });

  it('returns null when no cookie is present', () => {
    const req = makeReq(); // no cookie header
    const resB = makeRes();
    const result = consumeInstagramState(req, resB, 'some-state');
    expect(result).toBeNull();
  });

  it('returns null when the state param does not match the cookie state', () => {
    const res = makeRes();
    createInstagramState(res, USER_ID, CONTEXT_PERSONAL); // state A
    const setCookie = getSetCookieValue(res)!;

    const res2 = makeRes();
    const stateB = createInstagramState(res2, USER_ID, CONTEXT_PERSONAL); // state B
    // Send state B in the query but cookie from state A → mismatch.
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();

    const result = consumeInstagramState(req, resB, stateB);
    expect(result).toBeNull();
  });

  it('returns null for a tampered cookie (bit-flipped signature)', () => {
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const setCookie = getSetCookieValue(res)!;

    // Flip the last character of the signature portion of the cookie value.
    const pair = extractCookiePair(setCookie);
    const eqIdx = pair.indexOf('=');
    const rawValue = pair.slice(eqIdx + 1);
    const chars = rawValue.split('');
    chars[chars.length - 1] = chars[chars.length - 1] === 'A' ? 'B' : 'A';
    const tamperedCookie = `${INSTAGRAM_STATE_COOKIE}=${chars.join('')}`;

    const req = makeReq(tamperedCookie);
    const resB = makeRes();

    const result = consumeInstagramState(req, resB, state);
    expect(result).toBeNull();
  });

  it('returns null for an expired cookie', () => {
    vi.useFakeTimers();
    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL, 1000); // 1 s TTL
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));

    // Advance time past the TTL.
    vi.advanceTimersByTime(2000);

    const resB = makeRes();
    const result = consumeInstagramState(req, resB, state);
    vi.useRealTimers();

    expect(result).toBeNull();
  });

  it('returns null for a cookie with no dot separator (malformed)', () => {
    const req = makeReq(`${INSTAGRAM_STATE_COOKIE}=nodothere`);
    const resB = makeRes();
    const result = consumeInstagramState(req, resB, 'anything');
    expect(result).toBeNull();
  });

  it('returns null for a cookie whose payload is not valid JSON', () => {
    // Build a cookie that has a dot but whose payload is not JSON, then re-sign it.
    const badPayloadEncoded = Buffer.from('not-json').toString('base64url');
    const sig = crypto
      .createHmac('sha256', process.env.TOKEN_ENCRYPTION_KEY!)
      .update(badPayloadEncoded)
      .digest('base64url');
    const req = makeReq(`${INSTAGRAM_STATE_COOKIE}=${badPayloadEncoded}.${sig}`);
    const resB = makeRes();
    const result = consumeInstagramState(req, resB, 'anything');
    expect(result).toBeNull();
  });

  it('always clears the cookie even on rejection', () => {
    const req = makeReq(); // no cookie → will reject
    const resB = makeRes();

    consumeInstagramState(req, resB, 'some-state');

    const h = resB._headers['set-cookie'];
    const entries = Array.isArray(h) ? h : [h ?? ''];
    const clearsEntry = entries.find(
      (e) => e.startsWith(`${INSTAGRAM_STATE_COOKIE}=`) && e.includes('Max-Age=0'),
    );
    expect(clearsEntry).toBeTruthy();
  });

  it('does not log the state value, cookie content or any secret', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = makeRes();
    const state = createInstagramState(res, USER_ID, CONTEXT_PERSONAL);
    const setCookie = getSetCookieValue(res)!;
    const req = makeReq(toCookieHeader(setCookie));
    const resB = makeRes();
    consumeInstagramState(req, resB, state);

    const allCalls = [
      ...consoleSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].map((c) => JSON.stringify(c));

    consoleSpy.mockRestore();
    errorSpy.mockRestore();

    for (const call of allCalls) {
      expect(call).not.toContain(state);
      expect(call).not.toContain(process.env.TOKEN_ENCRYPTION_KEY);
    }
  });
});

describe('React StrictMode double-create scenario', () => {
  it('second create overwrites first — only the second state is valid', () => {
    // StrictMode can call connect() twice. The browser follows the second URL
    // (state-B) and brings back state-B in the callback. State-A URL was never
    // followed. The cookie from the second createInstagramState call is the one
    // the browser holds (cookie-B). Consuming with state-B and cookie-B must
    // succeed.

    // First call (would be abandoned by browser StrictMode)
    const resA = makeRes();
    createInstagramState(resA, USER_ID, CONTEXT_PERSONAL); // state A

    // Second call — browser navigates to this URL
    const resB = makeRes();
    const stateB = createInstagramState(resB, USER_ID, CONTEXT_PERSONAL);
    const setCookieB = getSetCookieValue(resB)!;

    // Callback arrives with state-B in the query and cookie-B in the header.
    const req = makeReq(toCookieHeader(setCookieB));
    const callbackRes = makeRes();
    const pending = consumeInstagramState(req, callbackRes, stateB);

    expect(pending).not.toBeNull();
    expect(pending?.userId).toBe(USER_ID);
  });
});

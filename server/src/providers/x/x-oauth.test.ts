/**
 * X OAuth (PKCE) — unit tests.
 *
 * Covers the signed cookie state carrying the PKCE verifier, verifier/challenge
 * generation, the callback's state checks, the token exchange and refresh, the
 * registry entry and the publish request.
 *
 * No database, no HTTP server, no Supabase — axios is mocked and everything else
 * is called directly.
 *
 * Run: cd server && npx vitest run src/providers/x/x-oauth.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { Request, Response } from 'express';

// ─── Environment setup ───────────────────────────────────────────────────────
// `vi.hoisted`, not a bare assignment: `config.ts` reads `env` at module load
// time and ESM hoists every `import` below above any statement written here, so
// a plain assignment would run *after* the module it is meant to configure had
// already captured empty strings.
vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';
  process.env.X_REDIRECT_URI = 'https://example.com/auth/x/callback';
  process.env.X_API_VERSION = '2';
  // Marked production so Secure cookies are used (avoids the NODE_ENV branch).
  process.env.NODE_ENV = 'production';
});

vi.mock('axios');
import axios from 'axios';

// The callback's persistence and audit writes. Mocked so these tests never
// reach Prisma — what is under test here is the state and PKCE handling, and a
// database round-trip would only add a dependency and some noisy log output.
vi.mock('../../services/social-connection.service', () => ({
  socialConnectionService: {
    connectAccount: vi.fn(async () => ({
      id: 'account-1',
      providerAccountId: '12345',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    })),
    recordConnectionFailure: vi.fn(async () => undefined),
  },
}));

import { createXState, consumeXState, X_STATE_COOKIE, X_STATE_TTL_MS } from './x-state';
import { createCodeVerifier, toCodeChallenge, createPkcePair } from './pkce';
import { exchangeAuthorizationCode, refreshAccessToken } from './token';
import { publish } from './publisher';
import { validatePost, canPublish, X_MAX_TEXT_LENGTH } from './validator';
import { buildAuthorizationUrl, xProvider } from './oauth';
import { providers, getProvider } from '../index';
import { getCatalogEntry } from '../catalog';
import { ProviderError } from '../provider.interface';

// ─── Minimal Express request/response mocks ──────────────────────────────────

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
  return { headers: { cookie } } as unknown as Request;
}

/** The raw Set-Cookie string for the x_oauth_state cookie. */
function getSetCookie(res: ReturnType<typeof makeRes>): string | undefined {
  const header = res._headers['set-cookie'];
  if (!header) return undefined;
  const entries = Array.isArray(header) ? header : [header];
  // The last write wins for a Cookie header the browser would send back, but
  // create() writes exactly one and consume() appends the clearing one after.
  return entries.find((e) => e.startsWith(`${X_STATE_COOKIE}=`));
}

/** A Cookie header built from a Set-Cookie header. */
function toCookieHeader(setCookie: string): string {
  return setCookie.split(';')[0];
}

const USER_ID = 'user-abc-123';
const CONTEXT = { contextType: 'personal', brandId: null } as const;
const BRAND_CONTEXT = { contextType: 'brand', brandId: 'brand-uuid-456' } as const;
const VERIFIER = 'test-verifier-abcdefghijklmnopqrstuvwxyz012345';

/** Mints a state and returns everything a callback needs to consume it. */
function mint(verifier = VERIFIER, context: typeof CONTEXT | typeof BRAND_CONTEXT = CONTEXT) {
  const res = makeRes();
  const state = createXState(res, USER_ID, context, verifier);
  const setCookie = getSetCookie(res)!;
  return { state, cookie: toCookieHeader(setCookie), setCookie };
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

describe('PKCE verifier and challenge generation', () => {
  it('produces a verifier inside RFC 7636 length limits', () => {
    const verifier = createCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('produces only unreserved base64url characters', () => {
    expect(createCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('produces a different verifier every call', () => {
    const seen = new Set(Array.from({ length: 50 }, () => createCodeVerifier()));
    expect(seen.size).toBe(50);
  });

  it('derives the challenge as base64url(SHA-256(verifier)) over ASCII', () => {
    const expected = crypto
      .createHash('sha256')
      .update(VERIFIER, 'ascii')
      .digest('base64url');
    expect(toCodeChallenge(VERIFIER)).toBe(expected);
  });

  it('is deterministic for the same verifier and different for another', () => {
    expect(toCodeChallenge(VERIFIER)).toBe(toCodeChallenge(VERIFIER));
    expect(toCodeChallenge(VERIFIER)).not.toBe(toCodeChallenge(`${VERIFIER}x`));
  });

  it('never returns the verifier itself as the challenge (S256, not plain)', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).not.toBe(verifier);
    expect(challenge).toBe(toCodeChallenge(verifier));
  });
});

// ─── State creation and verification ─────────────────────────────────────────

describe('X state creation', () => {
  it('returns a non-empty base64url state', () => {
    const { state } = mint();
    expect(state).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(state.length).toBeGreaterThan(20);
  });

  it('mints a different state every call', () => {
    const seen = new Set(Array.from({ length: 25 }, () => mint().state));
    expect(seen.size).toBe(25);
  });

  it('sets an HttpOnly, Secure, SameSite=None cookie scoped to the callback path', () => {
    const { setCookie } = mint();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Path=/auth/x/callback');
    expect(setCookie).toContain(`Max-Age=${Math.ceil(X_STATE_TTL_MS / 1000)}`);
  });

  it('never puts the verifier in the cookie in readable form', () => {
    const { setCookie } = mint();
    expect(setCookie).not.toContain(VERIFIER);
  });

  it('round-trips the user, context and PKCE verifier', () => {
    const { state, cookie } = mint(VERIFIER, BRAND_CONTEXT);
    const pending = consumeXState(makeReq(cookie), makeRes(), state);

    expect(pending).toEqual({
      userId: USER_ID,
      contextType: 'brand',
      brandId: 'brand-uuid-456',
      codeVerifier: VERIFIER,
    });
  });

  it('clears the cookie on consume, so a state is single-use', () => {
    const { state, cookie } = mint();
    const res = makeRes();

    expect(consumeXState(makeReq(cookie), res, state)).not.toBeNull();

    // consume() writes exactly one Set-Cookie on this fresh response: the
    // clearing one. Max-Age=0 is what makes the state single-use.
    const cleared = res._headers['set-cookie'];
    expect(String(cleared)).toContain(`${X_STATE_COOKIE}=`);
    expect(String(cleared)).toContain('Max-Age=0');
  });
});

describe('X state verification failures', () => {
  it('rejects a mismatched state param', () => {
    const { cookie } = mint();
    expect(consumeXState(makeReq(cookie), makeRes(), 'not-the-state')).toBeNull();
  });

  it('rejects a missing state param', () => {
    const { cookie } = mint();
    expect(consumeXState(makeReq(cookie), makeRes(), undefined)).toBeNull();
  });

  it('rejects a missing cookie', () => {
    const { state } = mint();
    expect(consumeXState(makeReq(undefined), makeRes(), state)).toBeNull();
  });

  it('rejects a tampered payload — the signature no longer matches', () => {
    const { state, cookie } = mint();
    const [name, raw] = [X_STATE_COOKIE, cookie.slice(X_STATE_COOKIE.length + 1)];
    const dot = raw.lastIndexOf('.');

    // Re-encode the payload with a different user id, keeping the old signature.
    const payload = JSON.parse(
      Buffer.from(raw.slice(0, dot), 'base64url').toString(),
    );
    payload.u = 'attacker-user-id';
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = `${name}=${forged}.${raw.slice(dot + 1)}`;

    expect(consumeXState(makeReq(tampered), makeRes(), state)).toBeNull();
  });

  it('rejects a tampered verifier', () => {
    const { state, cookie } = mint();
    const raw = cookie.slice(X_STATE_COOKIE.length + 1);
    const dot = raw.lastIndexOf('.');
    const payload = JSON.parse(
      Buffer.from(raw.slice(0, dot), 'base64url').toString(),
    );
    payload.v = 'attacker-supplied-verifier';
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const tampered = `${X_STATE_COOKIE}=${forged}.${raw.slice(dot + 1)}`;
    expect(consumeXState(makeReq(tampered), makeRes(), state)).toBeNull();
  });

  it('rejects a signature swapped for a self-signed one under a different key', () => {
    const { state, cookie } = mint();
    const raw = cookie.slice(X_STATE_COOKIE.length + 1);
    const encoded = raw.slice(0, raw.lastIndexOf('.'));
    const wrongSig = crypto
      .createHmac('sha256', 'a-completely-different-key')
      .update(encoded)
      .digest('base64url');

    const forged = `${X_STATE_COOKIE}=${encoded}.${wrongSig}`;
    expect(consumeXState(makeReq(forged), makeRes(), state)).toBeNull();
  });

  it('rejects an expired state', () => {
    const res = makeRes();
    // One millisecond TTL: expired by the time it is read back.
    const state = createXState(res, USER_ID, CONTEXT, VERIFIER, 1);
    const cookie = toCookieHeader(getSetCookie(res)!);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5_000);
    try {
      expect(consumeXState(makeReq(cookie), makeRes(), state)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not accept another provider's cookie", () => {
    const { state, cookie } = mint();
    const renamed = cookie.replace(X_STATE_COOKIE, 'ig_oauth_state');
    expect(consumeXState(makeReq(renamed), makeRes(), state)).toBeNull();
  });
});

// ─── Authorization URL ───────────────────────────────────────────────────────

describe('buildAuthorizationUrl', () => {
  it('sends PKCE S256, the configured redirect and the four scopes', () => {
    const url = new URL(buildAuthorizationUrl('the-state', 'the-challenge'));

    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.com/auth/x/callback',
    );
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.searchParams.get('code_challenge')).toBe('the-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe(
      'tweet.read tweet.write users.read media.write offline.access',
    );
  });

  it('never puts the verifier or the client secret in the URL', () => {
    const { verifier, challenge } = createPkcePair();
    const url = buildAuthorizationUrl('the-state', challenge);
    expect(url).not.toContain(verifier);
    expect(url).not.toContain('test-client-secret');
  });
});

// ─── Callback state handling ─────────────────────────────────────────────────

describe('callback state checks', () => {
  const postSpy = vi.mocked(axios.post);

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  /** Drives xProvider.callback with a query and cookie, capturing the redirect. */
  async function runCallback(
    query: Record<string, string>,
    cookie?: string,
  ): Promise<string> {
    let redirected = '';
    const res = makeRes();
    (res as unknown as { redirect: (s: number, u: string) => void }).redirect = (
      _status,
      url,
    ) => {
      redirected = url;
    };
    const req = { headers: { cookie }, query } as unknown as Request;
    await xProvider.callback(req, res);
    return redirected;
  }

  it('fails on a state mismatch without exchanging the code', async () => {
    const { cookie } = mint();
    const url = await runCallback({ code: 'auth-code', state: 'wrong-state' }, cookie);

    expect(url).toContain('status=failed');
    // The CSRF check must run *before* anything is redeemed.
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fails when no cookie came back at all', async () => {
    const { state } = mint();
    const url = await runCallback({ code: 'auth-code', state });

    expect(url).toContain('status=failed');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fails when the verified state carries no PKCE verifier', async () => {
    // A cookie minted by the shared store *without* a verifier — what a
    // non-PKCE provider writes. It verifies, but X cannot use it.
    const res = makeRes();
    const { createCookieStateStore } = await import('../oauth-state-cookie');
    const store = createCookieStateStore({
      cookieName: X_STATE_COOKIE,
      callbackPath: '/auth/x/callback',
      redirectUri: 'https://example.com/auth/x/callback',
    });
    const state = store.create(res, USER_ID, CONTEXT);
    const cookie = toCookieHeader(getSetCookie(res)!);

    const url = await runCallback({ code: 'auth-code', state }, cookie);

    expect(url).toContain('status=failed');
    // Refused rather than exchanged without PKCE.
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fails when X sends back an error instead of a code', async () => {
    const { state, cookie } = mint();
    const url = await runCallback({ error: 'access_denied', state }, cookie);

    expect(url).toContain('status=failed');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('fails when the authorization code is missing', async () => {
    const { state, cookie } = mint();
    const url = await runCallback({ state }, cookie);

    expect(url).toContain('status=failed');
    expect(postSpy).not.toHaveBeenCalled();
  });
});

// ─── Token exchange and refresh ──────────────────────────────────────────────

describe('token exchange', () => {
  const postSpy = vi.mocked(axios.post);

  beforeEach(() => vi.clearAllMocks());

  it('posts the PKCE verifier, form-encoded, with Basic auth', async () => {
    postSpy.mockResolvedValue({
      data: {
        token_type: 'bearer',
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 7200,
        scope: 'tweet.read tweet.write users.read offline.access',
      },
    });

    const token = await exchangeAuthorizationCode('auth-code', VERIFIER);

    expect(token.accessToken).toBe('access-1');
    expect(token.refreshToken).toBe('refresh-1');
    expect(token.scope).toBe('tweet.read tweet.write users.read offline.access');
    // 7200 seconds out, within a second of tolerance.
    expect(token.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 7_100_000 / 1000);

    const [url, body, cfg] = postSpy.mock.calls[0];
    expect(url).toBe('https://api.x.com/2/oauth2/token');

    const form = new URLSearchParams(body as string);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('auth-code');
    expect(form.get('code_verifier')).toBe(VERIFIER);
    expect(form.get('redirect_uri')).toBe('https://example.com/auth/x/callback');
    expect(form.get('client_id')).toBe('test-client-id');
    // The secret authenticates via Basic auth, never as a form field.
    expect(form.get('client_secret')).toBeNull();

    const headers = (cfg as { headers: Record<string, string> }).headers;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('test-client-id:test-client-secret').toString('base64')}`,
    );
  });

  it('throws a ProviderError when X returns no access_token', async () => {
    postSpy.mockResolvedValue({ data: { token_type: 'bearer' } });
    await expect(exchangeAuthorizationCode('code', VERIFIER)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it('never puts the verifier or the secret into the thrown message', async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    postSpy.mockRejectedValue(new Error('network down'));

    await expect(exchangeAuthorizationCode('code', VERIFIER)).rejects.toSatisfy(
      (error: Error) =>
        !error.message.includes(VERIFIER) &&
        !error.message.includes('test-client-secret'),
    );
  });
});

describe('refresh token handling', () => {
  const postSpy = vi.mocked(axios.post);

  beforeEach(() => vi.clearAllMocks());

  it('sends the refresh grant and returns the rotated refresh token', async () => {
    postSpy.mockResolvedValue({
      data: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 7200 },
    });

    const token = await refreshAccessToken('refresh-1');

    expect(token.accessToken).toBe('access-2');
    // X rotates: the *new* value must be what gets stored.
    expect(token.refreshToken).toBe('refresh-2');

    const form = new URLSearchParams(postSpy.mock.calls[0][1] as string);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('refresh-1');
    expect(form.get('client_id')).toBe('test-client-id');
  });

  it('keeps the presented refresh token when X omits a new one', async () => {
    postSpy.mockResolvedValue({ data: { access_token: 'access-3', expires_in: 7200 } });

    const token = await refreshAccessToken('refresh-1');
    expect(token.refreshToken).toBe('refresh-1');
  });

  it('throws when the refresh response has no access_token', async () => {
    postSpy.mockResolvedValue({ data: {} });
    await expect(refreshAccessToken('refresh-1')).rejects.toBeInstanceOf(ProviderError);
  });
});

// ─── Provider registration ───────────────────────────────────────────────────

describe('provider registration', () => {
  it('is filed in the registry under `x`', () => {
    expect(providers.x).toBe(xProvider);
    expect(getProvider('x')).toBe(xProvider);
  });

  it('implements the interface the other networks do', () => {
    expect(xProvider.id).toBe('x');
    expect(xProvider.displayName).toBe('X');
    expect(typeof xProvider.connect).toBe('function');
    expect(typeof xProvider.callback).toBe('function');
    expect(typeof xProvider.publish).toBe('function');
    expect(typeof xProvider.verify).toBe('function');
    expect(typeof xProvider.canPublish).toBe('function');
    expect(typeof xProvider.refreshTokens).toBe('function');
  });

  it('is available in the catalogue and wired to the connect route', () => {
    const entry = getCatalogEntry('x')!;
    expect(entry.available).toBe(true);
    expect(entry.connectPath).toBe('/auth/x/connect');
    expect(entry.apiVersion).toBe('2');
    // Every scope we request is described for the member.
    const scopes = entry.permissions.map((p) => p.scope).filter(Boolean);
    expect(scopes).toEqual(
      expect.arrayContaining([
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ]),
    );
  });

  it('leaves the other providers registered and unchanged', () => {
    expect(getProvider('linkedin')?.id).toBe('linkedin');
    expect(getProvider('instagram')?.id).toBe('instagram');
    expect(getProvider('facebook')?.id).toBe('facebook');
    // None of them grew a refresh path.
    expect(getProvider('linkedin')?.refreshTokens).toBeUndefined();
    expect(getProvider('instagram')?.refreshTokens).toBeUndefined();
    expect(getProvider('facebook')?.refreshTokens).toBeUndefined();
  });

  it('only counts a connection publishable when tweet.write was granted', () => {
    expect(canPublish(['tweet.read', 'tweet.write', 'users.read'])).toBe(true);
    expect(canPublish(['tweet.read', 'users.read'])).toBe(false);
    expect(canPublish([])).toBe(false);
  });
});

// ─── Publish request construction ────────────────────────────────────────────

describe('X publish request construction', () => {
  const postSpy = vi.mocked(axios.post);

  beforeEach(() => vi.clearAllMocks());

  it('POSTs /2/tweets with a JSON body and a Bearer token', async () => {
    postSpy.mockResolvedValue({ data: { data: { id: '1799999999', text: 'hi' } } });

    const result = await publish({
      accessToken: 'access-1',
      providerAccountId: '12345',
      caption: '  Shipping the X integration.  ',
    });

    const [url, body, cfg] = postSpy.mock.calls[0];
    expect(url).toBe('https://api.x.com/2/tweets');
    // Trimmed, and nothing but `text` — /2/tweets posts as the bearer's account.
    expect(body).toEqual({ text: 'Shipping the X integration.' });

    const headers = (cfg as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe('Bearer access-1');
    expect(headers['Content-Type']).toBe('application/json');

    expect(result.urn).toBe('1799999999');
    expect(result.url).toBe('https://x.com/i/web/status/1799999999');
    expect(result.endpoint).toBe('tweets');
    expect(result.mediaUrns).toEqual([]);
  });

  it('throws when X answers 2xx with no id', async () => {
    postSpy.mockResolvedValue({ data: { data: {} } });

    await expect(
      publish({ accessToken: 'a', providerAccountId: '1', caption: 'hello' }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('refuses an over-length post before spending a request', async () => {
    await expect(
      publish({
        accessToken: 'a',
        providerAccountId: '1',
        caption: 'x'.repeat(X_MAX_TEXT_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(postSpy).not.toHaveBeenCalled();
  });

  /** One attached image, already through the media service. */
  const image = (name: string) => ({
    kind: 'image' as const,
    mimeType: 'image/jpeg',
    data: Buffer.alloc(4),
    byteLength: 4,
    sourceUrl: `https://cdn.example.com/${name}.jpg`,
    width: 100,
    height: 100,
    altText: null,
  });

  it('uploads each image and attaches the ids in order', async () => {
    postSpy
      .mockResolvedValueOnce({ data: { data: { id: 'media-1' } } })
      .mockResolvedValueOnce({ data: { media_id_string: 'media-2' } })
      .mockResolvedValueOnce({ data: { data: { id: '1799999999' } } });

    const result = await publish({
      accessToken: 'access-1',
      providerAccountId: '12345',
      caption: 'two pictures',
      media: [image('a'), image('b')],
    });

    // Uploads first, post last — an id that never arrived cannot be referenced.
    expect(postSpy.mock.calls[0][0]).toBe('https://api.x.com/2/media/upload');
    expect(postSpy.mock.calls[1][0]).toBe('https://api.x.com/2/media/upload');

    const [url, body] = postSpy.mock.calls[2];
    expect(url).toBe('https://api.x.com/2/tweets');
    // Upload order is render order, and the string id is the one used.
    expect(body).toEqual({
      text: 'two pictures',
      media: { media_ids: ['media-1', 'media-2'] },
    });
    expect(result.mediaUrns).toEqual(['media-1', 'media-2']);
  });

  it('refuses a fifth image rather than publishing the first four', async () => {
    await expect(
      publish({
        accessToken: 'a',
        providerAccountId: '1',
        caption: 'five pictures',
        media: [image('a'), image('b'), image('c'), image('d'), image('e')],
      }),
    ).rejects.toThrow(/holds 4 images/i);
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('asks for a reconnect when the upload is refused for want of a scope', async () => {
    // `axios` is mocked wholesale here, so the type guard has to be told too.
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    postSpy.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        isAxiosError: true,
        response: { status: 403, data: {} },
      }),
    );

    await expect(
      publish({
        accessToken: 'a',
        providerAccountId: '1',
        caption: 'with a picture',
        media: [image('a')],
      }),
    ).rejects.toThrow(/Reconnect your X account/i);
    // The post itself was never attempted, so nothing went out without its image.
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('validates a 400 with no upstream status, so the publish service surfaces it', () => {
    try {
      validatePost({ caption: '   ' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).status).toBe(400);
      expect((error as ProviderError).upstreamStatus).toBeUndefined();
    }
  });

  it('counts by code point, so an emoji is one character', () => {
    // 280 emoji is 280 characters here, and 560 UTF-16 units.
    expect(() => validatePost({ caption: '😀'.repeat(X_MAX_TEXT_LENGTH) })).not.toThrow();
    expect(() => validatePost({ caption: '😀'.repeat(X_MAX_TEXT_LENGTH + 1) })).toThrow();
  });
});

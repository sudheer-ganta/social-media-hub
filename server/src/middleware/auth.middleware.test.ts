import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock('../config/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  },
}));

import { requireAuth } from './auth.middleware';

const SECRET = 'test-secret-test-secret-test-secret-123';

function run(token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn();
  return requireAuth(req, res, next).then(() => ({ req, res, next }));
}

const sign = (claims: object, opts: jwt.SignOptions = {}) =>
  jwt.sign(claims, SECRET, { algorithm: 'HS256', audience: 'authenticated', expiresIn: '1h', ...opts });

beforeEach(() => getUser.mockReset());

describe('requireAuth', () => {
  it('rejects a request with no token', async () => {
    const { res, next } = await run();
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed token without calling Supabase', async () => {
    const { req, next } = await run(sign({ sub: 'user-1', email: 'a@b.co' }));
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe('user-1');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('is a no-op when a user is already established', async () => {
    const req: any = { headers: {}, user: { id: 'already' } };
    const next = vi.fn();
    await requireAuth(req, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  // The regression: a Supabase outage used to make the API trust `jwt.decode`,
  // which never checks the signature.
  it('does NOT trust a forged token when Supabase is unreachable', async () => {
    const forged = jwt.sign({ sub: 'victim-user', exp: Math.floor(Date.now() / 1000) + 3600 }, 'attacker-key');
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'fetch failed', status: 0 },
    });

    const { res, next } = await run(forged);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('does NOT trust a forged token when the Supabase call throws', async () => {
    const forged = jwt.sign({ sub: 'victim-user', exp: Math.floor(Date.now() / 1000) + 3600 }, 'attacker-key');
    // Accessing the response blows up inside the middleware's try block — the
    // same `catch` a dropped socket reaches.
    getUser.mockResolvedValue({
      get data(): never {
        throw new Error('ECONNRESET');
      },
      error: null,
    });

    const { res, next } = await run(forged);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'victim-user', aud: 'authenticated', exp: 9999999999 })).toString('base64url');
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT', status: 401 } });

    const { res, next } = await run(`${header}.${payload}.`);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired token without asking Supabase', async () => {
    const { res, next } = await run(sign({ sub: 'user-1' }, { expiresIn: -10 }));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('falls back to Supabase for a token it cannot verify locally, and honours its answer', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'remote-user' } }, error: null });
    const { req, next } = await run(jwt.sign({ sub: 'x' }, 'some-other-key'));
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe('remote-user');
  });
});

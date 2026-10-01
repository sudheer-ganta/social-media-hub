/**
 * LinkedIn OAuth state — the forced-account-linking regression.
 *
 * LinkedIn used an in-memory Map keyed only by the `state` value, which bound a
 * flow to a Rally *user* but not to a *browser*. That let an attacker mint a
 * valid authorization URL from their own session and hand it to a victim; the
 * victim's approval would attach the victim's LinkedIn to the attacker's account.
 * The state now lives in a signed HttpOnly cookie, so only the browser that
 * started the flow can finish it.
 */
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';

process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
process.env.LINKEDIN_REDIRECT_URI = 'https://example.com/auth/linkedin/callback';
process.env.NODE_ENV = 'production';

import { createLinkedInState, consumeLinkedInState, LINKEDIN_STATE_COOKIE } from './linkedin-state';

function makeRes() {
  const headers: Record<string, string | string[]> = {};
  const res = {
    _headers: headers,
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res as unknown as Response & { _headers: Record<string, string | string[]> };
}

const makeReq = (cookie?: string) => ({ headers: { cookie } }) as unknown as Request;

function cookieFrom(res: ReturnType<typeof makeRes>): string {
  const header = res._headers['set-cookie'];
  const entries = Array.isArray(header) ? header : [header as string];
  const mine = entries.find((e) => e.startsWith(`${LINKEDIN_STATE_COOKIE}=`));
  if (!mine) throw new Error('no state cookie was set');
  return mine.split(';')[0];
}

const context = { contextType: 'personal', brandId: null };

describe('LinkedIn OAuth state', () => {
  it('sets a HttpOnly, Secure cookie scoped to the callback path', () => {
    const res = makeRes();
    createLinkedInState(res, 'user-1', context);
    const raw = [res._headers['set-cookie']].flat().join(';');
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('Path=/auth/linkedin/callback');
  });

  it('is redeemable by the browser that started the flow, and returns that user', () => {
    const res = makeRes();
    const state = createLinkedInState(res, 'user-1', context);
    const pending = consumeLinkedInState(makeReq(cookieFrom(res)), makeRes(), state);
    expect(pending?.userId).toBe('user-1');
  });

  // The attack: the attacker has a valid `state` (they minted it) but the victim's
  // browser has no cookie for it.
  it('rejects a valid state presented by a different browser (no cookie)', () => {
    const attackerRes = makeRes();
    const state = createLinkedInState(attackerRes, 'attacker', context);
    expect(consumeLinkedInState(makeReq(undefined), makeRes(), state)).toBeNull();
  });

  it('rejects a state that does not match the cookie', () => {
    const res = makeRes();
    createLinkedInState(res, 'user-1', context);
    expect(consumeLinkedInState(makeReq(cookieFrom(res)), makeRes(), 'some-other-state')).toBeNull();
  });

  it('rejects a tampered cookie', () => {
    const res = makeRes();
    const state = createLinkedInState(res, 'user-1', context);
    const pair = cookieFrom(res);
    const tampered = pair.slice(0, -2) + (pair.endsWith('AA') ? 'BB' : 'AA');
    expect(consumeLinkedInState(makeReq(tampered), makeRes(), state)).toBeNull();
  });

  it('clears the cookie when consumed', () => {
    const res = makeRes();
    const state = createLinkedInState(res, 'user-1', context);
    const consumeRes = makeRes();
    consumeLinkedInState(makeReq(cookieFrom(res)), consumeRes, state);
    const header = consumeRes._headers['set-cookie'];
    expect([header].flat().join(';')).toMatch(/Max-Age=0/);
  });
});

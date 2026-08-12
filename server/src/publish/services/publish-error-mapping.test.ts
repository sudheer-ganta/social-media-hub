/**
 * What a member reads when a network refuses a publish.
 *
 * The rule this file defends: **the message has to describe the actual
 * failure**. Every branch below was a real support case wearing the wrong
 * words — most recently X's `402 credits depleted`, which fell through to
 * "couldn't be reached, try again in a moment" and was debugged as a network
 * outage for as long as that sentence was believed.
 *
 * "Try again in a moment" is the most expensive wrong answer in the set. It is
 * an instruction, and a member who follows it on a 402 spends another media
 * upload against an empty balance.
 *
 * Run: cd server && npx vitest run src/publish/services/publish-error-mapping.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

import { ProviderError } from '../../providers/provider.interface';
import { PublishError } from './publish-error';
import { __testables } from './publish.service';

const { toMemberFacingError } = __testables;

/** A failure as the provider layer reports it: our status, and the network's. */
function upstream(status: number) {
  return new ProviderError(
    `X post publish failed (HTTP ${status}: credits depleted)`,
    502,
    'x',
    status,
  );
}

describe('402 — the API plan has run out', () => {
  const result = toMemberFacingError(upstream(402), 'X');

  it('says the plan is out of credit, not that X was unreachable', () => {
    expect(result.message).toMatch(/credit/i);
    expect(result.message).not.toMatch(/couldn't be reached/i);
  });

  it('does not tell the member to try again in a moment', () => {
    // Waiting does not refill a balance, and the retry costs another upload.
    expect(result.message).not.toMatch(/in a moment/i);
  });

  it('answers 402 rather than collapsing a billing problem into 502', () => {
    expect(result.status).toBe(402);
  });

  it('does not blame the connection — reconnecting fixes nothing here', () => {
    expect(result.message).not.toMatch(/reconnect/i);
  });

  it('leaks no vendor diagnostics into the member’s sentence', () => {
    expect(result.message).not.toMatch(/HTTP \d|credits depleted|\/2\/tweets|\{/);
  });
});

describe('the branches 402 must not be confused with', () => {
  it('401 and 403 ask for a reconnect', () => {
    for (const status of [401, 403]) {
      const result = toMemberFacingError(upstream(status), 'X');
      expect(result.message).toMatch(/reconnect/i);
      expect(result.status).toBe(400);
    }
  });

  it('429 says rate limited, which really does resolve by waiting', () => {
    const result = toMemberFacingError(upstream(429), 'X');
    expect(result.message).toMatch(/rate limiting/i);
    expect(result.status).toBe(429);
  });

  it('422 blames the post, which is the one the member edits', () => {
    const result = toMemberFacingError(upstream(422), 'X');
    expect(result.message).toMatch(/wouldn't accept this post/i);
    expect(result.status).toBe(422);
  });

  it('an unrecognised upstream status still says "couldn’t be reached"', () => {
    // The default is correct for what it covers — a 500, a timeout, a socket
    // that died. It was only ever wrong because 402 was falling into it.
    const result = toMemberFacingError(upstream(503), 'X');
    expect(result.message).toMatch(/couldn't be reached/i);
    expect(result.status).toBe(502);
  });

  it('a provider validation failure is passed through untouched', () => {
    // status 400 with no upstream status: refused before anything was sent.
    const validation = new ProviderError(
      'X publishes a GIF on its own. Remove the other media.',
      400,
      'x',
    );
    const result = toMemberFacingError(validation, 'X');

    expect(result.message).toBe(validation.message);
    // The post was never touched, so the claim is released rather than failed.
    expect(result.leavesPostUnchanged).toBe(true);
  });

  it('passes an existing PublishError straight through', () => {
    const original = new PublishError('Already a member message', 422);
    expect(toMemberFacingError(original, 'X')).toBe(original);
  });
});

describe('every network gets the same treatment', () => {
  it.each(['X', 'Instagram', 'Facebook', 'LinkedIn'])(
    'names %s in the 402 message',
    (network) => {
      // The mapping is provider-neutral: it reads `upstreamStatus`, never the
      // provider id. Meta and LinkedIn have their own billing failures and
      // must not have to be added here one at a time.
      expect(toMemberFacingError(upstream(402), network).message).toContain(
        network,
      );
    },
  );
});

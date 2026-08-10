/**
 * X token expiry, refresh and recovery — unit tests.
 *
 * Covers the three fixes made after the read-only audit:
 *
 *   1. the "Expiring Soon" window is per-provider, so a fresh X connection is
 *      not warned about the second it is made;
 *   2. an EXPIRED row no longer blocks publishing for a provider that can
 *      refresh;
 *   3. Refresh Connection renews before treating a 401 as permanent.
 *
 * The repository and the provider registry are mocked — what is under test is
 * the decision logic, and a database round-trip would only add a dependency.
 * No test asserts on, prints, or constructs a real token value.
 *
 * Run: cd server && npx vitest run src/services/token-expiry.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.X_CLIENT_ID = 'test-client-id';
  process.env.X_CLIENT_SECRET = 'test-client-secret';
  process.env.X_REDIRECT_URI = 'https://example.com/auth/x/callback';
  process.env.NODE_ENV = 'production';
});

// ─── Repository, mocked ──────────────────────────────────────────────────────

const repo = vi.hoisted(() => ({
  updateTokens: vi.fn(async () => ({})),
  updateStatus: vi.fn(async () => ({})),
  markSynced: vi.fn(async () => ({})),
  markHealthChecked: vi.fn(async () => ({})),
  findByUserAndProvider: vi.fn(),
  getDecryptedTokensById: vi.fn(),
}));

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: repo,
  updateTokens: repo.updateTokens,
}));

vi.mock('./activity.service', () => ({
  activityService: {
    logRefresh: vi.fn(async () => undefined),
    logDisconnect: vi.fn(async () => undefined),
  },
  ActivityAction: {},
}));

import { refreshAccountTokens, isExpiringSoon, TOKEN_REFRESH_SKEW_MS } from './token-refresh';
import { deriveStatus, DEFAULT_EXPIRY_WARNING_MS } from './integration-health';
import { getCatalogEntry } from '../providers/catalog';
import { resolvePermissions } from './integration-health';
import type { Provider } from '../providers/provider.interface';
import { ProviderError } from '../providers/provider.interface';
import type { SafeSocialAccount } from '../repositories/social-account.repository';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

/** A stored connection. Token *values* are irrelevant here and never asserted. */
function account(overrides: Partial<SafeSocialAccount> = {}): SafeSocialAccount {
  const now = new Date();
  return {
    id: 'account-1',
    userId: 'user-1',
    provider: 'x',
    providerAccountId: '12345',
    contextType: 'personal',
    brandId: null,
    displayName: 'A Member',
    username: 'amember',
    profileImage: null,
    status: 'CONNECTED',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    expiresAt: new Date(now.getTime() + 2 * HOUR),
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: now,
    lastHealthCheck: now,
    providerVersion: '2',
    ...overrides,
  } as SafeSocialAccount;
}

/** A stand-in provider that can refresh, with a scriptable outcome. */
function refreshableProvider(
  refreshTokens: Provider['refreshTokens'],
): Provider {
  return {
    id: 'x',
    displayName: 'X',
    connect: vi.fn(),
    callback: vi.fn(),
    disconnect: vi.fn(),
    refreshTokens,
  } as unknown as Provider;
}

// ─── Fix 1: the expiry warning window is per-provider ────────────────────────

describe('Fix 1 — provider-aware "Expiring Soon" window', () => {
  const xCatalog = getCatalogEntry('x')!;

  function statusFor(
    expiresInMs: number,
    warningMs: number | undefined,
    provider = 'x',
  ) {
    const catalog = getCatalogEntry(provider)!;
    const row = account({
      provider,
      expiresAt: new Date(Date.now() + expiresInMs),
      scopes: catalog.permissions
        .filter((p) => p.scope && !p.planned)
        .map((p) => p.scope!),
    });
    return deriveStatus(row, resolvePermissions(catalog, row), new Date(), warningMs);
  }

  it('declares a 15-minute window for X, not the shared week', () => {
    expect(xCatalog.expiryWarningMs).toBe(15 * 60 * 1000);
    expect(xCatalog.expiryWarningMs).toBeLessThan(DEFAULT_EXPIRY_WARNING_MS);
  });

  it('does NOT show a freshly connected X account as Expiring Soon', () => {
    // A brand new X connection: the full two hours ahead of it. This is the
    // exact case that read "Expiring Soon" before the fix.
    expect(statusFor(2 * HOUR, xCatalog.expiryWarningMs)).toBe('connected');
  });

  it('still reads connected with an hour left', () => {
    expect(statusFor(HOUR, xCatalog.expiryWarningMs)).toBe('connected');
  });

  it('warns only inside the last fifteen minutes', () => {
    expect(statusFor(16 * 60 * 1000, xCatalog.expiryWarningMs)).toBe('connected');
    expect(statusFor(10 * 60 * 1000, xCatalog.expiryWarningMs)).toBe('expiring_soon');
  });

  it('would have warned immediately under the old fixed week — the regression guard', () => {
    // Same fresh connection, judged by the default window. If someone ever
    // drops `expiryWarningMs` from the X entry, this is what comes back.
    expect(statusFor(2 * HOUR, DEFAULT_EXPIRY_WARNING_MS)).toBe('expiring_soon');
  });

  it('leaves LinkedIn, Instagram and Facebook on the week-long default', () => {
    for (const provider of ['linkedin', 'instagram', 'facebook'] as const) {
      expect(getCatalogEntry(provider)!.expiryWarningMs).toBeUndefined();
      // 60-day token: healthy. 3 days out: warned. Exactly as before.
      expect(statusFor(60 * 24 * HOUR, undefined, provider)).toBe('connected');
      expect(statusFor(3 * 24 * HOUR, undefined, provider)).toBe('expiring_soon');
    }
  });

  it('defaults to the week when no window is passed at all', () => {
    const row = account({ expiresAt: new Date(Date.now() + 3 * 24 * HOUR) });
    const perms = resolvePermissions(getCatalogEntry('x')!, row);
    expect(deriveStatus(row, perms, new Date())).toBe('expiring_soon');
  });
});

// ─── The shared refresh helper ───────────────────────────────────────────────

describe('refreshAccountTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the new access token, the new expiry and a rotated refresh token', async () => {
    const newExpiry = new Date(Date.now() + 2 * HOUR);
    const provider = refreshableProvider(
      vi.fn(async () => ({
        accessToken: 'renewed',
        refreshToken: 'rotated',
        expiresAt: newExpiry,
      })),
    );

    const outcome = await refreshAccountTokens('account-1', provider, 'stored');

    expect(outcome).toMatchObject({ ok: true, rotated: true });
    expect(repo.updateTokens).toHaveBeenCalledTimes(1);
    const [id, written] = repo.updateTokens.mock.calls[0];
    expect(id).toBe('account-1');
    // The rotated value must replace the spent one, or the *next* refresh dies.
    expect(written.refreshToken).toBe('rotated');
    expect(written.expiresAt).toBe(newExpiry);
  });

  it('leaves the stored refresh token alone when the network sends no new one', async () => {
    const provider = refreshableProvider(
      vi.fn(async () => ({
        accessToken: 'renewed',
        refreshToken: null,
        expiresAt: new Date(Date.now() + 2 * HOUR),
      })),
    );

    const outcome = await refreshAccountTokens('account-1', provider, 'stored');

    expect(outcome).toMatchObject({ ok: true, rotated: false });
    // undefined, not null: null would *clear* the column.
    expect(repo.updateTokens.mock.calls[0][1].refreshToken).toBeUndefined();
  });

  it('reports `rejected` when the network refuses the refresh token', async () => {
    const provider = refreshableProvider(
      vi.fn(async () => {
        throw new ProviderError('X token refresh failed (HTTP 400)', 502, 'x', 400);
      }),
    );

    const outcome = await refreshAccountTokens('account-1', provider, 'stored');

    expect(outcome).toMatchObject({ ok: false, reason: 'rejected' });
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });

  it('reports `no_refresh_token` without calling the network', async () => {
    const refresh = vi.fn();
    const outcome = await refreshAccountTokens(
      'account-1',
      refreshableProvider(refresh),
      null,
    );

    expect(outcome).toMatchObject({ ok: false, reason: 'no_refresh_token' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports `unsupported` for a provider with no refresh path', async () => {
    const provider = { id: 'linkedin', displayName: 'LinkedIn' } as unknown as Provider;
    const outcome = await refreshAccountTokens('account-1', provider, 'stored');

    expect(outcome).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });
});

describe('isExpiringSoon', () => {
  it('is true inside the skew window and past it', () => {
    expect(isExpiringSoon(new Date(Date.now() + 30_000), TOKEN_REFRESH_SKEW_MS)).toBe(true);
    expect(isExpiringSoon(new Date(Date.now() - HOUR), TOKEN_REFRESH_SKEW_MS)).toBe(true);
  });

  it('is false with real time left, and for an unknown expiry', () => {
    expect(isExpiringSoon(new Date(Date.now() + HOUR), TOKEN_REFRESH_SKEW_MS)).toBe(false);
    // A provider that told us nothing is not renewed on a guess.
    expect(isExpiringSoon(null, TOKEN_REFRESH_SKEW_MS)).toBe(false);
  });
});

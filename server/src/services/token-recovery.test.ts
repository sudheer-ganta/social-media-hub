/**
 * Expired-token recovery, end to end through the two services that own it.
 *
 * Fix 2 — `publishPost` must renew rather than refuse when a refreshable
 *         provider's connection is EXPIRED or its token is spent.
 * Fix 3 — `refreshConnection` must renew before treating a 401 as permanent,
 *         and must NOT renew a connection whose token is still good.
 *
 * The repository, the provider registry and the post repository are mocked:
 * what is under test is the sequence of decisions, and both services are pure
 * orchestration over those three. No test asserts on a real token value.
 *
 * Run: cd server && npx vitest run src/services/token-recovery.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.NODE_ENV = 'production';
});

const HOUR = 60 * 60 * 1000;

// ─── Mocks ───────────────────────────────────────────────────────────────────

const repo = vi.hoisted(() => ({
  findByUserAndProvider: vi.fn(),
  getDecryptedTokensById: vi.fn(),
  updateTokens: vi.fn(async () => ({})),
  updateStatus: vi.fn(async () => ({})),
  markSynced: vi.fn(async () => ({})),
  markHealthChecked: vi.fn(async () => ({})),
  listByUser: vi.fn(async () => []),
}));

const posts = vi.hoisted(() => ({
  findByIdForUser: vi.fn(),
  // Null: no stored content type, which is the backward-compatible path these
  // tests have always exercised without knowing it. The resolver falls back to
  // the media count, exactly as publishing did before content types existed.
  findPlatformForPost: vi.fn(async () => null),
  claimPlatformPublish: vi.fn(async () => ({ claimed: true })),
  releasePlatformClaim: vi.fn(async () => undefined),
  markPlatformPublished: vi.fn(async () => undefined),
  markPlatformFailed: vi.fn(async () => undefined),
  updateStatus: vi.fn(async () => undefined),
  listPlatformsForPost: vi.fn(async () => []),
}));

/** The provider under test. Reassigned per test to script its behaviour. */
const registry = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: repo,
}));
vi.mock('../repositories/post.repository', () => ({ postRepository: posts }));
vi.mock('./activity.service', () => ({
  activityService: {
    logRefresh: vi.fn(async () => undefined),
    logPublish: vi.fn(async () => undefined),
    logPublishStarted: vi.fn(async () => undefined),
    logPublishFailed: vi.fn(async () => undefined),
  },
  ActivityAction: {},
}));

// The registry is mocked so the tests drive a scripted provider rather than the
// real X implementation and its HTTP. `getCatalogEntry` and the catalogue stay
// real — the X entry's own values are part of what is being asserted.
vi.mock('../providers', async () => {
  const catalog = await vi.importActual<typeof import('../providers/catalog')>(
    '../providers/catalog',
  );
  const iface = await vi.importActual<
    typeof import('../providers/provider.interface')
  >('../providers/provider.interface');
  // The capability declaration stays real too, for the same reason the
  // catalogue does: what X can publish is part of what these tests assert, and
  // a stubbed capability set would let a publish pass here that the real one
  // would refuse.
  const capabilities = await vi.importActual<
    typeof import('../providers/capabilities')
  >('../providers/capabilities');
  return {
    ...catalog,
    ...iface,
    ...capabilities,
    getProvider: (id: string) => (id === 'x' ? registry.current : undefined),
  };
});

import { refreshConnection } from './integration.service';
import { publishPost, PublishError } from '../publish/services/publish.service';
import { ProviderError } from '../providers/provider.interface';
import type { Provider } from '../providers/provider.interface';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function account(overrides: Record<string, unknown> = {}) {
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
  };
}

function draft() {
  return {
    id: 'post-1',
    title: 'A post',
    caption: 'Hello from FlowPost.',
    ai_caption: null,
    image_url: null,
    context_type: 'personal',
    brand_id: null,
    status: 'DRAFT',
    published_at: null,
  };
}

/** A scripted X-like provider. Every hook is a spy the tests assert on. */
function makeProvider(script: {
  refresh?: Provider['refreshTokens'];
  verify?: Provider['verify'];
  publish?: Provider['publish'];
  canRefresh?: boolean;
}): Provider {
  const provider: Record<string, unknown> = {
    id: 'x',
    displayName: 'X',
    connect: vi.fn(),
    callback: vi.fn(),
    disconnect: vi.fn(),
    canPublish: (scopes: string[]) => scopes.includes('tweet.write'),
    verify:
      script.verify ??
      vi.fn(async () => ({
        ok: true as const,
        account: {
          providerAccountId: '12345',
          displayName: 'A Member',
          username: 'amember',
          profileImage: null,
        },
      })),
    publish:
      script.publish ??
      vi.fn(async () => ({ urn: '999', url: 'https://x.com/i/web/status/999' })),
  };

  if (script.canRefresh !== false) {
    provider.refreshTokens =
      script.refresh ??
      vi.fn(async () => ({
        accessToken: 'renewed',
        refreshToken: 'rotated',
        expiresAt: new Date(Date.now() + 2 * HOUR),
      }));
  }

  return provider as unknown as Provider;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getDecryptedTokensById.mockResolvedValue({
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    expiresAt: new Date(Date.now() + 2 * HOUR),
  });
  posts.findByIdForUser.mockResolvedValue(draft());
  posts.claimPlatformPublish.mockResolvedValue({ claimed: true });
});

// ─── Fix 2: publishing recovers instead of refusing ──────────────────────────

describe('Fix 2 — EXPIRED does not block a refreshable provider', () => {
  it('renews an EXPIRED X connection and publishes with the new token', async () => {
    const provider = makeProvider({});
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ status: 'EXPIRED', expiresAt: new Date(Date.now() - HOUR) }),
    );
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'spent-access',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - HOUR),
    });

    const result = await publishPost('user-1', 'post-1', 'x');

    expect(result.status).toBe('published');
    expect(provider.refreshTokens).toHaveBeenCalledTimes(1);
    // Published with the renewed token, never the spent one.
    expect(vi.mocked(provider.publish!).mock.calls[0][0].accessToken).toBe('renewed');
  });

  it('renews a token that is merely near expiry', async () => {
    const provider = makeProvider({});
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ expiresAt: new Date(Date.now() + 30_000) }),
    );
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'nearly-spent',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() + 30_000),
    });

    await publishPost('user-1', 'post-1', 'x');

    expect(provider.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it('persists the new expiry and the rotated refresh token before publishing', async () => {
    const newExpiry = new Date(Date.now() + 2 * HOUR);
    const provider = makeProvider({
      refresh: vi.fn(async () => ({
        accessToken: 'renewed',
        refreshToken: 'rotated',
        expiresAt: newExpiry,
      })),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account({ status: 'EXPIRED' }));
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'spent',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - HOUR),
    });

    await publishPost('user-1', 'post-1', 'x');

    const [id, written] = repo.updateTokens.mock.calls[0];
    expect(id).toBe('account-1');
    expect(written.expiresAt).toBe(newExpiry);
    expect(written.refreshToken).toBe('rotated');
  });

  it('does NOT renew a healthy token', async () => {
    const provider = makeProvider({});
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account());

    await publishPost('user-1', 'post-1', 'x');

    expect(provider.refreshTokens).not.toHaveBeenCalled();
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });

  it('marks the connection EXPIRED and asks for a reconnect when the refresh is rejected', async () => {
    const provider = makeProvider({
      refresh: vi.fn(async () => {
        throw new ProviderError('X token refresh failed (HTTP 400)', 502, 'x', 400);
      }),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ expiresAt: new Date(Date.now() - HOUR) }),
    );
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'spent',
      refreshToken: 'dead-refresh',
      expiresAt: new Date(Date.now() - HOUR),
    });

    await expect(publishPost('user-1', 'post-1', 'x')).rejects.toThrow(
      /needs reconnecting/i,
    );

    expect(repo.updateStatus).toHaveBeenCalledWith('account-1', 'EXPIRED');
    expect(provider.publish).not.toHaveBeenCalled();
    // Nothing was sent, so the claim goes back rather than the post failing.
    expect(posts.releasePlatformClaim).toHaveBeenCalled();
  });

  it('still refuses a REVOKED connection — withdrawal is not renewable', async () => {
    const provider = makeProvider({});
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account({ status: 'REVOKED' }));

    await expect(publishPost('user-1', 'post-1', 'x')).rejects.toBeInstanceOf(
      PublishError,
    );
    expect(provider.refreshTokens).not.toHaveBeenCalled();
  });

  it('leaves non-refreshable providers refusing an EXPIRED row, exactly as before', async () => {
    const provider = makeProvider({ canRefresh: false });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account({ status: 'EXPIRED' }));

    await expect(publishPost('user-1', 'post-1', 'x')).rejects.toThrow(
      /needs reconnecting/i,
    );
    expect(provider.publish).not.toHaveBeenCalled();
  });

  it('leaves non-refreshable providers refusing a lapsed expiry, exactly as before', async () => {
    const provider = makeProvider({ canRefresh: false });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ expiresAt: new Date(Date.now() - HOUR) }),
    );

    await expect(publishPost('user-1', 'post-1', 'x')).rejects.toThrow(/expired/i);
    expect(provider.publish).not.toHaveBeenCalled();
  });
});

// ─── Fix 3: Refresh Connection recovers an expired token ─────────────────────

describe('Fix 3 — Refresh Connection renews before giving up', () => {
  const unauthorized = {
    ok: false as const,
    reason: 'unauthorized' as const,
    message: 'X no longer accepts this connection.',
  };
  const healthy = {
    ok: true as const,
    account: {
      providerAccountId: '12345',
      displayName: 'A Member',
      username: 'amember',
      profileImage: null,
    },
  };

  it('renews ahead of the check when the stored token is already spent', async () => {
    const verify = vi.fn(async () => healthy);
    const provider = makeProvider({ verify });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ status: 'EXPIRED', expiresAt: new Date(Date.now() - HOUR) }),
    );
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'spent',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - HOUR),
    });

    const result = await refreshConnection('user-1', 'x');

    expect(provider.refreshTokens).toHaveBeenCalledTimes(1);
    // Verified once, with the renewed token — not with the spent one.
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith('renewed');
    expect(result.verified).toBe(true);
    // markSynced puts the row back to CONNECTED; it is never flagged EXPIRED.
    expect(repo.markSynced).toHaveBeenCalledWith('account-1', expect.anything());
    expect(repo.markHealthChecked).not.toHaveBeenCalledWith('account-1', 'EXPIRED');
  });

  it('records the refreshed expiry, so the card stops saying Expiring Soon', async () => {
    const newExpiry = new Date(Date.now() + 2 * HOUR);
    const provider = makeProvider({
      refresh: vi.fn(async () => ({
        accessToken: 'renewed',
        refreshToken: 'rotated',
        expiresAt: newExpiry,
      })),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ expiresAt: new Date(Date.now() - HOUR) }),
    );
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'spent',
      refreshToken: 'stored-refresh',
      expiresAt: new Date(Date.now() - HOUR),
    });

    await refreshConnection('user-1', 'x');

    const written = repo.updateTokens.mock.calls[0][1];
    expect(written.expiresAt).toBe(newExpiry);
    expect(written.refreshToken).toBe('rotated');
  });

  it('renews reactively when a healthy-looking token comes back 401', async () => {
    // Timestamp says fine, network disagrees — clock skew, or an early expiry.
    const verify = vi
      .fn()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(healthy);
    const provider = makeProvider({ verify });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account());

    const result = await refreshConnection('user-1', 'x');

    expect(verify).toHaveBeenNthCalledWith(1, 'stored-access');
    expect(provider.refreshTokens).toHaveBeenCalledTimes(1);
    // Re-verified with the new token rather than assumed good.
    expect(verify).toHaveBeenNthCalledWith(2, 'renewed');
    expect(result.verified).toBe(true);
    expect(repo.markHealthChecked).not.toHaveBeenCalledWith('account-1', 'EXPIRED');
  });

  it('does NOT renew when the token is valid and the check passes', async () => {
    const provider = makeProvider({});
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account());

    const result = await refreshConnection('user-1', 'x');

    expect(provider.refreshTokens).not.toHaveBeenCalled();
    expect(repo.updateTokens).not.toHaveBeenCalled();
    expect(result.verified).toBe(true);
  });

  it('marks EXPIRED when the refresh token itself is rejected', async () => {
    const verify = vi.fn(async () => healthy);
    const provider = makeProvider({
      verify,
      refresh: vi.fn(async () => {
        throw new ProviderError('X token refresh failed (HTTP 400)', 502, 'x', 400);
      }),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ status: 'EXPIRED', expiresAt: new Date(Date.now() - HOUR) }),
    );

    const result = await refreshConnection('user-1', 'x');

    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/needs your permission again/i);
    expect(repo.markHealthChecked).toHaveBeenCalledWith('account-1', 'EXPIRED');
    // A rejected refresh is conclusive — no point verifying with a dead token.
    expect(verify).not.toHaveBeenCalled();
  });

  it('marks EXPIRED when a 401 cannot be recovered — no refresh token to try', async () => {
    const verify = vi.fn(async () => unauthorized);
    const provider = makeProvider({ verify });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account());
    repo.getDecryptedTokensById.mockResolvedValue({
      accessToken: 'stored-access',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 2 * HOUR),
    });

    const result = await refreshConnection('user-1', 'x');

    expect(result.verified).toBe(false);
    expect(repo.markHealthChecked).toHaveBeenCalledWith('account-1', 'EXPIRED');
    expect(provider.refreshTokens).not.toHaveBeenCalled();
  });

  it('leaves an unreachable network alone — status untouched', async () => {
    const provider = makeProvider({
      verify: vi.fn(async () => ({
        ok: false as const,
        reason: 'unavailable' as const,
        message: 'X could not be reached.',
      })),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(account());

    const result = await refreshConnection('user-1', 'x');

    expect(result.verified).toBe(false);
    expect(provider.refreshTokens).not.toHaveBeenCalled();
    // Timestamp only. Never a status.
    expect(repo.markHealthChecked).toHaveBeenCalledWith('account-1');
  });

  it('leaves a non-refreshable provider on the old verify-then-expire path', async () => {
    const provider = makeProvider({
      canRefresh: false,
      verify: vi.fn(async () => unauthorized),
    });
    registry.current = provider;
    repo.findByUserAndProvider.mockResolvedValue(
      account({ expiresAt: new Date(Date.now() - HOUR) }),
    );

    const result = await refreshConnection('user-1', 'x');

    expect(result.verified).toBe(false);
    expect(repo.markHealthChecked).toHaveBeenCalledWith('account-1', 'EXPIRED');
    expect(repo.updateTokens).not.toHaveBeenCalled();
  });
});

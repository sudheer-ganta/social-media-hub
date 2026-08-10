import { socialAccountRepository } from '../repositories/social-account.repository';
import { ProviderError } from '../providers/provider.interface';
import type { Provider } from '../providers/provider.interface';

/**
 * Renewing a stored access token with its refresh token, and writing the result
 * down.
 *
 * One implementation, two callers: the publish path renews a token that is
 * about to be used, and Refresh Connection renews one the network has just
 * rejected. Both need identical behaviour around rotation and persistence, and
 * a second copy is a second place to drop a rotated refresh token — which
 * bricks the connection at the *following* refresh rather than this one, and is
 * correspondingly hard to trace back.
 *
 * Takes the `Provider` as an argument rather than resolving it from the
 * registry: `providers/index.ts` imports the provider folders, which import
 * `services/social-connection.service.ts`, so a service reaching back into the
 * registry closes an import cycle. Both callers already hold the provider.
 *
 * ─── What is never logged ───────────────────────────────────────────────────
 *
 * No access token, no refresh token, no Authorization header. The network's own
 * error message *is* logged — it is written for a developer and names the
 * grant, not the credential — and `ProviderError` messages from the X token
 * module already exclude the request body. Encryption at rest is unchanged:
 * this hands plaintext to the repository, which encrypts before writing, the
 * same as the OAuth callback does.
 */

/**
 * Why a refresh did not happen, or that it did.
 *
 * `unsupported` and `no_refresh_token` are deliberately distinct from
 * `rejected`. The first two mean *we* could not try — nothing was learned about
 * the connection, and marking it dead on that basis would be a guess. Only
 * `rejected` is the network telling us the refresh token is finished.
 */
export type RefreshOutcome =
  | { ok: true; accessToken: string; expiresAt: Date | null; rotated: boolean }
  | { ok: false; reason: 'unsupported' | 'no_refresh_token' | 'rejected'; message: string };

/**
 * Renews one connection's tokens and stores them.
 *
 * The write happens *before* this returns, not after the caller has used the
 * token. X rotates: the refresh token presented here is dead the moment the
 * exchange succeeds, so a pair obtained and not persisted is a connection that
 * can never refresh again — whether or not whatever the caller did next
 * worked. `updateTokens` also sets the row back to CONNECTED, which is what
 * lets a connection previously flagged EXPIRED heal itself.
 */
export async function refreshAccountTokens(
  accountId: string,
  provider: Provider,
  refreshToken: string | null,
): Promise<RefreshOutcome> {
  if (!provider.refreshTokens) {
    return {
      ok: false,
      reason: 'unsupported',
      message: `${provider.displayName} connections cannot be renewed automatically.`,
    };
  }

  if (!refreshToken) {
    // The member declined the network's offline-access scope, or connected
    // before we asked for it. Nothing to renew with — and nothing learned about
    // whether the access token still works.
    return {
      ok: false,
      reason: 'no_refresh_token',
      message: `This ${provider.displayName} connection was made without permission to stay signed in.`,
    };
  }

  try {
    const refreshed = await provider.refreshTokens(refreshToken);

    await socialAccountRepository.updateTokens(accountId, {
      accessToken: refreshed.accessToken,
      // Undefined leaves the stored one alone; a rotating network sends a new
      // one and it replaces the spent value.
      refreshToken: refreshed.refreshToken ?? undefined,
      expiresAt: refreshed.expiresAt,
    });

    console.log('[token-refresh] renewed', {
      accountId,
      provider: provider.id,
      rotatedRefreshToken: refreshed.refreshToken !== null,
      // The *timestamp* is not a credential and is the one thing worth having
      // in a log when a connection starts expiring unexpectedly.
      expiresAt: refreshed.expiresAt?.toISOString() ?? null,
    });

    return {
      ok: true,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      rotated: refreshed.refreshToken !== null,
    };
  } catch (error) {
    console.error('[token-refresh] failed', {
      accountId,
      provider: provider.id,
      upstreamStatus:
        error instanceof ProviderError ? error.upstreamStatus : undefined,
      error: error instanceof Error ? error.message : error,
    });

    return {
      ok: false,
      reason: 'rejected',
      message: `${provider.displayName} would not renew this connection.`,
    };
  }
}

/**
 * Whether a stored token is spent, or close enough that it will be by the time
 * a request lands.
 *
 * A null expiry reads as "not expiring" — a provider that told us nothing about
 * lifetime is not one we should renew on a guess.
 */
export function isExpiringSoon(
  expiresAt: Date | null,
  skewMs: number,
  now: number = Date.now(),
): boolean {
  return expiresAt !== null && expiresAt.getTime() - skewMs <= now;
}

/**
 * A token with less than this left is treated as spent.
 *
 * Sixty seconds: a token expiring inside the next minute will very likely be
 * dead by the time the request reaches the network, and one renewal call is
 * cheaper than a publish that fails after the post was already claimed.
 */
export const TOKEN_REFRESH_SKEW_MS = 60_000;

export const tokenRefreshService = { refreshAccountTokens, isExpiringSoon };

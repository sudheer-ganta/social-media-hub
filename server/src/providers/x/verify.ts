import { ProviderError, type ProviderVerification } from '../provider.interface';
import { fetchProfile } from './profile';

/**
 * "Is this connection still real?" — the X half of Refresh Connection.
 *
 * Same approach as LinkedIn's and Instagram's: the cheapest honest test is the
 * one call we already make at connect time. A token that can still read
 * `/2/users/me` is a token X still honours, and the response doubles as a
 * profile resync — which matters here because an X handle can change.
 *
 * Reuses {@link fetchProfile} rather than issuing its own request, so there is
 * one place that knows X's profile contract.
 *
 * Note what this does *not* do: it does not refresh. A verification reports on
 * the token it was given; renewing one is the publish path's job, and doing it
 * here would turn a read-only health check into a write.
 */

/** X answers a dead or withdrawn token with one of these. */
const UNAUTHORIZED_STATUSES = new Set([401, 403]);

export async function verify(accessToken: string): Promise<ProviderVerification> {
  try {
    const profile = await fetchProfile(accessToken);
    return {
      ok: true,
      account: {
        providerAccountId: profile.providerAccountId,
        displayName: profile.displayName,
        username: profile.username,
        profileImage: profile.profileImage,
      },
    };
  } catch (error) {
    // A rejected token is an *expected* answer here, not an exception the
    // caller should have to catch — see the contract on ProviderVerification.
    const upstreamStatus =
      error instanceof ProviderError ? error.upstreamStatus : undefined;

    if (upstreamStatus !== undefined && UNAUTHORIZED_STATUSES.has(upstreamStatus)) {
      return {
        ok: false,
        reason: 'unauthorized',
        message: 'X no longer accepts this connection.',
      };
    }

    // Everything else — a 5xx, a 429, a timeout — leaves the connection's
    // stored status alone. We learned nothing about the token.
    return {
      ok: false,
      reason: 'unavailable',
      message: error instanceof Error ? error.message : 'X could not be reached.',
    };
  }
}

export const xVerifyService = { verify };

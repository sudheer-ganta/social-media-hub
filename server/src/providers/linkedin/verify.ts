import { ProviderError, type ProviderVerification } from '../provider.interface';
import { fetchProfile } from './profile';

/**
 * "Is this connection still real?" — the LinkedIn half of Refresh Connection.
 *
 * There is no dedicated introspection endpoint for member tokens, so the
 * cheapest honest test is the one call we already make at connect time: ask
 * userinfo who the member is. A token that can still read the profile is a
 * token LinkedIn still honours, and the response doubles as a profile resync.
 *
 * Reuses {@link fetchProfile} rather than issuing its own request, so there is
 * one place that knows LinkedIn's userinfo contract.
 */

/** LinkedIn answers a dead or withdrawn token with one of these. */
const UNAUTHORIZED_STATUSES = new Set([401, 403]);

export async function verify(
  accessToken: string,
): Promise<ProviderVerification> {
  try {
    const profile = await fetchProfile(accessToken);
    return {
      ok: true,
      account: {
        providerAccountId: profile.providerAccountId,
        displayName: profile.displayName,
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
        message: 'LinkedIn no longer accepts this connection.',
      };
    }

    // Everything else — a 5xx, a timeout, a malformed response — leaves the
    // connection's stored status alone. We learned nothing about the token.
    return {
      ok: false,
      reason: 'unavailable',
      message:
        error instanceof Error
          ? error.message
          : 'LinkedIn could not be reached.',
    };
  }
}

export const linkedinVerifyService = { verify };

import { ProviderError, type ProviderVerification } from '../../provider.interface';
import { fetchProfile } from './profile';

/**
 * "Is this connection still real?" — the Instagram half of Refresh Connection.
 *
 * Same approach as LinkedIn's: the cheapest honest test is the one call we
 * already make at connect time. A token that can still read `/me` is a token
 * Meta still honours, and the response doubles as a profile resync — which
 * matters more here than on LinkedIn, because an Instagram username can change.
 *
 * Reuses {@link fetchProfile} rather than issuing its own request, so there is
 * one place that knows Instagram's profile contract.
 */

/**
 * Meta answers a dead or withdrawn token with one of these.
 *
 * 400 is in the set on purpose, and it is the difference from LinkedIn: Meta
 * reports an invalid OAuth token as a **400** with an error code in the body,
 * not as a 401. `http.ts` normalises the known token codes to 401 before this
 * ever sees them, so both paths land here — but a 400 that slipped through
 * uncoded would otherwise be read as "Meta is fine, your request was wrong",
 * which for a bare profile read is not a distinction that means anything.
 */
const UNAUTHORIZED_STATUSES = new Set([400, 401, 403]);

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
        message: 'Instagram no longer accepts this connection.',
      };
    }

    // Everything else — a 5xx, a timeout, a malformed response — leaves the
    // connection's stored status alone. We learned nothing about the token.
    return {
      ok: false,
      reason: 'unavailable',
      message:
        error instanceof Error ? error.message : 'Instagram could not be reached.',
    };
  }
}

export const instagramVerifyService = { verify };

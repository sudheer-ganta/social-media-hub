import {
  ProviderError,
  type ProviderVerification,
} from '../../provider.interface';
import { fetchPageProfile } from './profile';

/**
 * "Is this connection still real?" — the Facebook half of Refresh Connection.
 *
 * Same approach as Instagram's and LinkedIn's: the cheapest honest test is the
 * call we already make at connect time. A Page token that can still read `/me`
 * is a token Meta still honours, and the response doubles as a profile resync —
 * which matters here because a Page can be renamed at any time.
 *
 * This check is also the *only* expiry signal Facebook gives us. A Page access
 * token minted from a long-lived user token has no expiry date, so
 * `social_accounts.expires_at` is null for every Facebook row and the publish
 * service's stored-expiry pre-flight never fires. What actually kills a Page
 * token is a password change, a permission withdrawal or the member losing
 * their role on the Page — none of which we are notified about, and all of
 * which show up here as an `unauthorized`.
 *
 * Reuses {@link fetchPageProfile} rather than issuing its own request, so there
 * is one place that knows Facebook's profile contract.
 */

/**
 * Meta answers a dead or withdrawn token with one of these.
 *
 * 400 is in the set for the same reason it is in Instagram's: Meta reports an
 * invalid OAuth token as a **400** with an error code in the body, not as a
 * 401. `http.ts` normalises the known token codes to 401 and the permission
 * codes to 403 before this ever sees them, so both land here — but a 400 that
 * slipped through uncoded would otherwise read as "Meta is fine, your request
 * was wrong", which for a bare profile read is not a distinction that means
 * anything.
 */
const UNAUTHORIZED_STATUSES = new Set([400, 401, 403]);

export async function verify(
  accessToken: string,
): Promise<ProviderVerification> {
  try {
    const profile = await fetchPageProfile(accessToken);
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

    if (
      upstreamStatus !== undefined &&
      UNAUTHORIZED_STATUSES.has(upstreamStatus)
    ) {
      return {
        ok: false,
        reason: 'unauthorized',
        message: 'Facebook no longer accepts this connection.',
      };
    }

    // Everything else — a 5xx, a timeout, a malformed response — leaves the
    // connection's stored status alone. We learned nothing about the token.
    return {
      ok: false,
      reason: 'unavailable',
      message:
        error instanceof Error ? error.message : 'Facebook could not be reached.',
    };
  }
}

export const facebookVerifyService = { verify };

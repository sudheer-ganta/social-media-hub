import {
  socialAccountRepository,
  type SafeSocialAccount,
} from '../repositories/social-account.repository';
import { activityService } from './activity.service';
import type { ProviderId } from '../providers/provider.interface';

/**
 * What happens *after* a provider finishes its OAuth conversation.
 *
 * The provider layer knows LinkedIn's wire format; the repository owns the
 * `social_accounts` table. This service is the seam between them: it takes a
 * completed OAuth result and turns it into a stored connection plus an audit
 * row. Every provider added later reuses it unchanged.
 *
 * Two invariants worth stating out loud:
 *
 *  1. **The token stays plaintext exactly as far as this call.** Encryption is
 *     the repository's job — see `social-account.repository.ts` — so this
 *     module hands it over and never holds ciphertext or writes a token
 *     anywhere else.
 *  2. **Audit logging cannot fail the connection.** `activityService.log`
 *     already swallows its own errors, and the `await` here is deliberately
 *     wrapped anyway so nothing thrown from that direction can unwind a
 *     connection the user has already authorized.
 */

export interface ConnectAccountInput {
  /** The FlowPost (Supabase) user the connection belongs to. */
  userId: string;
  provider: ProviderId;
  providerAccountId: string;
  displayName?: string | null;
  /**
   * The member's handle where the network has one. LinkedIn does not; Instagram
   * does, and it is what people recognise their own account by — "@flowpost"
   * rather than a display name they may never have set.
   */
  username?: string | null;
  profileImage?: string | null;
  /** Plaintext. Encrypted by the repository on the way into the database. */
  accessToken: string;
  /**
   * Plaintext, and optional because most providers — LinkedIn included — do not
   * issue one on most flows. Stored encrypted when present; never assumed.
   */
  refreshToken?: string | null;
  expiresAt?: Date | null;
  /**
   * Scopes the provider granted, as the provider sent them — space- or
   * comma-delimited. Split and stored on the connection (Sprint 3.3) so the
   * Integrations page can show what the member actually authorized rather than
   * what we asked for, and logged to the audit trail either way.
   */
  scope?: string | null;
  /** Provider API version this connection was established against. */
  providerVersion?: string | null;
}

/**
 * Providers are inconsistent about the *shape*, not just the delimiter:
 * LinkedIn sends one space-delimited string, Meta sends a JSON array. Both are
 * accepted, both delimiters are accepted, and empties are dropped. An absent
 * `scope` yields an empty list, which reads downstream as "unknown", not "none".
 *
 * Each provider is still expected to hand over the delimited string its
 * `ConnectAccountInput` declares — Instagram's `toScopeString` does exactly
 * that. Accepting an array here too is the backstop, because this is the single
 * choke point every provider's scopes pass through, and Facebook and Threads
 * will arrive with the same array shape that produced
 * `scope.split is not a function`. Non-string entries are dropped rather than
 * coerced, so a stray null cannot become a granted permission named "null".
 */
export function parseScopes(
  scope: string | string[] | null | undefined,
): string[] {
  if (!scope) return [];

  const raw = Array.isArray(scope)
    ? scope.filter((entry): entry is string => typeof entry === 'string')
    : [scope];

  return [
    ...new Set(raw.flatMap((entry) => entry.split(/[\s,]+/)).filter(Boolean)),
  ];
}

/**
 * Stores (or refreshes) a connected account and records it in the audit trail.
 *
 * Idempotent by way of the repository's upsert on
 * (userId, provider, providerAccountId): a duplicated callback — a refresh, a
 * double-click — updates the existing row instead of stacking a second one.
 */
export async function connectAccount(
  input: ConnectAccountInput,
): Promise<SafeSocialAccount> {
  const account = await socialAccountRepository.upsert({
    userId: input.userId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    displayName: input.displayName ?? null,
    username: input.username ?? null,
    profileImage: input.profileImage ?? null,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    expiresAt: input.expiresAt ?? null,
    scopes: parseScopes(input.scope),
    providerVersion: input.providerVersion ?? null,
  });

  // Nothing credential-shaped goes in here, and activity.service.ts redacts
  // anything that slips through on top of that.
  await safeLog(() =>
    activityService.logConnection(input.userId, input.provider, {
      providerAccountId: input.providerAccountId,
      displayName: account.displayName,
      scope: input.scope ?? null,
      expiresAt: account.expiresAt?.toISOString() ?? null,
    }),
  );

  return account;
}

/**
 * Records a failed connect attempt. Called from the callback's catch block, so
 * it must be incapable of throwing on top of the error being handled.
 */
export async function recordConnectionFailure(
  userId: string,
  provider: ProviderId,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  await safeLog(() =>
    activityService.logFailure(userId, error, {
      provider,
      action: 'social.connect',
      ...context,
    }),
  );
}

/** Belt-and-braces around the audit trail. See invariant 2 above. */
async function safeLog(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error('[social-connection] audit write threw unexpectedly', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

export const socialConnectionService = {
  connectAccount,
  recordConnectionFailure,
  parseScopes,
};

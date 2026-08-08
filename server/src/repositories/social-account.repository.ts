import { prisma } from '../config/prisma';
import type { SocialAccount } from '../generated/prisma/client';
import { SocialAccountStatus } from '../generated/prisma/enums';
import {
  decrypt,
  decryptNullable,
  encrypt,
  encryptNullable,
} from '../services/encryption.service';

/**
 * The only module that reads or writes `social_accounts`.
 *
 * Encryption is enforced here rather than left to callers: `upsert` takes
 * plaintext tokens and encrypts them on the way in, and the only way to get a
 * token back out is {@link getDecryptedTokens}. Nothing above this layer ever
 * sees a ciphertext column, so nothing above it can accidentally persist a raw
 * token.
 */

/**
 * The Personal-vs-Brand discriminator on a connection. Mirrors
 * `services/account-context.ts` (typed loosely here to keep the repository
 * import-free of the service layer); rows are constrained to the two valid
 * shapes by CHECKs in the migration SQL.
 */
export interface AccountContextFilter {
  contextType: string;
  brandId: string | null;
}

/** A connection as the rest of the app is allowed to see it — no tokens. */
export interface SafeSocialAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
  expiresAt: Date | null;
  status: SocialAccountStatus;
  /** Scopes the provider actually granted. Can be narrower than we requested. */
  scopes: string[];
  providerVersion: string | null;
  /** Last successful profile confirmation. Null on connections predating 3.3. */
  lastSyncedAt: Date | null;
  /** Last health check, successful or not. */
  lastHealthCheck: Date | null;
  /** 'personal' or 'brand' — which publishing context this connection serves. */
  contextType: string;
  /** Set exactly when contextType is 'brand'. */
  brandId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertSocialAccountInput {
  userId: string;
  provider: string;
  providerAccountId: string;
  /** Which publishing context this connection serves. Defaults to personal. */
  contextType?: string;
  brandId?: string | null;
  displayName?: string | null;
  username?: string | null;
  profileImage?: string | null;
  /** Plaintext. Encrypted before it touches the database. */
  accessToken: string;
  /** Plaintext. Encrypted before it touches the database. */
  refreshToken?: string | null;
  expiresAt?: Date | null;
  /** Scopes the provider granted, already split into individual values. */
  scopes?: string[];
  /** Provider API version this connection was established against. */
  providerVersion?: string | null;
}

/**
 * Narrows a query to one publishing context. Spread into where-clauses rather
 * than bolted on per call site, so "filtered by context" means the same thing
 * everywhere. An omitted filter deliberately matches every context — that is
 * for the scripts and internal reads that genuinely mean "all".
 */
function contextWhere(context?: AccountContextFilter) {
  return context
    ? { contextType: context.contextType, brandId: context.brandId }
    : {};
}

/** Strips the token columns off a row on its way out of this module. */
function toSafe(account: SocialAccount): SafeSocialAccount {
  const {
    encryptedAccessToken: _access,
    encryptedRefreshToken: _refresh,
    ...safe
  } = account;
  return safe;
}

/**
 * Creates the connection, or refreshes it if the user reconnects the same
 * provider account *in the same context*. The identity that makes a callback
 * safe to hit twice is (userId, provider, providerAccountId, context) — the
 * same human account connected for Personal and for a Brand is two rows, so
 * connecting one must never overwrite the other.
 *
 * find-then-write rather than a Prisma upsert because the backing unique
 * index COALESCEs the nullable brand_id and is not expressible in the schema.
 * The index still backstops the race: a concurrent duplicate callback loses
 * the create with P2002 and is retried as the update it really is.
 *
 * A reconnect always resets `status` to CONNECTED: the whole point of
 * reconnecting is to clear an EXPIRED or REVOKED state.
 */
export async function upsert(
  input: UpsertSocialAccountInput,
): Promise<SafeSocialAccount> {
  const identity = {
    userId: input.userId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    contextType: input.contextType ?? 'personal',
    brandId: input.brandId ?? null,
  };

  const tokens = {
    encryptedAccessToken: encrypt(input.accessToken),
    encryptedRefreshToken: encryptNullable(input.refreshToken),
  };

  const profile = {
    displayName: input.displayName ?? null,
    username: input.username ?? null,
    profileImage: input.profileImage ?? null,
    expiresAt: input.expiresAt ?? null,
    scopes: input.scopes ?? [],
    providerVersion: input.providerVersion ?? null,
    // A completed OAuth exchange *is* a successful sync and a passing health
    // check — the profile we just stored came straight from the provider.
    // Stamping both here means a freshly connected account never renders as
    // "never synced" while it waits for someone to press Refresh.
    lastSyncedAt: new Date(),
    lastHealthCheck: new Date(),
  };

  const refresh = {
    status: SocialAccountStatus.CONNECTED,
    ...profile,
    ...tokens,
  };

  const existing = await prisma.socialAccount.findFirst({ where: identity });
  if (existing) {
    const account = await prisma.socialAccount.update({
      where: { id: existing.id },
      data: refresh,
    });
    return toSafe(account);
  }

  try {
    const account = await prisma.socialAccount.create({
      data: { ...identity, ...refresh },
    });
    return toSafe(account);
  } catch (error) {
    // Unique-index collision: a concurrent callback created the row between
    // our find and create. It is the same identity, so update it.
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const raced = await prisma.socialAccount.findFirst({ where: identity });
    if (!raced) throw error;
    const account = await prisma.socialAccount.update({
      where: { id: raced.id },
      data: refresh,
    });
    return toSafe(account);
  }
}

/**
 * A user's connections, newest first. Never includes tokens. Filtered to one
 * publishing context when given one — which is how GET /api/integrations keeps
 * brand accounts out of the Personal studio server-side.
 */
export async function listByUser(
  userId: string,
  context?: AccountContextFilter,
): Promise<SafeSocialAccount[]> {
  const accounts = await prisma.socialAccount.findMany({
    where: { userId, ...contextWhere(context) },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map(toSafe);
}

/** The user's connection for one provider, or null. Never includes tokens. */
export async function findByUserAndProvider(
  userId: string,
  provider: string,
  context?: AccountContextFilter,
): Promise<SafeSocialAccount | null> {
  const account = await prisma.socialAccount.findFirst({
    where: { userId, provider, ...contextWhere(context) },
    orderBy: { createdAt: 'desc' },
  });
  return account ? toSafe(account) : null;
}

export async function findById(id: string): Promise<SafeSocialAccount | null> {
  const account = await prisma.socialAccount.findUnique({ where: { id } });
  return account ? toSafe(account) : null;
}

/**
 * The single door to plaintext tokens. Call it as late as possible — right
 * before an outbound API request — and never store what it returns.
 *
 * Returns null when the connection doesn't exist. Throws when the row exists
 * but won't decrypt, because that means the key rotated or the data is corrupt
 * and callers must not treat it as "not connected".
 */
export async function getDecryptedTokens(
  userId: string,
  provider: string,
  context?: AccountContextFilter,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
} | null> {
  const account = await prisma.socialAccount.findFirst({
    where: { userId, provider, ...contextWhere(context) },
    orderBy: { createdAt: 'desc' },
  });
  if (!account) return null;

  return {
    accessToken: decrypt(account.encryptedAccessToken),
    refreshToken: decryptNullable(account.encryptedRefreshToken),
    expiresAt: account.expiresAt,
  };
}

/**
 * Tokens for one already-selected row. Prefer this over
 * {@link getDecryptedTokens} whenever the caller has an account in hand: two
 * independent (userId, provider) lookups can disagree the moment personal and
 * brand connections coexist on a provider, and a token from one row paired
 * with the providerAccountId of another is a cross-context publish.
 */
export async function getDecryptedTokensById(id: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
} | null> {
  const account = await prisma.socialAccount.findUnique({ where: { id } });
  if (!account) return null;

  return {
    accessToken: decrypt(account.encryptedAccessToken),
    refreshToken: decryptNullable(account.encryptedRefreshToken),
    expiresAt: account.expiresAt,
  };
}

/** Replaces the stored tokens after a refresh-token exchange. */
export async function updateTokens(
  id: string,
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  },
): Promise<SafeSocialAccount> {
  const account = await prisma.socialAccount.update({
    where: { id },
    data: {
      encryptedAccessToken: encrypt(tokens.accessToken),
      // Providers often omit the refresh token on a refresh response. Undefined
      // leaves the existing one alone; an explicit null clears it.
      ...(tokens.refreshToken !== undefined && {
        encryptedRefreshToken: encryptNullable(tokens.refreshToken),
      }),
      ...(tokens.expiresAt !== undefined && { expiresAt: tokens.expiresAt }),
      status: SocialAccountStatus.CONNECTED,
    },
  });
  return toSafe(account);
}

/** Marks a connection EXPIRED / REVOKED / ERROR without deleting its history. */
export async function updateStatus(
  id: string,
  status: SocialAccountStatus,
): Promise<SafeSocialAccount> {
  const account = await prisma.socialAccount.update({
    where: { id },
    data: { status },
  });
  return toSafe(account);
}

/**
 * Records a passing health check: the provider confirmed the token works and
 * handed back the member's current profile.
 *
 * Writes both timestamps and forces the status back to CONNECTED, which is what
 * makes Refresh Connection a genuine recovery path — an account we had marked
 * EXPIRED on a previous check heals itself the moment the provider disagrees.
 *
 * Profile fields are only overwritten when the provider actually sent one:
 * LinkedIn omits `picture` for members with no photo, and blanking a good
 * avatar because a later response was sparser would be a visible regression.
 */
export async function markSynced(
  id: string,
  profile: {
    displayName?: string | null;
    username?: string | null;
    profileImage?: string | null;
  } = {},
): Promise<SafeSocialAccount> {
  const now = new Date();
  const account = await prisma.socialAccount.update({
    where: { id },
    data: {
      ...(profile.displayName != null && { displayName: profile.displayName }),
      ...(profile.username != null && { username: profile.username }),
      ...(profile.profileImage != null && {
        profileImage: profile.profileImage,
      }),
      status: SocialAccountStatus.CONNECTED,
      lastSyncedAt: now,
      lastHealthCheck: now,
    },
  });
  return toSafe(account);
}

/**
 * Records that a health check ran. Optionally moves the status with it.
 *
 * The status argument is omitted when the check was inconclusive — the provider
 * was unreachable, say — so we remember that we looked without claiming to have
 * learned something. `lastSyncedAt` is deliberately left alone here: nothing
 * was synced.
 */
export async function markHealthChecked(
  id: string,
  status?: SocialAccountStatus,
): Promise<SafeSocialAccount> {
  const account = await prisma.socialAccount.update({
    where: { id },
    data: {
      lastHealthCheck: new Date(),
      ...(status && { status }),
    },
  });
  return toSafe(account);
}

/**
 * Disconnects a provider for a user. Deletes rather than soft-deletes, so the
 * encrypted tokens actually leave the database — that is the point of the
 * button. The audit trail lives in `activity_logs`.
 *
 * Returns the number of rows removed, so callers can tell a real disconnect
 * from a no-op.
 */
export async function deleteByUserAndProvider(
  userId: string,
  provider: string,
  context?: AccountContextFilter,
): Promise<number> {
  const { count } = await prisma.socialAccount.deleteMany({
    where: { userId, provider, ...contextWhere(context) },
  });
  return count;
}

export const socialAccountRepository = {
  upsert,
  listByUser,
  findByUserAndProvider,
  findById,
  getDecryptedTokens,
  getDecryptedTokensById,
  updateTokens,
  updateStatus,
  markSynced,
  markHealthChecked,
  deleteByUserAndProvider,
};

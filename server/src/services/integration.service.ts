import {
  socialAccountRepository,
  type SafeSocialAccount,
} from '../repositories/social-account.repository';
import {
  PERSONAL_CONTEXT,
  type AccountContext,
} from './account-context';
import { SocialAccountStatus } from '../generated/prisma/enums';
import {
  refreshAccountTokens,
  isExpiringSoon,
  TOKEN_REFRESH_SKEW_MS,
} from './token-refresh';
import { activityService, ActivityAction } from './activity.service';
import {
  assessHealth,
  deriveStatus,
  resolvePermissions,
  statusGuidance,
  statusLabel,
  statusTone,
  type ConnectionHealth,
  type GrantedPermission,
  type IntegrationStatus,
  type StatusTone,
} from './integration-health';
import {
  getProvider,
  PROVIDER_CATALOG,
  getCatalogEntry,
  type ProviderCatalogEntry,
  type ProviderId,
  type ProviderMediaCapability,
} from '../providers';

/**
 * The Integrations module's application layer.
 *
 * Everything the Integrations page can do goes through here: list connections,
 * verify one, disconnect one, read the activity feed. Routes call these
 * functions and serialize the result; nothing above this file touches a
 * repository, and nothing in this file touches Prisma.
 *
 * The shape it returns is provider-agnostic by construction — the catalogue
 * supplies the copy, the health module supplies the judgement, and the account
 * row supplies the facts. A new network appears in the response because it has
 * a catalogue entry, not because anything here learned its name.
 */

/** A failure a route should turn into a specific HTTP answer. */
export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/** The connection as the browser is allowed to see it. Never tokens. */
export interface IntegrationAccountDto {
  id: string;
  providerAccountId: string;
  /** 'personal' or 'brand' — which publishing context this connection serves. */
  contextType: string;
  brandId: string | null;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
  /** When the connection was first made. */
  connectedAt: string;
  /** Last write to the row — i.e. the most recent (re)connect. */
  lastConnectedAt: string;
  lastSyncedAt: string | null;
  lastHealthCheck: string | null;
  expiresAt: string | null;
  /** Raw provider scopes, for the Details panel. */
  scopes: string[];
  providerVersion: string | null;
}

/** One row of `GET /api/integrations`: a network and its connection, if any. */
export interface IntegrationDto {
  provider: ProviderId;
  displayName: string;
  description: string;
  brandColor: string;
  /** False for catalogued-but-unbuilt networks — the Coming Soon cards. */
  available: boolean;
  connectPath: string | null;
  apiVersion: string | null;
  connected: boolean;
  status: IntegrationStatus;
  statusLabel: string;
  tone: StatusTone;
  /** What to do about it, or null when there is nothing to fix. */
  guidance: string | null;
  permissions: GrantedPermission[];
  /**
   * How much media this network takes on one post.
   *
   * Sent to the browser so the composer can say, before anything is published,
   * what each selected network will actually receive. Straight from the
   * catalogue, which takes it from the validators — so the composer cannot
   * offer a carousel the publish path would reject.
   */
  media: ProviderMediaCapability;
  /** Null when there is no connection to assess. */
  health: ConnectionHealth | null;
  account: IntegrationAccountDto | null;
}

function toAccountDto(account: SafeSocialAccount): IntegrationAccountDto {
  return {
    id: account.id,
    providerAccountId: account.providerAccountId,
    contextType: account.contextType,
    brandId: account.brandId,
    displayName: account.displayName,
    username: account.username,
    profileImage: account.profileImage,
    connectedAt: account.createdAt.toISOString(),
    lastConnectedAt: account.updatedAt.toISOString(),
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastHealthCheck: account.lastHealthCheck?.toISOString() ?? null,
    expiresAt: account.expiresAt?.toISOString() ?? null,
    scopes: account.scopes,
    providerVersion: account.providerVersion,
  };
}

/** Assembles one card's worth of data. The only place the three sources meet. */
function toIntegrationDto(
  catalog: ProviderCatalogEntry,
  account: SafeSocialAccount | null,
  now: Date,
): IntegrationDto {
  const permissions = resolvePermissions(catalog, account);
  // The warning window is the network's own where it declares one — X's tokens
  // last two hours, so the shared week-long default would never stop warning.
  const warningMs = catalog.expiryWarningMs;
  const status = deriveStatus(account, permissions, now, warningMs);

  return {
    provider: catalog.id,
    displayName: catalog.displayName,
    description: catalog.description,
    brandColor: catalog.brandColor,
    available: catalog.available,
    connectPath: catalog.connectPath,
    apiVersion: account?.providerVersion ?? catalog.apiVersion,
    connected: account !== null,
    status,
    statusLabel: statusLabel(status),
    tone: statusTone(status),
    guidance: account ? statusGuidance(status, catalog.displayName) : null,
    permissions,
    media: catalog.media,
    health: account ? assessHealth(account, permissions, now, warningMs) : null,
    account: account ? toAccountDto(account) : null,
  };
}

/**
 * Every network in the catalogue, connected or not.
 *
 * One query for all providers rather than one per provider: the list is short,
 * and it keeps this O(1) as networks are added. Unconnected and unbuilt
 * networks are included deliberately — the page renders exactly what it is
 * given, so "Coming Soon" is a server-side fact and not a hardcoded list in the
 * browser.
 */
export async function listIntegrations(
  userId: string,
  context: AccountContext = PERSONAL_CONTEXT,
): Promise<IntegrationDto[]> {
  // Filtered in the query, not in the response: the browser must never receive
  // another context's accounts and merely hide them. Within one context the
  // provider→account Map stays 1:1, which is what the card layout assumes.
  const accounts = await socialAccountRepository.listByUser(userId, context);
  const byProvider = new Map(accounts.map((a) => [a.provider, a]));
  const now = new Date();

  return PROVIDER_CATALOG.map((catalog) =>
    toIntegrationDto(catalog, byProvider.get(catalog.id) ?? null, now),
  );
}

/** One network's card, rebuilt after a mutation so the client can swap it in. */
export async function getIntegration(
  userId: string,
  provider: ProviderId,
  context: AccountContext = PERSONAL_CONTEXT,
): Promise<IntegrationDto> {
  const catalog = getCatalogEntry(provider);
  if (!catalog) {
    throw new IntegrationError(`Unknown provider: ${provider}`, 404);
  }

  const account = await socialAccountRepository.findByUserAndProvider(
    userId,
    provider,
    context,
  );
  return toIntegrationDto(catalog, account, new Date());
}

export interface RefreshResult {
  /** The rebuilt card, reflecting whatever the check just learned. */
  integration: IntegrationDto;
  /** True only when the provider confirmed the connection and we resynced. */
  verified: boolean;
  /** One line for a toast. Always safe to show a member. */
  message: string;
}

/**
 * Refresh Connection: ask the provider whether this connection still works and
 * write down what it says.
 *
 * The three outcomes are kept genuinely distinct, because collapsing them is
 * how a page starts lying to people:
 *
 *  • verified      — profile resynced, status forced back to CONNECTED. This is
 *                    the recovery path: an account we had flagged EXPIRED heals
 *                    itself the moment the provider disagrees with us.
 *  • unauthorized  — the token is genuinely dead. Status moves to EXPIRED and
 *                    the card starts asking for a reconnect.
 *  • unavailable   — we learned nothing. The health-check timestamp moves so we
 *                    know we looked; the *status is left exactly as it was*.
 *                    Marking an account dead because the network had a bad
 *                    minute would be worse than not noticing for an hour.
 *
 * Never throws for a failed check — a dead token is an answer, not an error.
 * It throws only when the request itself makes no sense (unknown provider, no
 * connection to refresh).
 */
export async function refreshConnection(
  userId: string,
  provider: ProviderId,
  context: AccountContext = PERSONAL_CONTEXT,
): Promise<RefreshResult> {
  const catalog = getCatalogEntry(provider);
  if (!catalog) {
    throw new IntegrationError(`Unknown provider: ${provider}`, 404);
  }

  const account = await socialAccountRepository.findByUserAndProvider(
    userId,
    provider,
    context,
  );
  if (!account) {
    throw new IntegrationError(
      `${catalog.displayName} is not connected.`,
      404,
    );
  }

  const implementation = getProvider(provider);

  // A provider with no verify() can still be refreshed — we just have nothing
  // to ask it. Recording the check keeps "Recently Verified" honest instead of
  // silently passing.
  if (!implementation?.verify) {
    await socialAccountRepository.markHealthChecked(account.id);
    return {
      integration: await getIntegration(userId, provider, context),
      verified: false,
      message: `${catalog.displayName} does not support connection checks yet.`,
    };
  }

  // Decrypted as late as possible and never held beyond this call. Fetched by
  // the id of the row selected above, so the token checked is always the
  // token of the account this context resolved to.
  const tokens = await socialAccountRepository.getDecryptedTokensById(
    account.id,
  );
  if (!tokens) {
    throw new IntegrationError(
      `${catalog.displayName} is not connected.`,
      404,
    );
  }

  // ─── Renewal, for providers that can ────────────────────────────────────
  //
  // Two ways in, and the order matters:
  //
  //  1. **Ahead of the check**, when the stored token is already spent or the
  //     row is flagged EXPIRED. Verifying with a token we know is dead would
  //     spend a request to be told so, and — before this — would then record
  //     EXPIRED all over again, which is the loop that made an X connection
  //     unrecoverable without a manual reconnect.
  //  2. **After a 401**, when the token looked fine by its timestamp and the
  //     network disagreed. Clock skew, a revoked session, an early expiry.
  //
  // What does *not* happen is a renewal on every press. A healthy token is
  // verified with, not replaced — refreshing unconditionally would rotate the
  // refresh token on every page load and spend a grant for nothing.
  let accessToken = tokens.accessToken;
  let renewed = false;

  if (
    implementation.refreshTokens &&
    (isExpiringSoon(tokens.expiresAt, TOKEN_REFRESH_SKEW_MS) ||
      account.status === SocialAccountStatus.EXPIRED)
  ) {
    const outcome = await refreshAccountTokens(
      account.id,
      implementation,
      tokens.refreshToken,
    );

    if (outcome.ok) {
      accessToken = outcome.accessToken;
      renewed = true;
    } else if (outcome.reason === 'rejected') {
      // The network refused the refresh token itself. That is the one answer
      // that genuinely means "reconnect" — and the only one this branch takes.
      return await recordUnauthorized(userId, provider, account.id, context, catalog);
    }
    // `unsupported` / `no_refresh_token`: nothing was learned. Fall through and
    // verify with the token we hold, which may well still work.
  }

  let result = await implementation.verify(accessToken);

  if (
    !result.ok &&
    result.reason === 'unauthorized' &&
    implementation.refreshTokens &&
    !renewed
  ) {
    const outcome = await refreshAccountTokens(
      account.id,
      implementation,
      tokens.refreshToken,
    );

    if (outcome.ok) {
      accessToken = outcome.accessToken;
      renewed = true;
      // Re-verified rather than assumed: a token exchange proves the refresh
      // token was good, not that the new access token can read the profile.
      result = await implementation.verify(accessToken);
    }
    // A rejected or impossible refresh leaves `result` as the unauthorized it
    // already was, and the branch below records it exactly as it did before.
  }

  if (result.ok) {
    await socialAccountRepository.markSynced(account.id, {
      displayName: result.account.displayName,
      username: result.account.username ?? null,
      profileImage: result.account.profileImage,
    });
    await activityService.logRefresh(userId, provider, {
      outcome: 'verified',
      providerAccountId: result.account.providerAccountId,
    });

    return {
      integration: await getIntegration(userId, provider, context),
      verified: true,
      message: `${catalog.displayName} connection is healthy.`,
    };
  }

  if (result.reason === 'unauthorized') {
    return await recordUnauthorized(userId, provider, account.id, context, catalog);
  }

  // Inconclusive. Timestamp only — the status stays whatever it was.
  await socialAccountRepository.markHealthChecked(account.id);
  await activityService.logRefresh(userId, provider, {
    outcome: 'unavailable',
    message: result.message,
  });

  return {
    integration: await getIntegration(userId, provider, context),
    verified: false,
    message: `Could not reach ${catalog.displayName} just now. Your connection was left as it is.`,
  };
}

/**
 * Records a connection the network will not accept, and answers with the card
 * asking for a reconnect.
 *
 * Extracted because there are now two routes to the same conclusion — a
 * `verify()` that came back unauthorized, and a refresh token the network
 * rejected outright — and they must record identically. A refresh failure that
 * left a different status behind would show one thing on the card and mean
 * another at publish time.
 */
async function recordUnauthorized(
  userId: string,
  provider: ProviderId,
  accountId: string,
  context: AccountContext,
  catalog: ProviderCatalogEntry,
): Promise<RefreshResult> {
  await socialAccountRepository.markHealthChecked(
    accountId,
    SocialAccountStatus.EXPIRED,
  );
  await activityService.logRefresh(userId, provider, { outcome: 'unauthorized' });

  return {
    integration: await getIntegration(userId, provider, context),
    verified: false,
    message: `${catalog.displayName} needs your permission again. Reconnect to keep publishing.`,
  };
}

export interface DisconnectResult {
  /** The card in its now-disconnected state, ready to swap in. */
  integration: IntegrationDto;
  message: string;
}

/**
 * Disconnects a network.
 *
 * Deletes the row, which is what actually removes the encrypted tokens from the
 * database — the point of the button. Posts are untouched: they live in
 * `posts`, and the audit trail in `activity_logs` survives too, so the timeline
 * still shows that this connection once existed. That is exactly what the
 * confirmation dialog promises the member.
 *
 * No revoke call to the provider: `Provider.disconnect` takes req/res and is
 * still unimplemented for LinkedIn, and a member who wants the grant withdrawn
 * at LinkedIn's end does that from LinkedIn. Wiring a real revoke in is a
 * change to this one function.
 */
export async function disconnectIntegration(
  userId: string,
  provider: ProviderId,
  context: AccountContext = PERSONAL_CONTEXT,
): Promise<DisconnectResult> {
  const catalog = getCatalogEntry(provider);
  if (!catalog) {
    throw new IntegrationError(`Unknown provider: ${provider}`, 404);
  }

  const account = await socialAccountRepository.findByUserAndProvider(
    userId,
    provider,
    context,
  );
  if (!account) {
    throw new IntegrationError(
      `${catalog.displayName} is not connected.`,
      404,
    );
  }

  // Scoped by context: disconnecting a brand's LinkedIn must never take the
  // personal LinkedIn connection down with it.
  const removed = await socialAccountRepository.deleteByUserAndProvider(
    userId,
    provider,
    context,
  );

  // Logged with what was removed, so the timeline can say which account went
  // even though the row is gone. Nothing credential-shaped goes in here.
  await activityService.logDisconnection(userId, provider, {
    providerAccountId: account.providerAccountId,
    displayName: account.displayName,
    removedRows: removed,
  });

  return {
    integration: await getIntegration(userId, provider),
    message: `${catalog.displayName} disconnected. Your posts are safe; publishing has stopped.`,
  };
}

/** One entry in the Activity Timeline. */
export interface ActivityEventDto {
  id: string;
  action: string;
  provider: ProviderId | null;
  /** The provider's display name, resolved from the catalogue. */
  providerName: string | null;
  title: string;
  description: string | null;
  /** Drives the icon and colour, without the UI parsing action strings. */
  tone: 'positive' | 'neutral' | 'negative';
  createdAt: string;
}

/**
 * The integration events worth showing a member. Publishing and failures are
 * included because the timeline is about the *account*, not just the OAuth
 * handshake — "Published Marketing Campaign" is the most useful line on it.
 */
const TIMELINE_ACTIONS = new Set<string>([
  ActivityAction.SOCIAL_CONNECT,
  ActivityAction.SOCIAL_DISCONNECT,
  ActivityAction.SOCIAL_REFRESH,
  ActivityAction.POST_PUBLISH_STARTED,
  ActivityAction.POST_PUBLISH,
  ActivityAction.POST_PUBLISH_FAILED,
  ActivityAction.FAILURE,
]);

/** Hard ceiling, matching the repository's own. */
const MAX_TIMELINE_EVENTS = 50;

/**
 * Reads the audit trail back as a timeline.
 *
 * Built entirely from existing `activity_logs` rows — this sprint adds no new
 * writes for the sake of the feed. Over-fetches a little and filters in memory
 * because the interesting actions are a fixed handful and the repository's
 * `action` filter takes a single value.
 */
export async function listActivity(
  userId: string,
  options: { provider?: ProviderId; limit?: number } = {},
): Promise<ActivityEventDto[]> {
  const limit = Math.min(
    Math.max(options.limit ?? 20, 1),
    MAX_TIMELINE_EVENTS,
  );

  const rows = await activityService.listForUser(userId, {
    ...(options.provider && { provider: options.provider }),
    // Fetch headroom so filtering out non-timeline actions doesn't leave the
    // feed short of `limit` entries.
    limit: Math.min(limit * 3, 200),
  });

  return rows
    .filter((row) => TIMELINE_ACTIONS.has(row.action))
    .slice(0, limit)
    .map(toActivityEvent);
}

function toActivityEvent(row: {
  id: string;
  action: string;
  provider: string | null;
  details: unknown;
  createdAt: Date;
}): ActivityEventDto {
  const catalog = row.provider ? getCatalogEntry(row.provider) : undefined;
  const providerName = catalog?.displayName ?? row.provider;
  const details = (row.details ?? {}) as Record<string, unknown>;

  const { title, description, tone } = describeActivity(
    row.action,
    providerName,
    details,
  );

  return {
    id: row.id,
    action: row.action,
    provider: (catalog?.id ?? null) as ProviderId | null,
    providerName,
    title,
    description,
    tone,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Turns an audit row into a line a member can read.
 *
 * `details` is JSONB written by several call sites, so every field is treated
 * as possibly absent and possibly the wrong type — hence `asString` rather than
 * a cast. A row we cannot describe still renders, with its action as the title,
 * which is far better than an empty timeline.
 */
function describeActivity(
  action: string,
  providerName: string | null,
  details: Record<string, unknown>,
): Pick<ActivityEventDto, 'title' | 'description' | 'tone'> {
  const network = providerName ?? 'Account';

  switch (action) {
    case ActivityAction.SOCIAL_CONNECT:
      return {
        title: `${network} connected`,
        description: asString(details.displayName),
        tone: 'positive',
      };
    case ActivityAction.SOCIAL_DISCONNECT:
      return {
        title: `${network} disconnected`,
        description: asString(details.displayName),
        tone: 'neutral',
      };
    case ActivityAction.SOCIAL_REFRESH: {
      const outcome = asString(details.outcome);
      if (outcome === 'unauthorized') {
        return {
          title: `${network} needs reconnecting`,
          description: 'The stored access token is no longer accepted.',
          tone: 'negative',
        };
      }
      if (outcome === 'unavailable') {
        return {
          title: `${network} check inconclusive`,
          description: `${network} could not be reached.`,
          tone: 'neutral',
        };
      }
      return {
        title: `${network} connection verified`,
        description: null,
        tone: 'positive',
      };
    }
    case ActivityAction.POST_PUBLISH_STARTED:
      return {
        title: `Publishing to ${network}`,
        description: asString(details.title) ?? asString(details.postId),
        tone: 'neutral',
      };
    case ActivityAction.POST_PUBLISH:
      return {
        title: `Published to ${network}`,
        description: asString(details.title) ?? asString(details.postId),
        tone: 'positive',
      };
    case ActivityAction.POST_PUBLISH_FAILED:
      return {
        title: `Publish to ${network} failed`,
        // Already member-facing — see activityService.logPublishFailed.
        description: asString(details.reason) ?? asString(details.title),
        tone: 'negative',
      };
    case ActivityAction.FAILURE:
      return {
        title: `${network} action failed`,
        description: asString(details.message),
        tone: 'negative',
      };
    default:
      return { title: action, description: null, tone: 'neutral' };
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const integrationService = {
  listIntegrations,
  getIntegration,
  refreshConnection,
  disconnectIntegration,
  listActivity,
};

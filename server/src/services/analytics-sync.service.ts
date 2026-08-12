import { SocialAccountStatus } from '../generated/prisma/enums';
import { analyticsRepository } from '../repositories/analytics.repository';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { getProvider, isKnownProvider } from '../providers';
import { toMediaType } from '../analytics/normalise';
import { floorToHour, type AnalyticsScope } from '../analytics/window';
import {
  ACCOUNT_MIN_SYNC_INTERVAL_MS,
  RATE_LIMIT_BACKOFF_MS,
  isAccountDue,
  isAccountEligible,
  isPublicationDue,
} from '../analytics/cadence';
import { classifySyncFailure } from '../analytics/sync-errors';
import { capabilityFor, isContentType } from '../providers/capabilities';
import type { MediaType } from '../generated/prisma/enums';
import { tokenRefreshService, TOKEN_REFRESH_SKEW_MS } from './token-refresh';
import { ProviderError, type Provider } from '../providers/provider.interface';

/**
 * How long this publication is worth reading for.
 *
 * The network's horizon by default — unchanged for every format, which is the
 * point. A format that declares its own {@link metricsHorizonMs} shortens it,
 * and only shortens it: `Math.min` means a capability can never extend a window
 * the network will not answer for anyway.
 *
 * Reads the *observed* format first and the *requested* one second. Either
 * saying STORY is enough, because both are evidence of the same fact — the post
 * disappeared after a day — and the observed value is absent until the first
 * sync, which is exactly when this decision matters most.
 */
export function horizonFor(
  provider: string,
  publication: { mediaType: MediaType | null; contentType: MediaType | null },
  networkMaxAgeMs: number | undefined,
): number | undefined {
  const format = publication.mediaType ?? publication.contentType;
  if (!format || !isContentType(format)) return networkMaxAgeMs;

  const declared = capabilityFor(provider, format)?.metricsHorizonMs;
  if (declared === undefined) return networkMaxAgeMs;

  return networkMaxAgeMs === undefined
    ? declared
    : Math.min(declared, networkMaxAgeMs);
}

/**
 * Collecting real analytics from the networks and writing them down.
 *
 * Platform API → provider adapter → *here* → normalised snapshots. This service
 * is the only thing that writes to `post_metric_snapshots` and
 * `account_metric_snapshots`, and it writes nothing it was not given: if an
 * adapter returns null for reach, null is what is stored. There is no
 * derivation step, no backfill from a sibling metric and no default.
 *
 * ─── What can be synced today ────────────────────────────────────────────────
 * X, Instagram, Facebook and LinkedIn all have adapters. They do not all have
 * *permission*, and the difference is the thing this service is careful about.
 *
 * X reads on `tweet.read` and `users.read`, which every connection has been
 * granted since before analytics existed. The other three each need a scope
 * behind Meta's or LinkedIn's App Review — `instagram_business_manage_insights`,
 * `read_insights`, `r_member_postAnalytics` — which is requested only where the
 * deployment declares the app approved (see `providers/analytics-scopes.ts`),
 * and which a member can still decline.
 *
 * So there are three distinct outcomes and they must never render alike:
 *
 *   `unsupported`    — no adapter. YouTube. Nothing to reconnect for.
 *   `missing_scopes` — adapter, no permission. One reconnect away from working.
 *   ok, with nulls   — we asked and the network reported nothing for a metric.
 *
 * None of the three is zero engagement, and none of them writes a zero.
 *
 * ─── What this service will not do ───────────────────────────────────────────
 * It never invents attribution. A publication whose `social_account_id` is null
 * — every publication from before Phase 1 — is not synced and not guessed at.
 * `unattributedPublications` counts them so the gap is reported rather than
 * discovered.
 *
 * It never changes a connection's status on a temporary failure. Only a `401`,
 * after a token refresh has already been attempted and failed, is allowed to
 * mark a connection EXPIRED. A network having a bad minute must not produce a
 * "reconnect your account" banner over a connection that publishes fine.
 */

/** One connection's outcome. Every field is a count of something that happened. */
export interface AccountSyncResult {
  provider: string;
  socialAccountId: string;
  ok: boolean;
  reason?:
    | 'unsupported'
    | 'missing_scopes'
    | 'disconnected'
    | 'no_token'
    | 'token_expired'
    | 'rate_limited'
    | 'not_eligible'
    | 'failed';
  /** Safe to display. Never carries a provider body or any credential. */
  message?: string;
  missingScopes?: string[];
  /** Snapshots actually written. A re-read inside the same hour writes none. */
  postSnapshots: number;
  accountSnapshots: number;
  /** Publications the cadence said to read now. */
  publicationsDue: number;
  /** Of those, how many the network answered for. */
  publicationsAnswered: number;
  /** Asked about and not returned — deleted on the platform, most likely. */
  publicationsMissing: number;
  /** In the readable window but not yet at an observation point. */
  publicationsNotYetDue: number;
  /** Published before Phase 1, so no connection was recorded. Never guessed at. */
  unattributedPublications: number;
  mediaTypesConfirmed: number;
}

/** What a whole-context sync did. */
export interface ContextSyncSummary {
  syncedAccounts: number;
  syncedPosts: number;
  snapshotsCreated: number;
  unsupportedProviders: string[];
  failedAccounts: Array<{ provider: string; socialAccountId: string; reason: string }>;
  skippedUnattributed: number;
  results: AccountSyncResult[];
}

const DAY_MS = 86_400_000;

function emptyResult(
  provider: string,
  socialAccountId: string,
): AccountSyncResult {
  return {
    provider,
    socialAccountId,
    ok: false,
    postSnapshots: 0,
    accountSnapshots: 0,
    publicationsDue: 0,
    publicationsAnswered: 0,
    publicationsMissing: 0,
    publicationsNotYetDue: 0,
    unattributedPublications: 0,
    mediaTypesConfirmed: 0,
  };
}

/**
 * A token good enough to make a call with, renewing it first if it is spent.
 *
 * Mirrors what the publish path does, and for the same reason: a background read
 * that fails on an expired token is a connection that silently stops producing
 * analytics. Returns null when the credential cannot be renewed, which the
 * caller reports as `token_expired` — without touching the connection's status,
 * because a refresh endpoint that was unreachable is not the same as one that
 * refused.
 */
async function freshAccessToken(
  accountId: string,
  provider: Provider,
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  status: SocialAccountStatus,
): Promise<string | null> {
  const spent =
    status === SocialAccountStatus.EXPIRED ||
    tokenRefreshService.isExpiringSoon(tokens.expiresAt, TOKEN_REFRESH_SKEW_MS);

  if (!spent) return tokens.accessToken;

  const refreshed = await tokenRefreshService.refreshAccountTokens(
    accountId,
    provider,
    tokens.refreshToken,
  );

  return refreshed.ok ? refreshed.accessToken : null;
}

export interface SyncAccountOptions {
  /** The tick's clock. Passed in so tests can drive the cadence. */
  now?: Date;
  /**
   * Skip the pacing and failure-backoff gates.
   *
   * Set by a manual sync, where a member is waiting for an answer. It does
   * **not** skip the rate-limit stand-down — a network that said "too many
   * requests" is not negotiable — and it does **not** skip the per-post
   * cadence, because re-reading a post observed twenty minutes ago costs a
   * metered request and produces a snapshot that collides with the one already
   * stored. Forcing it would spend money to learn nothing.
   */
  force?: boolean;

  /**
   * Also read publications that have **never** been observed, whatever their age.
   *
   * The cadence's first stage is T+1h, which is right for a growth curve and
   * wrong for the moment a member presses Publish: they open the post and find
   * "collecting" for an hour, on a platform that would have answered
   * immediately. This lifts the age gate for the *first* observation only.
   *
   * Deliberately not a general `force` for the per-post cadence. A publication
   * that already has a snapshot is still paced normally — re-reading a post
   * observed twenty minutes ago spends a metered request (X bills per post
   * read) to produce a row that collides with the one already stored. This
   * option can therefore only ever add the observation that does not exist yet.
   */
  observeNew?: boolean;
}

/**
 * Syncs one connection.
 *
 * Every early return is a *stated* reason rather than an empty success. That
 * distinction is the contract with the UI: "we could not look" and "we looked
 * and there was nothing" must never render the same way, because the first is
 * fixable by reconnecting and the second is not.
 */
export async function syncAccount(
  accountId: string,
  options: SyncAccountOptions = {},
): Promise<AccountSyncResult> {
  const now = options.now ?? new Date();

  const account = await socialAccountRepository.findById(accountId);
  if (!account) {
    return {
      ...emptyResult('unknown', accountId),
      reason: 'disconnected',
      message: 'That connection no longer exists.',
    };
  }

  const result = emptyResult(account.provider, account.id);

  const provider = isKnownProvider(account.provider)
    ? getProvider(account.provider)
    : undefined;
  const analytics = provider?.analytics;

  if (!provider || !analytics) {
    return {
      ...result,
      reason: 'unsupported',
      message: `FlowPost cannot read analytics from ${account.provider} yet.`,
    };
  }

  const granted = account.scopes ?? [];
  if (!analytics.hasRequiredScopes(granted)) {
    return {
      ...result,
      reason: 'missing_scopes',
      message: `Reconnect ${provider.displayName} to enable analytics.`,
      missingScopes: analytics.requiredScopes.filter((s) => !granted.includes(s)),
    };
  }

  if (account.status === SocialAccountStatus.REVOKED) {
    return {
      ...result,
      reason: 'disconnected',
      message: `This ${provider.displayName} connection has been revoked.`,
    };
  }

  // ─── Pacing ────────────────────────────────────────────────────────────────
  const state = await analyticsRepository.findSyncState(account.id);
  const pacing = {
    lastSyncAt: state?.lastSyncAt ?? null,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    rateLimitedUntil: state?.rateLimitedUntil ?? null,
  };

  // The rate-limit stand-down binds even a manual sync.
  if (pacing.rateLimitedUntil && pacing.rateLimitedUntil.getTime() > now.getTime()) {
    return {
      ...result,
      reason: 'rate_limited',
      message: 'Rate limited by the network. FlowPost will try again shortly.',
    };
  }

  if (!options.force && !isAccountEligible(pacing, now)) {
    return { ...result, reason: 'not_eligible' };
  }

  // Claim before doing anything metered, so two instances cannot both pay for
  // the same read. A manual sync claims against `now` so it always wins.
  const claimed = await analyticsRepository.claimAccountForSync(
    account.id,
    now,
    options.force
      ? new Date(now.getTime() + 1)
      : new Date(now.getTime() - ACCOUNT_MIN_SYNC_INTERVAL_MS),
  );
  if (!claimed) {
    return { ...result, reason: 'not_eligible' };
  }

  const tokens = await socialAccountRepository.getDecryptedTokensById(account.id);
  if (!tokens) {
    return {
      ...result,
      reason: 'no_token',
      message: `Reconnect ${provider.displayName} to enable analytics.`,
    };
  }

  const capturedAt = floorToHour(now);

  try {
    const accessToken = await freshAccessToken(
      account.id,
      provider,
      tokens,
      account.status,
    );

    if (!accessToken) {
      // The refresh was attempted and did not produce a token. Recorded as a
      // failure; the connection's status is left alone, because `refreshTokens`
      // distinguishes "refused" from "could not ask" and only the publish path
      // and Refresh Connection act on that.
      await analyticsRepository.recordSyncFailure(
        account.id,
        now,
        'The connection needs to be reconnected.',
      );
      return {
        ...result,
        reason: 'token_expired',
        message: `Reconnect ${provider.displayName} to enable analytics.`,
      };
    }

    // ─── Account level ───────────────────────────────────────────────────────
    if (analytics.fetchAccountMetrics) {
      const lastCapture = await analyticsRepository.findLatestAccountCapture(
        account.userId,
        account.provider,
        account.providerAccountId,
      );

      if (isAccountDue(lastCapture, now)) {
        const metrics = await analytics.fetchAccountMetrics({
          accessToken,
          providerAccountId: account.providerAccountId,
        });

        const written = await analyticsRepository.recordAccountSnapshot({
          socialAccountId: account.id,
          userId: account.userId,
          // Copied onto the snapshot so the series survives a disconnect and
          // reconnect, and so a context filter is a column predicate.
          contextType: account.contextType ?? 'personal',
          brandId: account.brandId ?? null,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          capturedAt,
          ...metrics.metrics,
          raw: metrics.raw,
        });
        if (written) result.accountSnapshots += 1;
      }
    }

    // ─── Post level ──────────────────────────────────────────────────────────
    if (analytics.fetchPostMetrics) {
      const maxAgeMs = analytics.postMetricsMaxAgeDays
        ? analytics.postMetricsMaxAgeDays * DAY_MS
        : undefined;

      const publications = await analyticsRepository.findSyncablePublications(
        account.id,
        maxAgeMs ? new Date(now.getTime() - maxAgeMs) : null,
      );

      const due = publications.filter((publication) => {
        if (!publication.publishedAt || !publication.publishedId) return false;

        // The first observation does not wait for T+1h — see `observeNew`.
        // Guarded on having no snapshot at all, so this can never re-read
        // something already measured.
        if (options.observeNew && publication.metricSnapshots.length === 0) {
          return true;
        }

        return isPublicationDue(
          {
            publishedAt: publication.publishedAt,
            lastCapturedAt: publication.metricSnapshots[0]?.capturedAt ?? null,
          },
          now,
          // The network's horizon, or this *format's* if it states a shorter
          // one. A Story is gone after 24 hours: continuing to read it on the
          // weekly tail for the next month is a month of requests against a
          // post that no longer exists — and on X, where reads are billed per
          // post, a standing charge for nothing. See `metricsHorizonMs` in
          // `providers/capabilities.ts`.
          //
          // Only ever *shortens*. A format that declares no horizon, which is
          // every format but Story, is polled on exactly the cadence it always
          // was — this must not become a global change to the analytics clock.
          horizonFor(account.provider, publication, maxAgeMs),
        );
      });

      result.publicationsDue = due.length;
      result.publicationsNotYetDue = publications.length - due.length;

      if (due.length > 0) {
        const byPlatformId = new Map(
          due.map((publication) => [publication.publishedId!, publication]),
        );

        // One batched call, not one per post. The adapter pages internally at
        // whatever the network accepts — see `postMetricsBatchSize`.
        const metrics = await analytics.fetchPostMetrics({
          accessToken,
          platformPostIds: [...byPlatformId.keys()],
        });

        result.publicationsAnswered = metrics.length;
        result.publicationsMissing = due.length - metrics.length;

        for (const entry of metrics) {
          // Keyed, never positional: the network answers for a subset, in its
          // own order. A post deleted on the platform simply does not come
          // back, which is an absence rather than an error.
          const publication = byPlatformId.get(entry.platformPostId);
          if (!publication) continue;

          const written = await analyticsRepository.recordPostSnapshot({
            postPlatformId: publication.id,
            capturedAt,
            ...entry.metrics,
            raw: entry.raw,
          });
          if (written) result.postSnapshots += 1;

          const mediaType = toMediaType(entry.mediaType);
          if (mediaType && !publication.mediaTypeFromPlatform) {
            await analyticsRepository.confirmMediaType(publication.id, mediaType);
            result.mediaTypesConfirmed += 1;
          }
        }
      }
    }

    await analyticsRepository.recordSyncSuccess(account.id, now);

    console.log('[analytics-sync] synced', {
      socialAccountId: account.id,
      provider: account.provider,
      postSnapshots: result.postSnapshots,
      accountSnapshots: result.accountSnapshots,
      publicationsDue: result.publicationsDue,
      publicationsAnswered: result.publicationsAnswered,
      publicationsMissing: result.publicationsMissing,
    });

    return { ...result, ok: true };
  } catch (error) {
    const failure = classifySyncFailure(error);

    if (failure.kind === 'rate_limited') {
      await analyticsRepository.recordRateLimit(
        account.id,
        now,
        new Date(now.getTime() + RATE_LIMIT_BACKOFF_MS),
        failure.message,
      );
    } else {
      await analyticsRepository.recordSyncFailure(account.id, now, failure.message);
    }

    // Only a network stating that the credential is invalid may touch the
    // connection. EXPIRED is recoverable — a successful refresh or a reconnect
    // sets it back to CONNECTED — where a temporary failure marked fatal is not.
    if (failure.affectsConnection) {
      await socialAccountRepository.updateStatus(
        account.id,
        SocialAccountStatus.EXPIRED,
      );
    }

    console.error('[analytics-sync] failed', {
      socialAccountId: account.id,
      provider: account.provider,
      // The classification, never the thrown error's own text: that can quote a
      // provider response, and this line goes to a shared log.
      kind: failure.kind,
      // The status is a number, so it carries no response text — and it is the
      // difference between "the network had a bad minute" and "the network is
      // refusing this request every time and always will". Without it, a
      // retired API parameter answering 500 forever is indistinguishable in the
      // log from an outage that will clear on its own.
      upstreamStatus: error instanceof ProviderError ? error.upstreamStatus : undefined,
    });

    return {
      ...result,
      reason: failure.kind === 'rate_limited' ? 'rate_limited' : 'failed',
      message: failure.message,
    };
  }
}

/**
 * Syncs every connection in one publishing context.
 *
 * Sequential rather than concurrent. These are metered, rate-limited calls to
 * third parties — X charges per post read — and a member with four connections
 * is not waiting on latency worth parallelising for. It also means a rate limit
 * on one network cannot be reached four times before the first response lands.
 *
 * Never throws: one network failing must not cost the member the other three's
 * results.
 */
export async function syncContext(
  scope: AnalyticsScope,
  options: { provider?: string; force?: boolean; now?: Date } = {},
): Promise<ContextSyncSummary> {
  const accounts = await socialAccountRepository.listByUser(scope.userId, {
    contextType: scope.contextType,
    brandId: scope.brandId,
  });

  const targets = options.provider
    ? accounts.filter((account) => account.provider === options.provider)
    : accounts;

  const results: AccountSyncResult[] = [];
  for (const account of targets) {
    const result = await syncAccount(account.id, {
      ...(options.now ? { now: options.now } : {}),
      ...(options.force ? { force: true } : {}),
    });

    // Counted per provider *within this scope*, so a member's personal X posts
    // can never be reported against a brand's sync.
    result.unattributedPublications =
      await analyticsRepository.countUnattributedPublications(
        scope,
        account.provider,
      );

    results.push(result);
  }

  return {
    syncedAccounts: results.filter((r) => r.ok).length,
    syncedPosts: results.reduce((sum, r) => sum + r.publicationsAnswered, 0),
    snapshotsCreated: results.reduce(
      (sum, r) => sum + r.postSnapshots + r.accountSnapshots,
      0,
    ),
    unsupportedProviders: [
      ...new Set(
        results.filter((r) => r.reason === 'unsupported').map((r) => r.provider),
      ),
    ],
    failedAccounts: results
      .filter((r) => !r.ok && r.reason !== 'unsupported' && r.reason !== 'not_eligible')
      .map((r) => ({
        provider: r.provider,
        socialAccountId: r.socialAccountId,
        reason: r.reason ?? 'failed',
      })),
    skippedUnattributed: results.reduce(
      (sum, r) => sum + r.unattributedPublications,
      0,
    ),
    results,
  };
}

/**
 * A best-effort first reading, straight after a post goes out.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * The cadence's first observation is T+1h, which is correct for measuring a
 * growth curve and wrong for the thirty seconds after a member presses Publish.
 * They open the post, find "collecting", and have no way to tell that from
 * broken. Most networks will answer immediately — with zeros that are *real*
 * zeros — and one reading is the difference between a page that works and a
 * page that appears not to.
 *
 * ─── It cannot fail a publish, by construction ───────────────────────────────
 *
 * Not by being careful — by not being awaited. The post is already live and
 * already recorded before this is called; there is no code path from here back
 * to the publish result. The promise is detached with a `catch` that swallows
 * everything, because an unhandled rejection in a fire-and-forget is the one
 * way a background read could still take the process down.
 *
 * Every ordinary outcome is silent. An account with no adapter, without the
 * scopes, rate-limited, or paced out returns a reason and nothing is logged:
 * these are the common cases and they are already visible on the analytics
 * page as `collecting` or `unavailable`. Only a genuine throw is worth a line.
 *
 * ─── What it is not ──────────────────────────────────────────────────────────
 *
 * Not a replacement for the sweep. The background cadence — T+1h, T+6h, T+24h,
 * T+72h, then weekly — is unchanged and still does all the real work. This adds
 * one reading at T+0 and nothing else; `observeNew` can only ever produce the
 * observation that does not exist yet.
 */
export function scheduleFirstObservation(socialAccountId: string): void {
  void syncAccount(socialAccountId, { force: true, observeNew: true })
    .then((result) => {
      // One line, always. Not because every outcome is interesting, but because
      // silence on the happy path made "did the first observation run?" an
      // unanswerable question — the only other evidence is a `last_sync_at`
      // that a later sweep overwrites within the hour. It is one line per
      // publication, which is the same order as the publish log beside it.
      console.log('[analytics-sync] first observation', {
        socialAccountId,
        provider: result.provider,
        ok: result.ok,
        ...(result.reason ? { reason: result.reason } : {}),
        postSnapshots: result.postSnapshots,
        publicationsDue: result.publicationsDue,
      });
    })
    .catch((error) => {
      // syncAccount is written not to throw. If it does, the bookkeeping itself
      // failed — and it still must not reach the publish that triggered it.
      console.error('[analytics-sync] first observation crashed', {
        socialAccountId,
        error: error instanceof Error ? error.message : error,
      });
    });
}

export const analyticsSyncService = {
  syncAccount,
  syncContext,
  scheduleFirstObservation,
};

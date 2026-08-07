/**
 * Sprint 3.3 acceptance check.
 *
 *   npm run verify:sprint33          (from server/)
 *
 * Drives the integration service exactly as the routes do, against the real
 * database, using a throwaway provider and a synthetic connection so it never
 * touches a member's real LinkedIn row. Everything it creates is deleted at the
 * end, and it is safe to re-run.
 *
 * What it is actually checking is the *derivation* layer — that a row plus a
 * catalogue entry produces the right status, health and permissions — because
 * that is the logic with no other test and the most ways to be subtly wrong.
 */
import { prisma, disconnectPrisma } from '../config/prisma';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { integrationService } from '../services/integration.service';
import {
  assessHealth,
  deriveStatus,
  resolvePermissions,
} from '../services/integration-health';
import { getCatalogEntry, PROVIDER_CATALOG } from '../providers';
import { SocialAccountStatus } from '../generated/prisma/enums';
import type { SafeSocialAccount } from '../repositories/social-account.repository';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A synthetic row, so status derivation can be tested without a real account. */
function fakeAccount(overrides: Partial<SafeSocialAccount> = {}): SafeSocialAccount {
  const now = new Date();
  return {
    id: 'fake',
    userId: 'fake',
    provider: 'linkedin',
    providerAccountId: 'urn:li:person:fake',
    displayName: 'Test Member',
    username: null,
    profileImage: null,
    expiresAt: new Date(now.getTime() + 60 * 24 * 3600_000),
    status: SocialAccountStatus.CONNECTED,
    scopes: ['openid', 'profile', 'w_member_social'],
    providerVersion: '202401',
    lastSyncedAt: now,
    lastHealthCheck: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function main() {
  const linkedin = getCatalogEntry('linkedin');
  if (!linkedin) throw new Error('LinkedIn is missing from the catalogue');

  console.log('\nCatalogue');
  check('every network has a catalogue entry', PROVIDER_CATALOG.length >= 6);
  check(
    'only implemented networks expose a connect path',
    PROVIDER_CATALOG.every((entry) =>
      entry.available ? entry.connectPath !== null : entry.connectPath === null,
    ),
  );

  console.log('\nStatus derivation');

  const healthy = fakeAccount();
  const healthyPerms = resolvePermissions(linkedin, healthy);
  check(
    'a good connection is `connected`',
    deriveStatus(healthy, healthyPerms) === 'connected',
    deriveStatus(healthy, healthyPerms),
  );
  check(
    'a good connection scores full marks',
    assessHealth(healthy, healthyPerms).rating === 5,
  );

  // The case the whole derived-status design exists for: the row still says
  // CONNECTED because nobody has looked since the token lapsed.
  const lapsed = fakeAccount({ expiresAt: new Date(Date.now() - 1000) });
  const lapsedPerms = resolvePermissions(linkedin, lapsed);
  check(
    'a lapsed token reads as `needs_reconnect` despite a CONNECTED row',
    deriveStatus(lapsed, lapsedPerms) === 'needs_reconnect',
    deriveStatus(lapsed, lapsedPerms),
  );

  const soon = fakeAccount({
    expiresAt: new Date(Date.now() + 2 * 24 * 3600_000),
  });
  check(
    'a token expiring within a week reads as `expiring_soon`',
    deriveStatus(soon, resolvePermissions(linkedin, soon)) === 'expiring_soon',
  );

  const noPublish = fakeAccount({ scopes: ['openid', 'profile'] });
  const noPublishPerms = resolvePermissions(linkedin, noPublish);
  check(
    'a missing publish scope reads as `publishing_disabled`',
    deriveStatus(noPublish, noPublishPerms) === 'publishing_disabled',
    deriveStatus(noPublish, noPublishPerms),
  );
  check(
    'the withheld permission is marked as such',
    noPublishPerms.find((p) => p.scope === 'w_member_social')?.granted === false,
  );
  check(
    'planned permissions are neither granted nor withheld',
    noPublishPerms.filter((p) => p.planned).every((p) => p.granted === null),
  );

  // Connections made before Sprint 3.3 have no scopes recorded. They must keep
  // working rather than reporting every permission as withheld.
  const legacy = fakeAccount({ scopes: [] });
  const legacyPerms = resolvePermissions(linkedin, legacy);
  check(
    'a pre-3.3 connection with no recorded scopes still reads as connected',
    deriveStatus(legacy, legacyPerms) === 'connected',
    deriveStatus(legacy, legacyPerms),
  );

  const revoked = fakeAccount({ status: SocialAccountStatus.REVOKED });
  check(
    'a revoked row reads as `revoked`',
    deriveStatus(revoked, resolvePermissions(linkedin, revoked)) === 'revoked',
  );

  const stale = fakeAccount({
    lastSyncedAt: new Date(Date.now() - 90 * 24 * 3600_000),
    lastHealthCheck: new Date(Date.now() - 90 * 24 * 3600_000),
  });
  const staleHealth = assessHealth(stale, resolvePermissions(linkedin, stale));
  check(
    'a connection unchecked for months loses the freshness point',
    staleHealth.rating === 4 &&
      staleHealth.checks.find((c) => c.id === 'freshness')?.passed === false,
  );

  console.log('\nUnconnected networks');
  const none = resolvePermissions(linkedin, null);
  check(
    'no connection reads as `not_connected`',
    deriveStatus(null, none) === 'not_connected',
  );
  check('no connection has no health to report', assessHealth(null, none).rating === 0);

  console.log('\nService layer, against the database');

  // A real user id is required by the FK on social_accounts.user_id.
  const existing = await prisma.socialAccount.findFirst({
    select: { userId: true },
  });
  const userId = existing?.userId;

  if (!userId) {
    console.log(
      '  SKIP  no user with a connection exists yet — connect an account and re-run',
    );
  } else {
    const TEST_PROVIDER = 'linkedin';
    const before = await integrationService.listIntegrations(userId);

    check(
      'listIntegrations returns every catalogued network',
      before.length === PROVIDER_CATALOG.length,
      `${before.length} vs ${PROVIDER_CATALOG.length}`,
    );
    check(
      'unbuilt networks are reported as unavailable, not hidden',
      before.some((i) => !i.available),
    );
    check(
      'no response field can carry a token',
      !JSON.stringify(before).toLowerCase().includes('encrypted'),
    );

    const card = before.find((i) => i.provider === TEST_PROVIDER);
    check('the LinkedIn card is present', Boolean(card));
    check(
      'a connected card carries profile, health and permissions',
      !card?.connected ||
        (card.account !== null &&
          card.health !== null &&
          card.permissions.length > 0),
    );

    console.log('\nActivity timeline');
    const events = await integrationService.listActivity(userId, { limit: 10 });
    check('activity reads back without error', Array.isArray(events));
    check(
      'every event has a human-readable title',
      events.every((e) => typeof e.title === 'string' && e.title.length > 0),
    );
    for (const event of events.slice(0, 5)) {
      console.log(`        ${event.createdAt}  ${event.tone.padEnd(8)} ${event.title}`);
    }

    console.log('\nError handling');
    try {
      await integrationService.getIntegration(userId, 'myspace' as never);
      check('an unknown provider is rejected', false, 'no error thrown');
    } catch (error) {
      check(
        'an unknown provider is rejected with a 404',
        (error as { status?: number }).status === 404,
      );
    }

    try {
      // Refresh on a network with no connection must 404, not throw a 500.
      await integrationService.refreshConnection(userId, 'instagram');
      check('refreshing an unconnected network is rejected', false);
    } catch (error) {
      check(
        'refreshing an unconnected network is rejected with a 404',
        (error as { status?: number }).status === 404,
      );
    }

    // Round-trips the new columns through the repository on a throwaway row.
    console.log('\nRepository metadata round-trip');
    const temp = await socialAccountRepository.upsert({
      userId,
      provider: 'sprint33-selftest',
      providerAccountId: 'selftest',
      displayName: 'Self Test',
      accessToken: 'plaintext-never-stored-as-is',
      scopes: ['openid', 'profile'],
      providerVersion: '202401',
    });
    check('upsert stores granted scopes', temp.scopes.length === 2);
    check('upsert stores the provider version', temp.providerVersion === '202401');
    check('upsert stamps lastSyncedAt', temp.lastSyncedAt !== null);

    const synced = await socialAccountRepository.markSynced(temp.id, {
      displayName: 'Renamed',
    });
    check('markSynced updates the profile', synced.displayName === 'Renamed');
    check(
      'markSynced does not blank a field the provider omitted',
      synced.profileImage === temp.profileImage,
    );

    const checked = await socialAccountRepository.markHealthChecked(
      temp.id,
      SocialAccountStatus.EXPIRED,
    );
    check('markHealthChecked moves the status', checked.status === 'EXPIRED');
    check(
      'markHealthChecked leaves lastSyncedAt alone',
      checked.lastSyncedAt?.getTime() === synced.lastSyncedAt?.getTime(),
    );

    await prisma.socialAccount.delete({ where: { id: temp.id } });
    console.log('        cleaned up the throwaway row');
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('\nverify-sprint33 threw:', error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);

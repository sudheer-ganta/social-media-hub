/**
 * What analytics FlowPost can actually read, right now, from the real networks.
 *
 * ─── Read-only, and deliberately so ──────────────────────────────────────────
 *
 * This publishes nothing, writes no snapshot and updates no row. It reads each
 * connection's granted scopes, then — for the ones that hold what they need —
 * calls the network's *account metrics* endpoint with the real stored token and
 * prints what came back.
 *
 * ─── Why it exists ───────────────────────────────────────────────────────────
 *
 * "Analytics aren't working" has four completely different causes and they are
 * indistinguishable from the UI: no adapter for that network, an adapter whose
 * scope was never granted, a token that has died, or a network that answered
 * fine and simply does not report the metric being looked for. Each needs a
 * different fix and only the second is something a member can do anything
 * about. This prints which one it is, per connection, in one pass.
 *
 * It is also the check that proves an adapter works against the live API rather
 * than against its own test doubles — the unit tests cover the shape of the
 * response, and only this covers the assumption that the response has that
 * shape at all.
 *
 * ─── Reading the output ──────────────────────────────────────────────────────
 *
 *   reported     — the network sent a number. `followers=0` here is a genuine
 *                  zero and is not the same as being listed below.
 *   unavailable  — the network does not report this metric, or not for this
 *                  account. Stays NULL all the way to the API. Never a zero.
 *
 * Run: cd server && npm run verify:analytics
 */
import { prisma } from '../config/prisma';
import { getProvider, isKnownProvider } from '../providers';
import { socialAccountRepository } from '../repositories/social-account.repository';

async function main() {
  const accounts = await prisma.socialAccount.findMany({
    select: {
      id: true,
      provider: true,
      providerAccountId: true,
      status: true,
      scopes: true,
      contextType: true,
      brandId: true,
    },
    orderBy: { provider: 'asc' },
  });

  if (accounts.length === 0) {
    console.log('No connections. Connect a network first.');
    return;
  }

  console.log(`${accounts.length} connection(s)\n`);

  for (const account of accounts) {
    const context = `${account.contextType ?? 'personal'}${
      account.brandId ? `/${account.brandId.slice(0, 8)}` : ''
    }`;
    console.log(`── ${account.provider} [${account.status}] ${context}`);

    const provider = isKnownProvider(account.provider)
      ? getProvider(account.provider)
      : undefined;
    const analytics = provider?.analytics;

    // No adapter at all. Permanent, and nothing a reconnect would change.
    if (!analytics) {
      console.log('   unsupported — FlowPost has no analytics adapter for this network\n');
      continue;
    }

    const granted = account.scopes ?? [];
    const missing = analytics.requiredScopes.filter((s) => !granted.includes(s));

    if (missing.length > 0) {
      // The fixable one. Note it is never reported as zero engagement.
      console.log(`   missing scopes — reconnect to grant: ${missing.join(', ')}`);
      console.log(
        `   (set ANALYTICS_SCOPES=${account.provider} so the scope is requested at connect)\n`,
      );
      continue;
    }

    if (!analytics.fetchAccountMetrics) {
      console.log(
        '   post metrics only — this network reports no account-level audience\n',
      );
      continue;
    }

    const tokens = await socialAccountRepository.getDecryptedTokensById(account.id);
    if (!tokens) {
      console.log('   no stored token — reconnect\n');
      continue;
    }

    try {
      const result = await analytics.fetchAccountMetrics({
        accessToken: tokens.accessToken,
        providerAccountId: account.providerAccountId,
      });

      const entries = Object.entries(result.metrics);
      const reported = entries
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key}=${value}`);
      const unavailable = entries
        .filter(([, value]) => value === null || value === undefined)
        .map(([key]) => key);

      console.log('   ok');
      console.log(`   reported:    ${reported.join(', ') || '(none)'}`);
      console.log(`   unavailable: ${unavailable.join(', ') || '(none)'}\n`);
    } catch (error) {
      // The message is already log-safe — every adapter routes failures through
      // its provider's `toProviderError`, which keeps tokens out of the text.
      console.log(
        `   FAILED — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  const published = await prisma.postPlatform.count({
    where: { publishedId: { not: null } },
  });
  const snapshots = await prisma.postMetricSnapshot.count();

  console.log(`published publications: ${published}`);
  console.log(`post metric snapshots:  ${snapshots}`);

  if (published === 0) {
    // Worth saying out loud: with nothing published, a post-metrics sync has
    // nothing to ask about and a green sweep proves nothing about that half.
    console.log(
      '\nNothing has been published yet, so post metrics cannot be read.\n' +
        'Account metrics above are the only live check available.',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Sprint 2 acceptance check.
 *
 *   npx ts-node-dev --transpile-only src/scripts/verify-sprint2.ts
 *
 * Exercises the encryption service and all three repositories against the real
 * database, then deletes everything it created. Safe to re-run.
 */
import { prisma, disconnectPrisma } from '../config/prisma';
import { encrypt, decrypt } from '../services/encryption.service';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { activityRepository } from '../repositories/activity.repository';
import { postRepository } from '../repositories/post.repository';
import { activityService } from '../services/activity.service';
import { SocialAccountStatus } from '../generated/prisma/enums';

const TEST_PROVIDER = 'sprint2-selftest';

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

async function main() {
  console.log('\n1. Tables exist');
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('social_accounts', 'activity_logs', 'post_platforms')
  `;
  const found = tables.map((t) => t.table_name).sort();
  for (const t of ['activity_logs', 'post_platforms', 'social_accounts']) {
    check(t, found.includes(t));
  }

  const enums = await prisma.$queryRaw<{ typname: string }[]>`
    SELECT typname FROM pg_type
    WHERE typname IN ('post_status', 'social_account_status', 'publish_status')
  `;
  check(
    'enums post_status / social_account_status / publish_status',
    enums.length === 3,
    `found ${enums.map((e) => e.typname).join(', ')}`,
  );

  console.log('\n2. RLS shields the new tables from PostgREST roles');
  const rls = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean; npolicies: bigint }[]>`
    SELECT c.relname,
           c.relrowsecurity,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS npolicies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('social_accounts', 'activity_logs', 'post_platforms')
  `;
  for (const row of rls) {
    check(
      `${row.relname}: RLS enabled, no policies`,
      row.relrowsecurity && Number(row.npolicies) === 0,
      `rls=${row.relrowsecurity} policies=${row.npolicies}`,
    );
  }

  console.log('\n3. encrypt() -> decrypt() round-trips');
  const secret = 'AQV_linkedin_access_token_example.' + 'x'.repeat(120);
  const cipher = encrypt(secret);
  check('decrypt(encrypt(x)) === x', decrypt(cipher) === secret);
  check('ciphertext is not the plaintext', !cipher.includes(secret));
  check('versioned v1.<iv>.<tag>.<data>', cipher.split('.').length === 4 && cipher.startsWith('v1.'));
  check('same plaintext encrypts differently (random IV)', encrypt(secret) !== cipher);

  const tampered = cipher.slice(0, -4) + (cipher.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  let tamperRejected = false;
  try {
    decrypt(tampered);
  } catch {
    tamperRejected = true;
  }
  check('tampered ciphertext is rejected', tamperRejected);

  console.log('\n4. Repositories');
  // Prefer a user who already owns a post, so the PostPlatform checks can run
  // against a real row instead of being skipped.
  const users = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u.id::text
    FROM auth.users u
    LEFT JOIN public.posts p ON p.created_by = u.id
    GROUP BY u.id, u.created_at
    ORDER BY count(p.id) DESC, u.created_at ASC
    LIMIT 1
  `;
  if (users.length === 0) {
    console.log('  SKIP  no auth.users row to attach test data to — sign up once, then re-run.');
    return;
  }
  const userId = users[0].id;
  console.log(`  using auth user ${userId.slice(0, 8)}…`);

  // -- social-account.repository
  const account = await socialAccountRepository.upsert({
    userId,
    provider: TEST_PROVIDER,
    providerAccountId: 'urn:li:person:SELFTEST',
    displayName: 'Sprint 2 Self Test',
    username: 'sprint2',
    profileImage: 'https://example.com/avatar.png',
    accessToken: secret,
    refreshToken: 'refresh-token-example',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  check('SocialAccount created', Boolean(account.id));
  check('status defaults to CONNECTED', account.status === SocialAccountStatus.CONNECTED);
  check(
    'returned account carries no token fields',
    !('encryptedAccessToken' in account) && !('encryptedRefreshToken' in account),
  );

  const stored = await prisma.socialAccount.findUnique({ where: { id: account.id } });
  check('access token is ciphertext at rest', stored?.encryptedAccessToken.startsWith('v1.') === true);
  check('access token is NOT stored in plaintext', stored?.encryptedAccessToken !== secret);
  check('refresh token is ciphertext at rest', stored?.encryptedRefreshToken?.startsWith('v1.') === true);

  const tokens = await socialAccountRepository.getDecryptedTokens(userId, TEST_PROVIDER);
  check('getDecryptedTokens returns the original access token', tokens?.accessToken === secret);
  check('getDecryptedTokens returns the original refresh token', tokens?.refreshToken === 'refresh-token-example');

  const reconnected = await socialAccountRepository.upsert({
    userId,
    provider: TEST_PROVIDER,
    providerAccountId: 'urn:li:person:SELFTEST',
    accessToken: 'second-token',
  });
  check('reconnect upserts instead of duplicating', reconnected.id === account.id);
  check(
    'reconnect replaces the token',
    (await socialAccountRepository.getDecryptedTokens(userId, TEST_PROVIDER))?.accessToken === 'second-token',
  );
  check(
    'listByUser finds it',
    (await socialAccountRepository.listByUser(userId)).some((a) => a.id === account.id),
  );

  // -- activity.repository + activity.service
  const entry = await activityRepository.create({
    userId,
    action: 'sprint2.selftest',
    provider: TEST_PROVIDER,
    details: { note: 'repository-level write' },
  });
  check('ActivityLog created', Boolean(entry.id));

  const logged = await activityService.logConnection(userId, TEST_PROVIDER, {
    accessToken: 'SHOULD-NEVER-BE-STORED',
    displayName: 'Sprint 2 Self Test',
  });
  check('activityService.logConnection wrote a row', Boolean(logged?.id));
  const details = logged?.details as Record<string, unknown> | null;
  check('secret-looking keys are redacted', details?.accessToken === '[redacted]');
  check('non-secret keys survive', details?.displayName === 'Sprint 2 Self Test');

  const failureRow = await activityService.logFailure(userId, new Error('boom'), {
    provider: TEST_PROVIDER,
    action: 'post.publish',
  });
  check(
    'logFailure records the message',
    (failureRow?.details as Record<string, unknown> | null)?.message === 'boom',
  );

  check(
    'listByUser returns the audit rows',
    (await activityRepository.listByUser(userId, { provider: TEST_PROVIDER })).length >= 3,
  );

  // -- post.repository
  const post = await prisma.post.findFirst({ where: { created_by: userId } });
  if (!post) {
    console.log('  SKIP  no post owned by this user — create one in the app, then re-run for PostPlatform.');
  } else {
    await postRepository.startPlatformPublish(post.id, TEST_PROVIDER);
    const published = await postRepository.markPlatformPublished(post.id, TEST_PROVIDER, 'urn:li:share:123');
    check('PostPlatform row written', published.status === 'PUBLISHED' && published.publishedId === 'urn:li:share:123');

    const failedRow = await postRepository.markPlatformFailed(post.id, TEST_PROVIDER, 'rate limited');
    check('PostPlatform failure recorded', failedRow.status === 'FAILED' && failedRow.errorMessage === 'rate limited');
    check(
      'retry reuses the same row',
      (await postRepository.listPlatformsForPost(post.id)).filter((p) => p.provider === TEST_PROVIDER).length === 1,
    );
    check('findByIdForUser scopes to the owner', (await postRepository.findByIdForUser(post.id, userId)) !== null);
    check(
      'findByIdForUser rejects a different owner',
      (await postRepository.findByIdForUser(post.id, '00000000-0000-0000-0000-000000000000')) === null,
    );

    await prisma.postPlatform.deleteMany({ where: { postId: post.id, provider: TEST_PROVIDER } });
  }

  console.log('\n5. Cleanup');
  const removed = await socialAccountRepository.deleteByUserAndProvider(userId, TEST_PROVIDER);
  check('test SocialAccount removed', removed === 1);
  const { count } = await prisma.activityLog.deleteMany({ where: { userId, provider: TEST_PROVIDER } });
  check('test ActivityLog rows removed', count >= 3);
}

main()
  .catch((error) => {
    failed++;
    console.error('\nUNEXPECTED ERROR:', error);
  })
  .finally(async () => {
    await disconnectPrisma();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  });

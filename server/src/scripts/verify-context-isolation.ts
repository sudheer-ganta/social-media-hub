/**
 * Content Studio V2 acceptance check — Personal vs Brand context isolation.
 *
 *   npm run verify:contexts
 *
 * Exercises the brands table, the context-aware social-account repository and
 * the publish-time account resolution against the real database, then deletes
 * everything it created. Safe to re-run.
 */
import { prisma, disconnectPrisma } from '../config/prisma';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { brandRepository } from '../repositories/brand.repository';

const TEST_PROVIDER = 'ctx-selftest';
const TEST_BRAND = 'Context Selftest Brand';

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
  console.log('\n1. Schema: brands table + context columns');
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'brands' AND column_name = 'id')
        OR (table_name = 'social_accounts' AND column_name IN ('context_type', 'brand_id'))
        OR (table_name = 'posts' AND column_name IN ('context_type', 'brand_id', 'music', 'cta', 'link_url')))
  `;
  check('brands table exists', columns.some((c) => c.table_name === 'brands'));
  check(
    'social_accounts has context_type + brand_id',
    columns.filter((c) => c.table_name === 'social_accounts').length === 2,
  );
  check(
    'posts has context_type/brand_id/music/cta/link_url',
    columns.filter((c) => c.table_name === 'posts').length === 5,
  );

  const rls = await prisma.$queryRaw<{ relrowsecurity: boolean; npolicies: bigint }[]>`
    SELECT c.relrowsecurity,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS npolicies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'brands'
  `;
  check(
    'brands: RLS enabled with per-user policies',
    rls[0]?.relrowsecurity === true && Number(rls[0]?.npolicies) === 4,
    `rls=${rls[0]?.relrowsecurity} policies=${rls[0]?.npolicies}`,
  );

  console.log('\n2. Context-aware repository');
  const users = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM auth.users ORDER BY created_at ASC LIMIT 1
  `;
  if (users.length === 0) {
    console.log('  SKIP  no auth.users row — sign up once, then re-run.');
    return;
  }
  const userId = users[0].id;

  const brand = await prisma.brand.create({
    data: { name: TEST_BRAND, created_by: userId },
  });
  check('brand created', Boolean(brand.id));
  check(
    'findOwnedBrand proves ownership',
    (await brandRepository.findOwnedBrand(brand.id, userId))?.id === brand.id,
  );
  check(
    'findOwnedBrand refuses a foreign user',
    (await brandRepository.findOwnedBrand(
      brand.id,
      '00000000-0000-0000-0000-000000000000',
    )) === null,
  );

  // The same provider account connected in both contexts — two separate rows.
  const identity = {
    userId,
    provider: TEST_PROVIDER,
    providerAccountId: 'urn:ctx:SELFTEST',
  };
  const personal = await socialAccountRepository.upsert({
    ...identity,
    displayName: 'Personal connection',
    accessToken: 'personal-token',
  });
  const branded = await socialAccountRepository.upsert({
    ...identity,
    contextType: 'brand',
    brandId: brand.id,
    displayName: 'Brand connection',
    accessToken: 'brand-token',
  });
  check(
    'same provider account connects separately per context',
    personal.id !== branded.id,
  );

  const reconnected = await socialAccountRepository.upsert({
    ...identity,
    displayName: 'Personal reconnect',
    accessToken: 'personal-token-2',
  });
  check('reconnect updates its own context row', reconnected.id === personal.id);
  check(
    'reconnect leaves the other context alone',
    (await socialAccountRepository.findById(branded.id))?.displayName ===
      'Brand connection',
  );

  const personalCtx = { contextType: 'personal', brandId: null };
  const brandCtx = { contextType: 'brand', brandId: brand.id };

  const personalList = await socialAccountRepository.listByUser(userId, personalCtx);
  const brandList = await socialAccountRepository.listByUser(userId, brandCtx);
  check(
    'personal list never contains brand rows',
    personalList.every((a) => a.contextType === 'personal'),
  );
  check(
    'brand list contains only that brand',
    brandList.every((a) => a.brandId === brand.id) &&
      brandList.some((a) => a.id === branded.id),
  );

  console.log('\n3. Publish-time resolution');
  const personalPick = await socialAccountRepository.findByUserAndProvider(
    userId,
    TEST_PROVIDER,
    personalCtx,
  );
  const brandPick = await socialAccountRepository.findByUserAndProvider(
    userId,
    TEST_PROVIDER,
    brandCtx,
  );
  check('personal post resolves the personal row', personalPick?.id === personal.id);
  check('brand post resolves the brand row', brandPick?.id === branded.id);
  check(
    'token follows the selected row, not the newest',
    (await socialAccountRepository.getDecryptedTokensById(branded.id))
      ?.accessToken === 'brand-token',
  );

  const removed = await socialAccountRepository.deleteByUserAndProvider(
    userId,
    TEST_PROVIDER,
    personalCtx,
  );
  check('disconnect removes exactly the one context', removed === 1);
  check(
    'the other context survives a disconnect',
    (await socialAccountRepository.findById(branded.id)) !== null,
  );

  console.log('\n4. CASCADE: brand deletion takes its connections with it');
  await prisma.brand.delete({ where: { id: brand.id } });
  check(
    'brand connection deleted with the brand',
    (await socialAccountRepository.findById(branded.id)) === null,
  );
}

main()
  .catch((error) => {
    failed++;
    console.error('\nUnexpected failure:', error);
  })
  .finally(async () => {
    // Cleanup is idempotent: rows may already be gone via the CASCADE checks.
    await prisma.socialAccount.deleteMany({ where: { provider: TEST_PROVIDER } });
    await prisma.brand.deleteMany({ where: { name: TEST_BRAND } });
    await disconnectPrisma();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });

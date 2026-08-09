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

/**
 * Facebook is exercised under its *real* provider id, because the behaviour
 * being checked — one Page per context — lives in code keyed to that id. The
 * fake rows are made unmistakable by their Page ids instead, and cleanup
 * matches on this prefix so a genuine Facebook connection on this database is
 * never touched.
 */
const FACEBOOK_PROVIDER = 'facebook';
const FB_TEST_PREFIX = 'fb-selftest-';

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

  console.log('\n4. Facebook Pages: one Page per context, isolated per context');
  await verifyFacebookPages(userId, brand.id);

  console.log('\n5. CASCADE: brand deletion takes its connections with it');
  await prisma.brand.delete({ where: { id: brand.id } });
  check(
    'brand connection deleted with the brand',
    (await socialAccountRepository.findById(branded.id)) === null,
  );
}

/**
 * The Facebook half.
 *
 * Facebook is the first provider where `provider_account_id` is not the member
 * — it is a Page — and where the same member can hold several eligible Pages.
 * That makes two invariants worth proving against the real schema rather than
 * reasoning about:
 *
 *   • **One Page per context.** The unique index keys on the Page id, so
 *     connecting a second Page in the same context is two perfectly legal rows,
 *     at which point `findByUserAndProvider` picks between them by date and the
 *     publisher silently targets the wrong Page. `deleteOthersInContext` is
 *     what stops that, and this is where it is checked.
 *   • **The token follows the row, not the provider.** The publisher fetches
 *     credentials with `getDecryptedTokensById(account.id)` precisely so a
 *     Personal Page token can never be paired with a Brand Page id.
 *
 * Uses the real `facebook` provider value with unmistakably fake Page ids, and
 * cleans up by that prefix so a genuine connection on this database is never
 * touched.
 */
async function verifyFacebookPages(userId: string, brandId: string) {
  const personalCtx = { contextType: 'personal', brandId: null };
  const brandCtx = { contextType: 'brand', brandId };

  const connectPage = (
    context: { contextType: string; brandId: string | null },
    page: { id: string; name: string; pageToken: string },
  ) =>
    socialAccountRepository.upsert({
      userId,
      provider: FACEBOOK_PROVIDER,
      providerAccountId: page.id,
      contextType: context.contextType,
      brandId: context.brandId,
      displayName: page.name,
      accessToken: page.pageToken,
      // The long-lived *user* token. Not an OAuth refresh token — see the note
      // in providers/meta/facebook/oauth.ts.
      refreshToken: 'fb-selftest-user-token',
      // Null on purpose: a Page token minted from a long-lived user token does
      // not expire, and a stored expiry would make the publish pre-flight
      // refuse a working connection.
      expiresAt: null,
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    });

  // 1. A Facebook connection can be created.
  const personalPage = await connectPage(personalCtx, {
    id: `${FB_TEST_PREFIX}PERSONAL`,
    name: 'Selftest Personal Page',
    pageToken: 'fb-personal-page-token',
  });
  check('facebook: personal Page connects', Boolean(personalPage.id));
  check(
    'facebook: the Page id is stored as provider_account_id',
    personalPage.providerAccountId === `${FB_TEST_PREFIX}PERSONAL`,
  );
  check(
    'facebook: no expiry is stored for a Page token',
    personalPage.expiresAt === null,
  );

  // 2. Reconnecting the same Page updates the same row.
  const reconnected = await connectPage(personalCtx, {
    id: `${FB_TEST_PREFIX}PERSONAL`,
    name: 'Selftest Personal Page (renamed)',
    pageToken: 'fb-personal-page-token-2',
  });
  check(
    'facebook: reconnecting the same Page updates the same row',
    reconnected.id === personalPage.id &&
      reconnected.displayName === 'Selftest Personal Page (renamed)',
  );

  // 3. The same Page can exist in Personal and in a Brand independently.
  const sharedInBrand = await connectPage(brandCtx, {
    id: `${FB_TEST_PREFIX}PERSONAL`,
    name: 'Same Page, brand context',
    pageToken: 'fb-brand-token-for-shared-page',
  });
  check(
    'facebook: the same Page connects independently per context',
    sharedInBrand.id !== personalPage.id,
  );
  check(
    'facebook: connecting it for a brand left the personal row alone',
    (await socialAccountRepository.findById(personalPage.id))?.displayName ===
      'Selftest Personal Page (renamed)',
  );

  // 5. One Page per context: a *different* Page in the brand context retires
  //    the first, rather than leaving two rows to choose between.
  const brandPage = await connectPage(brandCtx, {
    id: `${FB_TEST_PREFIX}BRAND`,
    name: 'Selftest Brand Page',
    pageToken: 'fb-brand-page-token',
  });
  const retired = await socialAccountRepository.deleteOthersInContext(
    userId,
    FACEBOOK_PROVIDER,
    brandCtx,
    brandPage.id,
  );
  check(
    'facebook: connecting a second Page retires the first in that context',
    retired === 1 &&
      (await socialAccountRepository.findById(sharedInBrand.id)) === null,
    `retired ${retired}`,
  );
  check(
    'facebook: retiring a brand Page never touches the personal one',
    (await socialAccountRepository.findById(personalPage.id)) !== null,
  );
  check(
    'facebook: exactly one Page remains in the brand context',
    (await socialAccountRepository.listByUser(userId, brandCtx)).filter(
      (a) => a.provider === FACEBOOK_PROVIDER,
    ).length === 1,
  );

  // 6–8. Publish-time resolution. This is the shape the publish service uses:
  //      the context comes from the post, the row comes from the context, and
  //      the token comes from the row's id.
  const personalPick = await socialAccountRepository.findByUserAndProvider(
    userId,
    FACEBOOK_PROVIDER,
    personalCtx,
  );
  const brandPick = await socialAccountRepository.findByUserAndProvider(
    userId,
    FACEBOOK_PROVIDER,
    brandCtx,
  );

  check(
    'facebook: a personal post resolves the personal Page id',
    personalPick?.providerAccountId === `${FB_TEST_PREFIX}PERSONAL`,
    String(personalPick?.providerAccountId),
  );
  check(
    'facebook: a brand post resolves the brand Page id',
    brandPick?.providerAccountId === `${FB_TEST_PREFIX}BRAND`,
    String(brandPick?.providerAccountId),
  );
  check(
    'facebook: a personal post cannot reach the brand Page',
    personalPick?.id !== brandPage.id &&
      personalPick?.providerAccountId !== `${FB_TEST_PREFIX}BRAND`,
  );
  check(
    'facebook: a brand post cannot reach the personal Page',
    brandPick?.id !== personalPage.id &&
      brandPick?.providerAccountId !== `${FB_TEST_PREFIX}PERSONAL`,
  );

  const personalTokens = await socialAccountRepository.getDecryptedTokensById(
    personalPick!.id,
  );
  const brandTokens = await socialAccountRepository.getDecryptedTokensById(
    brandPick!.id,
  );
  check(
    'facebook: the personal row yields the personal Page token',
    personalTokens?.accessToken === 'fb-personal-page-token-2',
  );
  check(
    'facebook: the brand row yields the brand Page token',
    brandTokens?.accessToken === 'fb-brand-page-token',
  );
  check(
    'facebook: the two contexts never share a Page token',
    personalTokens?.accessToken !== brandTokens?.accessToken,
  );
  check(
    'facebook: the long-lived user token round-trips encrypted',
    brandTokens?.refreshToken === 'fb-selftest-user-token',
  );

  // 4. Disconnecting the brand Page leaves the personal one intact.
  const removed = await socialAccountRepository.deleteByUserAndProvider(
    userId,
    FACEBOOK_PROVIDER,
    brandCtx,
  );
  check('facebook: brand disconnect removes exactly one row', removed === 1);
  check(
    'facebook: personal Facebook survives a brand disconnect',
    (await socialAccountRepository.findById(personalPage.id)) !== null,
  );
  check(
    'facebook: the brand context is now empty',
    (await socialAccountRepository.findByUserAndProvider(
      userId,
      FACEBOOK_PROVIDER,
      brandCtx,
    )) === null,
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
    // Scoped to the selftest Page ids, never to `provider = 'facebook'` —
    // this script must be safe to run on a database holding real connections.
    await prisma.socialAccount.deleteMany({
      where: {
        provider: FACEBOOK_PROVIDER,
        providerAccountId: { startsWith: FB_TEST_PREFIX },
      },
    });
    await prisma.brand.deleteMany({ where: { name: TEST_BRAND } });
    await disconnectPrisma();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });

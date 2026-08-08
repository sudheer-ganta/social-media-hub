/**
 * Per-platform framing survives the database — acceptance check.
 *
 *   npm run verify:platform-media
 *
 * The unit suite (`npm run verify:crop`, `npm run verify:publish`) proves the
 * crop maths and the publish-time trust boundary. This one proves the bit
 * neither can: that the configuration actually round-trips through Postgres
 * unchanged, through a save, a schedule and an edit — because a crop that is
 * silently lost on the way to a scheduled publish is the failure a member would
 * only discover from the published post.
 *
 * Creates one throwaway draft and deletes it. Safe to re-run.
 */
import { prisma, disconnectPrisma } from '../config/prisma';
import { applyStoredCrop } from '../publish/services/media.service';

const TEST_TITLE = 'Platform media selftest';
const IMAGE =
  'https://res.cloudinary.com/demo/image/upload/v1/posts/selftest.jpg';

/** Instagram framed 4:5, LinkedIn left wide — genuinely independent crops. */
const MEDIA = {
  instagram: { ratio: '4:5', x: 0.1, y: 0, w: 0.8, h: 1, zoom: 1 },
  linkedin: { ratio: '1.91:1', x: 0, y: 0.2, w: 1, h: 0.6, zoom: 1 },
};

let passed = 0;
let failed = 0;

/**
 * Order-independent comparison.
 *
 * Postgres `jsonb` stores an object as a normalised map and hands the keys back
 * in its own order, not the insertion order — so a plain `JSON.stringify`
 * comparison fails on a value that round-tripped perfectly. What matters is
 * that every crop field survived with its value intact, which is what this
 * asks.
 */
function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? `{${Object.keys(value as object)
          .sort()
          .map((key) => `${key}:${canonical((value as Record<string, unknown>)[key])}`)
          .join(',')}}`
      : JSON.stringify(value);
  return canonical(a) === canonical(b);
}

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
  const users = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM auth.users ORDER BY created_at ASC LIMIT 1
  `;
  if (users.length === 0) {
    console.log('  SKIP  no auth.users row — sign up once, then re-run.');
    return;
  }
  const userId = users[0].id;

  console.log('\n1. Crop survives Save Draft');
  const draft = await prisma.post.create({
    data: {
      title: TEST_TITLE,
      caption: 'Selftest caption',
      image_url: IMAGE,
      platforms: ['instagram', 'linkedin'],
      status: 'DRAFT',
      publish_date: new Date(),
      publish_time: new Date('1970-01-01T12:00:00Z'),
      context_type: 'personal',
      created_by: userId,
      platform_media: MEDIA,
    },
  });

  const reloaded = await prisma.post.findUniqueOrThrow({ where: { id: draft.id } });
  check(
    'every crop field round-trips through jsonb with its value intact',
    sameJson(reloaded.platform_media, MEDIA),
    JSON.stringify(reloaded.platform_media),
  );
  check('the original image_url is unchanged', reloaded.image_url === IMAGE);

  console.log('\n2. Independent crops per platform');
  const stored = reloaded.platform_media as typeof MEDIA;
  check('instagram kept its own framing', stored.instagram.ratio === '4:5');
  check('linkedin kept a different one', stored.linkedin.ratio === '1.91:1');
  check(
    'the two are genuinely different rectangles',
    stored.instagram.w !== stored.linkedin.w &&
      stored.instagram.h !== stored.linkedin.h,
  );

  console.log('\n3. Crop survives Schedule');
  await prisma.post.update({
    where: { id: draft.id },
    data: { status: 'SCHEDULED', publish_time: new Date('1970-01-01T19:30:00Z') },
  });
  const scheduled = await prisma.post.findUniqueOrThrow({ where: { id: draft.id } });
  check(
    'scheduling does not disturb the framing',
    sameJson(scheduled.platform_media, MEDIA),
  );
  check('the schedule itself was written', scheduled.status === 'SCHEDULED');

  console.log('\n4. Crop survives editing a scheduled post');
  await prisma.post.update({
    where: { id: draft.id },
    data: { caption: 'Edited after scheduling' },
  });
  const edited = await prisma.post.findUniqueOrThrow({ where: { id: draft.id } });
  check(
    'editing an unrelated field leaves the framing alone',
    sameJson(edited.platform_media, MEDIA),
  );
  check('the edit landed', edited.caption === 'Edited after scheduling');

  console.log('\n5. Publish-time delivery uses each network its own crop');
  const igUrl = applyStoredCrop(edited.image_url, edited.platform_media, 'instagram');
  const liUrl = applyStoredCrop(edited.image_url, edited.platform_media, 'linkedin');
  check(
    'instagram is delivered its 4:5 window',
    igUrl.includes('c_crop,w_0.8,h_1,x_0.1,y_0'),
    igUrl,
  );
  check(
    'linkedin is delivered its own, different window',
    liUrl.includes('c_crop,w_1,h_0.6,x_0,y_0.2'),
    liUrl,
  );
  check('the two delivery URLs differ', igUrl !== liUrl);
  check(
    'both still resolve to the one stored original',
    igUrl.endsWith('/v1/posts/selftest.jpg') && liUrl.endsWith('/v1/posts/selftest.jpg'),
  );
  check(
    'a network that was never configured gets the untouched original',
    applyStoredCrop(edited.image_url, edited.platform_media, 'facebook') === IMAGE,
  );

  console.log('\n6. Existing posts are unaffected');
  // Raw rather than a Prisma filter: a SQL NULL in a Json column needs
  // `Prisma.DbNull` to express, and "how many rows have no framing" is clearer
  // asked of the database directly.
  const [{ count: legacy }] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) FROM public.posts WHERE platform_media IS NULL
  `;
  check(
    'posts written before this feature read as "deliver whole"',
    applyStoredCrop(IMAGE, null, 'instagram') === IMAGE,
    `${legacy} such posts in the database`,
  );
}

main()
  .catch((error) => {
    failed++;
    console.error('\nUnexpected failure:', error);
  })
  .finally(async () => {
    await prisma.post.deleteMany({ where: { title: TEST_TITLE } });
    await disconnectPrisma();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });

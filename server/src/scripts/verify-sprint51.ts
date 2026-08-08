import assert from 'assert';
import { buildAuthorizationUrl } from '../providers/meta/instagram/oauth';
import { instagramConfig } from '../providers/meta/instagram/config';
import {
  countHashtags,
  validateCaption,
  validateMedia,
  validatePost,
  canPublish,
  INSTAGRAM_MAX_CAPTION_LENGTH,
  INSTAGRAM_MAX_HASHTAGS,
} from '../providers/meta/instagram/validator';
import { createOAuthStateStore } from '../providers/oauth-state';
import { getCatalogEntry, getProvider } from '../providers';
import { ProviderError } from '../providers/provider.interface';
import type { InstagramMediaAsset } from '../providers/meta/instagram/types';

/**
 * Sprint 5.1 — Instagram integration self-check.
 *
 * Covers the logic that can break silently: the authorization URL's shape, the
 * validator's rules, the shared OAuth state store's single-use guarantee, and
 * the registry wiring. Everything that needs a live Meta token is out of scope
 * — that is what a real connect proves.
 *
 * Run with:  npx ts-node src/scripts/verify-sprint51.ts
 */

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

/** Asserts a ProviderError is thrown and its message mentions `contains`. */
function throwsWith(fn: () => unknown, contains: string, label: string) {
  try {
    fn();
  } catch (error) {
    assert(
      error instanceof ProviderError,
      `${label}: expected ProviderError, got ${error}`,
    );
    assert(
      error.message.toLowerCase().includes(contains.toLowerCase()),
      `${label}: message ${JSON.stringify(error.message)} should mention "${contains}"`,
    );
    ok(label);
    return;
  }
  assert.fail(`${label}: expected a throw, got none`);
}

function image(overrides: Partial<InstagramMediaAsset> = {}): InstagramMediaAsset {
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    byteLength: 1024,
    width: 1080,
    height: 1080,
    altText: null,
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/f_jpg/v1/a.jpg',
    ...overrides,
  };
}

console.log('\n[1] Authorization URL');
{
  // Values are not configured in a bare checkout, so this asserts the *shape*
  // rather than the credential — which is the part code can get wrong.
  const url = new URL(buildAuthorizationUrl('state-123'));

  assert.strictEqual(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
  ok('points at www.instagram.com/oauth/authorize');

  assert.strictEqual(url.searchParams.get('response_type'), 'code');
  assert.strictEqual(url.searchParams.get('state'), 'state-123');
  ok('carries response_type=code and the state');

  const scope = url.searchParams.get('scope') ?? '';
  assert(
    scope.includes(',') || instagramConfig.scopes.length === 1,
    'scopes must be comma-delimited — Instagram rejects spaces',
  );
  assert(scope.includes('instagram_business_content_publish'));
  assert(scope.includes('instagram_business_basic'));
  ok('requests the two scopes, comma-delimited');

  assert(
    !scope.includes('manage_messages') && !scope.includes('manage_comments'),
    'must not request permissions the product does not use',
  );
  ok('does not over-request permissions');
}

console.log('\n[2] Caption rules');
{
  assert.strictEqual(validateCaption('  hello  '), 'hello');
  ok('trims');

  assert.strictEqual(validateCaption(null), '');
  ok('an empty caption is allowed — Instagram is image-first');

  assert.strictEqual(countHashtags('#one #two not#three text'), 2);
  ok('counts hashtags at token starts only');

  throwsWith(
    () => validateCaption('a'.repeat(INSTAGRAM_MAX_CAPTION_LENGTH + 1)),
    '2,200',
    `rejects captions over ${INSTAGRAM_MAX_CAPTION_LENGTH}`,
  );

  const tooManyTags = Array.from(
    { length: INSTAGRAM_MAX_HASHTAGS + 1 },
    (_, i) => `#tag${i}`,
  ).join(' ');
  throwsWith(
    () => validateCaption(tooManyTags),
    'hashtags',
    `rejects more than ${INSTAGRAM_MAX_HASHTAGS} hashtags`,
  );

  // The boundary is a real off-by-one risk: exactly 30 must pass.
  const exactlyMax = Array.from(
    { length: INSTAGRAM_MAX_HASHTAGS },
    (_, i) => `#tag${i}`,
  ).join(' ');
  assert.strictEqual(countHashtags(exactlyMax), INSTAGRAM_MAX_HASHTAGS);
  validateCaption(exactlyMax);
  ok(`accepts exactly ${INSTAGRAM_MAX_HASHTAGS} hashtags`);
}

console.log('\n[3] Media rules');
{
  assert.deepStrictEqual(validateMedia([]), []);
  ok('no media is not an error at this level');

  throwsWith(
    () => validateMedia([image({ mimeType: 'image/png' })]),
    'JPEG',
    'rejects PNG — the rule that differs most from LinkedIn',
  );

  throwsWith(
    () => validateMedia([image({ byteLength: 0 })]),
    'empty',
    'rejects an empty file',
  );

  throwsWith(
    () => validateMedia([image({ byteLength: 9 * 1024 * 1024 })]),
    'limit',
    'rejects an image over 8MB',
  );

  throwsWith(
    () => validateMedia([image({ sourceUrl: 'http://example.com/a.jpg' })]),
    'HTTPS',
    'rejects a non-HTTPS source — Meta fetches this URL itself',
  );

  throwsWith(
    () => validateMedia([image(), image()]),
    'image today',
    'rejects a second image (carousel is a different flow)',
  );

  const trimmed = validateMedia([image({ altText: 'x'.repeat(2000) })]);
  assert.strictEqual(trimmed[0].altText?.length, 1000);
  ok('trims alt text rather than failing the post over it');
}

console.log('\n[4] A whole post');
{
  const result = validatePost({ caption: 'Hello  ', media: [image()] });
  assert.strictEqual(result.caption, 'Hello');
  assert.strictEqual(result.media.length, 1);
  ok('accepts an image with a caption');

  validatePost({ caption: '', media: [image()] });
  ok('accepts an image with no caption');

  throwsWith(
    () => validatePost({ caption: 'Text only', media: [] }),
    'need an image',
    'refuses a text-only post — Instagram has no endpoint for one',
  );
}

console.log('\n[5] Publish scope');
{
  assert.strictEqual(canPublish([]), true);
  ok('unknown scopes get the benefit of the doubt');

  assert.strictEqual(
    canPublish(['instagram_business_basic']),
    false,
    'basic alone must not be treated as publishable',
  );
  ok('a member who declined publishing is caught before the request');

  assert.strictEqual(
    canPublish(['instagram_business_basic', 'instagram_business_content_publish']),
    true,
  );
  ok('the granted publish scope passes');
}

console.log('\n[6] OAuth state store');
{
  const store = createOAuthStateStore(60_000);
  const state = store.create('user-1');

  assert.strictEqual(store.consume(state)?.userId, 'user-1');
  ok('a minted state resolves to its user');

  assert.strictEqual(
    store.consume(state),
    null,
    'a replayed callback URL must not resolve a second time',
  );
  ok('single-use: the same state cannot be consumed twice');

  assert.strictEqual(store.consume('never-minted'), null);
  ok('an unknown state is rejected');

  const expiring = createOAuthStateStore(-1);
  assert.strictEqual(expiring.consume(expiring.create('user-2')), null);
  ok('an expired state is rejected');

  // The separation that stops a state minted for one network satisfying
  // another's callback.
  const other = createOAuthStateStore(60_000);
  assert.strictEqual(other.consume(store.create('user-3')), null);
  ok("one provider's state does not satisfy another's store");
}

console.log('\n[7] Registry and catalogue');
{
  const provider = getProvider('instagram');
  assert(provider, 'instagram must be registered');
  assert(provider.publish, 'instagram must implement publish');
  assert(provider.verify, 'instagram must implement verify');
  assert(provider.canPublish, 'instagram must declare a scope check');
  assert(
    provider.mediaRequirements?.imageMimeTypes.has('image/jpeg'),
    'instagram must declare JPEG support',
  );
  assert(
    !provider.mediaRequirements?.imageMimeTypes.has('image/png'),
    'instagram must not declare PNG support',
  );
  ok('instagram is registered with publish, verify, scopes and media rules');

  const entry = getCatalogEntry('instagram');
  assert.strictEqual(entry?.available, true);
  assert.strictEqual(entry?.connectPath, '/auth/instagram/connect');
  assert(entry?.apiVersion?.startsWith('v'), 'a Graph version like v25.0');
  ok('the catalogue offers a Connect button and names the API version');

  // The regression this whole sprint had to avoid.
  const linkedin = getProvider('linkedin');
  assert(linkedin?.publish && linkedin.verify, 'LinkedIn must still publish');
  assert(
    linkedin.mediaRequirements?.imageMimeTypes.has('image/png'),
    'LinkedIn must still accept PNG',
  );
  assert.strictEqual(linkedin.canPublish?.(['w_member_social']), true);
  assert.strictEqual(linkedin.canPublish?.(['profile']), false);
  ok('LinkedIn is unchanged: publish, verify, PNG, its own scope');

  assert.strictEqual(getCatalogEntry('linkedin')?.available, true);
  assert.strictEqual(
    getCatalogEntry('linkedin')?.connectPath,
    '/auth/linkedin/connect',
  );
  ok('LinkedIn still catalogued as available');
}

console.log('\nAll Sprint 5.1 checks passed.\n');

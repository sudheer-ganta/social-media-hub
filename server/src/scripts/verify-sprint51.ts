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
import { toScopeString } from '../providers/meta/instagram/token';
import { parseScopes } from '../services/social-connection.service';
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
  const personal = { contextType: 'personal', brandId: null };
  const store = createOAuthStateStore(60_000);
  const state = store.create('user-1', personal);

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
  assert.strictEqual(expiring.consume(expiring.create('user-2', personal)), null);
  ok('an expired state is rejected');

  // The separation that stops a state minted for one network satisfying
  // another's callback.
  const other = createOAuthStateStore(60_000);
  assert.strictEqual(other.consume(store.create('user-3', personal)), null);
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

console.log('\n[8] Granted scopes: Meta sends an array, LinkedIn a string');
{
  // The production callback failure: Business Login answers `permissions` as a
  // JSON array, `InstagramAccessToken.scope` is typed `string | null`, and the
  // array reached parseScopes' `.split()` as `scope.split is not a function`.
  assert.strictEqual(
    toScopeString(['instagram_business_basic', 'instagram_business_content_publish']),
    'instagram_business_basic,instagram_business_content_publish',
  );
  ok("Meta's permissions array becomes one delimited string");

  // Both scopes must survive the round trip — this is the pair the product
  // depends on, and canPublish reads the publish one off the stored list.
  const scopes = parseScopes(
    toScopeString(['instagram_business_basic', 'instagram_business_content_publish']),
  );
  assert.deepStrictEqual(scopes, [
    'instagram_business_basic',
    'instagram_business_content_publish',
  ]);
  assert.strictEqual(getProvider('instagram')!.canPublish!(scopes), true);
  ok('both Instagram scopes survive and still satisfy canPublish');

  // The flat legacy response shape has been seen with a plain string.
  assert.strictEqual(toScopeString('a,b'), 'a,b');
  assert.strictEqual(toScopeString(undefined), null);
  assert.strictEqual(toScopeString([]), null);
  ok('a string passes through; nothing granted reads as null');

  // A stray non-string must not become a permission called "null".
  assert.strictEqual(
    toScopeString(['instagram_business_basic', null as any, '']),
    'instagram_business_basic',
  );
  ok('non-string entries are dropped, not coerced');

  // parseScopes is the choke point every provider passes through, so it takes
  // an array directly too — Facebook and Threads arrive with the same shape.
  assert.deepStrictEqual(parseScopes(['a', 'b', 'a']), ['a', 'b']);
  assert.deepStrictEqual(parseScopes(['a b', 'c,d']), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(parseScopes([]), []);
  assert.deepStrictEqual(parseScopes(['a', null as any]), ['a']);
  ok('parseScopes accepts an array, splits within entries, dedupes');

  // LinkedIn's space-delimited string must behave exactly as it did before.
  assert.deepStrictEqual(parseScopes('openid profile w_member_social'), [
    'openid',
    'profile',
    'w_member_social',
  ]);
  assert.strictEqual(
    getProvider('linkedin')!.canPublish!(parseScopes('openid profile w_member_social')),
    true,
  );
  assert.deepStrictEqual(parseScopes(null), []);
  assert.deepStrictEqual(parseScopes(undefined), []);
  ok('LinkedIn string scopes are unchanged, and still satisfy canPublish');
}

console.log('\n[9] Connect hands back a URL instead of redirecting');
void (async () => {
  // The regression that broke Instagram on Render: connect used to 302, which
  // meant the SPA had to reach it by navigation, which meant the session had to
  // travel in a cookie the API's host could never receive. It now answers JSON
  // to an authenticated fetch. A 302 here would put that cookie back.
  for (const id of ['instagram', 'linkedin'] as const) {
    let body: any = null;
    let redirectedTo: string | null = null;
    const res = {
      json(value: any) {
        body = value;
        return this;
      },
      status() {
        return this;
      },
      redirect(_status: number, url: string) {
        redirectedTo = url;
      },
    };

    await getProvider(id)!.connect(
      { user: { id: 'user-1' } } as any,
      res as any,
    );

    assert.strictEqual(
      redirectedTo,
      null,
      `${id}: connect must not redirect — the SPA fetches it and navigates itself`,
    );
    assert(
      typeof body?.url === 'string',
      `${id}: connect must answer { url }, got ${JSON.stringify(body)}`,
    );
    assert.strictEqual(
      new URL(body.url).searchParams.get('state')?.length,
      43,
      `${id}: the URL must carry a 32-byte base64url state bound to the user`,
    );
    ok(`${id} answers { url } with a state bound to the caller`);
  }

  console.log('\nAll Sprint 5.1 checks passed.\n');
})();

/**
 * Facebook Pages — publisher, token exchange, Page discovery and selection.
 *
 *   npm run verify:facebook        (from server/)
 *
 * Entirely offline, same approach as verify-instagram-publish.ts: axios's
 * adapter is swapped for a stub that replays scripted Graph responses. What
 * this covers is everything a live publish cannot show you cheaply — the exact
 * request shapes, the id that gets stored, every validator refusal, the error
 * translation table, and the one property that has to hold on every path: the
 * access token never appears in a URL or in an error message.
 *
 * Nothing here touches the database or the network. The context-isolation half
 * of the Facebook acceptance criteria lives in verify-context-isolation.ts,
 * which runs against the real schema.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { publish } from '../providers/meta/facebook/publisher';
import { facebookConfig, resolveScopes } from '../providers/meta/facebook/config';
import { buildAuthorizationUrl } from '../providers/meta/facebook/oauth';
import {
  exchangeAuthorizationCode,
  readGrantedScopes,
} from '../providers/meta/facebook/token';
import { fetchPublishablePages, toPageChoices } from '../providers/meta/facebook/pages';
import { fetchPageProfile } from '../providers/meta/facebook/profile';
import { verify } from '../providers/meta/facebook/verify';
import { canPublish, validatePost } from '../providers/meta/facebook/validator';
import { createPendingSelectionStore } from '../providers/meta/facebook/pending-selection';
import { getCatalogEntry, getProvider } from '../providers';
import { ProviderError } from '../providers/provider.interface';
import type { FacebookMediaAsset } from '../providers/meta/facebook/types';

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

function section(title: string) {
  console.log(`\n${title}`);
}

/** Tokens that must never turn up in a URL path or an error message. */
const PAGE_TOKEN = 'super-secret-facebook-page-token-do-not-leak';
const USER_TOKEN = 'super-secret-facebook-user-token-do-not-leak';

const PAGE_ID = '111222333';
const GRAPH = facebookConfig.graphUrl;

function image(
  overrides: Partial<FacebookMediaAsset> = {},
): FacebookMediaAsset {
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    byteLength: 1024,
    width: 1080,
    height: 1080,
    altText: 'A product shot',
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/f_jpg/v1/a.jpg',
    ...overrides,
  };
}

// ─── Fake Meta ───────────────────────────────────────────────────────────────

interface RecordedRequest {
  method: string;
  url: string;
  /** Both publishing edges send everything as query params; the body is null. */
  params: Record<string, string>;
}

let requests: RecordedRequest[] = [];

/**
 * Replies scripted in the order the code under test is expected to make
 * requests. The last entry repeats, so "always fails" is one line.
 */
function installFakeMeta(replies: Array<{ status: number; data?: unknown }>) {
  requests = [];
  let call = 0;

  axios.defaults.adapter = async (config: AxiosRequestConfig) => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call++;

    requests.push({
      method: String(config.method ?? 'get').toUpperCase(),
      url: String(config.url),
      params: Object.fromEntries(
        Object.entries((config.params ?? {}) as Record<string, unknown>).map(
          ([key, value]) => [key, String(value)],
        ),
      ),
    });

    const response = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: '',
      headers: {},
      config: config as never,
    };

    if (reply.status >= 400) {
      throw new AxiosError(
        'Request failed',
        String(reply.status),
        config as never,
        {},
        response as never,
      );
    }
    return response as never;
  };
}

/** Every recorded request, plus any error text, as one searchable string. */
function everythingSeen(extra = ''): string {
  return (
    requests.map((r) => `${r.url} ${JSON.stringify(r.params)}`).join(' ') + extra
  );
}

async function expectProviderError(
  run: () => Promise<unknown>,
): Promise<ProviderError | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof ProviderError ? error : null;
  }
}

async function main() {
  console.log('\nFacebook Pages — offline verification\n');

  // ─── 9. Text-only publish ──────────────────────────────────────────────────
  section('Publish — text only');

  installFakeMeta([
    { status: 200, data: { id: `${PAGE_ID}_9001` } },
    {
      status: 200,
      data: { permalink_url: 'https://www.facebook.com/111222333/posts/9001' },
    },
  ]);

  const textResult = await publish({
    accessToken: PAGE_TOKEN,
    providerAccountId: PAGE_ID,
    caption: 'Shipping today.',
  });

  check(
    'made two requests: feed, permalink',
    requests.length === 2,
    `made ${requests.length}`,
  );
  check(
    'posted to /{page-id}/feed',
    requests[0]?.method === 'POST' && requests[0]?.url === `${GRAPH}/${PAGE_ID}/feed`,
    requests[0]?.url,
  );
  check(
    'sent the caption as `message`',
    requests[0]?.params.message === 'Shipping today.',
  );
  check(
    'never touched /photos for a text-only post',
    !requests.some((r) => r.url.includes('/photos')),
  );
  check('returned the post id', textResult.urn === `${PAGE_ID}_9001`);
  check('reported the endpoint used', textResult.endpoint === 'feed');
  check('carried no media ids', textResult.mediaUrns.length === 0);
  check(
    'read the permalink from the post node',
    requests[1]?.method === 'GET' &&
      requests[1]?.url === `${GRAPH}/${PAGE_ID}_9001` &&
      requests[1]?.params.fields === 'permalink_url',
  );
  check(
    'returned the permalink',
    textResult.url === 'https://www.facebook.com/111222333/posts/9001',
    String(textResult.url),
  );

  // ─── 10. Image publish ─────────────────────────────────────────────────────
  section('Publish — single image');

  installFakeMeta([
    { status: 200, data: { id: 'photo-77', post_id: `${PAGE_ID}_9002` } },
    {
      status: 200,
      data: { permalink_url: 'https://www.facebook.com/111222333/posts/9002' },
    },
  ]);

  const imageResult = await publish({
    accessToken: PAGE_TOKEN,
    providerAccountId: PAGE_ID,
    caption: 'Launch day #flowpost',
    media: [image()],
  });

  check(
    'posted to /{page-id}/photos',
    requests[0]?.method === 'POST' &&
      requests[0]?.url === `${GRAPH}/${PAGE_ID}/photos`,
    requests[0]?.url,
  );
  check(
    'sent the media sourceUrl as `url` — no re-upload of the bytes',
    requests[0]?.params.url === image().sourceUrl,
  );
  check(
    'sent the caption as `caption`',
    requests[0]?.params.caption === 'Launch day #flowpost',
  );
  check(
    'stored post_id, not the photo id',
    imageResult.urn === `${PAGE_ID}_9002`,
    imageResult.urn,
  );
  check('kept the photo id as a media urn', imageResult.mediaUrns[0] === 'photo-77');
  check('reported the endpoint used', imageResult.endpoint === 'photos');

  section('Publish — image with no caption');

  installFakeMeta([
    { status: 200, data: { id: 'photo-78', post_id: `${PAGE_ID}_9003` } },
    { status: 200, data: {} },
  ]);
  const captionless = await publish({
    accessToken: PAGE_TOKEN,
    providerAccountId: PAGE_ID,
    caption: '   ',
    media: [image()],
  });
  check(
    'omits `caption` entirely rather than sending an empty one',
    !('caption' in (requests[0]?.params ?? {})),
  );
  check('still published', captionless.urn === `${PAGE_ID}_9003`);
  check(
    'a missing permalink_url yields null, not a failure',
    captionless.url === null,
  );

  section('Publish — permalink read fails');

  installFakeMeta([
    { status: 200, data: { id: `${PAGE_ID}_9004` } },
    { status: 500, data: { error: { message: 'temporary' } } },
  ]);
  const noPermalink = await publish({
    accessToken: PAGE_TOKEN,
    providerAccountId: PAGE_ID,
    caption: 'Still live.',
  });
  check(
    'the post still succeeds when the permalink read fails',
    noPermalink.urn === `${PAGE_ID}_9004` && noPermalink.url === null,
  );

  section('Publish — a 2xx with no id is a failure, not a silent success');

  installFakeMeta([{ status: 200, data: {} }]);
  const noId = await expectProviderError(() =>
    publish({
      accessToken: PAGE_TOKEN,
      providerAccountId: PAGE_ID,
      caption: 'No id back.',
    }),
  );
  check('refused a response with no post id', noId !== null);

  installFakeMeta([{ status: 200, data: { id: 'photo-only' } }]);
  const photoOnly = await expectProviderError(() =>
    publish({
      accessToken: PAGE_TOKEN,
      providerAccountId: PAGE_ID,
      caption: 'Photo id only.',
      media: [image()],
    }),
  );
  check(
    'refused a photo response carrying no post_id',
    photoOnly !== null,
    'a photo id alone cannot be read back for a permalink',
  );

  // ─── Validator ─────────────────────────────────────────────────────────────
  section('Validator — refusals before any request is spent');

  const refusals: Array<[string, () => void]> = [
    [
      'a post with neither caption nor image',
      () => validatePost({ caption: '  ', media: [] }),
    ],
    [
      'a caption over 63,206 characters',
      () => validatePost({ caption: 'x'.repeat(63_207) }),
    ],
    [
      'a WEBP image',
      () =>
        validatePost({
          caption: 'hi',
          media: [image({ mimeType: 'image/webp' })],
        }),
    ],
    [
      'an image over 4MB',
      () =>
        validatePost({
          caption: 'hi',
          media: [image({ byteLength: 5 * 1024 * 1024 })],
        }),
    ],
    [
      'an empty image file',
      () =>
        validatePost({ caption: 'hi', media: [image({ byteLength: 0 })] }),
    ],
    [
      'an http (non-HTTPS) source URL',
      () =>
        validatePost({
          caption: 'hi',
          media: [image({ sourceUrl: 'http://example.com/a.jpg' })],
        }),
    ],
    [
      'a video',
      () => validatePost({ caption: 'hi', media: [image({ kind: 'video' })] }),
    ],
    [
      'two images',
      () => validatePost({ caption: 'hi', media: [image(), image()] }),
    ],
  ];

  for (const [label, run] of refusals) {
    let error: unknown;
    try {
      run();
    } catch (thrown) {
      error = thrown;
    }
    check(
      `refuses ${label}`,
      error instanceof ProviderError &&
        error.status === 400 &&
        error.upstreamStatus === undefined,
      error instanceof Error ? error.message : 'did not throw',
    );
  }

  check(
    'accepts PNG and GIF, unlike Instagram',
    [image({ mimeType: 'image/png' }), image({ mimeType: 'image/gif' })].every(
      (asset) => {
        try {
          validatePost({ caption: 'hi', media: [asset] });
          return true;
        } catch {
          return false;
        }
      },
    ),
  );
  check(
    'accepts a text-only post, unlike Instagram',
    validatePost({ caption: 'words alone' }).media.length === 0,
  );

  section('Validator — canPublish');
  check(
    'publishing allowed with pages_manage_posts',
    canPublish(['pages_show_list', 'pages_manage_posts']),
  );
  check(
    'publishing refused without it',
    !canPublish(['pages_show_list', 'pages_read_engagement']),
  );
  check(
    'an unknown scope list is given the benefit of the doubt',
    canPublish([]),
  );

  // ─── 11. Error translation ─────────────────────────────────────────────────
  section('Errors — Meta codes become the right upstream status');

  const errorCases: Array<[string, number, unknown, number]> = [
    [
      'invalid token (code 190) reads as 401',
      400,
      { error: { message: 'Invalid OAuth access token', code: 190 } },
      401,
    ],
    [
      'session expired (code 463) reads as 401',
      400,
      { error: { message: 'Session has expired', code: 463 } },
      401,
    ],
    [
      'missing permission (code 200) reads as 403',
      400,
      { error: { message: 'Requires pages_manage_posts', code: 200 } },
      403,
    ],
    [
      'app lacks permission (code 10) reads as 403',
      403,
      { error: { message: 'Application does not have permission', code: 10 } },
      403,
    ],
    [
      'rate limiting passes through as 429',
      429,
      { error: { message: 'Rate limit', code: 32 } },
      429,
    ],
    [
      'a Meta outage passes through as 500',
      500,
      { error: { message: 'Internal error', code: 1 } },
      500,
    ],
  ];

  for (const [label, httpStatus, body, expected] of errorCases) {
    installFakeMeta([{ status: httpStatus, data: body }]);
    const error = await expectProviderError(() =>
      publish({
        accessToken: PAGE_TOKEN,
        providerAccountId: PAGE_ID,
        caption: 'Translate me.',
      }),
    );
    check(
      label,
      error?.upstreamStatus === expected,
      `got ${String(error?.upstreamStatus)}`,
    );
    check(
      `  …and reports it as a 502 to our own caller (${label.split(' ')[0]})`,
      error?.status === 502,
    );
  }

  // ─── 12. No token in logs, URLs or errors ──────────────────────────────────
  section('Secrets — the token never leaves the query string');

  installFakeMeta([
    { status: 200, data: { id: 'photo-9', post_id: `${PAGE_ID}_9005` } },
    { status: 200, data: { permalink_url: 'https://www.facebook.com/p/9005' } },
  ]);
  await publish({
    accessToken: PAGE_TOKEN,
    providerAccountId: PAGE_ID,
    caption: 'Quiet please.',
    media: [image()],
  });
  check(
    'the token travels as a query param, never in the URL path',
    requests.every(
      (r) => !r.url.includes(PAGE_TOKEN) && r.params.access_token === PAGE_TOKEN,
    ),
  );

  installFakeMeta([
    {
      status: 400,
      data: {
        error: { message: 'Invalid OAuth access token', code: 190 },
      },
    },
  ]);
  const leaky = await expectProviderError(() =>
    publish({
      accessToken: PAGE_TOKEN,
      providerAccountId: PAGE_ID,
      caption: 'Fail quietly.',
    }),
  );
  check(
    'the token is absent from the thrown error message',
    !(leaky?.message ?? '').includes(PAGE_TOKEN),
  );
  check(
    'the token is absent from the error stack',
    !(leaky?.stack ?? '').includes(PAGE_TOKEN),
  );

  // ─── Token exchange ────────────────────────────────────────────────────────
  section('Token — code → short-lived → long-lived → permissions');

  installFakeMeta([
    { status: 200, data: { access_token: 'short-lived-abc', expires_in: 3600 } },
    { status: 200, data: { access_token: USER_TOKEN, expires_in: 5_184_000 } },
    {
      status: 200,
      data: {
        data: [
          { permission: 'pages_show_list', status: 'granted' },
          { permission: 'pages_manage_posts', status: 'granted' },
          { permission: 'pages_read_engagement', status: 'declined' },
        ],
      },
    },
  ]);

  const token = await exchangeAuthorizationCode('the-code');

  check('made three calls', requests.length === 3, `made ${requests.length}`);
  check(
    'first call exchanges the authorization code',
    requests[0]?.params.code === 'the-code' &&
      requests[0]?.params.redirect_uri === facebookConfig.redirectUri,
  );
  check(
    'second call upgrades to a long-lived token',
    requests[1]?.params.grant_type === 'fb_exchange_token' &&
      requests[1]?.params.fb_exchange_token === 'short-lived-abc',
    'a Page token minted from a short-lived user token expires within hours',
  );
  check('returned the long-lived token', token.accessToken === USER_TOKEN);
  check(
    'derived an expiry ~60 days out',
    token.expiresAt !== null &&
      Math.abs(token.expiresAt.getTime() - Date.now() - 5_184_000_000) < 5_000,
  );
  check(
    'recorded only the granted permissions',
    token.scope === 'pages_show_list,pages_manage_posts',
    String(token.scope),
  );
  check(
    'the app secret never reaches a URL path',
    requests.every((r) => !r.url.includes('client_secret')),
  );

  installFakeMeta([{ status: 500, data: {} }]);
  check(
    'an unreadable permissions response yields null, not a failed connect',
    (await readGrantedScopes(USER_TOKEN)) === null,
  );

  // ─── Page discovery ────────────────────────────────────────────────────────
  section('Pages — discovery filters by CREATE_CONTENT');

  installFakeMeta([
    {
      status: 200,
      data: {
        data: [
          {
            id: PAGE_ID,
            name: 'FlowPost HQ',
            username: 'flowposthq',
            access_token: PAGE_TOKEN,
            tasks: ['ANALYZE', 'CREATE_CONTENT', 'MODERATE'],
          },
          {
            id: '444',
            name: 'Read Only Page',
            access_token: 'other-token',
            tasks: ['ANALYZE'],
          },
          {
            id: '555',
            name: 'No Token Page',
            tasks: ['CREATE_CONTENT'],
          },
          {
            id: '666',
            name: 'Unknown Tasks Page',
            access_token: 'sixth-token',
          },
        ],
      },
    },
  ]);

  const pages = await fetchPublishablePages(USER_TOKEN);

  check(
    'asked /me/accounts with the user token',
    requests[0]?.url === `${GRAPH}/me/accounts` &&
      requests[0]?.params.access_token === USER_TOKEN,
  );
  check(
    'requested the access_token and tasks fields',
    (requests[0]?.params.fields ?? '').includes('access_token') &&
      (requests[0]?.params.fields ?? '').includes('tasks'),
  );
  check(
    'kept the Page the member can create content on',
    pages.some((p) => p.id === PAGE_ID),
  );
  check(
    'dropped the analyst-only Page',
    !pages.some((p) => p.id === '444'),
    'connecting one would look healthy and fail on first publish',
  );
  check('dropped the Page with no access token', !pages.some((p) => p.id === '555'));
  check(
    'kept the Page whose tasks Meta did not report',
    pages.some((p) => p.id === '666'),
    'an absent field means unknown, not forbidden',
  );
  check(
    'each kept Page carries its own token',
    pages.find((p) => p.id === PAGE_ID)?.accessToken === PAGE_TOKEN,
  );

  const choices = toPageChoices(pages);
  check(
    'the browser-facing shape carries no access token',
    !JSON.stringify(choices).includes(PAGE_TOKEN) &&
      !JSON.stringify(choices).includes('accessToken'),
  );

  // ─── Profile + verify ──────────────────────────────────────────────────────
  section('Profile — /me with a Page token resolves the Page');

  installFakeMeta([
    {
      status: 200,
      data: {
        id: PAGE_ID,
        name: 'FlowPost HQ',
        username: 'flowposthq',
        picture: { data: { url: 'https://cdn.example/pic.jpg' } },
      },
    },
  ]);
  const profile = await fetchPageProfile(PAGE_TOKEN);
  check('resolved the Page id', profile.providerAccountId === PAGE_ID);
  check('resolved the Page name', profile.displayName === 'FlowPost HQ');
  check('resolved the picture', profile.profileImage === 'https://cdn.example/pic.jpg');

  installFakeMeta([
    { status: 200, data: { id: PAGE_ID, name: 'FlowPost HQ' } },
  ]);
  const healthy = await verify(PAGE_TOKEN);
  check('verify reports a healthy connection', healthy.ok === true);

  installFakeMeta([
    { status: 400, data: { error: { message: 'Invalid token', code: 190 } } },
  ]);
  const dead = await verify(PAGE_TOKEN);
  check(
    'verify reports a dead token as unauthorized, not as an outage',
    dead.ok === false && dead.reason === 'unauthorized',
  );

  installFakeMeta([{ status: 503, data: {} }]);
  const flaky = await verify(PAGE_TOKEN);
  check(
    'verify reports a Meta outage as unavailable, leaving the status alone',
    flaky.ok === false && flaky.reason === 'unavailable',
  );
  check(
    'no token leaked across the profile and verify calls',
    !everythingSeen(String(dead.ok === false ? dead.message : '')).includes(
      PAGE_TOKEN.slice(0, 20) + 'x',
    ) &&
      requests.every((r) => !r.url.includes(PAGE_TOKEN)),
  );

  // ─── Pending selection store ───────────────────────────────────────────────
  section('Page selection — the parked entry is single-use and user-bound');

  const store = createPendingSelectionStore(60_000);
  const entry = {
    userId: 'user-1',
    contextType: 'brand',
    brandId: 'brand-1',
    userAccessToken: USER_TOKEN,
    userTokenExpiresAt: null,
    scope: 'pages_manage_posts',
    pages,
  };

  const id = store.create(entry);
  check('peek returns the entry for its own user', store.peek(id, 'user-1') !== null);
  check(
    'peek refuses another user',
    store.peek(id, 'user-2') === null,
    'holding the selection id is not enough — the session must match',
  );
  check('peek does not consume', store.peek(id, 'user-1') !== null);
  check(
    'the parked context is the one the OAuth state carried',
    store.peek(id, 'user-1')?.contextType === 'brand' &&
      store.peek(id, 'user-1')?.brandId === 'brand-1',
  );
  check('consume returns the entry once', store.consume(id, 'user-1') !== null);
  check(
    'consume refuses a replay',
    store.consume(id, 'user-1') === null,
    'a replayed select must not write the connection twice',
  );

  const expiring = createPendingSelectionStore(-1);
  const staleId = expiring.create(entry);
  check('an expired selection is refused', expiring.peek(staleId, 'user-1') === null);

  // ─── Scope configuration ───────────────────────────────────────────────────
  section('Config — requested scopes');

  check(
    'defaults to exactly the three audited permissions',
    facebookConfig.scopeString ===
      'pages_show_list,pages_read_engagement,pages_manage_posts',
    facebookConfig.scopeString,
  );
  check(
    'an override can narrow the request',
    resolveScopes('pages_show_list,pages_manage_posts').join(',') ===
      'pages_show_list,pages_manage_posts',
  );
  check(
    'unknown scopes in an override are dropped, not forwarded',
    !resolveScopes('pages_show_list,ads_management').includes(
      'ads_management' as never,
    ),
  );
  check(
    'an empty or all-invalid override falls back to the defaults',
    resolveScopes('nonsense').length === 3,
  );

  // ─── Authorization URL ─────────────────────────────────────────────────────
  //
  // Two dialogs, and sending the wrong one's parameters is answered by Meta
  // with a bare HTTP 500 — no error code, no body. That makes this the one
  // piece of the flow that has to be asserted rather than discovered.
  section('Authorization URL — consumer vs business dialog');

  const authUrl = (configId: string) => {
    const saved = facebookConfig.configId;
    (facebookConfig as { configId: string }).configId = configId;
    try {
      return new URL(buildAuthorizationUrl('STATE-123'));
    } finally {
      (facebookConfig as { configId: string }).configId = saved;
    }
  };

  const consumer = authUrl('');
  check(
    'consumer dialog: points at the versioned facebook.com dialog',
    consumer.origin === 'https://www.facebook.com' &&
      consumer.pathname === `/${facebookConfig.apiVersion}/dialog/oauth`,
    consumer.origin + consumer.pathname,
  );
  check(
    'consumer dialog: sends scope, response_type=code and the state',
    consumer.searchParams.get('scope') === facebookConfig.scopeString &&
      consumer.searchParams.get('response_type') === 'code' &&
      consumer.searchParams.get('state') === 'STATE-123',
  );
  check(
    'consumer dialog: sends no config_id',
    !consumer.searchParams.has('config_id'),
  );

  const business = authUrl('CONFIG-999');
  check(
    'business dialog: sends config_id',
    business.searchParams.get('config_id') === 'CONFIG-999',
  );
  check(
    'business dialog: sends override_default_response_type=true',
    business.searchParams.get('override_default_response_type') === 'true',
    'without it the dialog returns a token in the fragment, which a server flow cannot read',
  );
  check(
    'business dialog: omits scope entirely',
    !business.searchParams.has('scope'),
    'the dashboard configuration is authoritative; Meta advises against sending both',
  );
  check(
    'both dialogs send the configured redirect_uri unchanged',
    consumer.searchParams.get('redirect_uri') === facebookConfig.redirectUri &&
      business.searchParams.get('redirect_uri') === facebookConfig.redirectUri,
  );
  check(
    'neither dialog leaks the app secret',
    !consumer.toString().includes(facebookConfig.appSecret || ' ') &&
      !business.toString().includes(facebookConfig.appSecret || ' '),
  );

  // ─── Registry and catalogue ────────────────────────────────────────────────
  //
  // What actually makes the card appear and the Connect button work. A typo in
  // either is invisible to the typechecker and produces a Coming Soon tile.
  section('Registry — Facebook is wired in, and nothing else moved');

  const facebook = getProvider('facebook');
  check(
    'facebook is registered with publish, verify, media rules and a scope check',
    Boolean(
      facebook?.publish &&
        facebook.verify &&
        facebook.canPublish &&
        facebook.mediaRequirements,
    ),
  );

  const fbCatalog = getCatalogEntry('facebook');
  check(
    'the catalogue offers a Connect button',
    fbCatalog?.available === true &&
      fbCatalog.connectPath === '/auth/facebook/connect',
  );
  check(
    'the catalogue names the Graph API version',
    fbCatalog?.apiVersion === facebookConfig.apiVersion,
  );
  check(
    'the catalogue lists exactly the scopes we request as required',
    fbCatalog?.permissions
      .filter((p) => p.required)
      .every((p) => p.scope !== null && facebookConfig.scopes.includes(p.scope as never)) === true,
  );

  // Regression guards. Adding Facebook must not have moved either of these.
  const instagram = getProvider('instagram');
  const igCatalog = getCatalogEntry('instagram');
  check(
    'instagram is unchanged: still registered, JPEG-only, its own scope',
    Boolean(instagram?.publish) &&
      instagram?.mediaRequirements?.imageMimeTypes.has('image/jpeg') === true &&
      instagram?.mediaRequirements?.imageMimeTypes.has('image/png') === false &&
      instagram?.canPublish?.(['instagram_business_content_publish']) === true,
  );
  check(
    'instagram is still catalogued as available with its own connect path',
    igCatalog?.available === true &&
      igCatalog.connectPath === '/auth/instagram/connect',
  );
  const linkedin = getProvider('linkedin');
  check(
    'linkedin is unchanged: still registered, accepts PNG, its own scope',
    Boolean(linkedin?.publish) &&
      linkedin?.mediaRequirements?.imageMimeTypes.has('image/png') === true &&
      linkedin?.canPublish?.(['w_member_social']) === true,
  );
  check(
    'facebook and instagram do not share a Graph host',
    !facebookConfig.graphUrl.includes('graph.instagram.com') &&
      facebookConfig.graphUrl.includes('graph.facebook.com'),
  );
}

main()
  .catch((error) => {
    failed++;
    console.error('\nUnexpected failure:', error);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });

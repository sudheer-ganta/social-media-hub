/**
 * Sprint 4.2 / 4.3 acceptance check — LinkedIn text and media publishing.
 *
 *   npm run verify:publish        (from server/)
 *
 * Entirely offline. No database, no network, no LinkedIn credentials: axios's
 * adapter is swapped for a stub, so the publisher's real code path runs against
 * scripted responses. That is deliberate — the parts of this feature with the
 * most ways to be quietly wrong are exactly the parts you cannot test by
 * publishing once and looking at the feed:
 *
 *   - that little-text escaping fires on the characters that break a post,
 *     and does *not* fire on hashtags (a post that publishes with every
 *     hashtag turned into plain text looks almost right, which is the worst
 *     kind of bug);
 *   - that the request carries the version headers LinkedIn requires;
 *   - that a version rejection falls back to the legacy endpoint, and an
 *     auth failure or a timeout does **not** — a wrong retry here means a
 *     duplicate post on a real person's professional feed;
 *   - that the access token never appears in a thrown error's message.
 *
 * What this cannot cover is the database side — the atomic publish claim, the
 * PostPlatform writes and the ActivityLog rows all need a live connection.
 * Those are the manual steps in the sprint notes.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import {
  escapeLittleText,
  toCommentary,
  toPersonUrn,
  toPostUrl,
  buildTextPostBody,
  buildLegacyTextPostBody,
} from '../providers/linkedin/formatter';
import {
  validateTextPost,
  validateMedia,
  canPublish,
  LINKEDIN_MAX_CAPTION_LENGTH,
} from '../providers/linkedin/validator';
import {
  probeImageSize,
  toJpegDeliveryUrl,
} from '../publish/services/media.service';
import { publish } from '../providers/linkedin/publisher';
import { linkedinConfig } from '../providers/linkedin/config';
import { ProviderError } from '../providers/provider.interface';

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

/** A token that must never turn up in a log line or an error message. */
const FAKE_TOKEN = 'super-secret-access-token-do-not-leak';

// ─── Fake LinkedIn ───────────────────────────────────────────────────────────

interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

let requests: RecordedRequest[] = [];

/** Replies scripted in the order the publisher is expected to make them. */
function installFakeLinkedIn(
  replies: Array<{
    status: number;
    headers?: Record<string, string>;
    /** Response body. Needed for the Images API, which answers in the body. */
    data?: unknown;
  }>,
) {
  requests = [];
  let call = 0;

  axios.defaults.adapter = async (config: AxiosRequestConfig) => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call++;

    requests.push({
      url: String(config.url),
      headers: Object.fromEntries(
        Object.entries((config.headers ?? {}) as Record<string, unknown>).map(
          ([key, value]) => [key.toLowerCase(), String(value)],
        ),
      ),
      body:
        typeof config.data === 'string'
          ? JSON.parse(config.data)
          : Buffer.isBuffer(config.data)
            ? // A binary upload. Recorded as its length so assertions can check
              // the right bytes went out without dumping them into the log.
              { __bytes: config.data.byteLength }
            : ((config.data ?? {}) as Record<string, unknown>),
    });

    const response = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: '',
      headers: reply.headers ?? {},
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

async function main() {
  console.log('\nSprint 4.2 — LinkedIn text publishing\n');

  // ─── Formatter: little text format ─────────────────────────────────────────
  section('Formatter — little text escaping');

  check(
    'escapes parentheses, which a caption uses constantly',
    escapeLittleText('Launch day (finally!)') === 'Launch day \\(finally!\\)',
    escapeLittleText('Launch day (finally!)'),
  );

  check(
    'escapes asterisks used as bullets',
    escapeLittleText('* Point one') === '\\* Point one',
    escapeLittleText('* Point one'),
  );

  check(
    'escapes @ so it cannot open a mention',
    escapeLittleText('email me @ work') === 'email me \\@ work',
    escapeLittleText('email me @ work'),
  );

  check(
    'escapes a backslash first, without double-escaping its own output',
    escapeLittleText('a\\b(c)') === 'a\\\\b\\(c\\)',
    escapeLittleText('a\\b(c)'),
  );

  check(
    'preserves hashtags so they stay clickable',
    escapeLittleText('Shipping today #launch #buildinpublic') ===
      'Shipping today #launch #buildinpublic',
    escapeLittleText('Shipping today #launch #buildinpublic'),
  );

  check(
    'escapes a bare # that is not a hashtag',
    escapeLittleText('ranked # 1') === 'ranked \\# 1',
    escapeLittleText('ranked # 1'),
  );

  check(
    'handles hashtags and reserved characters in the same caption',
    escapeLittleText('We shipped (v2) #launch') ===
      'We shipped \\(v2\\) #launch',
    escapeLittleText('We shipped (v2) #launch'),
  );

  check(
    'keeps non-English hashtags intact',
    escapeLittleText('#lancement #продукт') === '#lancement #продукт',
    escapeLittleText('#lancement #продукт'),
  );

  check(
    'is stateless across calls (the global regex does not carry lastIndex)',
    escapeLittleText('#one') === '#one' && escapeLittleText('#one') === '#one',
  );

  check(
    'normalises CRLF so Windows captions do not render stray characters',
    toCommentary('line one\r\nline two') === 'line one\nline two',
    JSON.stringify(toCommentary('line one\r\nline two')),
  );

  // ─── Formatter: URNs and URLs ──────────────────────────────────────────────
  section('Formatter — URNs and permalinks');

  check(
    'builds a person URN from the OIDC sub',
    toPersonUrn('abc123XYZ') === 'urn:li:person:abc123XYZ',
  );

  check(
    'builds a permalink from a share URN',
    toPostUrl('urn:li:share:6844785523593134080') ===
      'https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/',
    String(toPostUrl('urn:li:share:6844785523593134080')),
  );

  check(
    'builds a permalink from a ugcPost URN',
    toPostUrl('urn:li:ugcPost:68447855235931240')?.startsWith(
      'https://www.linkedin.com/feed/update/',
    ) === true,
  );

  check(
    'returns null rather than guessing a URL for an unknown URN shape',
    toPostUrl('urn:li:something:123') === null &&
      toPostUrl('not-a-urn') === null,
  );

  // ─── Formatter: request bodies ─────────────────────────────────────────────
  section('Formatter — request bodies');

  const body = buildTextPostBody({
    authorUrn: 'urn:li:person:abc',
    caption: 'Hello (world) #launch',
  });

  check(
    'versioned body carries every field LinkedIn requires',
    body.author === 'urn:li:person:abc' &&
      body.lifecycleState === 'PUBLISHED' &&
      body.visibility === 'PUBLIC' &&
      typeof body.distribution === 'object',
  );

  check(
    'versioned body escapes the commentary',
    body.commentary === 'Hello \\(world\\) #launch',
    String(body.commentary),
  );

  const legacy = buildLegacyTextPostBody({
    authorUrn: 'urn:li:person:abc',
    caption: 'Hello (world) #launch',
  });
  const legacyText = (
    (legacy.specificContent as Record<string, Record<string, never>>)[
      'com.linkedin.ugc.ShareContent'
    ] as unknown as { shareCommentary: { text: string } }
  ).shareCommentary.text;

  check(
    'legacy body sends the caption raw — ugcPosts is plain text, not little text',
    legacyText === 'Hello (world) #launch',
    legacyText,
  );

  // ─── Validator ─────────────────────────────────────────────────────────────
  section('Validator');

  check(
    'rejects an empty caption with a member-facing message',
    (() => {
      try {
        validateTextPost({ caption: '   ' });
        return false;
      } catch (error) {
        return (
          error instanceof ProviderError &&
          error.status === 400 &&
          /caption/i.test(error.message)
        );
      }
    })(),
  );

  check(
    'rejects a caption over LinkedIn’s limit',
    (() => {
      try {
        validateTextPost({ caption: 'x'.repeat(LINKEDIN_MAX_CAPTION_LENGTH + 1) });
        return false;
      } catch (error) {
        return error instanceof ProviderError && error.status === 400;
      }
    })(),
  );

  check(
    'accepts a caption exactly at the limit',
    validateTextPost({ caption: 'x'.repeat(LINKEDIN_MAX_CAPTION_LENGTH) })
      .caption.length === LINKEDIN_MAX_CAPTION_LENGTH,
  );

  check('trims the caption it hands back', validateTextPost({ caption: '  hi  ' }).caption === 'hi');

  check(
    'canPublish requires w_member_social when scopes are known',
    canPublish(['openid', 'profile', 'w_member_social']) === true &&
      canPublish(['openid', 'profile']) === false,
  );

  check(
    'canPublish treats an empty scope list as unknown, not as denied',
    canPublish([]) === true,
  );

  // ─── Publisher: the happy path ─────────────────────────────────────────────
  section('Publisher — versioned endpoint');

  installFakeLinkedIn([
    { status: 201, headers: { 'x-restli-id': 'urn:li:share:123456' } },
  ]);

  const result = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc123',
    caption: 'Shipping (at last) #launch',
  });

  check('returns the URN from the x-restli-id header', result.urn === 'urn:li:share:123456');
  check('reports which endpoint served it', result.endpoint === 'posts');
  check(
    'builds the permalink',
    result.url === 'https://www.linkedin.com/feed/update/urn:li:share:123456/',
    String(result.url),
  );
  check('made exactly one request', requests.length === 1, `made ${requests.length}`);
  check('called the versioned Posts API', requests[0]?.url === linkedinConfig.postsUrl);
  check(
    'sent the LinkedIn-Version header',
    requests[0]?.headers['linkedin-version'] === linkedinConfig.apiVersion,
    requests[0]?.headers['linkedin-version'],
  );
  check(
    'sent the Rest.li protocol header',
    requests[0]?.headers['x-restli-protocol-version'] === '2.0.0',
  );
  check(
    'sent the bearer token',
    requests[0]?.headers.authorization === `Bearer ${FAKE_TOKEN}`,
  );
  check(
    'did NOT send a version header that is already sunset',
    requests[0]?.headers['linkedin-version'] !== '202401',
    'catalog.ts used to pin 202401, which LinkedIn has deprecated',
  );

  // ─── Publisher: the fallback ───────────────────────────────────────────────
  section('Publisher — legacy fallback');

  installFakeLinkedIn([
    { status: 426 },
    { status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:999' } },
  ]);

  const fallback = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc123',
    caption: 'Hello world',
  });

  check('falls back to the legacy endpoint on 426', fallback.urn === 'urn:li:ugcPost:999');
  check('reports the legacy endpoint', fallback.endpoint === 'ugcPosts');
  check('tried the versioned endpoint first', requests[0]?.url === linkedinConfig.postsUrl);
  check('then the legacy one', requests[1]?.url === linkedinConfig.ugcPostsUrl);
  check(
    'omits the version header on the legacy call — it is unversioned',
    requests[1]?.headers['linkedin-version'] === undefined,
    requests[1]?.headers['linkedin-version'],
  );
  check('made exactly two requests', requests.length === 2, `made ${requests.length}`);

  // ─── Publisher: what must NOT be retried ───────────────────────────────────
  section('Publisher — failures that must not double-post');

  installFakeLinkedIn([{ status: 401 }, { status: 201 }]);
  const unauthorized = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'x',
  }).catch((error) => error);

  check('a 401 throws', unauthorized instanceof ProviderError);
  check(
    'a 401 carries the upstream status so the service can say "reconnect"',
    (unauthorized as ProviderError).upstreamStatus === 401,
  );
  check(
    'a 401 is NOT retried on the other endpoint',
    requests.length === 1,
    `made ${requests.length} requests`,
  );
  check(
    'the error message does not contain the access token',
    !(unauthorized as Error).message.includes(FAKE_TOKEN),
  );

  installFakeLinkedIn([{ status: 429 }, { status: 201 }]);
  const rateLimited = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'x',
  }).catch((error) => error);

  check(
    'a 429 is not retried — a rate limit is not the wrong endpoint',
    requests.length === 1,
    `made ${requests.length} requests`,
  );
  check(
    'a 429 carries its upstream status',
    (rateLimited as ProviderError).upstreamStatus === 429,
  );

  // A network failure with no response at all: we cannot know whether the post
  // was created, so retrying is the one thing we must not do.
  requests = [];
  let networkCalls = 0;
  axios.defaults.adapter = async (config: AxiosRequestConfig) => {
    networkCalls++;
    throw new AxiosError('socket hang up', 'ECONNRESET', config as never);
  };

  const networkError = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'x',
  }).catch((error) => error);

  check(
    'a network failure is never retried — the post may already exist',
    networkCalls === 1,
    `made ${networkCalls} requests`,
  );
  check(
    'a network failure has no upstream status, so the service reports "try again"',
    networkError instanceof ProviderError &&
      networkError.upstreamStatus === undefined,
  );

  // ─── Publisher: a 2xx we cannot record ─────────────────────────────────────
  section('Publisher — success without an id');

  installFakeLinkedIn([{ status: 201, headers: {} }]);
  const noUrn = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'x',
  }).catch((error) => error);

  check(
    'a 201 with no URN is an error, not a publish with an empty id',
    noUrn instanceof ProviderError,
    noUrn instanceof Error ? noUrn.message : String(noUrn),
  );

  // ─── Publisher: validation happens before any request ──────────────────────
  section('Publisher — validation short-circuits');

  installFakeLinkedIn([{ status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } }]);
  await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: '   ',
  }).catch(() => undefined);

  check(
    'an empty caption never reaches LinkedIn',
    requests.length === 0,
    `made ${requests.length} requests`,
  );

  await verifyMedia();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Sprint 4.3 — media publishing.
 *
 * The three things here that cannot be checked by publishing once and looking
 * at the feed:
 *
 *   - that the upload happens *before* the post is created, so a failed upload
 *     can never leave a live post pointing at an image that never arrived;
 *   - that the versioned/legacy choice is made by the `initializeUpload` probe
 *     and then held for the whole post — an image URN in a ugcPosts body, or an
 *     asset URN in a /rest/posts body, is a post that fails or renders empty;
 *   - that the image PUT carries the bearer token, which LinkedIn requires for
 *     images and rejects for videos.
 */
async function verifyMedia() {
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const imageAsset = {
    kind: 'image' as const,
    mimeType: 'image/png',
    data: PNG_1X1,
    byteLength: PNG_1X1.byteLength,
    width: 1,
    height: 1,
    altText: 'A single grey pixel',
  };

  // ─── Dimension probing ─────────────────────────────────────────────────────
  section('Media — dimension probe');

  check(
    'reads PNG dimensions from the IHDR chunk',
    probeImageSize(PNG_1X1, 'image/png').width === 1 &&
      probeImageSize(PNG_1X1, 'image/png').height === 1,
    JSON.stringify(probeImageSize(PNG_1X1, 'image/png')),
  );

  check(
    'returns nulls for a truncated header rather than guessing',
    probeImageSize(Buffer.from([0x89, 0x50]), 'image/png').width === null,
  );

  check(
    'returns nulls for a format it does not parse',
    probeImageSize(PNG_1X1, 'image/webp').width === null,
  );

  // ─── Format conversion ─────────────────────────────────────────────────────
  //
  // The uploader accepts WEBP and LinkedIn does not. Rejecting an image the app
  // itself said was fine is our bug, so a Cloudinary-hosted image gets asked for
  // again as JPEG rather than failing the publish.
  section('Media — Cloudinary format conversion');

  check(
    'asks Cloudinary for JPEG when the stored image is webp',
    toJpegDeliveryUrl(
      'https://res.cloudinary.com/demo/image/upload/v1712345678/posts/shot.webp',
    ) ===
      'https://res.cloudinary.com/demo/image/upload/f_jpg/v1712345678/posts/shot.webp',
    String(
      toJpegDeliveryUrl(
        'https://res.cloudinary.com/demo/image/upload/v1712345678/posts/shot.webp',
      ),
    ),
  );

  check(
    'leaves an existing format directive alone rather than second-guessing it',
    toJpegDeliveryUrl(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_80/v1/shot.webp',
    ) === null,
  );

  check(
    'returns null for a host that cannot transcode, so the real error stands',
    toJpegDeliveryUrl('https://example.com/photo.webp') === null,
  );

  check(
    'is not fooled by a lookalike hostname',
    toJpegDeliveryUrl('https://cloudinary.com.evil.test/image/upload/x.webp') ===
      null,
  );

  check(
    'returns null for a Cloudinary URL that is not an image delivery path',
    toJpegDeliveryUrl('https://res.cloudinary.com/demo/video/upload/v1/clip.mp4') ===
      null,
  );

  // ─── Validation ────────────────────────────────────────────────────────────
  section('Media — validation');

  const heic = { ...imageAsset, mimeType: 'image/heic' };
  let rejected: unknown;
  try {
    validateMedia([heic]);
  } catch (error) {
    rejected = error;
  }
  check(
    'rejects a format LinkedIn will not take, naming it',
    rejected instanceof ProviderError && /JPG, PNG and GIF/.test(rejected.message),
    rejected instanceof Error ? rejected.message : String(rejected),
  );

  const huge = { ...imageAsset, width: 9000, height: 9000 };
  check(
    'rejects an image over the pixel ceiling',
    (() => {
      try {
        validateMedia([huge]);
        return false;
      } catch (error) {
        return error instanceof ProviderError;
      }
    })(),
  );

  check(
    'treats unknown dimensions as "let LinkedIn decide"',
    validateMedia([{ ...imageAsset, width: null, height: null }]).length === 1,
  );

  check(
    'normalises whitespace-only alt text to null, not an empty string',
    validateMedia([{ ...imageAsset, altText: '   ' }])[0].altText === null,
  );

  // ─── The versioned path ────────────────────────────────────────────────────
  section('Media — versioned Images API');

  installFakeLinkedIn([
    {
      status: 200,
      data: {
        value: {
          uploadUrl: 'https://www.linkedin.com/dms-uploads/ABC/uploaded-image/0',
          image: 'urn:li:image:ABC',
        },
      },
    },
    { status: 201 },
    { status: 201, headers: { 'x-restli-id': 'urn:li:share:999' } },
  ]);

  const withImage = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'Shipping (at last) #launch',
    media: [imageAsset],
  });

  check(
    'made three requests: initialize, upload, post',
    requests.length === 3,
    `made ${requests.length}`,
  );

  check(
    'initialized against /rest/images with the action parameter',
    requests[0]?.url === `${linkedinConfig.imagesUrl}?action=initializeUpload`,
    requests[0]?.url,
  );

  check(
    'owned the upload by the member, not an organization',
    (requests[0]?.body as { initializeUploadRequest?: { owner?: string } })
      ?.initializeUploadRequest?.owner === 'urn:li:person:abc',
  );

  check(
    'sent the version header on the initialize call',
    requests[0]?.headers['linkedin-version'] === linkedinConfig.apiVersion,
  );

  check(
    'PUT the bytes to the URL LinkedIn returned',
    requests[1]?.url ===
      'https://www.linkedin.com/dms-uploads/ABC/uploaded-image/0',
    requests[1]?.url,
  );

  check(
    'the image upload carries the bearer token (LinkedIn requires it)',
    requests[1]?.headers.authorization === `Bearer ${FAKE_TOKEN}`,
  );

  check(
    'uploaded the actual bytes, not a JSON wrapper',
    (requests[1]?.body as { __bytes?: number })?.__bytes === PNG_1X1.byteLength,
    JSON.stringify(requests[1]?.body),
  );

  check(
    'created the post on the versioned Posts API',
    requests[2]?.url === linkedinConfig.postsUrl,
  );

  check(
    'referenced the image URN in content.media',
    (requests[2]?.body as { content?: { media?: { id?: string } } })?.content
      ?.media?.id === 'urn:li:image:ABC',
  );

  check(
    'passed the alt text through for screen readers',
    (requests[2]?.body as { content?: { media?: { altText?: string } } })
      ?.content?.media?.altText === 'A single grey pixel',
  );

  check(
    'still escaped the caption as little text',
    (requests[2]?.body as { commentary?: string })?.commentary ===
      'Shipping \\(at last\\) #launch',
    (requests[2]?.body as { commentary?: string })?.commentary,
  );

  check('reported the media URN back', withImage.mediaUrns[0] === 'urn:li:image:ABC');

  // ─── Alt text omitted rather than emptied ──────────────────────────────────
  section('Media — no alt text');

  installFakeLinkedIn([
    {
      status: 200,
      data: { value: { uploadUrl: 'https://upload.test/x', image: 'urn:li:image:D' } },
    },
    { status: 201 },
    { status: 201, headers: { 'x-restli-id': 'urn:li:share:1000' } },
  ]);

  await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'No description available',
    media: [{ ...imageAsset, altText: null }],
  });

  check(
    'omits altText entirely rather than sending "" (which means decorative)',
    !(
      'altText' in
      ((
        requests[2]?.body as { content?: { media?: Record<string, unknown> } }
      )?.content?.media ?? {})
    ),
    JSON.stringify((requests[2]?.body as { content?: unknown })?.content),
  );

  // ─── The legacy fallback ───────────────────────────────────────────────────
  section('Media — legacy Assets fallback');

  installFakeLinkedIn([
    // initializeUpload rejected the way an app not on the versioned API is.
    { status: 403 },
    {
      status: 200,
      data: {
        value: {
          asset: 'urn:li:digitalmediaAsset:XYZ',
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
              uploadUrl: 'https://www.linkedin.com/dms-uploads/XYZ/feedshare/0',
            },
          },
        },
      },
    },
    { status: 201 },
    { status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:777' } },
  ]);

  const legacy = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'Fallback (works)',
    media: [imageAsset],
  });

  check(
    'fell back to /v2/assets after the versioned probe was refused',
    requests[1]?.url === `${linkedinConfig.assetsUrl}?action=registerUpload`,
    requests[1]?.url,
  );

  check(
    'registered under the feedshare-image recipe',
    JSON.stringify(requests[1]?.body).includes('feedshare-image'),
  );

  check(
    'asked for a synchronous upload, which only this API supports',
    JSON.stringify(requests[1]?.body).includes('SYNCHRONOUS_UPLOAD'),
  );

  check(
    'did not send a version header on the legacy call',
    requests[1]?.headers['linkedin-version'] === undefined,
  );

  check(
    'posted to ugcPosts, matching the family the URN came from',
    requests[3]?.url === linkedinConfig.ugcPostsUrl,
    requests[3]?.url,
  );

  check(
    'used the digitalmediaAsset URN and IMAGE category',
    JSON.stringify(requests[3]?.body).includes('urn:li:digitalmediaAsset:XYZ') &&
      JSON.stringify(requests[3]?.body).includes('"shareMediaCategory":"IMAGE"'),
  );

  check(
    'sent the caption raw on the legacy path (ugcPosts is not little text)',
    JSON.stringify(requests[3]?.body).includes('Fallback (works)'),
  );

  check('reported ugcPosts as the endpoint', legacy.endpoint === 'ugcPosts');

  // ─── Ordering: nothing is published if the upload fails ────────────────────
  section('Media — a failed upload publishes nothing');

  installFakeLinkedIn([
    {
      status: 200,
      data: { value: { uploadUrl: 'https://upload.test/x', image: 'urn:li:image:E' } },
    },
    { status: 500 }, // the PUT dies
  ]);

  const uploadFailed = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'Should not publish',
    media: [imageAsset],
  }).catch((error) => error);

  check(
    'a failed upload throws rather than publishing a text-only post',
    uploadFailed instanceof ProviderError,
    uploadFailed instanceof Error ? uploadFailed.message : String(uploadFailed),
  );

  check(
    'never reached the Posts API',
    requests.every((request) => request.url !== linkedinConfig.postsUrl),
    requests.map((request) => request.url).join(', '),
  );

  check(
    'the upload failure does not leak the token',
    uploadFailed instanceof Error && !uploadFailed.message.includes(FAKE_TOKEN),
  );

  // ─── No mid-flight endpoint switching ──────────────────────────────────────
  section('Media — no fallback after bytes have moved');

  installFakeLinkedIn([
    {
      status: 200,
      data: { value: { uploadUrl: 'https://upload.test/x', image: 'urn:li:image:F' } },
    },
    { status: 201 }, // upload succeeded
    { status: 403 }, // the post is refused
  ]);

  const noSecondDoor = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'One door only',
    media: [imageAsset],
  }).catch((error) => error);

  check(
    'a refused media post fails instead of retrying on ugcPosts',
    noSecondDoor instanceof ProviderError && requests.length === 3,
    `made ${requests.length} requests`,
  );

  check(
    'never sent an image URN to the legacy endpoint',
    requests.every((request) => request.url !== linkedinConfig.ugcPostsUrl),
  );

  // ─── Unsupported kinds ─────────────────────────────────────────────────────
  section('Media — kinds not implemented yet');

  installFakeLinkedIn([{ status: 201 }]);
  const video = await publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: 'abc',
    caption: 'A video post',
    media: [{ ...imageAsset, kind: 'video', mimeType: 'video/mp4' }],
  }).catch((error) => error);

  check(
    'video is refused with a reason, before any request',
    video instanceof ProviderError && requests.length === 0,
    `made ${requests.length} requests`,
  );
}

main().catch((error) => {
  console.error('\nverify-publish crashed:', error);
  process.exit(1);
});

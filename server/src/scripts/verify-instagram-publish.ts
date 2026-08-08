/**
 * Instagram publisher — container lifecycle self-check.
 *
 *   npm run verify:instagram        (from server/)
 *
 * Entirely offline, same approach as verify-publish.ts: axios's adapter is
 * swapped for a stub that replays scripted Graph responses, and the module's
 * `timing.wait` is replaced so the poll-until-timeout path runs in
 * milliseconds. What this covers is exactly what a real publish cannot —
 * every branch of the container state machine:
 *
 *   - FINISHED on the first poll → publish;
 *   - IN_PROGRESS twice, then FINISHED → publish (the production bug: the old
 *     code published immediately and Meta answered code 9007 "Media ID is not
 *     available");
 *   - ERROR / EXPIRED → fail with Meta's own detail, publish never called;
 *   - IN_PROGRESS forever → a *bounded* failure, not an infinite loop;
 *   - publish answers 9007 despite FINISHED → a short transient retry;
 *   - 9007 that never clears → a bounded failure;
 *   - and on every path: the access token stays out of URLs and error text.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { publish, timing } from '../providers/meta/instagram/publisher';
import { instagramConfig } from '../providers/meta/instagram/config';
import { ProviderError } from '../providers/provider.interface';
import type { InstagramMediaAsset } from '../providers/meta/instagram/types';

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

/** A token that must never turn up in a URL path or an error message. */
const FAKE_TOKEN = 'super-secret-instagram-token-do-not-leak';

const IG_USER_ID = 'ig-user-1';
const GRAPH = instagramConfig.graphUrl;

function image(): InstagramMediaAsset {
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    byteLength: 1024,
    width: 1080,
    height: 1080,
    altText: null,
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/f_jpg/v1/a.jpg',
  };
}

// ─── Fake Meta ───────────────────────────────────────────────────────────────

interface RecordedRequest {
  method: string;
  url: string;
  /** The publisher sends everything as query params; the body is null. */
  params: Record<string, string>;
}

let requests: RecordedRequest[] = [];
/** Every delay the publisher scheduled, in ms. Waits resolve instantly. */
let waits: number[] = [];

timing.wait = async (ms: number) => {
  waits.push(ms);
};

/**
 * Replies scripted in the order the publisher is expected to make requests.
 * The last entry repeats, so "IN_PROGRESS forever" is one line, not thirty.
 */
function installFakeMeta(
  replies: Array<{ status: number; data?: unknown }>,
) {
  requests = [];
  waits = [];
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

function doPublish() {
  return publish({
    accessToken: FAKE_TOKEN,
    providerAccountId: IG_USER_ID,
    caption: 'Shipping #launch',
    media: [image()],
  });
}

/** The 400 Meta answers when the container is not ready to publish. */
const MEDIA_NOT_READY = {
  status: 400,
  data: {
    error: {
      message: 'Media ID is not available',
      code: 9007,
      error_subcode: 2207027,
      error_user_msg: 'The media is not ready for publishing, please wait for a moment',
    },
  },
};

const isStatusPoll = (r: RecordedRequest) =>
  r.method === 'GET' && r.url === `${GRAPH}/container-1`;
const isPublishCall = (r: RecordedRequest) =>
  r.method === 'POST' && r.url === `${GRAPH}/${IG_USER_ID}/media_publish`;

async function main() {
  console.log('\nInstagram publisher — container lifecycle\n');

  // ─── a. FINISHED on the first poll ─────────────────────────────────────────
  section('Lifecycle — create, FINISHED, publish');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'FINISHED', status: 'Finished' } },
    { status: 200, data: { id: 'media-1' } },
    { status: 200, data: { permalink: 'https://www.instagram.com/p/ABC/' } },
  ]);

  const result = await doPublish();

  check(
    'made four requests: create, status, publish, permalink',
    requests.length === 4,
    `made ${requests.length}`,
  );
  check(
    'created the container first',
    requests[0]?.url === `${GRAPH}/${IG_USER_ID}/media` &&
      requests[0]?.params.image_url === image().sourceUrl,
  );
  check(
    'polled the container node for status_code before publishing',
    isStatusPoll(requests[1]) &&
      requests[1]?.params.fields === 'status_code,status',
    requests[1]?.url,
  );
  check(
    'published with the creation_id Meta returned',
    isPublishCall(requests[2]) &&
      requests[2]?.params.creation_id === 'container-1',
  );
  check('returned the published media id', result.urn === 'media-1');
  check(
    'returned the permalink',
    result.url === 'https://www.instagram.com/p/ABC/',
    String(result.url),
  );
  check(
    'the token travels as a query param, never in the URL path',
    requests.every(
      (r) => !r.url.includes(FAKE_TOKEN) && r.params.access_token === FAKE_TOKEN,
    ),
  );
  check(
    'waited once before the first status check',
    waits.length === 1,
    `scheduled ${waits.length} waits`,
  );

  // ─── b. IN_PROGRESS twice, then FINISHED ───────────────────────────────────
  section('Lifecycle — IN_PROGRESS, IN_PROGRESS, FINISHED, publish');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'IN_PROGRESS' } },
    { status: 200, data: { status_code: 'IN_PROGRESS' } },
    { status: 200, data: { status_code: 'FINISHED' } },
    { status: 200, data: { id: 'media-2' } },
    { status: 200, data: { permalink: 'https://www.instagram.com/p/DEF/' } },
  ]);

  const slow = await doPublish();

  check('published after the container finished', slow.urn === 'media-2');
  check(
    'polled three times',
    requests.filter(isStatusPoll).length === 3,
    `polled ${requests.filter(isStatusPoll).length} times`,
  );
  check(
    'published exactly once',
    requests.filter(isPublishCall).length === 1,
  );
  check(
    'each poll was preceded by a wait',
    waits.length === 3,
    `scheduled ${waits.length} waits`,
  );
  check(
    'the delays between polls do not shrink',
    waits.every((ms, i) => i === 0 || ms >= waits[i - 1]),
    waits.join(', '),
  );

  // ─── c. ERROR ──────────────────────────────────────────────────────────────
  section('Lifecycle — ERROR fails with Meta’s detail');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    {
      status: 200,
      data: {
        status_code: 'ERROR',
        status: 'Error Message: The image could not be fetched.',
      },
    },
  ]);

  const errored = await doPublish().catch((error) => error);

  check('an ERROR container throws', errored instanceof ProviderError);
  check(
    'the error carries Meta’s own detail',
    errored instanceof Error &&
      errored.message.includes('ERROR') &&
      errored.message.includes('could not be fetched'),
    errored instanceof Error ? errored.message : String(errored),
  );
  check(
    'publish was never called for a failed container',
    requests.every((r) => !isPublishCall(r)),
  );
  check(
    'the error does not leak the token',
    errored instanceof Error && !errored.message.includes(FAKE_TOKEN),
  );

  // ─── c². EXPIRED ───────────────────────────────────────────────────────────
  section('Lifecycle — EXPIRED fails clearly');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'EXPIRED' } },
  ]);

  const expired = await doPublish().catch((error) => error);

  check(
    'an EXPIRED container throws, naming the state',
    expired instanceof ProviderError && expired.message.includes('EXPIRED'),
    expired instanceof Error ? expired.message : String(expired),
  );
  check(
    'publish was never called for an expired container',
    requests.every((r) => !isPublishCall(r)),
  );

  // ─── d. Bounded timeout ────────────────────────────────────────────────────
  section('Lifecycle — IN_PROGRESS forever is a bounded failure');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'IN_PROGRESS' } }, // repeats
  ]);

  const timedOut = await doPublish().catch((error) => error);

  const polls = requests.filter(isStatusPoll).length;
  check(
    'gave up with an error instead of looping',
    timedOut instanceof ProviderError && /did not finish/i.test(timedOut.message),
    timedOut instanceof Error ? timedOut.message : String(timedOut),
  );
  check(
    'the poll count is bounded and plural',
    polls > 1 && polls < 20,
    `polled ${polls} times`,
  );
  check(
    'the whole retry window stays under a minute',
    waits.reduce((sum, ms) => sum + ms, 0) <= 60_000,
    `${waits.reduce((sum, ms) => sum + ms, 0)}ms scheduled`,
  );
  check(
    'nothing was published on timeout',
    requests.every((r) => !isPublishCall(r)),
  );

  // ─── e. Transient "media not ready" on publish ─────────────────────────────
  section('Publish — 9007 after FINISHED is retried, then succeeds');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'FINISHED' } },
    MEDIA_NOT_READY,
    { status: 200, data: { id: 'media-3' } },
    { status: 200, data: { permalink: 'https://www.instagram.com/p/GHI/' } },
  ]);

  const retried = await doPublish();

  check('the retry published the post', retried.urn === 'media-3');
  check(
    'media_publish was called twice',
    requests.filter(isPublishCall).length === 2,
    `called ${requests.filter(isPublishCall).length} times`,
  );

  // ─── e². 9007 that never clears ────────────────────────────────────────────
  section('Publish — persistent 9007 fails after bounded retries');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'FINISHED' } },
    MEDIA_NOT_READY, // repeats
  ]);

  const exhausted = await doPublish().catch((error) => error);

  const publishCalls = requests.filter(isPublishCall).length;
  check(
    'a 9007 that never clears throws the real Instagram error',
    exhausted instanceof ProviderError &&
      exhausted.message.includes('9007') &&
      exhausted.upstreamStatus === 400,
    exhausted instanceof Error ? exhausted.message : String(exhausted),
  );
  check(
    'publish attempts are bounded',
    publishCalls > 1 && publishCalls <= 4,
    `called ${publishCalls} times`,
  );

  // ─── Other publish errors are not retried ──────────────────────────────────
  section('Publish — a non-9007 failure is not retried');

  installFakeMeta([
    { status: 200, data: { id: 'container-1' } },
    { status: 200, data: { status_code: 'FINISHED' } },
    {
      status: 400,
      data: { error: { message: 'Invalid parameter', code: 100 } },
    },
  ]);

  const invalid = await doPublish().catch((error) => error);

  check(
    'a non-transient publish error throws immediately',
    invalid instanceof ProviderError &&
      requests.filter(isPublishCall).length === 1,
    `called ${requests.filter(isPublishCall).length} times`,
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nverify-instagram-publish crashed:', error);
  process.exit(1);
});

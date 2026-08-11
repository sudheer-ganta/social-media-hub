/**
 * The scheduler: claiming, retrying, recovering. Unit tests.
 *
 * Everything that decides whether a post goes out twice lives in a conditional
 * write, so these tests run the repository against an **in-memory Postgres
 * stand-in** rather than mocking the repository away. A mock that returns
 * `true` for `claimDestination` would pass every test below and prove nothing:
 * the property under test is that the *where clause* refuses a row that is no
 * longer PENDING. The fake implements `updateMany` the way the database does —
 * match on the current row, then write — and applies each call atomically,
 * which is what lets two "workers" genuinely race here.
 *
 * The publish service is mocked, and only the publish service. It has its own
 * tests; what matters here is that the scheduler calls it exactly once per
 * successful destination, with `preClaimed`, and does the right bookkeeping
 * with what it throws.
 *
 * Run: cd server && npx vitest run src/scheduler/scheduler.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

// ─── An in-memory stand-in for the two tables the scheduler touches ──────────

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  posts: [] as Row[],
  destinations: [] as Row[],
}));

/**
 * Prisma's where-clause semantics, as far as this repository uses them.
 * Scalars, `in`, `notIn`, `lte`, `lt`, `gt`, `not`, and the one relation filter
 * (`post: { status: { in: [...] } }`).
 */
const matches = vi.hoisted(() => {
  const compare = (value: any, condition: any): boolean => {
    if (condition === null) return value === null;
    if (condition instanceof Date) return value?.getTime?.() === condition.getTime();
    if (typeof condition !== 'object') return value === condition;

    return Object.entries(condition).every(([operator, operand]: [string, any]) => {
      switch (operator) {
        case 'in':
          return operand.includes(value);
        case 'notIn':
          return !operand.includes(value);
        case 'lte':
          return value != null && value.getTime() <= operand.getTime();
        case 'lt':
          return value != null && value.getTime() < operand.getTime();
        case 'gt':
          return value != null && value > operand;
        case 'not':
          return operand === null ? value !== null : value !== operand;
        default:
          return false;
      }
    });
  };

  return function matches(row: Row, where: Row = {}, posts: Row[] = []): boolean {
    return Object.entries(where).every(([field, condition]) => {
      if (field === 'post') {
        const post = posts.find((candidate) => candidate.id === row.postId);
        return post ? matches(post, condition as Row, posts) : false;
      }
      return compare(row[field], condition);
    });
  };
});

/** Prisma's update payload: plain values plus `{ increment }`. */
const applyData = vi.hoisted(() => (row: Row, data: Row) => {
  for (const [field, value] of Object.entries(data)) {
    row[field] =
      value && typeof value === 'object' && 'increment' in value
        ? (row[field] ?? 0) + (value as any).increment
        : value;
  }
});

vi.mock('../config/prisma', () => {
  const table = (rows: () => Row[]) => ({
    findMany: async ({ where, take, select }: Row = {}) => {
      const found = rows().filter((row) => matches(row, where, db.posts));
      const limited = take ? found.slice(0, take) : found;
      // `select: { post: { select: { created_by } } }` — the one nesting used.
      return select?.post
        ? limited.map((row) => ({
            ...row,
            post: db.posts.find((post) => post.id === row.postId),
          }))
        : limited;
    },
    findFirst: async ({ where }: Row = {}) =>
      rows().find((row) => matches(row, where, db.posts)) ?? null,
    findUnique: async ({ where }: Row) => {
      const key = where.postId_provider ?? where;
      return rows().find((row) => matches(row, key, db.posts)) ?? null;
    },
    updateMany: async ({ where, data }: Row) => {
      const found = rows().filter((row) => matches(row, where, db.posts));
      found.forEach((row) => applyData(row, data));
      return { count: found.length };
    },
    update: async ({ where, data }: Row) => {
      const row = rows().find((candidate) => candidate.id === where.id);
      if (!row) throw new Error('not found');
      applyData(row, data);
      return row;
    },
    // `skipDuplicates` leans on the unique (post_id, provider) index, so the
    // stand-in has to honour it or `armSchedule` would look like it inserts
    // duplicate destination rows.
    createMany: async ({ data, skipDuplicates }: Row) => {
      let count = 0;
      for (const entry of data as Row[]) {
        const clash = rows().some(
          (row) => row.postId === entry.postId && row.provider === entry.provider,
        );
        if (clash && skipDuplicates) continue;
        rows().push({
          id: `dest-${rows().length + 1}`,
          attempts: 0,
          lastAttemptAt: null,
          publishedAt: null,
          publishedId: null,
          permalink: null,
          errorMessage: null,
          createdAt: NOW,
          ...entry,
        });
        count += 1;
      }
      return { count };
    },
  });

  return {
    prisma: {
      post: table(() => db.posts),
      postPlatform: table(() => db.destinations),
      // Prisma's array form runs the operations in order; each is already
      // built as a promise by the caller, so awaiting them is the whole job.
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    },
  };
});

// ─── The publish service, mocked ─────────────────────────────────────────────

const publish = vi.hoisted(() => vi.fn());

vi.mock('../publish/services/publish.service', async () => {
  class PublishError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly leavesPostUnchanged = false,
    ) {
      super(message);
      this.name = 'PublishError';
    }
  }
  return {
    PublishError,
    publishService: { publishPost: publish },
    publishPost: publish,
  };
});

import { scheduleRepository } from '../repositories/schedule.repository';
import { tick } from './scheduler.worker';
import { PublishError } from '../publish/services/publish.service';
import { deriveParentStatus } from './status';
import { isRetryable, nextAttemptAt, toStoredMessage, MAX_ATTEMPTS } from './retry';
import { PostStatus, PublishStatus } from '../generated/prisma/enums';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PAST = new Date('2026-08-20T04:00:00Z');
const NOW = new Date('2026-08-20T04:05:00Z');

function seed(
  post: Partial<Row> = {},
  destinations: Array<Partial<Row>> = [{ provider: 'linkedin' }],
) {
  const postRow: Row = {
    id: 'post-1',
    created_by: 'user-1',
    title: 'A post',
    status: PostStatus.SCHEDULED,
    scheduled_at: PAST,
    timezone: 'Asia/Kolkata',
    published_at: null,
    updated_at: NOW,
    ...post,
  };
  db.posts.push(postRow);

  destinations.forEach((destination, index) => {
    db.destinations.push({
      id: `dest-${index + 1}`,
      postId: postRow.id,
      provider: 'linkedin',
      status: PublishStatus.PENDING,
      attempts: 0,
      nextAttemptAt: PAST,
      lastAttemptAt: null,
      publishedAt: null,
      publishedId: null,
      permalink: null,
      errorMessage: null,
      createdAt: NOW,
      ...destination,
    });
  });

  return postRow;
}

const destination = (provider: string) =>
  db.destinations.find((row) => row.provider === provider)!;

const post = () => db.posts[0];

/**
 * What `publish.service.publishPost` does to the database on success.
 *
 * Modelled rather than skipped, because the scheduler depends on it: the
 * publish service is what writes PUBLISHED, the provider's id and the
 * permalink at the moment the network confirms, and the scheduler deliberately
 * does *not* duplicate that. A mock that only resolved a value would make
 * `markDestinationPublished` — which is conditional on PUBLISHED — silently do
 * nothing, and every assertion below would be testing a fiction.
 */
function publishSucceeds(provider: string) {
  const row = destination(provider);
  row.status = PublishStatus.PUBLISHED;
  row.publishedId = `urn:${provider}:1`;
  row.permalink = `https://${provider}.example/1`;
  row.errorMessage = null;
  post().status = PostStatus.PUBLISHED;

  return {
    postId: 'post-1',
    provider,
    status: 'published' as const,
    publishedId: row.publishedId,
    url: row.permalink,
    publishedAt: NOW.toISOString(),
  };
}

/**
 * What it does on a failure it has already recorded — the `leavesPostUnchanged
 * === false` branch, which is every provider rejection and every 5xx.
 */
function publishFails(provider: string, error: PublishError): never {
  if (!error.leavesPostUnchanged) {
    const row = destination(provider);
    row.status = PublishStatus.FAILED;
    row.errorMessage = error.message;
    post().status = PostStatus.FAILED;
  }
  throw error;
}

beforeEach(() => {
  db.posts.length = 0;
  db.destinations.length = 0;
  publish.mockReset();
});

// ─── The claim ───────────────────────────────────────────────────────────────

describe('atomic claim', () => {
  it('moves a due destination to PUBLISHING and burns an attempt', async () => {
    seed();
    expect(await scheduleRepository.claimDestination('dest-1', NOW)).toBe(true);

    expect(destination('linkedin')).toMatchObject({
      status: PublishStatus.PUBLISHING,
      attempts: 1,
      lastAttemptAt: NOW,
      // Cleared, so an in-flight row is invisible to the due query even before
      // its status is read.
      nextAttemptAt: null,
    });
  });

  it('two workers racing the same job: exactly one wins', async () => {
    seed();

    const [first, second] = await Promise.all([
      scheduleRepository.claimDestination('dest-1', NOW),
      scheduleRepository.claimDestination('dest-1', NOW),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    // And the loser did not burn an attempt on a job it never ran.
    expect(destination('linkedin').attempts).toBe(1);
  });

  it('cannot claim a destination that already published', async () => {
    seed({}, [{ provider: 'linkedin', status: PublishStatus.PUBLISHED }]);
    expect(await scheduleRepository.claimDestination('dest-1', NOW)).toBe(false);
  });

  it('cannot claim a cancelled destination', async () => {
    seed({}, [{ provider: 'linkedin', status: PublishStatus.CANCELLED }]);
    expect(await scheduleRepository.claimDestination('dest-1', NOW)).toBe(false);
  });
});

// ─── The due query ───────────────────────────────────────────────────────────

describe('finding what is due', () => {
  it('finds a destination whose instant has passed', async () => {
    seed();
    const due = await scheduleRepository.findDueDestinations(NOW);
    expect(due).toEqual([
      { id: 'dest-1', postId: 'post-1', provider: 'linkedin', attempts: 0, userId: 'user-1' },
    ]);
  });

  it('leaves a destination whose instant is still ahead', async () => {
    seed({}, [{ provider: 'linkedin', nextAttemptAt: new Date('2026-08-21T00:00:00Z') }]);
    expect(await scheduleRepository.findDueDestinations(NOW)).toHaveLength(0);
  });

  it('never returns a cancelled post — the worker cannot execute one', async () => {
    seed({ status: PostStatus.CANCELLED });
    expect(await scheduleRepository.findDueDestinations(NOW)).toHaveLength(0);
  });

  it('never returns a post already marked PUBLISHED', async () => {
    seed({ status: PostStatus.PUBLISHED });
    expect(await scheduleRepository.findDueDestinations(NOW)).toHaveLength(0);
  });

  it('ignores rows that were never scheduled — a manual publish is not ours', async () => {
    seed({}, [{ provider: 'linkedin', nextAttemptAt: null }]);
    expect(await scheduleRepository.findDueDestinations(NOW)).toHaveLength(0);
  });
});

// ─── One tick, end to end ────────────────────────────────────────────────────

describe('publishing a due post', () => {
  it('publishes through the existing publish service, pre-claimed', async () => {
    seed();
    publish.mockImplementation(async () => publishSucceeds('linkedin'));

    await tick(NOW);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('user-1', 'post-1', 'linkedin', {
      preClaimed: true,
    });
  });

  it('records the publish and moves the post to PUBLISHED', async () => {
    seed();
    publish.mockImplementation(async () => publishSucceeds('linkedin'));

    await tick(NOW);

    expect(destination('linkedin')).toMatchObject({
      attempts: 1,
      nextAttemptAt: null,
      publishedAt: new Date(NOW),
    });
    expect(post().status).toBe(PostStatus.PUBLISHED);
  });

  it('publishes each destination of a multi-network post exactly once', async () => {
    seed({}, [{ provider: 'linkedin' }, { provider: 'instagram' }, { provider: 'x' }]);
    db.destinations[1].provider = 'instagram';
    db.destinations[2].provider = 'x';
    publish.mockImplementation(async (_u: string, _p: string, provider: string) =>
      publishSucceeds(provider),
    );

    await tick(NOW);

    expect(publish.mock.calls.map((call) => call[2]).sort()).toEqual([
      'instagram',
      'linkedin',
      'x',
    ]);
    expect(post().status).toBe(PostStatus.PUBLISHED);
  });

  it('a second tick republishes nothing — the state machine is the guard', async () => {
    seed();
    publish.mockImplementation(async () => publishSucceeds('linkedin'));

    await tick(NOW);
    await tick(new Date(NOW.getTime() + 60_000));

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('a cancelled post is never published, however many ticks run', async () => {
    seed({ status: PostStatus.CANCELLED });

    await tick(NOW);
    await tick(new Date(NOW.getTime() + 60_000));

    expect(publish).not.toHaveBeenCalled();
  });
});

// ─── Failure, retry and the retry ceiling ────────────────────────────────────

describe('failures', () => {
  it('re-arms a transient failure with a backoff instead of failing it', async () => {
    seed();
    publish.mockImplementation(async () =>
      publishFails('linkedin', new PublishError('X is rate limiting posts.', 429)),
    );

    await tick(NOW);

    const row = destination('linkedin');
    expect(row.status).toBe(PublishStatus.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
    // The reason is visible while it waits.
    expect(row.errorMessage).toBe('X is rate limiting posts.');
  });

  it('does not retry a permanent failure', async () => {
    seed();
    publish.mockImplementation(async () =>
      publishFails(
        'linkedin',
        new PublishError('Reconnect your LinkedIn account and try again.', 400),
      ),
    );

    await tick(NOW);

    expect(destination('linkedin')).toMatchObject({
      status: PublishStatus.FAILED,
      nextAttemptAt: null,
      attempts: 1,
    });
    expect(post().status).toBe(PostStatus.FAILED);
  });

  it('gives up after the attempt ceiling and leaves it FAILED', async () => {
    seed();
    publish.mockImplementation(async () =>
      publishFails('linkedin', new PublishError('Network unreachable.', 502)),
    );

    // Each tick is later than the last backoff, so the retry is always due.
    for (let attempt = 0; attempt < MAX_ATTEMPTS + 2; attempt += 1) {
      await tick(new Date(NOW.getTime() + attempt * 24 * 60 * 60_000));
    }

    expect(publish).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(destination('linkedin')).toMatchObject({
      status: PublishStatus.FAILED,
      attempts: MAX_ATTEMPTS,
      nextAttemptAt: null,
    });
  });

  it('does not retry before the backoff has elapsed', async () => {
    seed();
    publish.mockImplementation(async () =>
      publishFails('linkedin', new PublishError('Network unreachable.', 502)),
    );

    await tick(NOW);
    await tick(new Date(NOW.getTime() + 1_000));

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('never stores a raw error — only a message written for a member', async () => {
    seed();
    publish.mockRejectedValue(
      new Error('POST https://api.linkedin.com/rest/posts failed: Bearer AQV…'),
    );

    await tick(NOW);

    const stored = destination('linkedin').errorMessage as string;
    expect(stored).toBe(
      'Something went wrong while publishing. Your post was not published.',
    );
    expect(stored).not.toMatch(/Bearer|api\.linkedin/);
  });
});

// ─── Partial success ─────────────────────────────────────────────────────────

describe('partial success', () => {
  it('is PARTIALLY_PUBLISHED, not FAILED, when one of three networks fails', async () => {
    seed({}, [{ provider: 'linkedin' }, { provider: 'instagram' }, { provider: 'x' }]);
    db.destinations[1].provider = 'instagram';
    db.destinations[2].provider = 'x';

    publish.mockImplementation(async (_u: string, _p: string, provider: string) =>
      provider === 'x'
        ? publishFails('x', new PublishError('X wouldn’t accept this post.', 422))
        : publishSucceeds(provider),
    );

    await tick(NOW);

    expect(post().status).toBe(PostStatus.PARTIALLY_PUBLISHED);
    expect(destination('linkedin').status).toBe(PublishStatus.PUBLISHED);
    expect(destination('instagram').status).toBe(PublishStatus.PUBLISHED);
    expect(destination('x').status).toBe(PublishStatus.FAILED);
  });

  it('retrying the failed network alone leaves the published ones untouched', async () => {
    seed({ status: PostStatus.PARTIALLY_PUBLISHED }, [
      { provider: 'linkedin', status: PublishStatus.PUBLISHED, nextAttemptAt: null },
      { provider: 'x', status: PublishStatus.FAILED, nextAttemptAt: null, attempts: 3 },
    ]);
    db.destinations[1].provider = 'x';
    publish.mockImplementation(async () => publishSucceeds('x'));

    expect(await scheduleRepository.rearmDestination('post-1', 'x', NOW)).toBe(true);
    await scheduleRepository.syncParentStatus('post-1');
    await tick(NOW);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][2]).toBe('x');
    expect(post().status).toBe(PostStatus.PUBLISHED);
  });

  it('refuses to re-arm a destination that already published', async () => {
    seed({ status: PostStatus.PUBLISHED }, [
      { provider: 'linkedin', status: PublishStatus.PUBLISHED, nextAttemptAt: null },
    ]);

    expect(await scheduleRepository.rearmDestination('post-1', 'linkedin', NOW)).toBe(
      false,
    );
  });
});

// ─── Cancellation ────────────────────────────────────────────────────────────

describe('cancellation', () => {
  it('cancels an armed schedule and its pending destinations', async () => {
    seed();

    expect(await scheduleRepository.cancelSchedule('post-1', 'user-1')).toBe(true);
    expect(post().status).toBe(PostStatus.CANCELLED);
    expect(destination('linkedin').status).toBe(PublishStatus.CANCELLED);

    await tick(NOW);
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps a cancelled schedule visible in the listing', async () => {
    seed();
    await scheduleRepository.cancelSchedule('post-1', 'user-1');

    // `scheduled_at` is what every schedule listing filters on. Clearing it
    // here would make a post vanish the instant it was cancelled, which is
    // exactly when a member looks for it to confirm.
    expect(post().scheduled_at).not.toBeNull();
    expect(await scheduleRepository.listForUser('user-1')).toHaveLength(1);
  });

  it('refuses to cancel a post a worker has already claimed', async () => {
    seed({ status: PostStatus.PUBLISHING }, [
      { provider: 'linkedin', status: PublishStatus.PUBLISHING },
    ]);

    expect(await scheduleRepository.cancelSchedule('post-1', 'user-1')).toBe(false);
    expect(post().status).toBe(PostStatus.PUBLISHING);
  });

  it('cannot be cancelled by another user', async () => {
    seed();
    expect(await scheduleRepository.cancelSchedule('post-1', 'someone-else')).toBe(false);
    expect(post().status).toBe(PostStatus.SCHEDULED);
  });

  it('takes a failed schedule off the list without deleting the post', async () => {
    seed({ status: PostStatus.FAILED }, [
      { provider: 'linkedin', status: PublishStatus.FAILED, nextAttemptAt: null },
    ]);

    expect(await scheduleRepository.clearSchedule('post-1', 'user-1')).toBe(true);
    expect(post().scheduled_at).toBeNull();
    // The post itself survives — a member removing a schedule wants the draft
    // back, not the loss of the caption they wrote.
    expect(db.posts).toHaveLength(1);
    expect(await scheduleRepository.listForUser('user-1')).toHaveLength(0);
  });

  it('refuses to take a post off the list while it is publishing', async () => {
    seed({ status: PostStatus.PUBLISHING });
    expect(await scheduleRepository.clearSchedule('post-1', 'user-1')).toBe(false);
    expect(post().scheduled_at).not.toBeNull();
  });

  it('leaves an already-published destination alone', async () => {
    seed({}, [
      { provider: 'linkedin', status: PublishStatus.PUBLISHED, nextAttemptAt: null },
      { provider: 'x' },
    ]);
    db.destinations[1].provider = 'x';

    await scheduleRepository.cancelSchedule('post-1', 'user-1');

    // Cancelling a schedule cannot unsend what is on someone's feed.
    expect(destination('linkedin').status).toBe(PublishStatus.PUBLISHED);
    expect(destination('x').status).toBe(PublishStatus.CANCELLED);
  });
});

// ─── Render: restart, redeploy, sleep ────────────────────────────────────────

describe('surviving a restart', () => {
  it('publishes a post whose time passed while the server was down', async () => {
    // Scheduled for 10:00; the process only came back at 10:10.
    seed({ scheduled_at: new Date('2026-08-20T10:00:00Z') }, [
      { provider: 'linkedin', nextAttemptAt: new Date('2026-08-20T10:00:00Z') },
    ]);
    publish.mockImplementation(async () => publishSucceeds('linkedin'));

    await tick(new Date('2026-08-20T10:10:00Z'));

    // Late, not skipped, and not deferred to some later window.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(post().status).toBe(PostStatus.PUBLISHED);
  });

  it('frees a claim abandoned mid-publish by a process that died', async () => {
    seed({ status: PostStatus.PUBLISHING }, [
      {
        provider: 'linkedin',
        status: PublishStatus.PUBLISHING,
        attempts: 1,
        lastAttemptAt: new Date('2026-08-20T04:00:00Z'),
        nextAttemptAt: null,
      },
    ]);
    publish.mockImplementation(async () => publishSucceeds('linkedin'));

    // Twenty minutes later — past the stale threshold.
    await tick(new Date('2026-08-20T04:20:00Z'));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(post().status).toBe(PostStatus.PUBLISHED);
  });

  it('does not steal a claim that is merely slow', async () => {
    seed({ status: PostStatus.PUBLISHING }, [
      {
        provider: 'linkedin',
        status: PublishStatus.PUBLISHING,
        attempts: 1,
        lastAttemptAt: new Date('2026-08-20T04:00:00Z'),
        nextAttemptAt: null,
      },
    ]);

    // One minute in. An Instagram carousel takes longer than this.
    await tick(new Date('2026-08-20T04:01:00Z'));

    expect(publish).not.toHaveBeenCalled();
    expect(destination('linkedin').status).toBe(PublishStatus.PUBLISHING);
  });

  it('does not adopt a manual publish that is in flight', async () => {
    // attempts = 0 is the signature of a publish nobody scheduled: a member is
    // sitting in front of it with a request open.
    seed({ status: PostStatus.PUBLISHING }, [
      {
        provider: 'linkedin',
        status: PublishStatus.PUBLISHING,
        attempts: 0,
        lastAttemptAt: new Date('2026-08-20T03:00:00Z'),
        nextAttemptAt: null,
      },
    ]);

    await tick(new Date('2026-08-20T04:20:00Z'));

    expect(publish).not.toHaveBeenCalled();
  });
});

// ─── Arming ──────────────────────────────────────────────────────────────────

describe('arming a schedule', () => {
  const AT = new Date('2026-08-25T04:00:00Z');

  it('arms every requested destination at the scheduled instant', async () => {
    seed({ status: PostStatus.DRAFT, scheduled_at: null }, []);

    await scheduleRepository.armSchedule('post-1', ['linkedin', 'x'], AT, 'Asia/Kolkata');

    expect(post()).toMatchObject({
      status: PostStatus.SCHEDULED,
      scheduled_at: AT,
      timezone: 'Asia/Kolkata',
    });
    expect(db.destinations.map((row) => [row.provider, row.nextAttemptAt])).toEqual([
      ['linkedin', AT],
      ['x', AT],
    ]);
  });

  it('resets a previously failed destination rather than adding a second row', async () => {
    seed({}, [
      {
        provider: 'linkedin',
        status: PublishStatus.FAILED,
        attempts: 3,
        errorMessage: 'Nope.',
        nextAttemptAt: null,
      },
    ]);

    await scheduleRepository.armSchedule('post-1', ['linkedin'], AT, 'UTC');

    expect(db.destinations).toHaveLength(1);
    expect(destination('linkedin')).toMatchObject({
      status: PublishStatus.PENDING,
      attempts: 0,
      errorMessage: null,
      nextAttemptAt: AT,
    });
  });

  it('never re-arms a destination that already published', async () => {
    seed({ status: PostStatus.PARTIALLY_PUBLISHED }, [
      { provider: 'linkedin', status: PublishStatus.PUBLISHED, nextAttemptAt: null },
    ]);

    await scheduleRepository.armSchedule('post-1', ['linkedin'], AT, 'UTC');
    publish.mockImplementation(async () => publishSucceeds('linkedin'));
    await tick(new Date(AT.getTime() + 60_000));

    expect(publish).not.toHaveBeenCalled();
    expect(destination('linkedin').status).toBe(PublishStatus.PUBLISHED);
  });

  it('cancels a destination the member removed from the schedule', async () => {
    seed({}, [{ provider: 'linkedin' }, { provider: 'x' }]);
    db.destinations[1].provider = 'x';

    await scheduleRepository.armSchedule('post-1', ['linkedin'], AT, 'UTC');

    expect(destination('x').status).toBe(PublishStatus.CANCELLED);
    expect(destination('linkedin').status).toBe(PublishStatus.PENDING);
  });
});

// ─── The pure decisions ──────────────────────────────────────────────────────

describe('deriveParentStatus', () => {
  const rows = (...statuses: PublishStatus[]) => statuses.map((status) => ({ status }));

  it('leaves a post with no destinations alone', () => {
    expect(deriveParentStatus([])).toBeNull();
  });

  it('is PUBLISHING while anything is still pending or in flight', () => {
    expect(deriveParentStatus(rows(PublishStatus.PUBLISHED, PublishStatus.PENDING))).toBe(
      PostStatus.PUBLISHING,
    );
    expect(deriveParentStatus(rows(PublishStatus.FAILED, PublishStatus.PUBLISHING))).toBe(
      PostStatus.PUBLISHING,
    );
  });

  it('is PARTIALLY_PUBLISHED for a mixed outcome, never FAILED', () => {
    expect(deriveParentStatus(rows(PublishStatus.PUBLISHED, PublishStatus.FAILED))).toBe(
      PostStatus.PARTIALLY_PUBLISHED,
    );
  });

  it('collapses a uniform outcome', () => {
    expect(deriveParentStatus(rows(PublishStatus.PUBLISHED, PublishStatus.PUBLISHED))).toBe(
      PostStatus.PUBLISHED,
    );
    expect(deriveParentStatus(rows(PublishStatus.FAILED))).toBe(PostStatus.FAILED);
    expect(deriveParentStatus(rows(PublishStatus.CANCELLED))).toBe(PostStatus.CANCELLED);
  });

  it('counts a cancelled sibling as done, not as a failure', () => {
    expect(deriveParentStatus(rows(PublishStatus.PUBLISHED, PublishStatus.CANCELLED))).toBe(
      PostStatus.PUBLISHED,
    );
  });
});

describe('retry policy', () => {
  it('retries what might not be true in a minute', () => {
    for (const status of [429, 500, 502, 409]) {
      expect(isRetryable(new PublishError('…', status))).toBe(true);
    }
  });

  it('does not retry what the network will refuse every time', () => {
    for (const status of [400, 403, 404, 422, 501]) {
      expect(isRetryable(new PublishError('…', status))).toBe(false);
    }
  });

  it('treats an unknown throw as retryable — it may be our own transient bug', () => {
    expect(isRetryable(new Error('socket hang up'))).toBe(true);
  });

  it('backs off further each time, then stops', () => {
    const first = nextAttemptAt(1, NOW)!;
    const second = nextAttemptAt(2, NOW)!;
    expect(first.getTime()).toBeGreaterThan(NOW.getTime());
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    expect(nextAttemptAt(MAX_ATTEMPTS, NOW)).toBeNull();
  });

  it('stores the translated message, or a generic one', () => {
    expect(toStoredMessage(new PublishError('Reconnect your account.', 400))).toBe(
      'Reconnect your account.',
    );
    expect(toStoredMessage(new Error('Bearer AQV…'))).not.toMatch(/Bearer/);
  });
});

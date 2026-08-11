/**
 * The scheduling API's rules — unit tests.
 *
 * Ownership, timezone resolution, destination validation and the state machine
 * that decides what may still be edited. The repository is mocked here (its own
 * conditional writes are exercised against a database stand-in in
 * `scheduler.test.ts`), because what is under test is the *decisions*: which
 * requests are refused, with which code, and what a member is told.
 *
 * No test asserts on, prints or constructs a token value.
 *
 * Run: cd server && npx vitest run src/scheduler/schedule.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const repo = vi.hoisted(() => ({
  armSchedule: vi.fn(async () => undefined),
  cancelSchedule: vi.fn(async () => true),
  rescheduleAt: vi.fn(async () => true),
  findForUser: vi.fn(),
  listForUser: vi.fn(async () => []),
  clearSchedule: vi.fn(async () => true),
  findDestination: vi.fn(),
  rearmDestination: vi.fn(async () => true),
  syncParentStatus: vi.fn(async () => null),
}));

vi.mock('../repositories/schedule.repository', () => ({
  scheduleRepository: repo,
}));

const accounts = vi.hoisted(() => ({
  findByUserAndProvider: vi.fn(),
}));

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: accounts,
}));

const registry = vi.hoisted(() => ({
  providers: new Map<string, any>(),
}));

vi.mock('../providers', () => ({
  isKnownProvider: (id: string) => registry.providers.has(id),
  getProvider: (id: string) => registry.providers.get(id) ?? null,
  getCatalogEntry: (id: string) =>
    registry.providers.has(id)
      ? { displayName: id.charAt(0).toUpperCase() + id.slice(1) }
      : null,
}));

vi.mock('../services/activity.service', () => ({
  activityService: { log: vi.fn(async () => null) },
  ActivityAction: {
    POST_SCHEDULED: 'post.scheduled',
    POST_SCHEDULE_CANCELLED: 'post.schedule_cancelled',
  },
}));

import { scheduleService } from './schedule.service';
import { ScheduleError } from './errors';
import { PostStatus, PublishStatus, SocialAccountStatus } from '../generated/prisma/enums';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A wall clock ~30 days out. Computed rather than hardcoded to a far-future
 * year: the service caps a schedule at two years ahead, so a literal like
 * '2099-08-20' would be rejected for the *wrong* reason and quietly stop
 * testing anything.
 */
const FUTURE_DAY = new Date(Date.now() + 30 * 24 * 60 * 60_000)
  .toISOString()
  .slice(0, 10);
const FUTURE_LOCAL = `${FUTURE_DAY}T09:30`;
const KOLKATA = 'Asia/Kolkata';

function post(overrides: Record<string, any> = {}) {
  return {
    id: 'post-1',
    created_by: 'user-1',
    title: 'A post',
    caption: 'Something worth reading.',
    ai_caption: null,
    image_url: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
    media: null,
    platforms: ['linkedin'],
    status: PostStatus.DRAFT,
    scheduled_at: null,
    timezone: null,
    context_type: 'personal',
    brand_id: null,
    created_at: new Date('2026-08-01T00:00:00Z'),
    updated_at: new Date('2026-08-01T00:00:00Z'),
    post_platforms: [],
    ...overrides,
  };
}

function connection(overrides: Record<string, any> = {}) {
  return {
    id: 'account-1',
    status: SocialAccountStatus.CONNECTED,
    scopes: ['w_member_social'],
    ...overrides,
  };
}

/** Asserts a rejection carries the code the composer branches on. */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ScheduleError);
  await promise.catch((error: ScheduleError) => expect(error.code).toBe(code));
}

beforeEach(() => {
  // `reset`, not `clear`: several tests queue a `mockResolvedValueOnce`, and a
  // queue that outlives its test makes the *next* one fail for a reason that
  // has nothing to do with what it is asserting.
  vi.resetAllMocks();
  registry.providers.clear();
  registry.providers.set('linkedin', { id: 'linkedin', publish: vi.fn() });
  registry.providers.set('instagram', { id: 'instagram', publish: vi.fn() });
  registry.providers.set('x', {
    id: 'x',
    publish: vi.fn(),
    // The one provider that can renew its own access token.
    refreshTokens: vi.fn(),
  });
  // A network in the catalogue that FlowPost cannot publish to yet.
  registry.providers.set('youtube', { id: 'youtube' });

  accounts.findByUserAndProvider.mockResolvedValue(connection());
  repo.findForUser.mockResolvedValue(post());
  repo.armSchedule.mockResolvedValue(undefined);
  repo.cancelSchedule.mockResolvedValue(true);
  repo.rescheduleAt.mockResolvedValue(true);
  repo.rearmDestination.mockResolvedValue(true);
  repo.clearSchedule.mockResolvedValue(true);
  repo.syncParentStatus.mockResolvedValue(null);
  repo.listForUser.mockResolvedValue([]);
});

// ─── Creating a schedule ─────────────────────────────────────────────────────

describe('createSchedule', () => {
  it('arms the post at the instant the wall clock and zone name', async () => {
    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: FUTURE_LOCAL,
      timezone: KOLKATA,
    });

    const [postId, providers, instant, timezone] = repo.armSchedule.mock.calls[0];
    expect(postId).toBe('post-1');
    expect(providers).toEqual(['linkedin']);
    expect(timezone).toBe(KOLKATA);
    // 09:30 in Kolkata is 04:00Z — not 09:30Z, which is what a naive parse on
    // a UTC server would have stored.
    expect((instant as Date).toISOString()).toBe(`${FUTURE_DAY}T04:00:00.000Z`);
  });

  it('defaults to the post’s own platforms and de-duplicates a request', async () => {
    repo.findForUser.mockResolvedValue(
      post({ platforms: ['linkedin', 'instagram'] }),
    );

    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: FUTURE_LOCAL,
      timezone: 'UTC',
      providers: ['linkedin', 'LinkedIn', 'x'],
    });

    expect(repo.armSchedule.mock.calls[0][1]).toEqual(['linkedin', 'x']);
  });

  it('refuses a time in the past', async () => {
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: '2020-01-01T09:00',
        timezone: 'UTC',
      }),
      'SCHEDULE_TIME_IN_PAST',
    );
    expect(repo.armSchedule).not.toHaveBeenCalled();
  });

  it('judges "past" in the member’s zone, not the server’s', async () => {
    // 23:00 UTC. In Kolkata that is 04:30 the next morning — still ahead — so
    // this must be accepted, and would not be if the backend parsed naively.
    const inTwoHoursUtc = new Date(Date.now() + 2 * 60 * 60_000);
    const kolkataLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: KOLKATA,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(inTwoHoursUtc)
      .reduce<Record<string, string>>((out, part) => {
        out[part.type] = part.value;
        return out;
      }, {});

    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: `${kolkataLocal.year}-${kolkataLocal.month}-${kolkataLocal.day}T${kolkataLocal.hour}:${kolkataLocal.minute}`,
      timezone: KOLKATA,
    });

    expect(repo.armSchedule).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown timezone rather than assuming UTC', async () => {
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'Mars/Olympus',
      }),
      'TIMEZONE_INVALID',
    );
  });

  it('refuses a date that is not a date', async () => {
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: 'next tuesday',
        timezone: 'UTC',
      }),
      'SCHEDULE_TIME_INVALID',
    );
  });

  it('refuses a schedule with no destinations', async () => {
    repo.findForUser.mockResolvedValue(post({ platforms: [] }));
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'NO_DESTINATIONS',
    );
  });

  it('refuses a network FlowPost cannot publish to', async () => {
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
        providers: ['youtube'],
      }),
      'PROVIDER_NOT_SUPPORTED',
    );
  });

  it('refuses a network that is not connected', async () => {
    accounts.findByUserAndProvider.mockResolvedValue(null);
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'ACCOUNT_NOT_CONNECTED',
    );
  });

  it('refuses a revoked connection', async () => {
    accounts.findByUserAndProvider.mockResolvedValue(
      connection({ status: SocialAccountStatus.REVOKED }),
    );
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'ACCOUNT_NOT_CONNECTED',
    );
  });

  it('refuses a connection that declined the publishing permission', async () => {
    registry.providers.set('linkedin', {
      id: 'linkedin',
      publish: vi.fn(),
      canPublish: (scopes: string[]) => scopes.includes('w_member_social'),
    });
    accounts.findByUserAndProvider.mockResolvedValue(
      connection({ scopes: ['r_liteprofile'] }),
    );

    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'ACCOUNT_NOT_CONNECTED',
    );
  });

  it('refuses a post with no caption', async () => {
    repo.findForUser.mockResolvedValue(post({ caption: '   ', ai_caption: null }));
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'INVALID_CONTENT',
    );
  });

  it('refuses media we could not fetch at publish time', async () => {
    repo.findForUser.mockResolvedValue(
      post({ media: [{ url: 'file:///etc/passwd' }] }),
    );
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'INVALID_MEDIA',
    );
  });

  it('resolves the connection in the post’s own context, never the request’s', async () => {
    repo.findForUser.mockResolvedValue(
      post({ context_type: 'brand', brand_id: 'brand-1' }),
    );

    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: FUTURE_LOCAL,
      timezone: 'UTC',
    });

    expect(accounts.findByUserAndProvider).toHaveBeenCalledWith(
      'user-1',
      'linkedin',
      { contextType: 'brand', brandId: 'brand-1' },
    );
  });
});

// ─── X, whose access token expires every two hours ───────────────────────────

describe('X token expiry', () => {
  it('schedules against an EXPIRED X connection — the publish path renews it', async () => {
    accounts.findByUserAndProvider.mockResolvedValue(
      connection({ status: SocialAccountStatus.EXPIRED, scopes: ['tweet.write'] }),
    );

    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: FUTURE_LOCAL,
      timezone: 'UTC',
      providers: ['x'],
    });

    // EXPIRED is the *normal* state of an X connection two hours after it is
    // made, with a good refresh token beside it. Refusing here would make an X
    // account unschedulable most of the time.
    expect(repo.armSchedule).toHaveBeenCalledTimes(1);
  });

  it('still refuses an EXPIRED connection on a network that cannot refresh', async () => {
    accounts.findByUserAndProvider.mockResolvedValue(
      connection({ status: SocialAccountStatus.EXPIRED }),
    );

    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
        providers: ['linkedin'],
      }),
      'ACCOUNT_NOT_CONNECTED',
    );
  });
});

// ─── Ownership ───────────────────────────────────────────────────────────────

describe('ownership', () => {
  it('cannot schedule another member’s post', async () => {
    // `findForUser` filters on created_by in the query — a post that is not
    // this user's simply does not exist as far as this API is concerned.
    repo.findForUser.mockResolvedValue(null);

    await expectCode(
      scheduleService.createSchedule('someone-else', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'SCHEDULE_NOT_FOUND',
    );
    expect(repo.armSchedule).not.toHaveBeenCalled();
  });

  it('answers 404, not 403 — a 403 would confirm the id is real', async () => {
    repo.findForUser.mockResolvedValue(null);
    await scheduleService
      .getSchedule('someone-else', 'post-1')
      .catch((error: ScheduleError) => expect(error.status).toBe(404));
  });

  it('passes the caller’s id to every read', async () => {
    await scheduleService.getSchedule('user-1', 'post-1');
    expect(repo.findForUser).toHaveBeenCalledWith('post-1', 'user-1');
  });

  it('cannot cancel or read another member’s schedule', async () => {
    repo.findForUser.mockResolvedValue(null);
    await expectCode(
      scheduleService.cancelSchedule('someone-else', 'post-1'),
      'SCHEDULE_NOT_FOUND',
    );
    expect(repo.cancelSchedule).not.toHaveBeenCalled();
  });
});

// ─── The state machine ───────────────────────────────────────────────────────

describe('what may still be scheduled', () => {
  it('refuses a post that is being published right now', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.PUBLISHING }));
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'SCHEDULE_ALREADY_PROCESSING',
    );
  });

  it('refuses a post that has already been published', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.PUBLISHED }));
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'SCHEDULE_ALREADY_PUBLISHED',
    );
  });

  it('refuses a cancelled schedule', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.CANCELLED }));
    await expectCode(
      scheduleService.createSchedule('user-1', {
        postId: 'post-1',
        scheduledAt: FUTURE_LOCAL,
        timezone: 'UTC',
      }),
      'SCHEDULE_CANCELLED',
    );
  });

  it('allows rescheduling a post that failed', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.FAILED }));
    await scheduleService.createSchedule('user-1', {
      postId: 'post-1',
      scheduledAt: FUTURE_LOCAL,
      timezone: 'UTC',
    });
    expect(repo.armSchedule).toHaveBeenCalledTimes(1);
  });
});

// ─── Editing ─────────────────────────────────────────────────────────────────

describe('updateSchedule', () => {
  beforeEach(() => {
    repo.findForUser.mockResolvedValue(
      post({
        status: PostStatus.SCHEDULED,
        scheduled_at: new Date(`${FUTURE_DAY}T04:00:00Z`),
        timezone: KOLKATA,
      }),
    );
  });

  it('moves an armed schedule without re-arming its destinations', async () => {
    await scheduleService.updateSchedule('user-1', 'post-1', {
      scheduledAt: `${FUTURE_DAY}T18:00`,
    });

    expect(repo.rescheduleAt).toHaveBeenCalledTimes(1);
    expect(repo.armSchedule).not.toHaveBeenCalled();
    // The zone it was scheduled in is kept when the request does not send one.
    const [, , instant, timezone] = repo.rescheduleAt.mock.calls[0];
    expect(timezone).toBe(KOLKATA);
    expect((instant as Date).toISOString()).toBe(`${FUTURE_DAY}T12:30:00.000Z`);
  });

  it('re-arms wholesale when the destinations change', async () => {
    await scheduleService.updateSchedule('user-1', 'post-1', {
      providers: ['linkedin', 'instagram'],
    });

    expect(repo.armSchedule).toHaveBeenCalledTimes(1);
    expect(repo.armSchedule.mock.calls[0][1]).toEqual(['linkedin', 'instagram']);
  });

  it('reports a conditional-write refusal as the state it actually found', async () => {
    repo.rescheduleAt.mockResolvedValue(false);
    repo.findForUser
      .mockResolvedValueOnce(post({ status: PostStatus.SCHEDULED }))
      .mockResolvedValueOnce(post({ status: PostStatus.PUBLISHING }));

    await expectCode(
      scheduleService.updateSchedule('user-1', 'post-1', {
        scheduledAt: `${FUTURE_DAY}T18:00`,
      }),
      'SCHEDULE_ALREADY_PROCESSING',
    );
  });

  it('refuses to move a schedule into the past', async () => {
    await expectCode(
      scheduleService.updateSchedule('user-1', 'post-1', {
        scheduledAt: '2020-01-01T09:00',
      }),
      'SCHEDULE_TIME_IN_PAST',
    );
  });
});

// ─── Cancelling and retrying ─────────────────────────────────────────────────

describe('cancelSchedule', () => {
  it('cancels an armed schedule', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.SCHEDULED }));
    await scheduleService.cancelSchedule('user-1', 'post-1');
    expect(repo.cancelSchedule).toHaveBeenCalledWith('post-1', 'user-1');
  });

  it('refuses when the worker got there first', async () => {
    repo.cancelSchedule.mockResolvedValue(false);
    repo.findForUser
      .mockResolvedValueOnce(post({ status: PostStatus.SCHEDULED }))
      .mockResolvedValueOnce(post({ status: PostStatus.PUBLISHING }));

    await expectCode(
      scheduleService.cancelSchedule('user-1', 'post-1'),
      'SCHEDULE_ALREADY_PROCESSING',
    );
  });
});

describe('deleteSchedule', () => {
  it('takes the post off the schedule without deleting the post', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.FAILED }));
    await scheduleService.deleteSchedule('user-1', 'post-1');
    expect(repo.clearSchedule).toHaveBeenCalledWith('post-1', 'user-1');
  });

  it('refuses while a worker is publishing it', async () => {
    repo.clearSchedule.mockResolvedValue(false);
    repo.findForUser
      .mockResolvedValueOnce(post({ status: PostStatus.SCHEDULED }))
      .mockResolvedValueOnce(post({ status: PostStatus.PUBLISHING }));

    await expectCode(
      scheduleService.deleteSchedule('user-1', 'post-1'),
      'SCHEDULE_ALREADY_PROCESSING',
    );
  });

  it('cannot remove another member’s schedule', async () => {
    repo.findForUser.mockResolvedValue(null);
    await expectCode(
      scheduleService.deleteSchedule('someone-else', 'post-1'),
      'SCHEDULE_NOT_FOUND',
    );
    expect(repo.clearSchedule).not.toHaveBeenCalled();
  });
});

describe('retryDestination', () => {
  it('re-arms only the network that failed', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.PARTIALLY_PUBLISHED }));
    repo.findDestination.mockResolvedValue({ status: PublishStatus.FAILED });

    await scheduleService.retryDestination('user-1', 'post-1', 'x');

    expect(repo.rearmDestination).toHaveBeenCalledWith('post-1', 'x');
    // FAILED and PARTIALLY_PUBLISHED are not statuses the due query fires on;
    // re-deriving moves the post back to one that is.
    expect(repo.syncParentStatus).toHaveBeenCalledWith('post-1');
  });

  it('refuses to retry a network the post is already live on', async () => {
    repo.findForUser.mockResolvedValue(post({ status: PostStatus.PUBLISHED }));
    repo.findDestination.mockResolvedValue({ status: PublishStatus.PUBLISHED });

    await expectCode(
      scheduleService.retryDestination('user-1', 'post-1', 'linkedin'),
      'SCHEDULE_ALREADY_PUBLISHED',
    );
    expect(repo.rearmDestination).not.toHaveBeenCalled();
  });

  it('refuses a network the post was never scheduled to', async () => {
    repo.findDestination.mockResolvedValue(null);
    await expectCode(
      scheduleService.retryDestination('user-1', 'post-1', 'instagram'),
      'SCHEDULE_NOT_FOUND',
    );
  });
});

// ─── What the API hands back ─────────────────────────────────────────────────

describe('serialisation', () => {
  it('returns the instant, the zone and the wall clock the member picked', async () => {
    repo.findForUser.mockResolvedValue(
      post({
        status: PostStatus.SCHEDULED,
        scheduled_at: new Date(`${FUTURE_DAY}T04:00:00Z`),
        timezone: KOLKATA,
      }),
    );

    const view = await scheduleService.getSchedule('user-1', 'post-1');

    expect(view.scheduledAt).toBe(`${FUTURE_DAY}T04:00:00.000Z`);
    expect(view.timezone).toBe(KOLKATA);
    // The editor reopens on what they chose, not on 04:00 in whatever zone the
    // browser happens to be in today.
    expect(view.scheduledLocal).toBe(`${FUTURE_DAY}T09:30`);
  });

  it('reports per-destination state, including attempts left', async () => {
    repo.findForUser.mockResolvedValue(
      post({
        status: PostStatus.PARTIALLY_PUBLISHED,
        post_platforms: [
          {
            provider: 'linkedin',
            status: PublishStatus.PUBLISHED,
            publishedId: 'urn:li:share:1',
            permalink: 'https://linkedin.example/1',
            errorMessage: null,
            attempts: 1,
            lastAttemptAt: new Date(`${FUTURE_DAY}T04:00:00Z`),
            nextAttemptAt: null,
            publishedAt: new Date(`${FUTURE_DAY}T04:00:05Z`),
          },
          {
            provider: 'x',
            status: PublishStatus.FAILED,
            publishedId: null,
            permalink: null,
            errorMessage: 'X wouldn’t accept this post.',
            attempts: 3,
            lastAttemptAt: new Date(`${FUTURE_DAY}T04:11:00Z`),
            nextAttemptAt: null,
            publishedAt: null,
          },
        ],
      }),
    );

    const view = await scheduleService.getSchedule('user-1', 'post-1');

    expect(view.status).toBe(PostStatus.PARTIALLY_PUBLISHED);
    expect(view.destinations.map((d) => [d.provider, d.status])).toEqual([
      ['linkedin', PublishStatus.PUBLISHED],
      ['x', PublishStatus.FAILED],
    ]);
    expect(view.destinations[1].attemptsRemaining).toBe(0);
    expect(view.destinations[0].url).toBe('https://linkedin.example/1');
  });
});

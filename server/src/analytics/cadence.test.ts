import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MIN_SYNC_INTERVAL_MS,
  elapsedStageMs,
  failureBackoffMs,
  isAccountDue,
  isAccountEligible,
  isPublicationDue,
} from './cadence';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-08-11T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

/** A publication published at T0, observed (or not) at some offset. */
const pub = (lastCapturedOffsetMs: number | null) => ({
  publishedAt: T0,
  lastCapturedAt: lastCapturedOffsetMs === null ? null : at(lastCapturedOffsetMs),
});

describe('elapsedStageMs', () => {
  it('returns the newest boundary that has passed, not the next unobserved one', () => {
    // The self-healing property. A worker down from T+30m to T+30h owes one
    // read at the 24h boundary — not three catch-up reads for boundaries whose
    // numbers are no longer obtainable.
    expect(elapsedStageMs(30 * 60_000)).toBeNull();
    expect(elapsedStageMs(2 * HOUR)).toBe(1 * HOUR);
    expect(elapsedStageMs(30 * HOUR)).toBe(24 * HOUR);
    expect(elapsedStageMs(10 * DAY)).toBe(72 * HOUR);
  });
});

describe('isPublicationDue', () => {
  it('is not due before the first observation point', () => {
    // Reading a post ten minutes after it went out mostly measures how fast we
    // can make an HTTP request.
    expect(isPublicationDue(pub(null), at(10 * 60_000))).toBe(false);
    expect(isPublicationDue(pub(null), at(59 * 60_000))).toBe(false);
  });

  it('becomes due at T+1h when never observed', () => {
    expect(isPublicationDue(pub(null), at(HOUR))).toBe(true);
  });

  it('walks the staged schedule, one observation per boundary', () => {
    // Observed at T+1h → nothing more until T+6h.
    expect(isPublicationDue(pub(HOUR), at(2 * HOUR))).toBe(false);
    expect(isPublicationDue(pub(HOUR), at(6 * HOUR))).toBe(true);

    expect(isPublicationDue(pub(6 * HOUR), at(12 * HOUR))).toBe(false);
    expect(isPublicationDue(pub(6 * HOUR), at(24 * HOUR))).toBe(true);

    expect(isPublicationDue(pub(24 * HOUR), at(48 * HOUR))).toBe(false);
    expect(isPublicationDue(pub(24 * HOUR), at(72 * HOUR))).toBe(true);
  });

  it('drops to a weekly tail once the staged schedule is done', () => {
    // Not every hour forever — this is the difference between a few cents and a
    // standing charge on a metered API.
    expect(isPublicationDue(pub(72 * HOUR), at(4 * DAY))).toBe(false);
    expect(isPublicationDue(pub(72 * HOUR), at(6 * DAY))).toBe(false);
    expect(isPublicationDue(pub(72 * HOUR), at(10 * DAY))).toBe(true);
  });

  it('stops asking past the provider horizon, whatever the schedule says', () => {
    // X serves post metrics for 30 days. Asking on day 40 is a metered request
    // that cannot succeed.
    const maxAge = 30 * DAY;
    expect(isPublicationDue(pub(20 * DAY), at(29 * DAY), maxAge)).toBe(true);
    expect(isPublicationDue(pub(20 * DAY), at(31 * DAY), maxAge)).toBe(false);
    expect(isPublicationDue(pub(null), at(40 * DAY), maxAge)).toBe(false);
  });

  it('is not due for a publication timestamped in the future', () => {
    expect(isPublicationDue(pub(null), new Date(T0.getTime() - HOUR))).toBe(false);
  });

  it('catches up a post that was never observed during its staged window', () => {
    // A connection added long after publishing, or a worker that was down. One
    // read, now.
    expect(isPublicationDue(pub(null), at(5 * DAY), 30 * DAY)).toBe(true);
  });
});

describe('isAccountDue', () => {
  it('reads follower counts daily, not hourly', () => {
    expect(isAccountDue(null, T0)).toBe(true);
    expect(isAccountDue(T0, at(6 * HOUR))).toBe(false);
    expect(isAccountDue(T0, at(DAY))).toBe(true);
  });
});

describe('failureBackoffMs', () => {
  it('doubles from five minutes and caps at six hours', () => {
    expect(failureBackoffMs(0)).toBe(0);
    expect(failureBackoffMs(1)).toBe(5 * 60_000);
    expect(failureBackoffMs(2)).toBe(10 * 60_000);
    expect(failureBackoffMs(3)).toBe(20 * 60_000);
    // Capped, so an account that failed all night resumes in the morning
    // instead of sitting at a twelve-hour delay.
    expect(failureBackoffMs(20)).toBe(6 * HOUR);
  });
});

describe('isAccountEligible — automatic sync eligibility', () => {
  const healthy = { lastSyncAt: null, consecutiveFailures: 0, rateLimitedUntil: null };

  it('contacts a connection that has never been synced', () => {
    expect(isAccountEligible(healthy, T0)).toBe(true);
  });

  it('paces a healthy connection to the minimum interval', () => {
    const state = { ...healthy, lastSyncAt: T0 };
    expect(isAccountEligible(state, at(ACCOUNT_MIN_SYNC_INTERVAL_MS - 1))).toBe(false);
    expect(isAccountEligible(state, at(ACCOUNT_MIN_SYNC_INTERVAL_MS))).toBe(true);
  });

  it('honours an explicit rate-limit stand-down above everything else', () => {
    // Even a connection that has never been synced waits. A network that said
    // "too many requests" is not negotiable.
    const limited = { ...healthy, rateLimitedUntil: at(HOUR) };
    expect(isAccountEligible(limited, at(30 * 60_000))).toBe(false);
    expect(isAccountEligible(limited, at(HOUR + 1))).toBe(true);
  });

  it('applies the failure backoff instead of the ordinary interval', () => {
    const failing = { lastSyncAt: T0, consecutiveFailures: 3, rateLimitedUntil: null };
    // 20 minutes of backoff is shorter than the 30-minute pacing floor, but the
    // backoff branch is the one that applies once failures are non-zero.
    expect(isAccountEligible(failing, at(10 * 60_000))).toBe(false);
    expect(isAccountEligible(failing, at(20 * 60_000))).toBe(true);
  });
});

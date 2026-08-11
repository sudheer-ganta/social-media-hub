/**
 * Wall clock → instant. Unit tests.
 *
 * The bug these exist to prevent: a member in Kolkata schedules 09:30, Render
 * parses it in UTC, and the post goes out at 15:00 their time. Every assertion
 * below is an instant, never a formatted local string, because a formatted
 * string is exactly the thing that hides the error.
 *
 * Run: cd server && npx vitest run src/scheduler/timezone.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  zonedTimeToUtc,
  utcToZonedLocalIso,
  isValidTimeZone,
  TimezoneError,
} from './timezone';

describe('zonedTimeToUtc', () => {
  it('resolves the example from the brief: 09:30 in Asia/Kolkata is 04:00Z', () => {
    // +05:30, year round — no DST to confuse it.
    expect(zonedTimeToUtc('2026-08-20T09:30:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-20T04:00:00.000Z',
    );
  });

  it('accepts the seconds-less form the composer sends', () => {
    expect(zonedTimeToUtc('2026-08-20T09:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-20T04:00:00.000Z',
    );
  });

  it('treats UTC as the identity', () => {
    expect(zonedTimeToUtc('2026-08-20T09:30', 'UTC').toISOString()).toBe(
      '2026-08-20T09:30:00.000Z',
    );
  });

  it('is NOT the naive parse — the regression this module exists for', () => {
    const correct = zonedTimeToUtc('2026-08-20T09:30', 'Asia/Kolkata');
    // What `new Date(local)` would have produced on a UTC server.
    const naive = new Date('2026-08-20T09:30:00Z');
    expect(correct.getTime()).not.toBe(naive.getTime());
    expect(naive.getTime() - correct.getTime()).toBe(5.5 * 60 * 60 * 1000);
  });

  describe('daylight saving', () => {
    it('uses summer time for a July date in New York (UTC-4)', () => {
      expect(zonedTimeToUtc('2026-07-15T09:00', 'America/New_York').toISOString()).toBe(
        '2026-07-15T13:00:00.000Z',
      );
    });

    it('uses standard time for a January date in New York (UTC-5)', () => {
      expect(zonedTimeToUtc('2026-01-15T09:00', 'America/New_York').toISOString()).toBe(
        '2026-01-15T14:00:00.000Z',
      );
    });

    it('the same wall clock is a different instant either side of the change', () => {
      const summer = zonedTimeToUtc('2026-07-15T09:00', 'America/New_York');
      const winter = zonedTimeToUtc('2026-01-15T09:00', 'America/New_York');
      expect(winter.getUTCHours() - summer.getUTCHours()).toBe(1);
    });

    it('handles Europe/London, which is UTC in winter and UTC+1 in summer', () => {
      expect(zonedTimeToUtc('2026-01-15T09:00', 'Europe/London').toISOString()).toBe(
        '2026-01-15T09:00:00.000Z',
      );
      expect(zonedTimeToUtc('2026-07-15T09:00', 'Europe/London').toISOString()).toBe(
        '2026-07-15T08:00:00.000Z',
      );
    });

    it('resolves an hour just after the spring-forward boundary correctly', () => {
      // US DST 2026 begins 08 March, 02:00 → 03:00 local. 03:30 exists and is
      // EDT (UTC-4): 07:30Z. Getting this wrong by an hour is the classic
      // single-pass-offset bug.
      expect(zonedTimeToUtc('2026-03-08T03:30', 'America/New_York').toISOString()).toBe(
        '2026-03-08T07:30:00.000Z',
      );
    });

    it('resolves an hour just before the boundary correctly', () => {
      // 01:30 on the same morning is still EST (UTC-5): 06:30Z.
      expect(zonedTimeToUtc('2026-03-08T01:30', 'America/New_York').toISOString()).toBe(
        '2026-03-08T06:30:00.000Z',
      );
    });

    it('shifts a time that does not exist forward rather than refusing it', () => {
      // 02:30 on 08 March 2026 never happens in New York. Publishing an hour
      // late once a year beats refusing to schedule at all.
      const resolved = zonedTimeToUtc('2026-03-08T02:30', 'America/New_York');
      expect(resolved.toISOString()).toBe('2026-03-08T07:30:00.000Z');
      expect(utcToZonedLocalIso(resolved, 'America/New_York')).toBe('2026-03-08T03:30');
    });

    it('picks the first occurrence of an hour that happens twice', () => {
      // US DST 2026 ends 01 November, 02:00 → 01:00. 01:30 occurs at 05:30Z
      // (EDT) and again at 06:30Z (EST). The earlier one wins.
      expect(zonedTimeToUtc('2026-11-01T01:30', 'America/New_York').toISOString()).toBe(
        '2026-11-01T05:30:00.000Z',
      );
    });

    it('handles a southern-hemisphere zone, where the seasons are inverted', () => {
      // Sydney is UTC+11 in January (summer) and UTC+10 in July (winter).
      expect(zonedTimeToUtc('2026-01-15T09:00', 'Australia/Sydney').toISOString()).toBe(
        '2026-01-14T22:00:00.000Z',
      );
      expect(zonedTimeToUtc('2026-07-15T09:00', 'Australia/Sydney').toISOString()).toBe(
        '2026-07-14T23:00:00.000Z',
      );
    });
  });

  describe('rejection', () => {
    it('refuses an unknown zone rather than falling back to UTC', () => {
      expect(() => zonedTimeToUtc('2026-08-20T09:30', 'Mars/Olympus')).toThrow(
        TimezoneError,
      );
    });

    it('refuses a value that is not a local date and time', () => {
      for (const bad of ['tomorrow', '2026-08-20', '20/08/2026 09:30', '']) {
        expect(() => zonedTimeToUtc(bad, 'UTC')).toThrow(TimezoneError);
      }
    });

    it('refuses an instant with a zone already on it — two answers, one field', () => {
      expect(() => zonedTimeToUtc('2026-08-20T09:30:00Z', 'Asia/Kolkata')).toThrow(
        TimezoneError,
      );
    });
  });
});

describe('utcToZonedLocalIso', () => {
  it('round-trips the wall clock a member picked', () => {
    for (const [local, zone] of [
      ['2026-08-20T09:30', 'Asia/Kolkata'],
      ['2026-07-15T09:00', 'America/New_York'],
      ['2026-01-15T23:45', 'Europe/London'],
      ['2026-01-15T00:00', 'Australia/Sydney'],
    ] as const) {
      expect(utcToZonedLocalIso(zonedTimeToUtc(local, zone), zone)).toBe(local);
    }
  });

  it('renders midnight as 00, never 24', () => {
    expect(utcToZonedLocalIso(new Date('2026-08-20T00:00:00Z'), 'UTC')).toBe(
      '2026-08-20T00:00',
    );
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA names and rejects everything else', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined as unknown as string)).toBe(false);
  });
});

/**
 * The best-time engine's arithmetic and its refusals.
 *
 * Run: cd server && npx vitest run src/analytics/timing.test.ts
 *
 * The refusals matter more than the recommendations here. Anything can pick the
 * best of five hours; the tests that earn their keep are the ones proving the
 * engine declines to — on too small a sample, on a sample spread too thin, and
 * on evidence it does not have.
 */

import { describe, expect, it } from 'vitest';
import { MediaType } from '../generated/prisma/enums';
import {
  BUCKET_MINUTES,
  DEFAULT_TIMING_GATES,
  TIMING_EVIDENCE_BY_PROVIDER,
  bestTimeFor,
  bucketBy,
  chooseMetric,
  formatClock,
  formatLocalTime,
  hasAudienceActivity,
  localTimeOf,
  median,
  narrowToSlot,
  occurrencesFor,
  scoreOf,
  selectBasis,
  type TimingGates,
  type TimingPublication,
} from './timing';

const KOLKATA = 'Asia/Kolkata';
const UTC = 'UTC';

/**
 * One publication at a given UTC instant.
 *
 * `at` is an ISO string so a test reads as a wall clock rather than as an epoch
 * offset, and the timezone under test is what turns it into a local hour.
 */
function pub(
  at: string,
  overrides: Partial<TimingPublication> = {},
): TimingPublication {
  return {
    provider: 'instagram',
    publishedAt: new Date(at),
    mediaType: null,
    contentType: null,
    engagement: 50,
    exposure: 1000,
    ...overrides,
  };
}

/** `count` publications at the same instant, so a bucket can be filled cheaply. */
function many(
  count: number,
  at: string,
  overrides: Partial<TimingPublication> = {},
): TimingPublication[] {
  return Array.from({ length: count }, () => pub(at, overrides));
}

describe('median', () => {
  it('is null for nothing', () => {
    expect(median([])).toBeNull();
  });

  it('takes the middle of an odd list', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('takes the mean of the middle two of an even list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is unmoved by one outlier', () => {
    expect(median([1, 1, 1, 1, 10_000])).toBe(1);
  });
});

describe('scoreOf', () => {
  it('divides engagement by exposure for a rate', () => {
    expect(scoreOf(pub('2026-01-01T12:00:00Z'), 'engagement_rate')).toBe(0.05);
  });

  it('ranks the smaller post above the bigger one when the rate is better', () => {
    // The example from the brief: 50/1000 beats 100/10000.
    const strong = scoreOf(
      pub('2026-01-01T12:00:00Z', { engagement: 50, exposure: 1000 }),
      'engagement_rate',
    );
    const weak = scoreOf(
      pub('2026-01-01T12:00:00Z', { engagement: 100, exposure: 10_000 }),
      'engagement_rate',
    );
    expect(strong).toBeGreaterThan(weak as number);
  });

  it('is null for a rate with no exposure — never a zero', () => {
    expect(
      scoreOf(pub('2026-01-01T12:00:00Z', { exposure: null }), 'engagement_rate'),
    ).toBeNull();
  });

  it('is null for a rate with a zero denominator', () => {
    expect(
      scoreOf(pub('2026-01-01T12:00:00Z', { exposure: 0 }), 'engagement_rate'),
    ).toBeNull();
  });

  it('is null whenever engagement itself was not reported', () => {
    expect(
      scoreOf(pub('2026-01-01T12:00:00Z', { engagement: null }), 'engagement'),
    ).toBeNull();
  });

  it('uses the raw count when the metric is a count', () => {
    expect(
      scoreOf(pub('2026-01-01T12:00:00Z', { exposure: null, engagement: 7 }), 'engagement'),
    ).toBe(7);
  });
});

describe('chooseMetric', () => {
  it('prefers a rate once enough publications carry exposure', () => {
    expect(chooseMetric(many(10, '2026-01-01T12:00:00Z'))).toBe('engagement_rate');
  });

  it('falls back to counts when the network reports no exposure', () => {
    // Facebook's case: engagement present, exposure permanently null.
    const facebook = many(30, '2026-01-01T12:00:00Z', {
      provider: 'facebook',
      exposure: null,
    });
    expect(chooseMetric(facebook)).toBe('engagement');
  });

  it('falls back to counts when too few publications have been measured', () => {
    expect(chooseMetric(many(3, '2026-01-01T12:00:00Z'))).toBe('engagement');
  });
});

describe('localTimeOf', () => {
  it('reads the hour on the member’s clock, not on UTC', () => {
    // 15:00 UTC is 20:30 in Kolkata (+05:30).
    const local = localTimeOf(new Date('2026-03-10T15:00:00Z'), KOLKATA);
    expect(formatLocalTime(local.minutes)).toBe('20:30');
  });

  it('reads the local weekday, which can differ from the UTC one', () => {
    // 20:00 UTC Sunday is 01:30 Monday in Kolkata.
    const local = localTimeOf(new Date('2026-03-08T20:00:00Z'), KOLKATA);
    expect(local.weekday).toBe(1);
    expect(formatLocalTime(local.minutes)).toBe('01:30');
  });

  it('agrees with UTC when the zone is UTC', () => {
    const local = localTimeOf(new Date('2026-03-10T15:00:00Z'), UTC);
    expect(formatLocalTime(local.minutes)).toBe('15:00');
  });

  it('follows a daylight-saving change rather than a fixed offset', () => {
    // New York is -05:00 in January and -04:00 in July. The same UTC clock time
    // is therefore a different local hour in each.
    const winter = localTimeOf(new Date('2026-01-15T18:00:00Z'), 'America/New_York');
    const summer = localTimeOf(new Date('2026-07-15T18:00:00Z'), 'America/New_York');
    expect(formatLocalTime(winter.minutes)).toBe('13:00');
    expect(formatLocalTime(summer.minutes)).toBe('14:00');
  });
});

describe('formatLocalTime', () => {
  it('pads to a wall clock the scheduler’s time input accepts', () => {
    expect(formatLocalTime(0)).toBe('00:00');
    expect(formatLocalTime(570)).toBe('09:30');
    expect(formatLocalTime(1230)).toBe('20:30');
  });

  it('wraps midnight rather than printing a 24th hour', () => {
    expect(formatLocalTime(1440)).toBe('00:00');
  });
});

describe('formatClock', () => {
  it('reads as a member reads a clock', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(570)).toBe('9:30 AM');
    expect(formatClock(12 * 60)).toBe('12:00 PM');
    expect(formatClock(1230)).toBe('8:30 PM');
    expect(formatClock(23 * 60 + 45)).toBe('11:45 PM');
  });

  it('is used for prose and never for a wire value', () => {
    // The two must not be swapped: `formatLocalTime` feeds the scheduler's time
    // input and the schedule API, which parse `HH:mm` and nothing else.
    expect(formatLocalTime(1230)).toBe('20:30');
    expect(formatClock(1230)).not.toBe(formatLocalTime(1230));
  });

  it('is what the explanation quotes, so the panel and the sentence agree', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(20, '2026-03-10T15:00:00Z', { engagement: 500 }),
        ...many(15, '2026-03-10T04:00:00Z', { engagement: 5 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.reason).toMatch(/8:00 PM–9:00 PM/);
    expect(result.reason).not.toMatch(/20:00/);
  });
});

describe('occurrencesFor', () => {
  it('offers today when the window is still ahead on the local clock', () => {
    // 09:00 UTC is 14:30 in Kolkata; 20:30 is still to come.
    const occurrences = occurrencesFor(20 * 60 + 30, KOLKATA, new Date('2026-08-12T09:00:00Z'));
    expect(occurrences.today).toBe('2026-08-12T20:30');
    expect(occurrences.tomorrow).toBe('2026-08-13T20:30');
  });

  it('withholds today once the window has passed locally', () => {
    // 18:00 UTC is 23:30 in Kolkata — 20:30 has gone.
    const occurrences = occurrencesFor(20 * 60 + 30, KOLKATA, new Date('2026-08-12T18:00:00Z'));
    expect(occurrences.today).toBeNull();
    expect(occurrences.tomorrow).toBe('2026-08-13T20:30');
  });

  it('uses the member’s calendar day, not the UTC one', () => {
    // 20:00 UTC on the 12th is already 01:30 on the 13th in Kolkata.
    const occurrences = occurrencesFor(9 * 60, KOLKATA, new Date('2026-08-12T20:00:00Z'));
    expect(occurrences.today).toBe('2026-08-13T09:00');
    expect(occurrences.tomorrow).toBe('2026-08-14T09:00');
  });

  it('rolls over a month end', () => {
    const occurrences = occurrencesFor(9 * 60, UTC, new Date('2026-08-31T20:00:00Z'));
    expect(occurrences.tomorrow).toBe('2026-09-01T09:00');
  });

  it('emits the shape the schedule API takes for scheduledAt', () => {
    const occurrences = occurrencesFor(570, UTC, new Date('2026-08-12T00:00:00Z'));
    expect(occurrences.today).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('bucketBy', () => {
  it('groups into hour-of-day buckets on the local clock', () => {
    const buckets = bucketBy(
      [...many(3, '2026-03-10T15:00:00Z'), ...many(2, '2026-03-10T04:00:00Z')],
      KOLKATA,
      'engagement_rate',
    );
    // 20:30 local → the 20:00 bucket; 09:30 local → the 09:00 bucket.
    expect(buckets.map((bucket) => bucket.startMinutes).sort((a, b) => a - b)).toEqual([
      9 * 60,
      20 * 60,
    ]);
    expect(BUCKET_MINUTES).toBe(60);
  });

  it('drops unscoreable publications instead of counting them as zero', () => {
    const buckets = bucketBy(
      [
        ...many(2, '2026-03-10T15:00:00Z', { engagement: 50 }),
        ...many(5, '2026-03-10T15:00:00Z', { engagement: null }),
      ],
      KOLKATA,
      'engagement',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].n).toBe(2);
  });

  it('records which local weekdays a bucket drew on', () => {
    const buckets = bucketBy(
      [pub('2026-03-09T15:00:00Z'), pub('2026-03-11T15:00:00Z')],
      KOLKATA,
      'engagement_rate',
    );
    // Monday and Wednesday, both at 20:30 local.
    expect(buckets[0].weekdays).toEqual([1, 3]);
  });

  it('sorts strongest first', () => {
    const buckets = bucketBy(
      [
        ...many(3, '2026-03-10T04:00:00Z', { engagement: 10 }),
        ...many(3, '2026-03-10T15:00:00Z', { engagement: 900 }),
      ],
      KOLKATA,
      'engagement',
    );
    expect(buckets[0].startMinutes).toBe(20 * 60);
  });
});

describe('narrowToSlot', () => {
  const gates: TimingGates = { ...DEFAULT_TIMING_GATES, minSlotPosts: 2 };

  it('narrows to the stronger half hour once it has its own sample', () => {
    const publications = [
      // 20:00 local ×2, weak.
      ...many(2, '2026-03-10T14:30:00Z', { engagement: 1 }),
      // 20:30 local ×2, strong.
      ...many(2, '2026-03-10T15:00:00Z', { engagement: 500 }),
    ];
    expect(narrowToSlot(publications, KOLKATA, 'engagement', 20 * 60, gates)).toBe(
      20 * 60 + 30,
    );
  });

  it('stays on the hour when no half hour clears the gate', () => {
    const publications = many(1, '2026-03-10T15:00:00Z', { engagement: 500 });
    expect(narrowToSlot(publications, KOLKATA, 'engagement', 20 * 60, gates)).toBe(
      20 * 60,
    );
  });

  it('ignores publications from other hours', () => {
    const publications = many(5, '2026-03-10T04:00:00Z', { engagement: 900 });
    expect(narrowToSlot(publications, KOLKATA, 'engagement', 20 * 60, gates)).toBe(
      20 * 60,
    );
  });
});

describe('selectBasis', () => {
  const gates: TimingGates = { ...DEFAULT_TIMING_GATES, early: 4 };

  it('uses the requested content type when it has enough history', () => {
    const publications = [
      ...many(5, '2026-03-10T15:00:00Z', { contentType: MediaType.REEL }),
      ...many(5, '2026-03-10T04:00:00Z', { contentType: MediaType.IMAGE }),
    ];
    const selected = selectBasis(publications, MediaType.REEL, gates);
    expect(selected.basis).toBe('content_type');
    expect(selected.publications).toHaveLength(5);
  });

  it('falls back to the observed format when the requested one is thin', () => {
    const publications = [
      ...many(2, '2026-03-10T15:00:00Z', { contentType: MediaType.REEL }),
      ...many(5, '2026-03-10T15:00:00Z', { mediaType: MediaType.REEL }),
    ];
    const selected = selectBasis(publications, MediaType.REEL, gates);
    expect(selected.basis).toBe('media_type');
  });

  it('falls back to the whole platform when neither format slice is enough', () => {
    const publications = many(10, '2026-03-10T15:00:00Z', {
      contentType: MediaType.IMAGE,
    });
    const selected = selectBasis(publications, MediaType.REEL, gates);
    expect(selected.basis).toBe('platform');
    expect(selected.publications).toHaveLength(10);
  });

  it('is platform-level immediately when no format was named', () => {
    const publications = many(10, '2026-03-10T15:00:00Z', {
      contentType: MediaType.REEL,
    });
    expect(selectBasis(publications, null, gates).basis).toBe('platform');
  });
});

describe('audience-activity evidence', () => {
  it('is unavailable for every network FlowPost integrates', () => {
    // The engine may not claim "your followers are most active" until a provider
    // adapter genuinely populates this. Nothing does today.
    for (const provider of ['instagram', 'facebook', 'linkedin', 'x']) {
      expect(hasAudienceActivity(provider)).toBe(false);
      expect(TIMING_EVIDENCE_BY_PROVIDER[provider]).toBe(false);
    }
  });

  it('reports publish history as the source on every recommendation', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: many(40, '2026-03-10T15:00:00Z'),
      timeZone: KOLKATA,
    });
    expect(result.evidence).toBe('publish_history');
  });

  it('never says the audience is active', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(30, '2026-03-10T15:00:00Z', { engagement: 500 }),
        ...many(20, '2026-03-10T04:00:00Z', { engagement: 5 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.reason).not.toMatch(/audience|active|online|followers/i);
    expect(result.reason).toMatch(/your Instagram posts/i);
  });
});

describe('bestTimeFor — the sample gates', () => {
  it('refuses a personalised recommendation below the early gate', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: many(9, '2026-03-10T15:00:00Z'),
      timeZone: KOLKATA,
    });
    expect(result.confidence).toBe('none');
    expect(result.recommendedMinutes).toBeNull();
    expect(result.window).toBeNull();
    expect(result.reason).toBe('Not enough history yet.');
  });

  it('calls 10–29 measured posts an early signal', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(10, '2026-03-10T15:00:00Z', { engagement: 500 }),
        ...many(10, '2026-03-10T04:00:00Z', { engagement: 5 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.sampleSize).toBe(20);
    expect(result.confidence).toBe('early');
    expect(result.reason).toMatch(/Early signal, based on only 20 measured posts/);
  });

  it('calls 30 or more a strong signal', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(20, '2026-03-10T15:00:00Z', { engagement: 500 }),
        ...many(20, '2026-03-10T04:00:00Z', { engagement: 5 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.sampleSize).toBe(40);
    expect(result.confidence).toBe('strong');
    expect(result.reason).toMatch(/Based on 40 measured posts/);
  });

  it('takes its strong threshold from the gates rather than a literal', () => {
    const publications = many(12, '2026-03-10T15:00:00Z');
    expect(
      bestTimeFor({
        provider: 'instagram',
        label: 'Instagram',
        publications,
        timeZone: KOLKATA,
        gates: { ...DEFAULT_TIMING_GATES, strong: 12 },
      }).confidence,
    ).toBe('strong');
  });

  it('refuses when the sample is spread too thinly to fill one hour', () => {
    // 24 posts, one per hour: enough posts, no bucket with three.
    const publications = Array.from({ length: 24 }, (_, hour) =>
      pub(`2026-03-10T${String(hour).padStart(2, '0')}:00:00Z`),
    );
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications,
      timeZone: UTC,
    });
    expect(result.confidence).toBe('none');
    expect(result.recommendedMinutes).toBeNull();
    expect(result.reason).toMatch(/spread too evenly/);
  });
});

describe('bestTimeFor — the recommendation', () => {
  const strongEvening = [
    ...many(20, '2026-03-10T15:00:00Z', { engagement: 500 }),
    ...many(10, '2026-03-10T04:00:00Z', { engagement: 100 }),
    ...many(10, '2026-03-10T06:00:00Z', { engagement: 10 }),
  ];

  it('names the winning hour on the member’s clock', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: strongEvening,
      timeZone: KOLKATA,
    });
    expect(formatLocalTime(result.window!.startMinutes)).toBe('20:00');
    expect(formatLocalTime(result.window!.endMinutes)).toBe('21:00');
  });

  it('offers the three half-hour choices spanning the window', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: strongEvening,
      timeZone: KOLKATA,
    });
    expect(result.slots.map(formatLocalTime)).toEqual(['20:00', '20:30', '21:00']);
  });

  it('quotes a lift against the member’s own median', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: strongEvening,
      timeZone: KOLKATA,
    });
    expect(result.lift).toBeGreaterThan(0);
    expect(result.reason).toMatch(/% above your median/);
  });

  it('states no percentage when the winner is not above the median', () => {
    // Every post identical: a winner exists, a lift does not.
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: many(30, '2026-03-10T15:00:00Z'),
      timeZone: KOLKATA,
    });
    expect(result.lift).toBeNull();
    expect(result.reason).not.toMatch(/%/);
    expect(result.reason).toMatch(/have performed best/);
  });

  it('returns alternative windows that also beat the median', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(10, '2026-03-10T15:00:00Z', { engagement: 900 }),
        ...many(10, '2026-03-10T16:00:00Z', { engagement: 800 }),
        ...many(10, '2026-03-10T17:00:00Z', { engagement: 700 }),
        ...many(10, '2026-03-10T04:00:00Z', { engagement: 1 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives).not.toContain(result.window!.startMinutes);
    // 22:00 local is left out on purpose: its median sits below the group
    // median, so offering it would be offering a below-average hour.
    expect(result.alternatives.map(formatLocalTime)).toEqual(['21:00']);
  });

  it('offers no alternatives when nothing else beats the median', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(10, '2026-03-10T15:00:00Z', { engagement: 900 }),
        ...many(20, '2026-03-10T04:00:00Z', { engagement: 1 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.alternatives).toEqual([]);
  });

  it('reports the same evidence in a different zone as a different local hour', () => {
    const utc = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: strongEvening,
      timeZone: UTC,
    });
    expect(formatLocalTime(utc.window!.startMinutes)).toBe('15:00');
  });

  it('discloses when a format’s time came from wider history', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(20, '2026-03-10T15:00:00Z', { contentType: MediaType.IMAGE, engagement: 500 }),
        ...many(10, '2026-03-10T04:00:00Z', { contentType: MediaType.IMAGE, engagement: 5 }),
      ],
      timeZone: KOLKATA,
      format: MediaType.REEL,
    });
    expect(result.basis).toBe('platform');
    expect(result.reason).toMatch(/not enough reel history on its own yet/i);
  });

  it('says nothing about widening when the format had its own history', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(20, '2026-03-10T15:00:00Z', { contentType: MediaType.REEL, engagement: 500 }),
        ...many(10, '2026-03-10T04:00:00Z', { contentType: MediaType.REEL, engagement: 5 }),
      ],
      timeZone: KOLKATA,
      format: MediaType.REEL,
    });
    expect(result.basis).toBe('content_type');
    expect(result.reason).not.toMatch(/not enough/i);
  });

  it('reports which weekdays the evidence spans without claiming one', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(15, '2026-03-09T15:00:00Z'),
        ...many(15, '2026-03-11T15:00:00Z'),
      ],
      timeZone: KOLKATA,
    });
    expect(result.weekdaysObserved).toEqual([1, 3]);
    expect(result.reason).not.toMatch(/monday|wednesday/i);
  });
});

describe('bestTimeFor — never blending networks', () => {
  it('scores only the network it was asked about', () => {
    const result = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications: [
        ...many(15, '2026-03-10T15:00:00Z', { provider: 'instagram', engagement: 500 }),
        // LinkedIn measures impressions where Instagram measures reach. These
        // must never enter the same ranking, whatever they say.
        ...many(50, '2026-03-10T04:00:00Z', { provider: 'linkedin', engagement: 9000 }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.sampleSize).toBe(15);
    // The window is the hour; the recommendation is narrowed to the half hour
    // those fifteen posts actually landed in.
    expect(formatLocalTime(result.window!.startMinutes)).toBe('20:00');
    expect(formatLocalTime(result.recommendedMinutes!)).toBe('20:30');
  });

  it('gives two networks two different times from the same history', () => {
    const publications = [
      ...many(15, '2026-03-10T15:00:00Z', { provider: 'instagram', engagement: 500 }),
      ...many(15, '2026-03-10T22:00:00Z', { provider: 'instagram', engagement: 5 }),
      ...many(15, '2026-03-10T03:45:00Z', { provider: 'linkedin', engagement: 500 }),
      ...many(15, '2026-03-10T22:00:00Z', { provider: 'linkedin', engagement: 5 }),
    ];
    const instagram = bestTimeFor({
      provider: 'instagram',
      label: 'Instagram',
      publications,
      timeZone: KOLKATA,
    });
    const linkedin = bestTimeFor({
      provider: 'linkedin',
      label: 'LinkedIn',
      publications,
      timeZone: KOLKATA,
    });
    expect(formatLocalTime(instagram.window!.startMinutes)).toBe('20:00');
    expect(formatLocalTime(linkedin.window!.startMinutes)).toBe('09:00');
  });

  it('handles a network that reports no exposure at all', () => {
    const result = bestTimeFor({
      provider: 'facebook',
      label: 'Facebook',
      publications: [
        ...many(20, '2026-03-10T15:00:00Z', {
          provider: 'facebook',
          exposure: null,
          engagement: 40,
        }),
        ...many(15, '2026-03-10T04:00:00Z', {
          provider: 'facebook',
          exposure: null,
          engagement: 4,
        }),
      ],
      timeZone: KOLKATA,
    });
    expect(result.metric).toBe('engagement');
    expect(result.confidence).toBe('strong');
    expect(result.recommendedMinutes).not.toBeNull();
  });

  it('invents nothing when a network has no history at all', () => {
    const result = bestTimeFor({
      provider: 'x',
      label: 'X',
      publications: many(40, '2026-03-10T15:00:00Z', { provider: 'instagram' }),
      timeZone: KOLKATA,
    });
    expect(result.sampleSize).toBe(0);
    expect(result.confidence).toBe('none');
    expect(result.recommendedMinutes).toBeNull();
  });
});

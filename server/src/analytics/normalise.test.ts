import { describe, expect, it } from 'vitest';
import { MediaType } from '../generated/prisma/enums';
import {
  aggregate,
  average,
  engagementOf,
  exposureOf,
  inferMediaTypeFromUpload,
  rate,
  toMediaType,
} from './normalise';

/**
 * The honesty rules, made executable.
 *
 * Almost every case here is about the same thing: null must never become zero.
 * That is the property the whole analytics feature rests on, it is invisible
 * when it breaks (a wrong average looks exactly like a right one), and it is
 * one careless `?? 0` away at all times.
 */

describe('aggregate', () => {
  it('returns null rather than zero when nothing reported the metric', () => {
    // The single most important assertion in this file. `[null, null]` summing
    // to 0 would put "not measured" into every average as a real zero.
    expect(aggregate([null, null, undefined])).toEqual({
      value: null,
      reported: 0,
      total: 3,
    });
  });

  it('distinguishes a reported zero from an absent metric', () => {
    const reportedZero = aggregate([0, 0]);
    expect(reportedZero.value).toBe(0);
    expect(reportedZero.reported).toBe(2);

    expect(aggregate([null, null]).value).toBeNull();
  });

  it('sums what was reported and counts what was not', () => {
    expect(aggregate([10, null, 5])).toEqual({
      value: 15,
      reported: 2,
      total: 3,
    });
  });

  it('ignores values that are not finite numbers', () => {
    expect(aggregate([Number.NaN, Number.POSITIVE_INFINITY, 4])).toEqual({
      value: 4,
      reported: 1,
      total: 3,
    });
  });
});

describe('average', () => {
  it('divides by what was reported, not by the sample size', () => {
    // 15 over the two posts that reported, not over all three. Dividing by 3
    // would silently treat the unmeasured post as a zero.
    expect(average([10, null, 5])).toBe(7.5);
  });

  it('is null when nothing reported', () => {
    expect(average([null, undefined])).toBeNull();
  });
});

describe('rate', () => {
  it('is null unless both sides are real', () => {
    expect(rate(null, 100)).toBeNull();
    expect(rate(10, null)).toBeNull();
  });

  it('is null on a zero denominator rather than zero or Infinity', () => {
    // 0% would read as "nobody engaged"; the truth is "we do not know how many
    // saw it".
    expect(rate(10, 0)).toBeNull();
  });

  it('divides when both sides are known', () => {
    expect(rate(5, 100)).toBe(0.05);
  });
});

describe('engagementOf', () => {
  it('sums only the interaction components', () => {
    // impressions must never leak into engagement.
    expect(
      engagementOf({
        likes: 3,
        comments: 2,
        shares: 1,
        reposts: 4,
        saves: 5,
        clicks: 6,
        impressions: 9_999,
      }),
    ).toBe(21);
  });

  it('is null when the network reported no interactions at all', () => {
    expect(engagementOf({ impressions: 500 })).toBeNull();
  });

  it('counts a genuine zero', () => {
    expect(engagementOf({ likes: 0, comments: 0 })).toBe(0);
  });
});

describe('exposureOf', () => {
  it('prefers impressions over views', () => {
    expect(exposureOf({ impressions: 100, views: 80 })).toBe(100);
  });

  it('never falls back to reach', () => {
    // Reach is unique people and impressions are appearances. Substituting one
    // for the other would publish two different rates under one label.
    expect(exposureOf({ reach: 100 })).toBeNull();
  });
});

describe('toMediaType', () => {
  it('maps every provider value onto the database enum', () => {
    expect(toMediaType('REEL')).toBe(MediaType.REEL);
    expect(toMediaType('CAROUSEL')).toBe(MediaType.CAROUSEL);
  });

  it('passes null through rather than defaulting to a format', () => {
    // An unknown format must leave whatever was inferred at publish time
    // standing, not overwrite it with a claim.
    expect(toMediaType(null)).toBeNull();
    expect(toMediaType(undefined)).toBeNull();
  });
});

describe('inferMediaTypeFromUpload', () => {
  it('reads an empty media list as a text post', () => {
    expect(inferMediaTypeFromUpload([])).toBe(MediaType.TEXT);
  });

  it('reads one image as IMAGE and several as CAROUSEL', () => {
    expect(inferMediaTypeFromUpload([{ type: 'image' }])).toBe(MediaType.IMAGE);
    expect(
      inferMediaTypeFromUpload([{ type: 'image' }, { type: 'image' }]),
    ).toBe(MediaType.CAROUSEL);
  });

  it('lets video win over a mixed list', () => {
    expect(
      inferMediaTypeFromUpload([{ type: 'image' }, { type: 'video' }]),
    ).toBe(MediaType.VIDEO);
  });

  it('returns null for a malformed column rather than guessing', () => {
    // `posts.media` is JSONB the browser writes and has been through more than
    // one shape. Unknown means unknown — not TEXT, which is a real format.
    expect(inferMediaTypeFromUpload(null)).toBeNull();
    expect(inferMediaTypeFromUpload('not an array')).toBeNull();
    expect(inferMediaTypeFromUpload({ url: 'x' })).toBeNull();
  });
});

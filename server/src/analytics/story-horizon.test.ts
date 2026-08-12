import { describe, expect, it } from 'vitest';
import { horizonFor } from '../services/analytics-sync.service';
import { isPublicationDue } from './cadence';
import { MediaType } from '../generated/prisma/enums';

/**
 * How long a Story is worth asking about.
 *
 * Twenty-four hours, because that is how long a Story exists. Past that the
 * post is gone and every read is a request against nothing — on X, where reads
 * are billed per post, a standing charge for it.
 *
 * The other half of the test, and the more important half, is that this
 * changed *nothing else*. The analytics cadence is a shared clock: a horizon
 * that leaked into ordinary posts would quietly stop syncing every feed post
 * after a day, and the symptom would be numbers that silently stopped moving.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const X_HORIZON_MS = 30 * DAY_MS;

/** One publication, as much of it as the horizon needs. */
function publication(
  mediaType: MediaType | null,
  contentType: MediaType | null = null,
) {
  return { mediaType, contentType };
}

describe('Story horizon', () => {
  // Test 31
  it('is 24 hours for an Instagram Story', () => {
    expect(horizonFor('instagram', publication(MediaType.STORY), undefined)).toBe(
      DAY_MS,
    );
  });

  it('reads the requested format when the network has not answered yet', () => {
    // `mediaType` is null until the first sync — which is exactly when this
    // decision matters. The member's own choice is the evidence available.
    expect(
      horizonFor('instagram', publication(null, MediaType.STORY), X_HORIZON_MS),
    ).toBe(DAY_MS);
  });

  it('prefers the observed format over the requested one', () => {
    // The network is the authority. A post requested as a Story that Instagram
    // filed as a feed post is a feed post.
    expect(
      horizonFor('instagram', publication(MediaType.IMAGE, MediaType.STORY), undefined),
    ).toBeUndefined();
  });
});

describe('nothing else moved', () => {
  it('leaves every other Instagram format on the network horizon', () => {
    for (const format of [MediaType.IMAGE, MediaType.CAROUSEL, MediaType.REEL]) {
      expect(horizonFor('instagram', publication(format), undefined)).toBeUndefined();
      expect(horizonFor('instagram', publication(format), X_HORIZON_MS)).toBe(
        X_HORIZON_MS,
      );
    }
  });

  it('leaves every other network untouched', () => {
    for (const provider of ['linkedin', 'facebook', 'x']) {
      for (const format of [MediaType.TEXT, MediaType.IMAGE, MediaType.VIDEO]) {
        expect(horizonFor(provider, publication(format), X_HORIZON_MS)).toBe(
          X_HORIZON_MS,
        );
      }
    }
  });

  it('leaves an unknown or absent format on the network horizon', () => {
    expect(horizonFor('instagram', publication(null), X_HORIZON_MS)).toBe(X_HORIZON_MS);
    expect(horizonFor('instagram', publication(MediaType.OTHER), X_HORIZON_MS)).toBe(
      X_HORIZON_MS,
    );
    // A network with no capability declaration at all.
    expect(horizonFor('youtube', publication(MediaType.STORY), X_HORIZON_MS)).toBe(
      X_HORIZON_MS,
    );
  });

  it('only ever shortens — a capability cannot outlive what the network answers', () => {
    // If a network ever served metrics for less than a day, the Story horizon
    // must not extend past it.
    expect(horizonFor('instagram', publication(MediaType.STORY), 6 * 60 * 60 * 1000)).toBe(
      6 * 60 * 60 * 1000,
    );
  });
});

describe('the horizon reaching the due check', () => {
  const publishedAt = new Date('2026-08-10T00:00:00Z');

  it('stops polling a Story after a day', () => {
    const horizon = horizonFor('instagram', publication(MediaType.STORY), X_HORIZON_MS)!;

    // Eight hours old, never read: due.
    expect(
      isPublicationDue(
        { publishedAt, lastCapturedAt: null },
        new Date('2026-08-10T08:00:00Z'),
        horizon,
      ),
    ).toBe(true);

    // Two days old: the Story is gone and no amount of asking will produce an
    // answer, so it is never due again.
    expect(
      isPublicationDue(
        { publishedAt, lastCapturedAt: null },
        new Date('2026-08-12T00:00:00Z'),
        horizon,
      ),
    ).toBe(false);
  });

  it('keeps polling an ordinary post on the same cadence it always had', () => {
    const horizon = horizonFor('instagram', publication(MediaType.IMAGE), X_HORIZON_MS);

    // Two days old and never read — well past where a Story would have stopped.
    expect(
      isPublicationDue(
        { publishedAt, lastCapturedAt: null },
        new Date('2026-08-12T00:00:00Z'),
        horizon,
      ),
    ).toBe(true);
  });
});

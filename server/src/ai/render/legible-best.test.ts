import { afterEach, describe, expect, it } from 'vitest';
import { isLegible, legibleBestEnabled, pickLegibleBest, type RejectedAttempt } from './legible-best';

const attempt = (
  id: string,
  problems: string[],
  over: { critic?: Record<string, unknown>; risk?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; overlap?: number } = {},
): RejectedAttempt<string> => ({
  result: id,
  critic: {
    passed: false, templateLook: false, humanCraft: true, singleClearIdea: true, layoutExpressesIdea: true,
    interchangeableWithAnotherEvent: false, problems, reasonsToReject: problems, ...over.critic,
  } as never,
  reading: { risk: over.risk ?? 'LOW', overlap: over.overlap ?? 0.1 },
});

const GENERIC = 'The composition looks like a generic UI card or template. Use stronger graphic art direction.';
const NO_IDEA = 'No single creative idea is legible in the finished piece. Build the design on one idea.';

describe('which rejected attempts may be delivered', () => {
  it('accepts an attempt the critic found only generic', () => {
    expect(isLegible(attempt('a', [GENERIC, NO_IDEA], { critic: { templateLook: true, singleClearIdea: false } }))).toBe(true);
  });

  it('refuses type on the subject, unreadable type, a clipped logo and broken copy', () => {
    expect(isLegible(attempt('a', ['Type is sitting on the subject'], { critic: { textOccludesSubject: true } }))).toBe(false);
    expect(isLegible(attempt('a', ['Poor contrast and low legibility on the paragraph text']))).toBe(false);
    expect(isLegible(attempt('a', ['The brand logo is colliding with other elements or unreadable.'], { critic: { logoClear: false } }))).toBe(false);
    expect(isLegible(attempt('a', ['Body copy contains raw code or a json fragment']))).toBe(false);
    expect(isLegible(attempt('a', ['Copy is missing required facts: Launch party']))).toBe(false);
  });

  it('refuses an attempt whose placement still collides, whatever the critic said', () => {
    expect(isLegible(attempt('a', [GENERIC], { risk: 'HIGH' }))).toBe(false);
    expect(isLegible(attempt('a', [GENERIC], { risk: 'CRITICAL' }))).toBe(false);
    expect(isLegible(attempt('a', [GENERIC], { risk: 'MODERATE' }))).toBe(true);
  });
});

describe('pickLegibleBest', () => {
  it('picks the attempt with the fewest objections among those without defects', () => {
    const picked = pickLegibleBest([
      attempt('many', [GENERIC, NO_IDEA, 'The layout expresses nothing.']),
      attempt('broken', [], { critic: { textOccludesSubject: true } }),
      attempt('few', [GENERIC]),
    ]);
    expect(picked?.result).toBe('few');
  });

  it('breaks a tie by keeping the type furthest from the subject', () => {
    const picked = pickLegibleBest([
      attempt('close', [GENERIC], { overlap: 0.25 }),
      attempt('clear', [GENERIC], { overlap: 0.05 }),
    ]);
    expect(picked?.result).toBe('clear');
  });

  it('delivers nothing when every attempt has a defect', () => {
    expect(pickLegibleBest([
      attempt('a', ['Poor contrast'], {}),
      attempt('b', [GENERIC], { risk: 'CRITICAL' }),
    ])).toBeUndefined();
    expect(pickLegibleBest([])).toBeUndefined();
  });

  it('does not reorder the caller\'s list', () => {
    const list = [attempt('b', [GENERIC, NO_IDEA]), attempt('a', [GENERIC])];
    pickLegibleBest(list);
    expect(list.map((x) => x.result)).toEqual(['b', 'a']);
  });
});

describe('the switch', () => {
  const original = process.env.CREATIVE_ACCEPT_LEGIBLE_BEST;
  afterEach(() => {
    if (original === undefined) delete process.env.CREATIVE_ACCEPT_LEGIBLE_BEST;
    else process.env.CREATIVE_ACCEPT_LEGIBLE_BEST = original;
  });

  it('is off unless explicitly set to true', () => {
    delete process.env.CREATIVE_ACCEPT_LEGIBLE_BEST;
    expect(legibleBestEnabled()).toBe(false);
    process.env.CREATIVE_ACCEPT_LEGIBLE_BEST = 'yes';
    expect(legibleBestEnabled()).toBe(false);
    process.env.CREATIVE_ACCEPT_LEGIBLE_BEST = 'true';
    expect(legibleBestEnabled()).toBe(true);
  });
});

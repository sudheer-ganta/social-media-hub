import { describe, expect, it } from 'vitest';
import {
  AnalyticsQueryError,
  DEFAULT_INTELLIGENCE_WINDOW,
  floorToHour,
  readIntelligenceWindow,
  readReportingDimension,
  scopeFor,
} from './window';

/**
 * The three time dimensions stay three things, and the scope stays enforced.
 */

describe('readIntelligenceWindow', () => {
  it('defaults to the last 20 published posts', () => {
    expect(readIntelligenceWindow({})).toEqual({ kind: 'window', size: 20 });
    expect(DEFAULT_INTELLIGENCE_WINDOW).toBe(20);
  });

  it('accepts each offered size', () => {
    for (const size of [10, 20, 30, 60]) {
      expect(readIntelligenceWindow({ window: String(size) })).toEqual({
        kind: 'window',
        size,
      });
    }
  });

  it('refuses a size it does not offer rather than rounding to one', () => {
    // ?window=25 means the caller believes it is getting 25 posts. Quietly
    // serving 20 makes every number downstream not what was asked for.
    expect(() => readIntelligenceWindow({ window: '25' })).toThrow(
      AnalyticsQueryError,
    );
    expect(() => readIntelligenceWindow({ window: '0' })).toThrow();
    expect(() => readIntelligenceWindow({ window: 'all' })).toThrow();
  });
});

describe('readReportingDimension', () => {
  const now = new Date('2026-08-11T12:00:00.000Z');

  it('defaults to lifetime, not to a recent slice', () => {
    // A member opening analytics for the first time should see everything
    // FlowPost has, not an empty 30-day window.
    expect(readReportingDimension({}, now)).toEqual({ kind: 'lifetime' });
    expect(readReportingDimension({ period: 'lifetime' }, now)).toEqual({
      kind: 'lifetime',
    });
  });

  it('turns ?days= into a bounded period', () => {
    const dimension = readReportingDimension({ days: '30' }, now);
    expect(dimension.kind).toBe('period');
    if (dimension.kind !== 'period') throw new Error('expected a period');
    expect(dimension.to).toEqual(now);
    expect(dimension.from).toEqual(new Date('2026-07-12T12:00:00.000Z'));
  });

  it('rejects a nonsensical range', () => {
    expect(() => readReportingDimension({ days: '-1' }, now)).toThrow();
    expect(() => readReportingDimension({ days: '99999' }, now)).toThrow();
    expect(() => readReportingDimension({ from: '2026-01-01' }, now)).toThrow();
    expect(() =>
      readReportingDimension({ from: '2026-08-01', to: '2026-07-01' }, now),
    ).toThrow();
  });

  it('never returns a window — the two dimensions do not share a parameter', () => {
    // ?window= is meaningless to the reporting dimension, and must not quietly
    // narrow a lifetime total to the last 20 posts.
    expect(readReportingDimension({ window: '20' }, now)).toEqual({
      kind: 'lifetime',
    });
  });
});

describe('scopeFor', () => {
  it('carries brandId: null for personal, which is a filter in its own right', () => {
    // Without the explicit null, a personal query matching only on
    // context_type would still match every brand post the member owns.
    expect(
      scopeFor('user-1', { contextType: 'personal', brandId: null }),
    ).toEqual({ userId: 'user-1', contextType: 'personal', brandId: null });
  });

  it('keeps one brand distinct from another', () => {
    const a = scopeFor('user-1', { contextType: 'brand', brandId: 'brand-a' });
    const b = scopeFor('user-1', { contextType: 'brand', brandId: 'brand-b' });
    expect(a.brandId).not.toBe(b.brandId);
  });
});

describe('floorToHour', () => {
  it('collapses everything inside one hour to the same instant', () => {
    // This is the entire duplicate-snapshot strategy: two syncs in the same
    // hour produce the same captured_at and collide at the unique index.
    const a = floorToHour(new Date('2026-08-11T13:05:59.999Z'));
    const b = floorToHour(new Date('2026-08-11T13:59:00.000Z'));
    expect(a.toISOString()).toBe('2026-08-11T13:00:00.000Z');
    expect(a.getTime()).toBe(b.getTime());
  });

  it('keeps distinct hours distinct, so T+1h and T+6h are both retained', () => {
    const first = floorToHour(new Date('2026-08-11T13:30:00.000Z'));
    const later = floorToHour(new Date('2026-08-11T18:30:00.000Z'));
    expect(first.getTime()).not.toBe(later.getTime());
  });

  it('does not mutate its argument', () => {
    const original = new Date('2026-08-11T13:45:00.000Z');
    floorToHour(original);
    expect(original.toISOString()).toBe('2026-08-11T13:45:00.000Z');
  });
});

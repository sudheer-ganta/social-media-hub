import { describe, expect, it } from 'vitest';
import { collapseSubsumed, contentTokens, dropSubsumedClaims, restoreMissingClaims } from './copy-repair';

const line = (role: string, text: string) => ({ role, text });

describe('collapseSubsumed', () => {
  it('drops the offer and support lines a headline already says', () => {
    const lines = [
      line('HEADLINE', '30% off all running shoes'),
      line('OFFER', '30% off'),
      line('SUPPORT', 'Save 30% on running shoes'),
      line('DETAIL', 'Ends Sunday'),
    ];
    expect(collapseSubsumed(lines, (l) => l.role === 'HEADLINE').map((l) => l.text)).toEqual([
      '30% off all running shoes',
      'Ends Sunday',
    ]);
  });

  it('keeps a line that carries a number or time the others lack', () => {
    const lines = [line('HEADLINE', 'Live music at the rooftop cafe'), line('DETAIL', 'Live music at the rooftop cafe from 7 PM')];
    expect(collapseSubsumed(lines, (l) => l.role === 'HEADLINE')).toHaveLength(2);
  });

  it('keeps a long line that mostly differs from the others', () => {
    const lines = [line('HEADLINE', '30% off all running shoes'), line('SUPPORT', 'Free delivery on running shoes today')];
    expect(collapseSubsumed(lines, (l) => l.role === 'HEADLINE')).toHaveLength(2);
  });

  it('keeps lines that add a word the others do not have', () => {
    const lines = [line('HEADLINE', 'Weekend sale'), line('SUPPORT', 'Weekend sale on running shoes')];
    // The headline is protected, and the support line says more than it, so both stay.
    expect(collapseSubsumed(lines, (l) => l.role === 'HEADLINE')).toHaveLength(2);
  });

  it('never removes both of two lines that say the same thing', () => {
    const out = collapseSubsumed([line('SUPPORT', '30% off'), line('DETAIL', 'Off 30%')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('30% off');
  });

  it('keeps protected roles even when repeated, and keeps numbers distinct', () => {
    const lines = [line('HEADLINE', 'Shop now and save'), line('CTA', 'Shop now')];
    expect(collapseSubsumed(lines, (l) => l.role === 'CTA')).toHaveLength(2);
    expect(collapseSubsumed([line('A', '30% off shoes'), line('B', '50% off shoes')])).toHaveLength(2);
  });

  it('keeps lines with no content words and leaves a single line alone', () => {
    expect(collapseSubsumed([line('A', '!!!'), line('B', 'Hello world')])).toHaveLength(2);
    expect(collapseSubsumed([line('A', 'Only line')])).toHaveLength(1);
  });
});

describe('dropSubsumedClaims', () => {
  it('removes a claim that a longer required claim already contains', () => {
    expect(dropSubsumedClaims(['Launch party', 'rooftop cafe', 'new rooftop cafe', 'Bengaluru', 'this Friday 7 PM']))
      .toEqual(['Launch party', 'new rooftop cafe', 'Bengaluru', 'this Friday 7 PM']);
  });

  it('keeps independent claims and preserves their order', () => {
    expect(dropSubsumedClaims(['30% off', 'Stride Lab', 'ends Sunday'])).toEqual(['30% off', 'Stride Lab', 'ends Sunday']);
  });

  it('folds plurals and exact repeats', () => {
    expect(dropSubsumedClaims(['running shoe', 'running shoes'])).toEqual(['running shoe']);
  });
});

describe('restoreMissingClaims', () => {
  const make = (role: string, text: string) => line(role, text);

  it('puts a missing event in an event badge and a missing offer in an offer line', () => {
    const out = restoreMissingClaims([line('HEADLINE', 'The Horizon Stage')], ['Launch party', '30% off'], { event: 'Launch party', offer: '30% off' }, make);
    expect(out).toEqual([
      line('HEADLINE', 'The Horizon Stage'),
      line('EVENT_BADGE', 'Launch party'),
      line('OFFER', '30% off'),
    ]);
  });

  it('folds other claims into the existing detail line, or creates one', () => {
    const withDetail = restoreMissingClaims([line('DETAIL', 'Terrace 9')], ['Bengaluru', 'this Friday 7 PM'], undefined, make);
    expect(withDetail).toEqual([line('DETAIL', 'Terrace 9, Bengaluru, this Friday 7 PM')]);

    const without = restoreMissingClaims([line('HEADLINE', 'Hi')], ['Bengaluru'], undefined, make);
    expect(without).toEqual([line('HEADLINE', 'Hi'), line('DETAIL', 'Bengaluru')]);
  });

  it('does not add a second badge when one exists, and ignores artifacts', () => {
    const out = restoreMissingClaims([line('EVENT_BADGE', 'Opening night')], ['Launch party'], { event: 'Launch party' }, make);
    expect(out.filter((l) => l.role === 'EVENT_BADGE')).toHaveLength(1);
    expect(restoreMissingClaims([], ['{"json": true}', '```'], undefined, make)).toEqual([]);
  });

  it('returns the same array when nothing is missing', () => {
    const lines = [line('HEADLINE', 'Hi')];
    expect(restoreMissingClaims(lines, [], undefined, make)).toBe(lines);
  });
});

describe('contentTokens', () => {
  it('keeps the percent sign attached to its number', () => {
    expect(contentTokens('Get 30 % off')).toContain('30%');
  });
});

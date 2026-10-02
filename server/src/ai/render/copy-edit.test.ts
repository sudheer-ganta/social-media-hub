import { describe, expect, it } from 'vitest';
import type { CreativeDirection } from '../types';
import type { GraphicDesignConcept } from '../brand/creative-brief';
import {
  applyTextEdits,
  CopyEditError,
  listEditableText,
  MAX_EDITED_TEXT_LENGTH,
  parseTextEdits,
} from './copy-edit';

/** Only the fields the copy rules read: the rest of a direction is irrelevant to wording. */
function direction(overrides: Partial<CreativeDirection> = {}): CreativeDirection {
  return {
    headline: 'Slow mornings, made simple',
    supportingLine: 'Small rituals for a calmer start',
    cta: 'Shop the range',
    copyTreatment: 'headline_support',
    marketingCreative: { offerText: 'Free delivery over 999', brandMessage: 'Made by hand' },
    ...overrides,
  } as unknown as CreativeDirection;
}

function concept(requiredRoles: string[], maxTextElements = 4): GraphicDesignConcept {
  return {
    elementsToOmit: [],
    copyPlan: { requiredRoles, maxTextElements, rationale: 'test' },
  } as unknown as GraphicDesignConcept;
}

describe('listEditableText', () => {
  it('offers exactly the lines the idea asked for', () => {
    const lines = listEditableText(direction(), concept(['HEADLINE', 'CTA']));
    expect(lines.map((l) => l.field)).toEqual(['headline', 'cta']);
    expect(lines.find((l) => l.field === 'headline')?.text).toBe('Slow mornings, made simple');
  });

  it('does not offer a line that exists in the direction but is not on the creative', () => {
    const fields = listEditableText(direction(), concept(['HEADLINE'])).map((l) => l.field);
    expect(fields).toEqual(['headline']);
  });

  it('reports each line with the longest wording it accepts', () => {
    const [headline] = listEditableText(direction(), concept(['HEADLINE']));
    expect(headline.maxLength).toBe(MAX_EDITED_TEXT_LENGTH.headline);
  });
});

describe('parseTextEdits', () => {
  it('trims and single-spaces wording', () => {
    expect(parseTextEdits({ headline: '  New   wording\there ' })).toEqual({ headline: 'New wording here' });
  });

  it.each([
    ['nothing', undefined],
    ['an array', ['x']],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(() => parseTextEdits(value)).toThrow(CopyEditError);
  });

  it('rejects a field that cannot be edited', () => {
    expect(() => parseTextEdits({ aspectRatio: '1:1' })).toThrow(/not a line that can be edited/);
  });

  it('rejects empty, non-text and over-long wording', () => {
    expect(() => parseTextEdits({ headline: '   ' })).toThrow(/cannot be left empty/);
    expect(() => parseTextEdits({ headline: 42 })).toThrow(/must be text/);
    expect(() => parseTextEdits({ cta: 'x'.repeat(MAX_EDITED_TEXT_LENGTH.cta + 1) })).toThrow(/at most 40/);
  });

  it('rejects control characters', () => {
    expect(() => parseTextEdits({ headline: 'bad\u0000text' })).toThrow(CopyEditError);
  });
});

describe('applyTextEdits', () => {
  it('returns a copy with the new wording and leaves the original untouched', () => {
    const original = direction();
    const next = applyTextEdits(original, concept(['HEADLINE', 'CTA']), { headline: 'Unhurried starts' });
    expect(next.headline).toBe('Unhurried starts');
    expect(original.headline).toBe('Slow mornings, made simple');
    expect(next.cta).toBe('Shop the range');
  });

  it('writes marketing lines into marketingCreative', () => {
    const next = applyTextEdits(direction(), concept(['HEADLINE', 'OFFER']), { offerText: 'Free delivery over 1499' });
    expect(next.marketingCreative?.offerText).toBe('Free delivery over 1499');
  });

  it('refuses to edit a line that is not on the creative', () => {
    expect(() => applyTextEdits(direction(), concept(['HEADLINE']), { cta: 'Buy now' })).toThrow(/not on this creative/);
  });

  it('refuses wording that duplicates another line, which the renderer would drop', () => {
    expect(() =>
      applyTextEdits(direction(), concept(['HEADLINE', 'CTA']), { cta: 'Slow mornings, made simple' }),
    ).toThrow(/cannot be placed/);
  });

  it('refuses wording that drops a fact the creative must state', () => {
    const withClaim = direction({ headline: 'Flat 50% off this week' });
    expect(() =>
      applyTextEdits(withClaim, concept(['HEADLINE', 'CTA']), { headline: 'Hello there' }, ['50% off']),
    ).toThrow(/drops/);
  });

  it('accepts wording that keeps the required fact', () => {
    const withClaim = direction({ headline: 'Flat 50% off this week' });
    const next = applyTextEdits(withClaim, concept(['HEADLINE', 'CTA']), { headline: 'Now 50% off, today only' }, ['50% off']);
    expect(next.headline).toBe('Now 50% off, today only');
  });
});

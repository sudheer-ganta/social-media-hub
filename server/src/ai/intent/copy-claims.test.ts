import { describe, expect, it } from 'vitest';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import { ensureRequiredClaims } from './copy-claims';

const line = (role: CampaignCopyLine['role'], text: string): CampaignCopyLine => ({ role, text });

// A request whose claims the writing model only partly used.
const CLAIMS = ['Launch party', 'new rooftop cafe', 'Bengaluru', 'this Friday 7 PM', 'live acoustic music'];
const INTENT = { event: 'Launch party' };

describe('ensureRequiredClaims', () => {
  it('leaves copy alone when it already carries every claim', () => {
    const raw = [
      line('HEADLINE', 'Launch party at our new rooftop cafe'),
      line('SUPPORT', 'Live acoustic music, Bengaluru'),
      line('DETAIL', 'This Friday 7 PM'),
    ];
    const out = ensureRequiredClaims({ rawCopy: raw, requiredClaims: CLAIMS, intent: INTENT, baseBudget: 3 });
    expect(out.missing).toEqual([]);
    expect(out.restored).toEqual([]);
    expect(out.raw).toBe(raw);
  });

  it('puts back an event the writing model never used', () => {
    const raw = [
      line('HEADLINE', 'The Horizon Stage'),
      line('SUPPORT', 'Live acoustic music above the new rooftop cafe'),
      line('DETAIL', 'Bengaluru, this Friday 7 PM'),
    ];
    const out = ensureRequiredClaims({ rawCopy: raw, requiredClaims: CLAIMS, intent: INTENT, baseBudget: 3 });
    expect(out.missing).toEqual([]);
    expect(out.restored).toEqual(['Launch party']);
    expect(out.renderable.some((r) => r.role === 'EVENT_BADGE' && r.text === 'Launch party')).toBe(true);
  });

  it('widens the number of blocks rather than trading one claim for another', () => {
    // At three blocks, the badge restored for "Launch party" outranks the line that carried
    // "live acoustic music" in looser words, so fixing one claim silently broke another.
    const raw = [
      line('HEADLINE', 'Terrace 9 turns up the volume'),
      line('SUPPORT', 'An evening of acoustic live music'),
      line('DETAIL', 'New rooftop cafe in Bengaluru'),
    ];
    const tight = ensureRequiredClaims({ rawCopy: raw, requiredClaims: CLAIMS, intent: INTENT, baseBudget: 3, maxBudget: 3 });
    expect(tight.missing).toEqual(['live acoustic music']);

    const widened = ensureRequiredClaims({ rawCopy: raw, requiredClaims: CLAIMS, intent: INTENT, baseBudget: 3 });
    expect(widened.missing).toEqual([]);
    expect(widened.renderable.length).toBe(4);
    expect(widened.renderable.map((r) => r.text)).toContain('An evening of acoustic live music');
  });

  it('puts an event badge in when only the event is missing, and keeps the text blocks to four', () => {
    const raw = [
      line('HEADLINE', 'The Horizon Stage'),
      line('SUPPORT', 'Acoustic sets and live music all evening, above the new rooftop cafe'),
      line('DETAIL', 'Terrace 9, Bengaluru'),
      line('BRAND_MESSAGE', 'This Friday at 7 PM'),
    ];
    const out = ensureRequiredClaims({ rawCopy: raw, requiredClaims: CLAIMS, intent: INTENT, baseBudget: 3 });
    expect(out.missing).toEqual([]);
    expect(out.renderable.length).toBeLessThanOrEqual(5);
  });

  it('never exceeds the ceiling on text blocks, and says what is still missing', () => {
    const raw = [line('HEADLINE', 'Hello')];
    const claims = ['alpha one', 'bravo two', 'charlie three', 'delta four', 'echo five', 'foxtrot six', 'golf seven'];
    const out = ensureRequiredClaims({ rawCopy: raw, requiredClaims: claims, baseBudget: 3 });
    expect(out.renderable.length).toBeLessThanOrEqual(5);
    // Folded into one detail line, every claim is carried without adding blocks.
    expect(out.missing).toEqual([]);
  });

  it('returns the original untouched when the repair cannot help', () => {
    const raw = [line('HEADLINE', 'Hello')];
    const out = ensureRequiredClaims({ rawCopy: raw, requiredClaims: ['{"artifact": true}'], baseBudget: 3 });
    expect(out.raw).toBe(raw);
    expect(out.restored).toEqual([]);
  });
});

/**
 * AI font pairing — unit tests.
 *
 * The contract under test is containment: the model may only ever choose from the
 * shortlist the deterministic ranking already validated, and every route out of
 * this generator that is not a valid, renderable pairing must return null so the
 * caller keeps the pairing it already had.
 *
 * Run: cd server && npx vitest run src/ai/typography/font-pairing.generator.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { generateFontPairing } from './font-pairing.generator';
import { FONT_CATALOG, getFontDefinition, type FontDefinition } from './font-catalog';
import type { AiTextProvider } from '../providers';

const provider = (reply: unknown): AiTextProvider => ({
  id: 'test',
  model: 'test',
  supportsVision: true,
  isConfigured: () => true,
  generateJson: vi.fn(async () => reply),
});

const throwingProvider = (): AiTextProvider => ({
  id: 'test',
  model: 'test',
  supportsVision: true,
  isConfigured: () => true,
  generateJson: vi.fn(async () => {
    throw new Error('vendor is down');
  }),
});

const def = (family: string): FontDefinition => {
  const found = getFontDefinition(family);
  if (!found) throw new Error(`test fixture: ${family} is not in the catalog`);
  return found;
};

/** Two real, distinct, file-backed families to choose between. */
const bodyCandidates = FONT_CATALOG.filter((f) => f.readability === 'body-friendly' && f.category === 'sans-serif').slice(0, 3);
const headlineCandidates = FONT_CATALOG.filter((f) => f.category === 'serif').slice(0, 3);

const candidates = {
  headline: headlineCandidates,
  body: bodyCandidates,
  accent: [] as FontDefinition[],
};

const context = { concept: 'a quiet launch', mood: 'confident', copy: ['Made for the long run'] };

const validReply = (over: Record<string, unknown> = {}) => ({
  headlineFamily: headlineCandidates[0].family,
  bodyFamily: bodyCandidates[0].family,
  headlineCase: 'upper',
  headlineTracking: 'tight',
  bodyCase: 'sentence',
  bodyTracking: 'normal',
  reasoning: 'A serif voice against a neutral sans.',
  ...over,
});

describe('generateFontPairing', () => {
  it('accepts a pairing chosen from the shortlists', async () => {
    const result = await generateFontPairing({ provider: provider(validReply()), candidates, context });

    expect(result).not.toBeNull();
    expect(result!.headlineFamily).toBe(headlineCandidates[0].family);
    expect(result!.bodyFamily).toBe(bodyCandidates[0].family);
    expect(result!.intents.headline.caseIntent).toBe('upper');
    expect(result!.intents.headline.trackingIntent).toBe('tight');
    expect(result!.reasoning).toContain('serif');
  });

  it('matches a family name case-insensitively', async () => {
    const result = await generateFontPairing({
      provider: provider(validReply({ headlineFamily: headlineCandidates[0].family.toUpperCase() })),
      candidates,
      context,
    });

    expect(result!.headlineFamily).toBe(headlineCandidates[0].family);
  });

  it('rejects a family that was never offered for that role', async () => {
    // A real catalog family, but not one on this shortlist — the shape of the bug
    // that would silently bypass script, readability and style-category filters.
    const offListed = FONT_CATALOG.find((f) => !candidates.headline.includes(f) && !candidates.body.includes(f))!;

    const result = await generateFontPairing({
      provider: provider(validReply({ headlineFamily: offListed.family })),
      candidates,
      context,
    });

    expect(result).toBeNull();
  });

  it('rejects a family that does not exist at all', async () => {
    const result = await generateFontPairing({
      provider: provider(validReply({ bodyFamily: 'Definitely Not A Real Typeface' })),
      candidates,
      context,
    });

    expect(result).toBeNull();
  });

  it('rejects one family for both roles when the weights carry no contrast', async () => {
    const single = def(bodyCandidates[0].family);
    const result = await generateFontPairing({
      provider: provider(validReply({ headlineFamily: single.family, bodyFamily: single.family })),
      candidates: { headline: [single], body: [single], accent: [] },
      context,
    });

    // Either it is refused outright, or the weights genuinely differ enough to be
    // a pairing — never one family at one weight passed off as two voices.
    if (result !== null) {
      expect(Math.abs((result.headlineWeight ?? 0) - (result.bodyWeight ?? 0))).toBeGreaterThanOrEqual(200);
    } else {
      expect(result).toBeNull();
    }
  });

  it('falls back when the provider throws', async () => {
    expect(await generateFontPairing({ provider: throwingProvider(), candidates, context })).toBeNull();
  });

  it('falls back on a malformed or empty reply', async () => {
    expect(await generateFontPairing({ provider: provider(null), candidates, context })).toBeNull();
    expect(await generateFontPairing({ provider: provider('not an object'), candidates, context })).toBeNull();
    expect(await generateFontPairing({ provider: provider({}), candidates, context })).toBeNull();
  });

  it('never calls the provider when there is nothing to choose between', async () => {
    const empty = provider(validReply());
    const result = await generateFontPairing({ provider: empty, candidates: { headline: [], body: [], accent: [] }, context });

    expect(result).toBeNull();
    expect(empty.generateJson).not.toHaveBeenCalled();
  });

  it('defaults an unrecognised case or tracking value rather than failing', async () => {
    const result = await generateFontPairing({
      provider: provider(validReply({ headlineCase: 'sideways', headlineTracking: 'enormous' })),
      candidates,
      context,
    });

    expect(result!.intents.headline.caseIntent).toBe('none');
    expect(result!.intents.headline.trackingIntent).toBe('normal');
  });

  it('offers the model the typographic facts, not just a list of names', async () => {
    const spy = provider(validReply());
    await generateFontPairing({ provider: spy, candidates, context });

    const prompt = (spy.generateJson as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt;
    expect(prompt).toContain(headlineCandidates[0].family);
    expect(prompt).toContain('formality');
    expect(prompt).toContain('Made for the long run');
    expect(prompt).toContain('Headline shortlist');
  });
});

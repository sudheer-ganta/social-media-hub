import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The engineering rule, enforced in code:
 *
 *   FlowPost must never map an occasion, industry, or content category
 *   directly to a visual layout, symbol set, palette or composition.
 *
 * This is the guard that stops the architecture regressing by a thousand small
 * additions. The previous collapse was not built in one commit — it accreted as
 * `isSimpleCampaign: /pooja|diwali|bts party|sale/`, as "for festivals, prefer a
 * typographic poster", as `hero → 'typography'` when the brief looked simple.
 * Each addition was individually reasonable and collectively became a template
 * engine keyed on the occasion.
 *
 * So: the LIVE generation path may not name a specific occasion, festival,
 * fandom, holiday or brand at all. Research and the strategy stage supply that
 * vocabulary at runtime, per request, where it belongs. If you need FlowPost to
 * handle a new occasion well, that is a signal to improve the strategy prompt's
 * reasoning — never to add the occasion's name to this codebase.
 *
 * Comments are stripped before scanning: documenting the history of a removed
 * hardcoding is encouraged, reintroducing it is not.
 */

/** Every file the live `/generate` path executes to decide what a creative looks like. */
const LIVE_PIPELINE = [
  'ai/prompts/creative-strategy.prompt.ts',
  'ai/generators/creative-strategy.generator.ts',
  'ai/prompts/art-director.prompt.ts',
  'ai/generators/art-director.generator.ts',
  'ai/prompts/creative-concepts.prompt.ts',
  'ai/generators/creative-concepts.generator.ts',
  'ai/prompts/creative-direction.prompt.ts',
  'ai/generators/creative-direction.generator.ts',
  'ai/prompts/campaign-creative.prompt.ts',
  'ai/generators/design-critic.generator.ts',
  'ai/brand/creative-brief.ts',
  'ai/render/designer-composition.ts',
  'ai/render/anti-template-validator.ts',
  'ai/strategy/concept-similarity.ts',
  'services/creative-generation.service.ts',
];

/**
 * Named things a creative might be ABOUT. None of them belongs in the code that
 * decides how a creative looks. The list is deliberately drawn from different
 * cultures, religions, fandoms and industries — a rule that only protects the
 * examples someone happened to think of is the bug, not the fix.
 */
const NAMED_SUBJECTS = [
  // Festivals and holidays
  'diwali', 'deepavali', 'ganesh', 'pooja', 'puja', 'navaratri', 'navratri', 'holi',
  'christmas', 'xmas', 'easter', 'eid', 'ramadan', 'hanukkah', 'diwali', 'onam',
  'pongal', 'baisakhi', 'thanksgiving', 'halloween', 'lunar new year',
  // Fandoms and named brands
  'bts', 'blackpink', 'k-pop', 'kpop', 'taylor swift', 'marvel',
  // Categories that have historically attracted their own layout
  'restaurant', 'salon', 'gym', 'saas', 'real estate', 'travel agency',
];

/** Vocabulary that describes how something LOOKS, as opposed to what it means. */
const VISUAL_VOCABULARY = [
  'diya', 'lamp', 'rangoli', 'firework', 'garland', 'lantern', 'candle',
  'gold gradient', 'maroon', 'festive glow', 'confetti',
  'poster', 'layout', 'column', 'quadrant', 'footer', 'card',
  'left', 'right', 'top', 'bottom', 'corner', 'centre', 'center',
];

/**
 * Whole words only. Without boundaries "holi" matches "holiday" and "eid"
 * matches "provideId" — a guard that cries wolf gets deleted, which would be a
 * worse outcome than not having it.
 */
const mentions = (source: string, term: string): boolean =>
  new RegExp(String.raw`\b${term.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\b`).test(source);

const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const read = (relative: string): string => {
  const source = readFileSync(join(__dirname, '..', '..', relative), 'utf8');
  return stripComments(source).toLowerCase();
};

describe('no occasion, industry or category may be mapped to a visual', () => {
  it.each(LIVE_PIPELINE)('%s names no specific occasion, fandom or brand', (relative) => {
    const source = read(relative);
    const found = NAMED_SUBJECTS.filter((subject) => mentions(source, subject));

    expect(
      found,
      `${relative} names ${found.join(', ')}. A named occasion or category in the generation path is a template waiting to happen — that vocabulary belongs to research and the strategy stage, resolved per request at runtime.`,
    ).toEqual([]);
  });

  it('the strategy prompt teaches reasoning about context without naming any context', () => {
    const source = read('ai/prompts/creative-strategy.prompt.ts');

    // It must talk about occasions in the abstract...
    expect(source).toContain('occasion');
    expect(source).toContain('context informs. it never dictates.');
    // ...and never name one, nor tell the model what any of them look like.
    for (const subject of NAMED_SUBJECTS) expect(mentions(source, subject)).toBe(false);
    for (const visual of ['diya', 'rangoli', 'firework', 'garland', 'lantern']) {
      expect(mentions(source, visual)).toBe(false);
    }
  });

  it('the art director is never told a category implies a composition', () => {
    const source = read('ai/prompts/art-director.prompt.ts');

    // The old prompt carried "For simple campaigns such as: Ganesh Pooja /
    // Diwali / BTS Party / Sale — a DIRECT TYPOGRAPHIC POSTER can be the
    // strongest concept." That is the exact shape being banned.
    expect(source).not.toMatch(/for (?:simple )?(?:campaigns|events|festivals|occasions) such as/);
    // The prompt DOES contain the phrase "this is an occasion, therefore a
    // poster" — as the reasoning it forbids. That it appears only inside a
    // prohibition is the thing worth asserting.
    expect(source).toContain('you are forbidden from reasoning "this is an occasion, therefore a poster"');
    expect(source).toContain('context does not dictate the design');
  });

  it('no live file pairs a named subject with visual vocabulary on one line', () => {
    // The subtlest form of the bug: not a literal `if (diwali)`, but a prompt
    // line quietly suggesting what a category should look like.
    const offenders: string[] = [];
    for (const relative of LIVE_PIPELINE) {
      for (const line of read(relative).split('\n')) {
        const subject = NAMED_SUBJECTS.find((s) => mentions(line, s));
        const visual = VISUAL_VOCABULARY.find((v) => mentions(line, v));
        if (subject && visual) offenders.push(`${relative}: "${subject}" + "${visual}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

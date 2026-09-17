/**
 * Modular type scale — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/typography/type-system.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildTypeSystem, type SemanticRole } from './type-system';
import type { TypographySelection } from './font-selector';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import type { FontRole } from './font-catalog';

const ROLES: FontRole[] = ['eyebrow', 'headline', 'subheadline', 'body', 'offer', 'cta', 'metadata', 'disclaimer', 'accent'];

function typography(overrides: Partial<Record<FontRole, Partial<TypographySelection['hierarchy'][FontRole]>>> = {}): TypographySelection {
  const hierarchy = Object.fromEntries(
    ROLES.map((role) => [
      role,
      {
        family: role === 'headline' || role === 'offer' ? 'Anton' : 'Inter',
        weight: role === 'headline' ? 700 : 400,
        fontSize: 0.03,
        letterSpacing: 0,
        lineHeightMult: role === 'headline' ? 1.0 : 1.15,
        caseTransform: 'sentence' as const,
        italic: false,
        ...overrides[role],
      },
    ]),
  ) as TypographySelection['hierarchy'];

  return {
    headlineFont: 'Anton',
    bodyFont: 'Inter',
    headlineWeight: 700,
    bodyWeight: 400,
    typographyReasoning: '',
    hierarchy,
    baseFontStack: {
      headline: 'Anton',
      body: 'Inter',
      headlineWeight: 700,
      bodyWeight: 400,
      headlineCharWidth: 0.5,
      lineHeightMult: 1,
    },
    facesUsed: [],
  };
}

const copy = (...texts: string[]): CampaignCopyLine[] =>
  texts.map((text, i) => ({ role: i === 0 ? 'HEADLINE' : 'SUPPORT', text }));

describe('buildTypeSystem', () => {
  it('reads the ratio off the declared scale intent, not off the subject', () => {
    const lines = copy('Built for the long run', 'Since 1994');

    const extreme = buildTypeSystem({ typography: typography(), concept: { typographyScaleContrast: 'extreme — an enormous first read against a whisper' }, copy: lines });
    const dramatic = buildTypeSystem({ typography: typography(), concept: { typographyScaleContrast: 'dramatic, the headline dominant' }, copy: lines });
    const restrained = buildTypeSystem({ typography: typography(), concept: { typographyScaleContrast: 'restrained, an almost flat hierarchy' }, copy: lines });
    const undeclared = buildTypeSystem({ typography: typography(), concept: {}, copy: lines });

    expect(extreme.ratio).toBeGreaterThan(dramatic.ratio);
    expect(dramatic.ratio).toBeGreaterThan(undeclared.ratio);
    expect(undeclared.ratio).toBeGreaterThan(restrained.ratio);
  });

  it('puts the roles in strict hierarchy on every ratio', () => {
    for (const contrast of ['extreme', 'dramatic', 'restrained', '']) {
      const system = buildTypeSystem({
        typography: typography(),
        concept: { typographyScaleContrast: contrast },
        copy: copy('One clear line', 'Half price today', 'Ends Sunday'),
      });

      expect(system.steps['primary-hook'].fontScale).toBeGreaterThan(system.steps['secondary-hook'].fontScale);
      expect(system.steps['secondary-hook'].fontScale).toBeGreaterThan(system.steps['supporting-note'].fontScale);
    }
  });

  it('never renders below the optical floor', () => {
    const system = buildTypeSystem({
      typography: typography(),
      concept: { typographyScaleContrast: 'extreme' },
      copy: copy(
        'A headline long enough that the scale has to give way somewhere',
        'A supporting line',
        'Another supporting line',
        'A fourth',
        'A fifth',
        'A sixth',
      ),
    });

    for (const role of Object.keys(system.steps) as SemanticRole[]) {
      expect(system.steps[role].fontScale).toBeGreaterThanOrEqual(system.opticalFloor);
    }
  });

  it('sets one short line larger than six long ones', () => {
    const short = buildTypeSystem({ typography: typography(), concept: {}, copy: copy('Go') });
    const many = buildTypeSystem({
      typography: typography(),
      concept: {},
      copy: copy('A considerably longer first read', 'two', 'three', 'four', 'five', 'six'),
    });

    expect(short.steps['primary-hook'].fontScale).toBeGreaterThan(many.steps['primary-hook'].fontScale);
  });

  it('tightens tracking as type grows and opens it as type shrinks', () => {
    const system = buildTypeSystem({ typography: typography(), concept: { typographyScaleContrast: 'dramatic' }, copy: copy('Big', 'small print here') });

    expect(system.steps['primary-hook'].letterSpacing).toBeLessThan(0);
    expect(system.steps['primary-hook'].letterSpacing).toBeLessThan(system.steps['supporting-note'].letterSpacing);
  });

  it('gives all-caps more air than mixed case at the same size', () => {
    const mixed = buildTypeSystem({ typography: typography(), concept: {}, copy: copy('Same words here') });
    const caps = buildTypeSystem({
      typography: typography({ headline: { caseTransform: 'upper' } }),
      concept: {},
      copy: copy('Same words here'),
    });

    expect(caps.steps['primary-hook'].letterSpacing).toBeGreaterThan(mixed.steps['primary-hook'].letterSpacing);
  });

  it('closes line height as type grows', () => {
    const system = buildTypeSystem({ typography: typography(), concept: { typographyScaleContrast: 'dramatic' }, copy: copy('Big line', 'supporting detail') });

    expect(system.steps['primary-hook'].lineHeight).toBeLessThan(system.steps['supporting-note'].lineHeight);
  });

  it('carries the family and weight the font selector chose', () => {
    const system = buildTypeSystem({ typography: typography(), concept: {}, copy: copy('Headline', 'body') });

    expect(system.steps['primary-hook'].family).toBe('Anton');
    expect(system.steps['primary-hook'].weight).toBe(700);
    expect(system.steps['supporting-note'].family).toBe('Inter');
  });
});

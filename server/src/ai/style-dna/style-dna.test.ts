import { describe, expect, it } from 'vitest';
import { STYLE_DNA_LIBRARY, getStyleDNA, renderStyleDnaInstructions, resolveStyleDNA, styleDnaToRecipe, validateStyleDNA } from './style-dna';

describe('Style DNA library', () => {
  it('contains exactly the 15 Phase 1 systems and every definition is complete', () => {
    expect(STYLE_DNA_LIBRARY).toHaveLength(15);
    expect(new Set(STYLE_DNA_LIBRARY.map((style) => style.id)).size).toBe(15);
    for (const style of STYLE_DNA_LIBRARY) expect(validateStyleDNA(style), style.id).toEqual([]);
  });

  it('resolves the current prompt before an explicit picker selection', () => {
    const resolved = resolveStyleDNA({ styleId: 'editorial', prompt: 'make this a loud y2k poster' });
    expect(resolved?.style.id).toBe('y2k');
    expect(resolved?.source).toBe('prompt');
  });

  it('lets the current prompt override historical preference', () => {
    expect(resolveStyleDNA({ prompt: 'Create a Y2K party poster', preferredStyleId: 'minimalist' })?.style.id).toBe('y2k');
    expect(resolveStyleDNA({ prompt: 'Create a coffee promotion', preferredStyleId: 'minimalist' })?.source).toBe('history');
  });

  it('resolves aliases and produces stable but controllably varied recipes', () => {
    const first = resolveStyleDNA({ prompt: 'A premium cyber y2k launch', variationKey: 'A' });
    const repeated = resolveStyleDNA({ prompt: 'A premium cyber y2k launch', variationKey: 'A' });
    const second = resolveStyleDNA({ prompt: 'A premium cyber y2k launch', variationKey: 'B' });
    expect(first?.style.id).toBe('y2k');
    expect(first?.variant).toBe(repeated?.variant);
    expect(first?.variant).not.toBe(second?.variant);
    expect(styleDnaToRecipe(first!.style, first!.variant).typographyFamily).toBeTruthy();
  });

  it('renders concrete visual instructions without locking a single template', () => {
    const style = getStyleDNA('cinematic-drama')!;
    const prompt = renderStyleDnaInstructions({ style, source: 'explicit', variant: 42 });
    expect(prompt).toContain('FlowPost Style DNA');
    expect(prompt).toContain('Lighting:');
    expect(prompt).toContain('Composition:');
    expect(prompt).toContain('Vary within');
  });
});

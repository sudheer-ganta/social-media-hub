import { describe, it, expect } from 'vitest';
import { resolveCreativeDna, isCreativeDnaEmpty, renderCreativeDnaSection } from './creative-dna';
import type { ImageAnalysis } from '../types';

function analysis(overrides?: Partial<ImageAnalysis>): ImageAnalysis {
  return {
    primarySubject: 'a black leather kurta on a mannequin',
    secondarySubjects: [],
    objects: ['kurta', 'mannequin'],
    sceneDescription: 'A dark kurta shot in soft studio light.',
    setting: 'studio',
    composition: 'centered, negative space around subject',
    lighting: 'soft warm side-light',
    mood: 'quiet luxury',
    colorPalette: ['#1a1a1a', '#c9a227'],
    brandStyle: 'cinematic minimal',
    textInImage: [],
    emotions: ['calm'],
    themes: ['festive'],
    symbolism: [],
    storyAngles: [],
    productCategory: 'apparel',
    industry: 'fashion',
    targetAudience: 'premium shoppers',
    suggestedCampaignType: 'festive launch',
    suggestedMarketingObjective: 'sales',
    suggestedBuyerPersona: 'premium shopper',
    confidenceScore: 88,
    ...overrides,
  };
}

describe('resolveCreativeDna', () => {
  it('returns an empty, zero-completeness profile when nothing is given', () => {
    const dna = resolveCreativeDna();
    expect(dna.completeness).toBe(0);
    expect(isCreativeDnaEmpty(dna)).toBe(true);
  });

  it('fills gaps from Vision when no Creative DNA was saved', () => {
    const dna = resolveCreativeDna({ imageAnalysis: analysis() });

    expect(dna.visualStyle).toBe('cinematic minimal');
    expect(dna.composition).toContain('centered');
    expect(dna.lighting).toContain('soft warm side-light');
    expect(dna.brandColors).toEqual(['#1a1a1a', '#c9a227']);
    expect(dna.provenance.visualStyle).toBe('image');
    expect(dna.provenance.brandColors).toBe('image');
  });

  it('lets a saved profile win over what the image shows', () => {
    const dna = resolveCreativeDna({
      creativeDna: { visualStyle: 'warm documentary', brandColors: ['#ffffff'] },
      imageAnalysis: analysis(),
    });

    expect(dna.visualStyle).toBe('warm documentary');
    expect(dna.brandColors).toEqual(['#ffffff']);
    expect(dna.provenance.visualStyle).toBe('brand');
    expect(dna.provenance.brandColors).toBe('brand');
  });

  it('is deterministic and produces different profiles for different brands from the same image', () => {
    const image = analysis();
    const brandA = resolveCreativeDna({ creativeDna: { visualStyle: 'bold streetwear' }, imageAnalysis: image });
    const brandB = resolveCreativeDna({ creativeDna: { visualStyle: 'quiet luxury minimal' }, imageAnalysis: image });

    expect(brandA.visualStyle).not.toBe(brandB.visualStyle);
    // Everything Vision supplied and neither brand overrode stays identical.
    expect(brandA.lighting).toBe(brandB.lighting);
  });

  it('labels an inferred field as a working assumption in the rendered section', () => {
    const dna = resolveCreativeDna({ imageAnalysis: analysis() });
    const section = renderCreativeDnaSection(dna);
    expect(section).toContain('not set by the brand');
  });

  it('caveats a mostly-empty profile instead of asserting it as a house style', () => {
    const dna = resolveCreativeDna({ creativeDna: { mood: 'calm' } });
    const section = renderCreativeDnaSection(dna);
    expect(section).toContain('mostly empty');
  });
});

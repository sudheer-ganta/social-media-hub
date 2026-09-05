import { describe, it, expect } from 'vitest';
import { selectTypography } from './font-selector';
import type { CreativeDirection, ReferenceDesignRecipe, ResolvedCreativeDna } from '../types';

function dna(overrides?: Partial<ResolvedCreativeDna>): ResolvedCreativeDna {
  return {
    visualStyle: '',
    photographyStyle: '',
    composition: '',
    lighting: '',
    mood: '',
    typographyCharacter: '',
    spacing: '',
    productTreatment: '',
    logoTreatment: '',
    preferredElements: [],
    avoidedElements: [],
    brandColors: [],
    logoAssetUrl: '',
    referenceAssetUrls: [],
    headlineFont: '',
    bodyFont: '',
    completeness: 0,
    provenance: {},
    ...overrides,
  };
}

function direction(overrides?: Partial<CreativeDirection>): CreativeDirection {
  return {
    concept: '',
    visualStory: '',
    subject: '',
    environment: '',
    composition: '',
    lighting: '',
    mood: '',
    palette: [],
    brandConstraints: [],
    productTreatment: '',
    background: '',
    negativeVisualConstraints: [],
    aspectRatio: '4:5',
    platform: 'instagram',
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    copyTreatment: 'headline_support',
    headline: 'THE NEW SILHOUETTE',
    supportingLine: 'Tailored for the modern minimalist.',
    cta: 'Shop the edit',
    interactionInstructions: '',
    ...overrides,
  };
}

function recipe(overrides?: Partial<ReferenceDesignRecipe>): ReferenceDesignRecipe {
  return {
    photographyStyle: '',
    illustrationStyle: '',
    headlineCharacter: '',
    supportingTypography: '',
    compositionBehaviour: '',
    textHierarchy: '',
    typographyFamily: 'serif-editorial',
    colorPalette: [],
    layoutBehaviour: 'asymmetric',
    logoTreatment: 'corner',
    spacingBehaviour: 'generous',
    texture: 'none',
    graphicElements: [],
    footerStyle: 'none',
    borderStyle: 'none',
    shapeLanguage: 'editorial-rules',
    visualDensity: 'balanced',
    imperfectionLevel: 'none',
    imageTreatment: 'full-bleed',
    ...overrides,
  };
}

describe('selectTypography', () => {
  it('picks an elegant serif headline for a luxury fashion editorial brief', () => {
    const result = selectTypography({
      direction: direction({
        concept: 'A quiet-luxury fashion campaign, sophisticated and fashion-forward',
        subject: 'a tailored coat on a model',
        mood: 'elegant, premium, refined',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'serif-editorial' }),
    });
    expect(['Cormorant Garamond', 'Playfair Display']).toContain(result.headlineFont);
    expect(result.bodyFont).not.toBe(result.headlineFont);
  });

  it('picks a modern geometric-sans headline for a tech announcement in the same Editorial family', () => {
    const result = selectTypography({
      direction: direction({
        concept: 'A modern technology product announcement, clean and confident',
        subject: 'a software app interface',
        mood: 'modern, technical, sleek',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'sans-modern' }),
    });
    expect(result.headlineFont).not.toBe('Cormorant Garamond');
    expect(result.headlineFont).not.toBe('Playfair Display');
  });

  it('honours an explicit brand body font while still allowing a specialised headline display face', () => {
    const result = selectTypography({
      direction: direction({
        concept: 'A quiet-luxury fashion campaign',
        mood: 'elegant, premium',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      }),
      creativeDna: dna({ headlineFont: 'Inter', bodyFont: 'Inter' }),
      recipe: recipe({ typographyFamily: 'serif-editorial' }),
    });
    expect(result.bodyFont).toBe('Inter');
  });

  it('never selects a Latin-only display font for Devanagari copy', () => {
    const result = selectTypography({
      direction: direction({
        headline: 'नमस्ते दुनिया',
        supportingLine: 'ताज़ा और स्वादिष्ट',
        artDirectionFamily: 'TYPOGRAPHY_LED',
      }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'condensed-display' }),
    });
    expect(result.headlineFont).toMatch(/Devanagari|Noto/);
    expect(result.bodyFont).toMatch(/Devanagari|Noto/);
  });

  it('prefers heavy grotesk/condensed display type for Neo Brutalism-flavoured typography-led concepts', () => {
    const result = selectTypography({
      direction: direction({
        concept: 'A loud, brutalist streetwear drop, high-impact and confident',
        mood: 'bold, loud, industrial',
        artDirectionFamily: 'TYPOGRAPHY_LED',
      }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'condensed-display' }),
    });
    expect(['Anton', 'Archivo Black', 'Bebas Neue', 'Oswald', 'Barlow Condensed']).toContain(result.headlineFont);
  });

  it('offers a handwritten accent for Minimal Doodles-flavoured concepts', () => {
    const result = selectTypography({
      direction: direction({
        concept: 'A friendly, doodle-illustrated coffee shop promo',
        mood: 'friendly, restrained, quiet',
        artDirectionFamily: 'MINIMAL_ART',
      }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'sans-modern' }),
    });
    expect(result.accentFont).toBeTruthy();
  });

  it('always returns real weights the catalog actually has files for', () => {
    const result = selectTypography({
      direction: direction({ artDirectionFamily: 'TYPOGRAPHY_LED' }),
      creativeDna: dna(),
      recipe: recipe({ typographyFamily: 'condensed-display' }),
    });
    expect(result.headlineWeight).toBeGreaterThan(0);
    expect(result.bodyWeight).toBeGreaterThan(0);
  });
});

/**
 * Creative renderer — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/creative-renderer.test.ts
 *
 * ponytail: text rasterizes via whatever fonts the host has installed —
 * these tests assert structure and valid output, never glyph-level pixels.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderCreative, buildContent, resolveCanvasSize, resolvePalette } from './creative-renderer';
import type { CreativeDirection, ReferenceDesignRecipe, ReferenceStyleProfile, ResolvedCreativeDna } from '../types';

export const BASE_DIRECTION: CreativeDirection = {
  concept: 'Quiet Luxury',
  visualStory: 'A product on a dark table.',
  subject: 'the attached product',
  environment: 'studio',
  composition: 'centered',
  lighting: 'soft',
  mood: 'calm',
  palette: ['#111111'],
  brandConstraints: [],
  productTreatment: 'hero, large',
  background: 'dark gradient',
  negativeVisualConstraints: [],
  aspectRatio: '4:5',
  platform: 'instagram',
  mode: 'EDITORIAL',
  artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
  copyTreatment: 'headline_support',
  headline: 'Quiet Luxury, Loud Results',
  supportingLine: 'Handcrafted, every time.',
  cta: 'Shop now',
  interactionInstructions: '',
  marketingCreative: {
    brandMessage: 'Cooked in silence, served with love.',
    secondaryInfo: ['Prism Mall, Gachibowli'],
  },
};

export const EMPTY_DNA: ResolvedCreativeDna = {
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
  completeness: 0,
  provenance: {},
};

export const BASE_RECIPE: ReferenceDesignRecipe = {
  photographyStyle: 'warm editorial',
  illustrationStyle: '',
  headlineCharacter: 'large expressive serif',
  supportingTypography: 'restrained sans',
  compositionBehaviour: 'subject offset left',
  textHierarchy: 'headline first',
  typographyFamily: 'serif-editorial',
  colorPalette: ['#f4ead8', '#5c3a21', '#c99b45'],
  layoutBehaviour: 'asymmetric',
  logoTreatment: 'corner',
  spacingBehaviour: 'generous',
  texture: 'paper-grain',
  graphicElements: ['hand-drawn underline'],
  footerStyle: 'torn-paper',
  borderStyle: 'none',
  shapeLanguage: 'organic',
  visualDensity: 'balanced',
  imperfectionLevel: 'subtle',
  imageTreatment: 'full-bleed',
};

export function profileWithRecipe(recipe: Partial<ReferenceDesignRecipe>): ReferenceStyleProfile {
  return {
    analysed: true,
    referenceCount: 3,
    visualLanguage: 'editorial, tactile',
    compositionPatterns: [],
    typographyCharacter: '',
    colorRelationships: '',
    textureAndMaterial: '',
    lightingAndMood: '',
    photographicOrIllustrative: '',
    visualDensity: '',
    brandTreatment: '',
    creativeMechanisms: [],
    imperfectionLevel: '',
    interactionPatterns: '',
    doNotCopy: [],
    dominantDirection: '',
    influence: 'high',
    designRecipe: { ...BASE_RECIPE, ...recipe },
  };
}

async function tinyPng(width = 40, height = 40): Promise<{ mimeType: string; data: string }> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 140, b: 90 } },
  })
    .png()
    .toBuffer();
  return { mimeType: 'image/png', data: buffer.toString('base64') };
}

describe('resolveCanvasSize', () => {
  it('fixes the long edge and derives the short edge from the ratio', () => {
    expect(resolveCanvasSize('1:1')).toEqual({ width: 1600, height: 1600 });
    expect(resolveCanvasSize('4:5')).toEqual({ width: 1280, height: 1600 });
    expect(resolveCanvasSize('16:9')).toEqual({ width: 1600, height: 900 });
  });

  it('falls back to square for an unknown ratio', () => {
    expect(resolveCanvasSize('unknown')).toEqual({ width: 1600, height: 1600 });
  });
});

describe('resolvePalette', () => {
  it('falls back to a safe neutral when nothing is set', () => {
    expect(resolvePalette([], [])).toEqual({ ink: '#1a1a1a', paper: '#f7f4ee', accent: '#1a1a1a' });
  });

  it('brand colours always win — the accent is the first brand colour given', () => {
    expect(resolvePalette(['#e94560', '#0f3460'], ['#aaaaaa']).accent).toBe('#e94560');
  });

  it('with no brand colours, the reference palette tints the piece instead', () => {
    const palette = resolvePalette([], ['#f4ead8', '#5c3a21']);
    expect(palette.paper).toBe('#f4ead8');
    expect(palette.ink).toBe('#5c3a21');
  });

  it('picks a dark ink and light paper by luminance, regardless of order', () => {
    const palette = resolvePalette(['#ffffff', '#0a0a0a'], []);
    expect(palette.ink).toBe('#0a0a0a');
    expect(palette.paper).toBe('#ffffff');
  });
});

describe('buildContent', () => {
  it('includes only what copyTreatment calls for', () => {
    const content = buildContent(BASE_DIRECTION, false);
    expect(content.headline).toBe(BASE_DIRECTION.headline);
    expect(content.support).toBe(BASE_DIRECTION.supportingLine);
    expect(content.brandMessage).toBe('Cooked in silence, served with love.');
    expect(content.cta).toBe('Shop now');
    expect(content.supportIsInteraction).toBeUndefined();
  });

  it('drops copy when copyTreatment is none, even if the text fields are still set', () => {
    const content = buildContent({ ...BASE_DIRECTION, copyTreatment: 'none', marketingCreative: undefined, cta: '' }, false);
    expect(content.headline).toBeUndefined();
    expect(content.support).toBeUndefined();
    expect(content.cta).toBeUndefined();
  });

  it('marks interaction copy so the planner can badge it', () => {
    const content = buildContent(
      { ...BASE_DIRECTION, copyTreatment: 'interactive', interactionInstructions: 'Guess before you scroll.' },
      false,
    );
    expect(content.support).toBe('Guess before you scroll.');
    expect(content.supportIsInteraction).toBe(true);
  });
});

describe('renderCreative', () => {
  const treatments = ['full-bleed', 'framed', 'inset'] as const;
  const aspectRatios = ['1:1', '4:5', '9:16'];

  it.each(treatments.flatMap((t) => aspectRatios.map((ratio) => [t, ratio] as const)))(
    'produces a valid full-size PNG for %s at %s',
    async (imageTreatment, aspectRatio) => {
      const visualImage = await tinyPng();
      const logoImage = await tinyPng(20, 20);
      const result = await renderCreative({
        visualImage,
        direction: { ...BASE_DIRECTION, aspectRatio },
        creativeDna: { ...EMPTY_DNA, brandColors: ['#e94560', '#0f3460'] },
        referenceStyle: profileWithRecipe({ imageTreatment }),
        logoImage,
      });

      expect(result.mimeType).toBe('image/png');
      expect(result.structure).toContain(imageTreatment);
      const metadata = await sharp(Buffer.from(result.data, 'base64')).metadata();
      expect(metadata.format).toBe('png');
      const expected = resolveCanvasSize(aspectRatio);
      expect(metadata.width).toBe(expected.width);
      expect(metadata.height).toBe(expected.height);
    },
    // Full-canvas SVG rasterization is slow under parallel suite load.
    20_000,
  );

  it('composites without a logo and without a reference style', async () => {
    const visualImage = await tinyPng();
    const result = await renderCreative({ visualImage, direction: BASE_DIRECTION, creativeDna: EMPTY_DNA });
    const metadata = await sharp(Buffer.from(result.data, 'base64')).metadata();
    expect(metadata.format).toBe('png');
    expect(result.structure.length).toBeGreaterThan(0);
  });

  it('two different recipes produce two structurally different plans for the same direction', async () => {
    const visualImage = await tinyPng();
    const tactile = await renderCreative({
      visualImage,
      direction: BASE_DIRECTION,
      creativeDna: EMPTY_DNA,
      referenceStyle: profileWithRecipe({}),
    });
    const boldGraphic = await renderCreative({
      visualImage,
      direction: BASE_DIRECTION,
      creativeDna: EMPTY_DNA,
      referenceStyle: profileWithRecipe({
        typographyFamily: 'condensed-display',
        layoutBehaviour: 'centered',
        footerStyle: 'none',
        texture: 'none',
        shapeLanguage: 'geometric',
        imageTreatment: 'inset',
        logoTreatment: 'integrated',
      }),
    });
    expect(tactile.structure).not.toBe(boldGraphic.structure);
  }, 20_000);
});

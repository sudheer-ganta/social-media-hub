import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { designCreative, renderDesignerPlan, validateDesignerPlan, type DesignerPlan, type DesignNode } from './designer-composition';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import { resolveDesignRecipe } from './design-recipe';
import { selectTypography } from '../typography/font-selector';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { buildTypeSystem } from '../typography/type-system';
import type { CreativeDirection, CreativeRenderContext } from '../types';

const direction: CreativeDirection = {
  concept: 'Travel offer', visualStory: 'International travel', subject: 'Travel', environment: '', composition: 'asymmetric',
  lighting: '', mood: 'confident', palette: ['#ffffff', '#111111'], brandConstraints: [], productTreatment: '', background: '',
  negativeVisualConstraints: [], aspectRatio: '1:1', platform: 'instagram', mode: 'EDITORIAL', artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
  copyTreatment: 'headline', headline: 'International trips', supportingLine: '', cta: '', interactionInstructions: '',
  marketingCreative: { offerText: '20% off' },
};
const context: CreativeRenderContext = { brand: resolveBrandProfile(), creativeDna: resolveCreativeDna(),
  goal: 'sales', funnelStage: 'BOFU', platforms: ['instagram'] };
const node = (id: string, kind: DesignNode['kind'], x: number, y: number, width: number, height: number, lines: string[] = [], fontScale = .045, rotation = 0): DesignNode =>
  ({ id, kind, x, y, width, height, lines, color: '#111111', surface: 'none', fontScale, align: 'left', shape: 'rectangle', rotation });
const plan = (): DesignerPlan => ({ background: '#ffffff', rationale: 'Travel offer is the first read', visualPrompt: 'An airplane window overlooking a coast', nodes: [
  node('primary-hook', 'copy', .05, .05, .85, .25, ['International trips'], .09), // Hero scale
  node('secondary-hook', 'copy', .05, .32, .42, .12, ['20% off'], .04),
  node('hero-visual', 'product', .48, .28, .55, .55, [], .045, 2), // Bleeding / tactile photo with rotation
  node('brand-mark', 'logo', .05, .85, .18, .08),
] });
const image = async (color: string) => ({ mimeType: 'image/png', data: (await sharp({ create: { width: 40, height: 40, channels: 3, background: color } }).png().toBuffer()).toString('base64') });
const typography = () => selectTypography({ direction, creativeDna: context.creativeDna, recipe: resolveDesignRecipe(direction, context.creativeDna).recipe });

/**
 * Text calls are looked up by what they ASK FOR, never by their position in the
 * call log. The pipeline gained a font-pairing call ahead of composition, which
 * silently shifted every index-based assertion in this file by one — so these
 * helpers make the assertions say what they mean and survive the next stage
 * anyone adds. Each schema is identified by a required field only it has.
 */
type JsonCall = [{ responseSchema?: { required?: string[] }; prompt: string; images?: unknown[] }];
const callsAsking = (generateJson: { mock: { calls: JsonCall[] } }, required: string) =>
  generateJson.mock.calls.filter((call) => call[0].responseSchema?.required?.includes(required));
const compositionCalls = (g: { mock: { calls: JsonCall[] } }) => callsAsking(g, 'background');
const criticCalls = (g: { mock: { calls: JsonCall[] } }) => callsAsking(g, 'observedSubject');
const artDirectorCalls = (g: { mock: { calls: JsonCall[] } }) => callsAsking(g, 'conceptName');
const fontPairingCalls = (g: { mock: { calls: JsonCall[] } }) => callsAsking(g, 'headlineFamily');

describe('designer composition contracts', () => {
  it('requires every original product, logo and exact copy line', () => {
    const p = plan();
    expect(validateDesignerPlan(p, collectCampaignCopy(direction), 1)).toEqual([]);
    expect(validateDesignerPlan(p, collectCampaignCopy(direction), 2)).toContain('Missing supporting-visual-0.');
    p.nodes.find(n => n.id === 'brand-mark')!.kind = 'shape';
    expect(validateDesignerPlan(p, collectCampaignCopy(direction), 1)).toContain('Missing brand-mark.');
    p.nodes[1].lines = ['Special deal'];
    expect(validateDesignerPlan(p, collectCampaignCopy(direction), 1).join(' ')).toContain('exact supplied copy');
  });
  it('rejects logo/image collisions, product occlusion and unreadable offers', () => {
    const p = plan(); p.nodes[3].x = .52; p.nodes[3].y = .32; // Logo overlaps product
    expect(validateDesignerPlan(p, collectCampaignCopy(direction), 1).join(' ')).toContain('overlaps');
    p.nodes[1].fontScale = .01;
    p.nodes[0].color = '#eeeeee';
    const errors = validateDesignerPlan(p, collectCampaignCopy(direction), 1).join(' ');
    expect(errors).toContain('fontScale'); expect(errors).toContain('contrast');
  });
  it('uses original product and logo pixels in separate regions', async () => {
    const p = plan();
    const result = await renderDesignerPlan(p, { direction, products: [await image('#ef1234')], logo: await image('#1234ef') }, collectCampaignCopy(direction), await typography());
    const pixel = async (x: number, y: number) => [...await sharp(result).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
    expect(await pixel(1000, 1000)).toEqual([239, 18, 52]);
    expect(await pixel(200, 1400)).toEqual([18, 52, 239]);
    expect((await sharp(result).metadata()).width).toBe(1600);
  }, 20000);
  it('rejects text that cannot fit rather than clipping or shrinking to illegibility', async () => {
    const p = plan(); p.nodes[0].width = .02; p.nodes[0].height = .02;
    await expect(renderDesignerPlan(p, { direction, products: [await image('#ff0000')], logo: await image('#0000ff') },
      collectCampaignCopy(direction), await typography())).rejects.toThrow();
  }, 20000);

  // ── The type system and the scrim actually reach the pixels ───────────────

  it('sets type differently when a type system is supplied than when it is not', async () => {
    const assets = { direction, products: [await image('#ef1234')], logo: await image('#1234ef') };
    const copy = collectCampaignCopy(direction);
    const type = await typography();
    const system = buildTypeSystem({ typography: type, concept: { typographyScaleContrast: 'dramatic' }, copy });
    // Anything but 'none' proves the case, tracking and leading are being applied
    // rather than computed and discarded, which is what used to happen.
    system.steps['primary-hook'] = { ...system.steps['primary-hook'], caseTransform: 'upper', letterSpacing: 0.08, lineHeight: 1.4 };

    const plain = await renderDesignerPlan(plan(), assets, copy, type);
    const set = await renderDesignerPlan(plan(), assets, copy, type, undefined, 'none', undefined, system);

    expect(Buffer.compare(plain, set)).not.toBe(0);
  }, 20000);

  it('renders a scrim as a gradient in the copy layer, where it can actually darken the picture', async () => {
    const assets = { direction, products: [await image('#ef1234')], logo: await image('#1234ef') };
    const copy = collectCampaignCopy(direction);
    const type = await typography();

    const withScrim = plan();
    withScrim.nodes[0].scrim = { direction: 'down', color: '#000000', opacity: 0.8 };

    const bare = await renderDesignerPlan(plan(), assets, copy, type);
    const scrimmed = await renderDesignerPlan(withScrim, assets, copy, type);

    // Sampled per pixel rather than as a region mean, because sharp's `stats()`
    // reports on the INPUT image and silently ignores a preceding `extract()` —
    // a region mean measured that way is the whole canvas every time.
    const px = async (png: Buffer, x: number, y: number) =>
      [...(await sharp(png).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];

    // Strongest at the edge it is anchored to, where the first read sits...
    expect((await px(scrimmed, 800, 60))[0]).toBeLessThan((await px(bare, 800, 60))[0] - 100);
    // ...weaker further from it, because it is a gradient and not a panel...
    const mid = (await px(bare, 800, 300))[0] - (await px(scrimmed, 800, 300))[0];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan((await px(bare, 800, 60))[0] - (await px(scrimmed, 800, 60))[0]);
    // ...and gone entirely beyond the copy, which is the whole point of washing
    // only the region the type occupies: the picture survives everywhere else.
    expect(await px(scrimmed, 800, 900)).toEqual(await px(bare, 800, 900));
    expect(await px(scrimmed, 200, 1400)).toEqual(await px(bare, 200, 1400));
  }, 20000);
});

describe('designer generation and final review', () => {
  async function setup(products = true) {
    const product = await image('#ef1234'), logo = await image('#1234ef'), reference = await image('#12ef34');
    const p = plan();
    if (!products) { p.nodes[2].kind = 'visual'; p.nodes[2].id = 'hero-visual'; }
    const generateJson = vi.fn().mockImplementation(async (call) => {
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        return p;
      }
      return {
        observedSubject: '20% off international trips',
        observedOffer: '20% off',
        observedHero: 'typography',
        firstRead: 'International trips 20% off',
        templateLook: false,
        aiLook: false,
        humanCraft: true,
        visualTension: true,
        typographyAsDesign: true,
        logoClear: true,
        problems: [],
        strengths: ['Clear 20% off offer', 'Asymmetrical hierarchy'],
      };
    });
    const generateImage = vi.fn().mockResolvedValue([await image('#ababab')]);
    return { p, generateJson, generateImage, input: { direction, context, products: products ? [product] : [], references: [reference], logo,
      textProvider: { id: 'mock', model: 'mock', supportsVision: true, isConfigured: () => true, generateJson },
      imageProvider: { id: 'mock', model: 'mock', isConfigured: () => true, generateImage } } };
  }
  it('never asks the image model to recreate uploaded products; reads real references and reviews the final pixels', async () => {
    const { input, generateJson, generateImage } = await setup();
    const result = await designCreative(input);
    expect(generateImage).not.toHaveBeenCalled();
    expect(result.assetIds).toEqual(['hero-visual']);
    expect(compositionCalls(generateJson)[0][0].images).toEqual([...input.products, ...input.references, input.logo]);
    expect(compositionCalls(generateJson)[0][0].prompt).toContain('BOFU');
    expect(criticCalls(generateJson)[0][0].images![0]).toMatchObject({ data: result.data.toString('base64') });
  }, 15000);
  it('generates relevant imagery only when products are absent and sends style references without the logo', async () => {
    const { input, generateImage } = await setup(false);
    await designCreative(input);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0][0].referenceImages).toEqual(input.references);
    expect(generateImage.mock.calls[0][0].prompt).toContain('airplane window');
  }, 15000);
  it('repairs a missing offer node before any render reaches final review', async () => {
    const { input, p, generateJson } = await setup();
    let planAttempt = 0;
    generateJson.mockReset().mockImplementation(async (call) => {
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        planAttempt++;
        return planAttempt === 1 ? { ...p, nodes: p.nodes.filter(n => n.id !== 'secondary-hook') } : p;
      }
      return {
        observedSubject: 'Travel offer', observedOffer: '20% off', firstRead: 'Travel 20% off',
        templateLook: false, humanCraft: true, logoClear: true, problems: [], strengths: [],
      };
    });
    await designCreative(input);
    expect(compositionCalls(generateJson)[1][0].prompt).toContain('Missing secondary-hook');
  }, 15000);
  it('fails after bounded retries (max 2 attempts) when the actual output never passes the design critic', async () => {
    const { input, p, generateJson } = await setup();
    generateJson.mockReset().mockImplementation(async (call) => {
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        return p;
      }
      if (call.responseSchema && call.responseSchema.required?.includes('conceptName')) {
        return {
          conceptName: 'Redesign Concept',
          visualIdea: 'Alternative layout idea',
          hero: 'typography',
          heroPlacement: 'Left side',
          imageRole: 'small-tactile-object',
          imageTreatment: 'Rotated slightly',
          firstRead: '20% OFF',
          typographyStrategy: 'Bold scale contrast',
          typographyScaleContrast: 'High contrast',
          compositionStrategy: 'Asymmetrical',
          logoSanctuary: 'Top right',
          elementsToOmit: ['CTA'],
          compositionFamily: 'raw-brutalist',
        };
      }
      return {
        observedSubject: 'Travel',
        templateLook: true,
        criticalFlaws: ['The composition resembles a generic template card.'],
        problems: ['The composition resembles a generic template card.'],
      };
    });
    await expect(designCreative(input)).rejects.toThrow('after two attempts');
    // 2 attempts: (plan + critic + art-director) + (plan + critic), plus the one
    // font-pairing call that happens once per creative before the attempt loop.
    expect(compositionCalls(generateJson)).toHaveLength(2);
    expect(criticCalls(generateJson)).toHaveLength(2);
    expect(artDirectorCalls(generateJson)).toHaveLength(1);
    expect(fontPairingCalls(generateJson)).toHaveLength(1);
    expect(generateJson).toHaveBeenCalledTimes(6);
  }, 25000);
});


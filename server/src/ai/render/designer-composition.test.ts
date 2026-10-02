import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { designCreative, renderDesignerPlan, retypeCreativeFromLayout, validateDesignerPlan, type DesignerPlan, type DesignNode } from './designer-composition';
import { buildPersistedLayout } from './type-style-apply';
import { LayoutMismatchError, TextStyleError } from './type-style';
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
    expect(criticCalls(generateJson)[0][0].images![0]).toMatchObject({ data: result.data.toString('base64') });
  }, 15000);
  it('generates relevant imagery only when products are absent and sends style references without the logo', async () => {
    const { input, generateImage } = await setup(false);
    await designCreative(input);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0][0].referenceImages).toEqual(input.references);
    expect(generateImage.mock.calls[0][0].prompt).toContain('International travel');
  }, 15000);
  it('discovers composition autonomously using dynamic design engine with zero LLM plan calls', async () => {
    const { input, generateJson } = await setup();
    const result = await designCreative(input);
    expect(compositionCalls(generateJson)).toHaveLength(0);
    expect(result.plan.nodes.length).toBeGreaterThanOrEqual(3);
    const primaryNode = result.plan.nodes.find(n => n.id === 'primary-hook');
    expect(primaryNode).toBeDefined();
    expect(primaryNode?.kind).toBe('copy');
    expect(primaryNode?.fontScale).toBeGreaterThan(0.02);
  }, 15000);
  describe('text edit (retype) mode', () => {
    it('re-typesets over the locked picture without calling the image model, the critic or font pairing', async () => {
      const { input, generateJson, generateImage } = await setup(false);
      const lockedVisual = await image('#ababab');
      const lockedTypography = await typography();
      const result = await designCreative({
        ...input, retype: true, lockedVisual, lockedTypography,
        direction: { ...direction, headline: 'Fresh wording' },
      });
      expect(generateImage).not.toHaveBeenCalled();
      expect(criticCalls(generateJson)).toHaveLength(0);
      expect(fontPairingCalls(generateJson)).toHaveLength(0);
      expect(result.visual?.data).toBe(lockedVisual.data);
      expect(result.typography).toBe(lockedTypography);
      const typeset = result.plan.nodes.filter(n => n.kind === 'copy').flatMap(n => n.lines).join(' ').toLowerCase();
      expect(typeset).toContain('fresh wording');
      expect(typeset).not.toContain('international trips');
    }, 20000);

    it('keeps the original fonts: the locked typography is used as given', async () => {
      const { input } = await setup(false);
      const lockedTypography = await typography();
      const result = await designCreative({ ...input, retype: true, lockedVisual: await image('#ababab'), lockedTypography });
      expect(result.typography.headlineFont).toBe(lockedTypography.headlineFont);
    }, 20000);

    it('typesets a line in the font, size and colour the member chose, and reports what it applied', async () => {
      const { input, generateImage } = await setup(false);
      const lockedVisual = await image('#ababab');
      const lockedTypography = await typography();
      const styled = await designCreative({
        ...input, retype: true, lockedVisual, lockedTypography,
        textStyles: { HEADLINE: { fontFamily: 'Anton', color: '#ff3300', sizeScale: 0.8 } },
      });
      const headline = styled.plan.nodes.find((n) => n.id === 'primary-hook')!;
      expect(headline.fontFamily).toBe('Anton');
      expect(headline.color).toBe('#ff3300');
      expect(styled.appliedTextStyles?.HEADLINE).toMatchObject({ fontFamily: 'Anton', color: '#ff3300', sizeScale: 0.8 });
      expect(styled.typeset.HEADLINE).toMatchObject({ fontFamily: 'Anton', color: '#ff3300' });
      expect(generateImage).not.toHaveBeenCalled();
    }, 20000);

    it('ignores style overrides outside retype mode', async () => {
      const { input } = await setup(false);
      const result = await designCreative({ ...input, textStyles: { HEADLINE: { fontFamily: 'Anton' } } });
      expect(result.appliedTextStyles).toBeUndefined();
    }, 20000);

    describe('re-rendering the saved layout', () => {
      async function original() {
        const { input } = await setup(false);
        const lockedVisual = await image('#ababab');
        const lockedTypography = await typography();
        const first = await designCreative({ ...input, retype: true, lockedVisual, lockedTypography });
        const layout = buildPersistedLayout({ plan: first.plan, roles: first.copyNodeRoles, copy: first.copyById, baseScales: first.baseScales });
        return { input, lockedVisual, lockedTypography, first, layout };
      }
      const rerender = (o: Awaited<ReturnType<typeof original>>, edited: CreativeDirection, changes = {}) =>
        retypeCreativeFromLayout({
          direction: edited, context, products: o.input.products, logo: o.input.logo,
          lockedVisual: o.lockedVisual, typography: o.lockedTypography, layout: o.layout, changes,
        });
      const box = (n: DesignNode) => ({ x: n.x, y: n.y, width: n.width, height: n.height });

      it('changes only the edited line: every other line keeps its exact box, size, breaks and colour', async () => {
        const o = await original();
        const edited = await rerender(o, { ...direction, headline: 'Quick trips' });
        for (const before of o.first.plan.nodes.filter((n) => n.id !== 'primary-hook')) {
          expect(edited.plan.nodes.find((n) => n.id === before.id)).toEqual(before);
        }
        const headBefore = o.first.plan.nodes.find((n) => n.id === 'primary-hook')!;
        const headAfter = edited.plan.nodes.find((n) => n.id === 'primary-hook')!;
        expect(box(headAfter)).toEqual(box(headBefore));
        expect(headAfter.fontFamily).toBe(headBefore.fontFamily);
        expect(headAfter.color).toBe(headBefore.color);
        expect(headAfter.lines.join(' ')).toBe('Quick trips');
        expect(headAfter.fontScale).toBeLessThanOrEqual(headBefore.fontScale + 1e-9);
        expect(edited.data.length).toBeGreaterThan(0);
      }, 20000);

      it('restyles one line without touching the rest of the layout', async () => {
        const o = await original();
        const edited = await rerender(o, { ...direction, headline: 'Quick trips' }, { HEADLINE: { fontFamily: 'Anton', color: '#ff3300' } });
        for (const before of o.first.plan.nodes.filter((n) => n.id !== 'primary-hook')) {
          expect(edited.plan.nodes.find((n) => n.id === before.id)).toEqual(before);
        }
        const head = edited.plan.nodes.find((n) => n.id === 'primary-hook')!;
        expect(head.fontFamily).toBe('Anton');
        expect(head.color).toBe('#ff3300');
        expect(edited.typeset.HEADLINE).toMatchObject({ fontFamily: 'Anton', color: '#ff3300' });
      }, 20000);

      it('shrinks long wording to fit its own box rather than moving or growing it', async () => {
        const o = await original();
        const edited = await rerender(o, { ...direction, headline: 'International trips planned slowly around the people you love most' });
        const headBefore = o.first.plan.nodes.find((n) => n.id === 'primary-hook')!;
        const headAfter = edited.plan.nodes.find((n) => n.id === 'primary-hook')!;
        expect(box(headAfter)).toEqual(box(headBefore));
        expect(headAfter.fontScale).toBeLessThan(headBefore.fontScale);
        for (const before of o.first.plan.nodes.filter((n) => n.id !== 'primary-hook')) {
          expect(edited.plan.nodes.find((n) => n.id === before.id)).toEqual(before);
        }
      }, 20000);

      it('asks for a re-solve when the saved layout no longer matches the lines', async () => {
        const o = await original();
        const withoutOffer = { ...direction, marketingCreative: {} } as CreativeDirection;
        await expect(rerender(o, withoutOffer)).rejects.toBeInstanceOf(LayoutMismatchError);
      }, 20000);
    });

    it('never redesigns or regenerates, even when the critic would have rejected the design', async () => {
      const { input, generateJson, generateImage } = await setup(false);
      // A critic that rejects everything: outside retype mode this forces a redesign and a new image.
      generateJson.mockReset().mockImplementation(async () => ({
        observedSubject: 'Travel', templateLook: true, problems: ['Looks like a template.'],
      }));
      const result = await designCreative({ ...input, retype: true, lockedVisual: await image('#ababab'), lockedTypography: await typography() });
      expect(result.data.length).toBeGreaterThan(0);
      expect(generateImage).not.toHaveBeenCalled();
      expect(artDirectorCalls(generateJson)).toHaveLength(0);
      expect(generateJson).not.toHaveBeenCalled();
    }, 20000);
  });

  it('fails after bounded retries (max 2 attempts) when the actual output never passes the design critic', async () => {
    const { input, p, generateJson } = await setup();
    generateJson.mockReset().mockImplementation(async (call) => {
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
    expect(compositionCalls(generateJson)).toHaveLength(0);
    expect(criticCalls(generateJson)).toHaveLength(2);
    expect(artDirectorCalls(generateJson)).toHaveLength(1);
    expect(fontPairingCalls(generateJson)).toHaveLength(1);
    expect(generateJson).toHaveBeenCalledTimes(4);
  }, 25000);
});


import { describe, it, expect, vi } from 'vitest';
import { generateCreativeDirection, summariseCreativeDirection } from './creative-direction.generator';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import type { AiTextProvider } from '../providers';
import type { CreativeConcept } from '../types';

function mockProvider(payload: Record<string, unknown>): AiTextProvider {
  return {
    id: 'mock',
    model: 'mock-model',
    supportsVision: false,
    isConfigured: () => true,
    generateJson: vi.fn(async () => payload),
  };
}

const RAW_PAYLOAD = {
  concept: 'Quiet Luxury — Diwali',
  visualStory: 'A single kurta lit from the side against a dark backdrop.',
  subject: 'the attached kurta',
  environment: 'dark studio',
  composition: 'centered, generous negative space',
  lighting: 'low warm side-light',
  mood: 'restrained, festive',
  palette: ['#1A1A1A', '#C9A227'],
  brandConstraints: ['no loud gold gradients'],
  productTreatment: 'hero, natural fabric detail preserved',
  background: 'dark charcoal gradient',
  negativeVisualConstraints: ['no invented text', 'no confetti'],
  aspectRatio: '4:5',
  platform: 'instagram',
  copyTreatment: 'headline',
  headline: 'Quiet. Bold. Yours.',
  supportingLine: '',
  cta: '',
  interactionInstructions: '',
};

const SAMPLE_CONCEPT: CreativeConcept = {
  conceptName: 'The Fold Reveals',
  bigIdea: 'The kurta\'s own fabric fold becomes the reveal.',
  visualMechanism: 'visual metaphor',
  productRole: 'the fold itself is the idea, not decoration',
};

describe('generateCreativeDirection', () => {
  it('normalises a model payload into a CreativeDirection, carrying mode and copy fields through', async () => {
    const provider = mockProvider(RAW_PAYLOAD);
    const brand = resolveBrandProfile({ brand: { name: 'Aura' } });
    const creativeDna = resolveCreativeDna({ creativeDna: { visualStyle: 'quiet luxury' } });

    const { direction, meta } = await generateCreativeDirection({
      provider,
      request: 'A premium Diwali campaign for our new black kurta collection.',
      goal: 'product_launch',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: true,
      brand,
      creativeDna,
      concept: SAMPLE_CONCEPT,
      mode: 'VISUAL_METAPHOR',
    });

    expect(direction.concept).toBe('Quiet Luxury — Diwali');
    expect(direction.palette).toEqual(['#1a1a1a', '#c9a227']);
    expect(direction.aspectRatio).toBe('4:5');
    expect(direction.mode).toBe('VISUAL_METAPHOR');
    expect(direction.copyTreatment).toBe('headline');
    expect(direction.headline).toBe('Quiet. Bold. Yours.');
    expect(meta.model).toBe('mock-model');

    // The chosen idea is handed to the model as a brief to execute, not invented fresh.
    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).toContain('The Fold Reveals');
    expect(call.prompt).toContain('visual metaphor');
  });

  it('falls back to a safe default instead of an invalid aspect ratio', async () => {
    const provider = mockProvider({ ...RAW_PAYLOAD, aspectRatio: 'ultrawide-cinemascope' });
    const brand = resolveBrandProfile();
    const creativeDna = resolveCreativeDna();

    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand,
      creativeDna,
      mode: 'EDITORIAL',
    });

    expect(direction.aspectRatio).toBe('1:1');
  });

  it('defaults copyTreatment to none for an unrecognised or absent value — most ideas need less text than that', async () => {
    const provider = mockProvider({ ...RAW_PAYLOAD, copyTreatment: undefined });
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'MINIMAL',
    });

    expect(direction.copyTreatment).toBe('none');
  });

  it('never returns null even for a thin payload — a request that reached here already validated', async () => {
    const provider = mockProvider({});
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    expect(direction.concept).toBe('Brand creative');
  });

  it('carries artDirectionFamily through unchanged and tells the model to execute it concretely', async () => {
    const provider = mockProvider(RAW_PAYLOAD);
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      concept: SAMPLE_CONCEPT,
      mode: 'VISUAL_METAPHOR',
      artDirectionFamily: 'COLLAGE',
    });

    expect(direction.artDirectionFamily).toBe('COLLAGE');
    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).toContain('Art direction family to execute (fixed, do not change): COLLAGE');
  });

  it('carries the prior direction forward field by field, not just its concept name, so a narrow instruction cannot redesign the whole shot', async () => {
    const provider = mockProvider(RAW_PAYLOAD);
    const priorDirection = {
      concept: 'Quiet Luxury',
      visualStory: 'A single kurta lit from the side against a dark backdrop.',
      subject: 'the attached kurta',
      environment: 'dark studio',
      composition: 'centered, generous negative space',
      lighting: 'low warm side-light',
      mood: 'restrained, festive',
      palette: ['#1a1a1a', '#c9a227'],
      brandConstraints: [],
      productTreatment: 'hero, natural fabric detail preserved',
      background: 'dark charcoal gradient',
      negativeVisualConstraints: [],
      aspectRatio: '4:5',
      platform: 'instagram',
      mode: 'EDITORIAL' as const,
      copyTreatment: 'none' as const,
      headline: '',
      supportingLine: '',
      cta: '',
      interactionInstructions: '',
    };

    await generateCreativeDirection({
      provider,
      request: 'original request',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: priorDirection.mode,
      refinementOf: { priorDirection, instruction: 'Make it darker' },
    });

    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).toContain('Refine the existing creative per this instruction: "Make it darker"');
    // Every field of the prior shot rides along as a concrete anchor, not just the concept name.
    expect(call.prompt).toContain('composition: centered, generous negative space');
    expect(call.prompt).toContain('environment: dark studio');
    expect(call.prompt).toContain('background: dark charcoal gradient');
    expect(call.prompt).toContain('productTreatment: hero, natural fabric detail preserved');
    expect(call.prompt).toContain('Change only what the instruction names');
  });
});

describe('generateCreativeDirection — marketingCreative', () => {
  it('normalises marketingCreative when the model supplies it, dropping it entirely when empty', async () => {
    const provider = mockProvider({
      ...RAW_PAYLOAD,
      goal: 'brand_awareness',
      marketingCreative: {
        brandMessage: 'Cooked in silence, served with love.',
        secondaryInfo: ['Prism Mall, Gachibowli'],
        logoTreatment: '',
        requiredElements: [],
      },
    });

    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    expect(direction.marketingCreative?.brandMessage).toBe('Cooked in silence, served with love.');
    expect(direction.marketingCreative?.secondaryInfo).toEqual(['Prism Mall, Gachibowli']);
    expect(direction.marketingCreative?.logoTreatment).toBeUndefined();
  });

  it('omits marketingCreative when every field comes back empty', async () => {
    const provider = mockProvider({ ...RAW_PAYLOAD, marketingCreative: {} });
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    expect(direction.marketingCreative).toBeUndefined();
  });
});

describe('generateCreativeDirection — layoutDirection', () => {
  it('normalises layoutDirection when the model supplies it, dropping it entirely when empty', async () => {
    const provider = mockProvider({
      ...RAW_PAYLOAD,
      layoutDirection: {
        layoutType: 'editorial vertical split, product foreground-left',
        textHierarchy: ['HOOK — headline, upper third', 'DIRECT — cta, lower-right corner'],
        headlinePlacement: '',
        logoPlacement: 'bottom-right corner, small',
        safeAreas: '',
      },
    });

    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    expect(direction.layoutDirection?.layoutType).toBe('editorial vertical split, product foreground-left');
    expect(direction.layoutDirection?.textHierarchy).toEqual([
      'HOOK — headline, upper third',
      'DIRECT — cta, lower-right corner',
    ]);
    expect(direction.layoutDirection?.logoPlacement).toBe('bottom-right corner, small');
    expect(direction.layoutDirection?.headlinePlacement).toBeUndefined();
    expect(direction.layoutDirection?.safeAreas).toBeUndefined();
  });

  it('omits layoutDirection when every field comes back empty', async () => {
    const provider = mockProvider({ ...RAW_PAYLOAD, layoutDirection: {} });
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    expect(direction.layoutDirection).toBeUndefined();
  });
});

describe('generateCreativeDirection — retry', () => {
  it('retries once for a promotional goal when the brief ships with no communication at all', async () => {
    const uncommunicative = { ...RAW_PAYLOAD, headline: '', copyTreatment: 'none' };
    const communicative = { ...RAW_PAYLOAD, headline: 'Momos mode: ON.', copyTreatment: 'headline' };

    const generateJson = vi
      .fn()
      .mockResolvedValueOnce(uncommunicative)
      .mockResolvedValueOnce(communicative);
    const provider: AiTextProvider = {
      id: 'mock',
      model: 'mock-model',
      supportsVision: false,
      isConfigured: () => true,
      generateJson,
    };

    const { direction } = await generateCreativeDirection({
      provider,
      request: 'Promote our momo dish.',
      goal: 'sales',
      funnelStage: 'BOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      concept: SAMPLE_CONCEPT,
      mode: 'EDITORIAL',
    });

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(direction.headline).toBe('Momos mode: ON.');
  });

  it('does not retry for a non-promotional goal, even with no communication at all', async () => {
    const provider = mockProvider({ ...RAW_PAYLOAD, headline: '', copyTreatment: 'none' });
    await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      mode: 'MINIMAL',
    });

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });
});

describe('summariseCreativeDirection', () => {
  it('produces a plain-language summary, not raw JSON', async () => {
    const provider = mockProvider(RAW_PAYLOAD);
    const { direction } = await generateCreativeDirection({
      provider,
      request: 'anything',
      goal: 'product_launch',
      funnelStage: 'TOFU',
      platforms: ['instagram', 'linkedin'],
      hasAssets: false,
      brand: resolveBrandProfile({ brand: { name: 'Aura' } }),
      creativeDna: resolveCreativeDna(),
      mode: 'EDITORIAL',
    });

    const summary = summariseCreativeDirection(direction, {
      goal: 'product_launch',
      funnelStage: 'TOFU',
      platforms: ['instagram', 'linkedin'],
      brandName: 'Aura',
    });

    expect(summary).not.toContain('{');
    expect(summary).toContain('Quiet Luxury — Diwali');
    expect(summary).toContain('Aura');
    expect(summary).toContain('instagram, linkedin');
    expect(summary).toContain('Quiet. Bold. Yours.');
  });
});

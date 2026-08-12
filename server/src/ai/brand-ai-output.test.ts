import { describe, expect, it } from 'vitest';
import { resolveBrandProfile } from './brand/brand-profile';
import { buildCaptionPrompt, buildCaptionResponseSchema } from './prompts/caption.prompt';
import type { CaptionRequest } from './types';

function baseRequest(overrides?: Partial<CaptionRequest>): CaptionRequest {
  return {
    mode: 'brand',
    userId: 'user-123',
    topic: 'FlowPost Multi-Platform Composer',
    title: 'FlowPost Product Launch',
    audience: 'professional',
    platforms: ['linkedin', 'instagram', 'x'],
    goal: 'product_launch',
    funnelStage: 'TOFU',
    captionLength: 'Medium',
    language: 'English',
    variationCount: 3,
    hashtagCount: 4,
    ...overrides,
  };
}

describe('Brand AI Output Presentation & Prompt Construction', () => {
  it('substantially differentiates TOFU and BOFU funnel stage prompts', () => {
    const tofuRequest = baseRequest({ funnelStage: 'TOFU' });
    const bofuRequest = baseRequest({ funnelStage: 'BOFU' });

    const brand = resolveBrandProfile({
      brand: { name: 'FlowPost', description: 'Social media management tool' },
    });

    const tofuPrompt = buildCaptionPrompt(tofuRequest, { brand });
    const bofuPrompt = buildCaptionPrompt(bofuRequest, { brand });

    expect(tofuPrompt.prompt).toContain('TOFU (Top of Funnel - Awareness & Problem Framing)');
    expect(tofuPrompt.prompt).toContain('Sell NOTHING');
    expect(tofuPrompt.prompt).toContain('low-friction or soft CTA');

    expect(bofuPrompt.prompt).toContain('BOFU (Bottom of Funnel - Conversion & Direct Value)');
    expect(bofuPrompt.prompt).toContain('Lead directly with concrete product value proposition');
    expect(bofuPrompt.prompt).toContain('clear, direct conversion CTA');
    expect(tofuPrompt.prompt).not.toEqual(bofuPrompt.prompt);
  });

  it('filters banned clichés while respecting explicit brand wordsToUse', () => {
    const requestWithoutBrandWord = baseRequest();
    const requestWithBrandWord = baseRequest({
      brandVoice: {
        name: 'FlowPost',
        wordsToUse: ['seamless', 'unlock'],
      },
    });

    const brand1 = resolveBrandProfile({ brand: { name: 'FlowPost' } });
    const brand2 = resolveBrandProfile({
      brand: { name: 'FlowPost', wordsToUse: ['seamless', 'unlock'] },
    });

    const prompt1 = buildCaptionPrompt(requestWithoutBrandWord, { brand: brand1 });
    const prompt2 = buildCaptionPrompt(requestWithBrandWord, { brand: brand2 });

    expect(prompt1.systemInstruction).toContain('"seamless"');
    expect(prompt1.systemInstruction).toContain('"unlock"');

    // Brand explicitly listed "seamless" and "unlock" in wordsToUse, so they must NOT be banned
    expect(prompt2.systemInstruction).not.toContain('"seamless"');
    expect(prompt2.systemInstruction).not.toContain('"unlock"');
    expect(prompt2.systemInstruction).toContain('"revolutionary"');
  });

  it('includes structured whyItWorksDetails and platformCaptions in response schema', () => {
    const request = baseRequest();
    const schema = buildCaptionResponseSchema(request) as any;

    expect(schema.properties.variations.items.properties).toHaveProperty('whyItWorksDetails');
    const detailsProps = schema.properties.variations.items.properties.whyItWorksDetails.properties;
    expect(detailsProps).toHaveProperty('hook');
    expect(detailsProps).toHaveProperty('funnel');
    expect(detailsProps).toHaveProperty('voice');
    expect(detailsProps).toHaveProperty('platform');

    expect(schema.properties).toHaveProperty('platformCaptions');
    expect(schema.properties.platformCaptions.properties).toHaveProperty('linkedin');
    expect(schema.properties.platformCaptions.properties).toHaveProperty('instagram');
    expect(schema.properties.platformCaptions.properties).toHaveProperty('x');
  });

  it('clamps hashtags schema to max 5 items', () => {
    const request = baseRequest({ hashtagCount: 10 });
    const schema = buildCaptionResponseSchema(request) as any;

    expect(schema.properties.hashtags.maxItems).toBe(5);
  });
});

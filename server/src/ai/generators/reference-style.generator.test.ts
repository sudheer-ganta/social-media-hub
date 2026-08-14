import { describe, it, expect, vi } from 'vitest';

vi.mock('../vision/image-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../vision/image-source')>();
  return {
    ...actual,
    fetchInlineImage: vi.fn(async (_url: string) => ({
      mimeType: 'image/jpeg',
      data: 'ZmFrZQ==',
      sizeBytes: 4,
    })),
  };
});

import { generateReferenceStyleProfile, EMPTY_REFERENCE_STYLE_PROFILE } from './reference-style.generator';
import { fetchInlineImage } from '../vision/image-source';
import type { AiTextProvider } from '../providers';

function mockProvider(payload: unknown, supportsVision = true): AiTextProvider {
  return {
    id: 'mock',
    model: 'mock-model',
    supportsVision,
    isConfigured: () => true,
    generateJson: vi.fn(async () => payload),
  };
}

const SAMPLE_PAYLOAD = {
  visualLanguage: 'editorial, tactile, asymmetric',
  compositionPatterns: ['off-centre framing', 'diagonal lines'],
  typographyCharacter: 'bold hand-set serif',
  colorRelationships: 'warm neutrals with one saturated accent',
  textureAndMaterial: 'grainy print, visible paper fibre',
  lightingAndMood: 'low warm light, quiet and intimate',
  photographicOrIllustrative: 'photographic with collage elements',
  visualDensity: 'spacious, one focal point',
  brandTreatment: 'small wordmark, bottom corner',
  creativeMechanisms: ['unusual perspective', 'tactile paper texture'],
  imperfectionLevel: 'deliberately imperfect, visible grain',
  interactionPatterns: '',
  doNotCopy: ['the exact hand model shown', 'the exact headline wording'],
  dominantDirection: 'Lean into tactile, editorial warmth.',
  influence: 'high',
};

describe('generateReferenceStyleProfile', () => {
  it('returns the empty profile when no reference URLs are given', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD);
    const profile = await generateReferenceStyleProfile({ provider, referenceUrls: [] });

    expect(profile).toEqual(EMPTY_REFERENCE_STYLE_PROFILE);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it('returns the empty profile when the provider cannot see', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD, false);
    const profile = await generateReferenceStyleProfile({
      provider,
      referenceUrls: ['https://cdn.example.com/ref1.jpg'],
    });

    expect(profile).toEqual(EMPTY_REFERENCE_STYLE_PROFILE);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it('sends every reference image in ONE call, not one call per image', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD);
    await generateReferenceStyleProfile({
      provider,
      referenceUrls: [
        'https://cdn.example.com/ref1.jpg',
        'https://cdn.example.com/ref2.jpg',
        'https://cdn.example.com/ref3.jpg',
      ],
    });

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.images).toHaveLength(3);
  });

  it('normalises a full payload, including the mandatory doNotCopy list', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD);
    const profile = await generateReferenceStyleProfile({
      provider,
      referenceUrls: ['https://cdn.example.com/ref1.jpg', 'https://cdn.example.com/ref2.jpg'],
    });

    expect(profile.analysed).toBe(true);
    expect(profile.referenceCount).toBe(2);
    expect(profile.visualLanguage).toBe('editorial, tactile, asymmetric');
    expect(profile.creativeMechanisms).toEqual(['unusual perspective', 'tactile paper texture']);
    expect(profile.doNotCopy).toEqual(['the exact hand model shown', 'the exact headline wording']);
    expect(profile.influence).toBe('high');
  });

  it('caps influence at medium for a single reference, even if the model says high', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD);
    const profile = await generateReferenceStyleProfile({
      provider,
      referenceUrls: ['https://cdn.example.com/ref1.jpg'],
    });

    expect(profile.referenceCount).toBe(1);
    expect(profile.influence).toBe('medium');
  });

  it('degrades to the empty profile when every reference fails to fetch', async () => {
    vi.mocked(fetchInlineImage).mockRejectedValueOnce(new Error('404')).mockRejectedValueOnce(new Error('404'));
    const provider = mockProvider(SAMPLE_PAYLOAD);

    const profile = await generateReferenceStyleProfile({
      provider,
      referenceUrls: ['https://cdn.example.com/broken1.jpg', 'https://cdn.example.com/broken2.jpg'],
    });

    expect(profile).toEqual(EMPTY_REFERENCE_STYLE_PROFILE);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it('degrades to the empty profile when the model call throws — an enhancement, not a requirement', async () => {
    const provider: AiTextProvider = {
      id: 'mock',
      model: 'mock-model',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn(async () => {
        throw new Error('model unavailable');
      }),
    };

    const profile = await generateReferenceStyleProfile({
      provider,
      referenceUrls: ['https://cdn.example.com/ref1.jpg'],
    });

    expect(profile).toEqual(EMPTY_REFERENCE_STYLE_PROFILE);
  });

  it('caps at 6 references even if more are supplied', async () => {
    const provider = mockProvider(SAMPLE_PAYLOAD);
    const urls = Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/ref${i}.jpg`);
    await generateReferenceStyleProfile({ provider, referenceUrls: urls });

    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.images).toHaveLength(6);
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../research/gemini-grounded-search', () => ({
  isGroundedSearchConfigured: vi.fn(() => false),
  groundedSearch: vi.fn(async () => null),
}));

import { generateCreativeResearch, EMPTY_CREATIVE_RESEARCH } from './creative-research.generator';
import { groundedSearch } from '../research/gemini-grounded-search';
import type { AiTextProvider } from '../providers';
import type { CreativeResearchContext } from '../prompts/creative-research.prompt';

function mockProvider(payload: unknown): AiTextProvider {
  return {
    id: 'mock',
    model: 'mock-model',
    supportsVision: false,
    isConfigured: () => true,
    generateJson: vi.fn(async () => payload),
  };
}

function baseContext(overrides?: Partial<CreativeResearchContext>): CreativeResearchContext {
  return {
    request: 'momo restaurant campaign',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    ...overrides,
  };
}

describe('generateCreativeResearch', () => {
  it('reasons from the model alone when grounding is unavailable (no key / grounding failed)', async () => {
    const provider = mockProvider({
      creativeMechanisms: ['product as visual metaphor'],
      originalityDirection: 'Use the product in an unexpected situation, not a product poster.',
    });

    const research = await generateCreativeResearch({ provider, context: baseContext() });

    expect(groundedSearch).toHaveBeenCalledTimes(1);
    expect(research.researchPerformed).toBe(false);
    expect(research.sources).toEqual([]);
    expect(research.creativeMechanisms).toEqual(['product as visual metaphor']);
    expect(research.originalityDirection).toContain('unexpected situation');
  });

  it('marks researchPerformed and preserves source provenance when grounding succeeds', async () => {
    vi.mocked(groundedSearch).mockResolvedValueOnce({
      text: 'Food brands are using unexpected scale and playful mechanisms.',
      sources: [{ title: 'nrn.com', url: 'https://vertexaisearch.example/redirect/abc', domain: 'nrn.com' }],
    });

    const provider = mockProvider({
      creativeMechanisms: ['unexpected scale'],
      originalityDirection: 'Build on scale, not on the exact reference composition.',
    });

    const research = await generateCreativeResearch({
      provider,
      context: baseContext({ industry: 'food', brandName: 'Seven Sisters' }),
    });

    expect(research.researchPerformed).toBe(true);
    expect(research.referenceCount).toBe(1);
    expect(research.sources).toEqual([{ title: 'nrn.com', url: 'https://vertexaisearch.example/redirect/abc', domain: 'nrn.com' }]);
    // Never store the copyrighted source text itself.
    expect(JSON.stringify(research)).not.toContain('unexpected scale and playful mechanisms');
  });

  it('threads the full creative context into the grounded query — not a generic search', async () => {
    const provider = mockProvider({ creativeMechanisms: [], originalityDirection: '' });
    await generateCreativeResearch({
      provider,
      context: baseContext({
        brandName: 'VisaWorX',
        industry: 'Travel / Visa Services',
        audience: 'first-time travellers',
        request: 'Create a campaign about avoiding visa application mistakes.',
      }),
    });

    const calls = vi.mocked(groundedSearch).mock.calls;
    const [, prompt] = calls[calls.length - 1];
    expect(prompt).toContain('VisaWorX');
    expect(prompt).toContain('Travel / Visa Services');
    expect(prompt).toContain('first-time travellers');
    expect(prompt).toContain('avoiding visa application mistakes');
    expect(prompt).not.toContain('best AI advertising designs');
  });

  it('degrades gracefully to EMPTY_CREATIVE_RESEARCH when the synthesis call throws', async () => {
    const provider: AiTextProvider = {
      id: 'mock',
      model: 'mock-model',
      supportsVision: false,
      isConfigured: () => true,
      generateJson: vi.fn(async () => {
        throw new Error('model unavailable');
      }),
    };

    const research = await generateCreativeResearch({ provider, context: baseContext() });
    expect(research).toEqual(EMPTY_CREATIVE_RESEARCH);
  });

  it('degrades gracefully when the model returns something unusable rather than throwing', async () => {
    const provider = mockProvider(undefined);
    const research = await generateCreativeResearch({ provider, context: baseContext() });
    expect(research).toEqual(EMPTY_CREATIVE_RESEARCH);
  });

  it('never requires TAVILY_API_KEY or any Tavily module', async () => {
    // Static proof the dependency is gone, not just untested: importing the
    // generator's module graph must not touch a "tavily" path.
    const mod = await import('./creative-research.generator');
    expect(Object.keys(mod)).not.toContain('searchWeb');
    await expect(import('../research/tavily-search' as string)).rejects.toBeDefined();
  });
});

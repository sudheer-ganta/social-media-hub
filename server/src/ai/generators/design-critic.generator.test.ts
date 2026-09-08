import { describe, it, expect, vi } from 'vitest';
import { evaluateRenderedDesign } from './design-critic.generator';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';
import type { AiTextProvider } from '../providers';
import type { CreativeIntentBrief } from '../types';

const intentFor = (event: string, offer = ''): CreativeIntentBrief => ({
  extracted: true,
  event,
  culturalContext: '',
  productCategory: '',
  offer,
  promotionType: '',
  venueType: '',
  audience: '',
  requiredClaims: [event, offer].filter(Boolean),
  optionalDetails: [],
  confidence: {},
});

/** A verdict where every template-collapse check passes, so a test can fail exactly one. */
const cleanVerdict = (overrides: Record<string, unknown> = {}) => ({
  observedSubject: 'BTS Return Party in Korea with 20% off',
  observedEvent: 'BTS Return Party',
  observedOffer: '20% off',
  observedHero: 'typography',
  firstRead: 'BTS RETURN PARTY / 20% OFF',
  templateLook: false,
  aiLook: false,
  humanCraft: true,
  visualTension: true,
  typographyAsDesign: true,
  styleExpression: 'Y2K / High-character Editorial',
  logoClear: true,
  singleClearIdea: true,
  statedIdea: 'The comeback is staged as a boarding announcement.',
  layoutExpressesIdea: true,
  imageFillsEmptyQuadrant: false,
  typeParkedOppositeImage: false,
  unnecessaryTextBlocks: false,
  contextIntegrated: true,
  interchangeableWithAnotherEvent: false,
  problems: [],
  strengths: ['Bold typographic hierarchy', 'Clear 20% off offer'],
  ...overrides,
});

const providerReturning = (verdict: Record<string, unknown>): AiTextProvider => ({
  id: 'mock',
  model: 'mock-model',
  supportsVision: true,
  isConfigured: () => true,
  generateJson: vi.fn(async () => verdict),
});

const briefForParty = () =>
  buildCanonicalCreativeBrief({
    userPrompt: 'BTS return party in Korea, 20% off',
    goal: 'event_promotion',
    funnelStage: 'TOFU',
    intent: intentFor('BTS Return Party', '20% off'),
    productAssetUrls: ['https://cdn.example.com/korean-dish.png'],
    logoAssetUrl: 'https://cdn.example.com/logo.png',
  });

const evaluate = (verdict: Record<string, unknown>) =>
  evaluateRenderedDesign({
    provider: providerReturning(verdict),
    renderedPng: Buffer.from('fake-png-data'),
    brief: briefForParty(),
  });

describe('evaluateRenderedDesign', () => {
  it('approves a high-craft graphic design that accurately communicates the campaign and offer', async () => {
    const result = await evaluate(cleanVerdict());

    expect(result.passed).toBe(true);
    expect(result.observedEvent).toBe('BTS Return Party');
    expect(result.observedOffer).toBe('20% off');
    expect(result.problems).toEqual([]);
  });

  it('rejects when the visual communicates a generic food promo instead of the event', async () => {
    const result = await evaluate(
      cleanVerdict({
        observedSubject: 'Korean Food Restaurant promotion',
        observedEvent: '',
        firstRead: 'Delicious Korean Food',
        observedHero: 'image',
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('Campaign event mismatch');
  });

  it('rejects when the design looks like a template / UI card', async () => {
    const result = await evaluate(cleanVerdict({ templateLook: true, humanCraft: false }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('template');
  });
});

// ─── Template-collapse detection (spec §15) ──────────────────────────────────
//
// Each of these describes a creative that is competent — legible, on-brief,
// logo clean — and still worthless, because the design has no idea in it. The
// old critic passed every one of them.
describe('template collapse', () => {
  it('rejects a creative whose occasion could be swapped for any other — the decisive test', async () => {
    const result = await evaluate(cleanVerdict({ interchangeableWithAnotherEvent: true }));

    expect(result.passed).toBe(false);
    expect(result.interchangeableWithAnotherEvent).toBe(true);
    expect(result.redesignFeedback).toContain('would work unchanged with a completely different occasion');
    expect(result.redesignFeedback).toContain('BTS Return Party');
  });

  it('rejects a creative with no single legible idea, and quotes what it actually read as', async () => {
    const result = await evaluate(
      cleanVerdict({ singleClearIdea: false, statedIdea: 'a restaurant advertising food' }),
    );

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('No single creative idea');
    expect(result.redesignFeedback).toContain('a restaurant advertising food');
  });

  it('rejects a layout that would hold any campaign at all', async () => {
    const result = await evaluate(cleanVerdict({ layoutExpressesIdea: false }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('would hold any other campaign');
  });

  it('rejects an image that is only filling an empty quadrant', async () => {
    const result = await evaluate(cleanVerdict({ imageFillsEmptyQuadrant: true }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('filling an empty region');
  });

  it('rejects typography parked in the space left over beside the image', async () => {
    const result = await evaluate(cleanVerdict({ typeParkedOppositeImage: true }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('parked in the space left over');
  });

  it('rejects supporting text blocks the idea never needed', async () => {
    const result = await evaluate(cleanVerdict({ unnecessaryTextBlocks: true }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('Cut the copy to the minimum');
  });

  it('rejects an occasion decorated onto a generic design rather than integrated into it', async () => {
    const result = await evaluate(cleanVerdict({ contextIntegrated: false }));

    expect(result.passed).toBe(false);
    expect(result.redesignFeedback).toContain('decorated onto the design');
  });

  it('treats missing verdicts as passes, so a dropped field never rejects a good creative', async () => {
    const verdict = cleanVerdict();
    for (const key of [
      'singleClearIdea',
      'layoutExpressesIdea',
      'contextIntegrated',
      'imageFillsEmptyQuadrant',
      'typeParkedOppositeImage',
      'unnecessaryTextBlocks',
      'interchangeableWithAnotherEvent',
    ]) {
      delete (verdict as Record<string, unknown>)[key];
    }

    const result = await evaluate(verdict);
    expect(result.passed).toBe(true);
  });

  it('asks the model the interchangeability question against the real occasion', async () => {
    const provider = providerReturning(cleanVerdict());
    await evaluateRenderedDesign({
      provider,
      renderedPng: Buffer.from('fake-png-data'),
      brief: briefForParty(),
    });

    const call = (provider.generateJson as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain('the occasion to imagine replacing is: "BTS Return Party"');
    expect(call.systemInstruction).toContain('THE INTERCHANGEABILITY TEST');
    // A typography-led piece with no photograph must not be marked down for it.
    expect(call.systemInstruction).toContain('do not mark it down for having no photograph');
  });
});

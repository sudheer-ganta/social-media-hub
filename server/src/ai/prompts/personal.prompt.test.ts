import { describe, expect, it } from 'vitest';
import { buildPersonalPrompt, PROMPT_LINE_BUDGET } from './personal.prompt';
import type { CaptionRequest, ImageAnalysis } from '../types';

/**
 * Two things are worth a test here, and neither is the wording.
 *
 * The line budget, because the pressure on that file only ever points one way:
 * every failure has an obvious fix that reads "add a sentence explaining it",
 * and thirty of those turn a voice into a description of a voice.
 *
 * And the absence of the marketing furniture, because Personal not inheriting
 * Brand's requirements is the entire point of the split — and it is exactly the
 * kind of thing a later edit reintroduces by accident.
 */

const request: CaptionRequest = {
  mode: 'personal',
  userId: 'test-user',
  topic: 'galricus',
  title: 'galricus',
  suggestSongs: false,
  audience: 'gen_z_millennial',
  platforms: ['instagram'],
  goal: 'brand_awareness',
  funnelStage: 'TOFU',
  captionLength: 'Medium',
  language: 'English',
  variationCount: 4,
  hashtagCount: 0,
};

const analysis: ImageAnalysis = {
  primarySubject: 'armoured fantasy warrior',
  secondarySubjects: [],
  objects: ['sword', 'cape'],
  sceneDescription: 'A heavily armoured figure stands on a battlefield at dusk.',
  setting: 'battlefield at dusk',
  composition: 'low angle, centred',
  lighting: 'cold backlight',
  mood: 'grim',
  colorPalette: ['#1a1a2e'],
  brandStyle: 'cinematic fantasy',
  textInImage: [],
  emotions: ['awe'],
  themes: ['power'],
  symbolism: ['armour as defence'],
  storyAngles: [],
  productCategory: '',
  industry: '',
  targetAudience: '',
  suggestedCampaignType: '',
  suggestedMarketingObjective: '',
  suggestedBuyerPersona: '',
  confidenceScore: 80,
  whatSubjectIsDoing: 'standing still, taking himself extremely seriously',
  vibe: 'main quest boss who has never been told no',
  recognisableReferences: ['Dark Souls', 'Game of Thrones'],
  whatAFriendWouldNotice: 'the cape is doing a lot of work',
};

/** The longest a prompt gets: a full profile and a full evidence list. */
const styleSection = ['## How this person posts', ...Array(18).fill('- a measured line')].join('\n');
const evidenceSection = [
  '## STYLE EVIDENCE — DO NOT COPY OR PARAPHRASE',
  ...Array(12).fill('- "a caption they wrote"'),
].join('\n');

describe('the line budget', () => {
  it('stays inside it at full size', () => {
    const built = buildPersonalPrompt(request, {
      imageAnalysis: analysis,
      styleSection,
      evidenceSection,
      count: 7,
    });

    const lines = built.prompt.split('\n').length;
    expect(lines).toBeLessThanOrEqual(PROMPT_LINE_BUDGET);
  });

  it('stays inside it at cold start too', () => {
    const built = buildPersonalPrompt(request, { imageAnalysis: analysis, count: 7 });
    expect(built.prompt.split('\n').length).toBeLessThanOrEqual(PROMPT_LINE_BUDGET);
  });
});

describe('no marketing inheritance', () => {
  const built = buildPersonalPrompt(request, {
    imageAnalysis: analysis,
    styleSection,
    evidenceSection,
    count: 4,
  });
  const text = `${built.systemInstruction}\n${built.prompt}`.toLowerCase();

  // Every one of these is a Brand concept the personal prompt must not carry.
  //
  // "hook", "hashtag" and "call to action" are deliberately absent from this
  // list: they *do* appear in the prompt, in the Never section, telling the
  // model not to produce them. Asserting on those would fail on the sentence
  // that enforces the rule. What must not appear is the marketing frame — the
  // words that would mean it is being asked *for* one.
  it.each([
    'funnel',
    'objective',
    'brand awareness',
    'why it works',
    'target audience',
    'conversion',
    'audience register',
  ])('never mentions %j', (term) => {
    expect(text).not.toContain(term);
  });

  it('asks for no hook, no hashtags and no whyItWorks in the schema', () => {
    const schema = JSON.stringify(built.responseSchema);
    expect(schema).not.toContain('hook');
    expect(schema).not.toContain('hashtag');
    expect(schema).not.toContain('whyItWorks');
    expect(schema).not.toContain('angle');
  });

  it('accepts a one-character caption', () => {
    const schema = built.responseSchema as {
      properties: { captions: { items: { properties: { text: { minLength: number } } } } };
    };
    expect(schema.properties.captions.items.properties.text.minLength).toBe(1);
  });
});

describe('cold start', () => {
  it('says there is no style rather than inventing one', () => {
    const built = buildPersonalPrompt(request, { imageAnalysis: analysis, count: 3 });
    expect(built.prompt).toContain('Not known yet');
    expect(built.prompt).toContain('Do not invent a personality');
  });
});

describe('the read comes before the captions', () => {
  it('requires both, in that order', () => {
    const built = buildPersonalPrompt(request, { imageAnalysis: analysis, count: 3 });
    const schema = built.responseSchema as { required: string[] };
    expect(schema.required).toEqual(['read', 'captions']);
  });

  it('leaves the choice of behaviour to the model', () => {
    const built = buildPersonalPrompt(request, { imageAnalysis: analysis, count: 3 });
    // The guard against a rotation: the behaviours are named once, as options,
    // and the prompt says explicitly not to work through them.
    expect(built.prompt).toContain('It is not a list to work through');
    expect(built.prompt).toContain('Do not write one of each');
  });
});

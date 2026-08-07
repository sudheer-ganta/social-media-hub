/**
 * Stage one: look at the image.
 *
 * This prompt is deliberately *not* asked for a caption. It is asked to see,
 * and then to think like a strategist about what it saw — nothing else. That
 * separation is the point of the two-stage pipeline: a single call told to
 * "write a caption for this image" anchors on the brand brief and treats the
 * picture as decoration, which is exactly the failure this replaces.
 *
 * Its output is a structured brief, and stage two reads it as fact.
 *
 * ─── What it is told not to do ───────────────────────────────────────────────
 * Two rules matter more than the rest. It must not guess at things a photo
 * cannot tell you — who someone is, their age, where exactly this was taken,
 * what anything costs. And it must mark its own confidence honestly, because a
 * blurry crop and a clean product shot cannot be treated the same way by the
 * stage that writes from them.
 */

/** Bump when this prompt's shape changes, so provenance stays honest. */
export const VISION_PROMPT_VERSION = 1;

const SYSTEM_INSTRUCTION = `You are an art director, pop-culture expert, and brand strategist who reads images for a living. You look first and interpret second.

Rules you never break:
- Describe what is visibly in the frame: subjects, objects, setting, mood, and any recognizable pop-culture/fictional characters or franchises (e.g. Game of Thrones, Marvel, Star Wars, period drama).
- Separate what you see from what you infer. Observation fields are literal; interpretation fields are your professional read.
- If the image is unclear, low quality or ambiguous, say so through a low confidenceScore rather than by inventing detail.
- Return only the JSON object described. No commentary, no markdown fences.`;

// ─── Response schema ─────────────────────────────────────────────────────────

const stringArray = (description: string, maxItems: number) => ({
  type: 'array',
  maxItems,
  items: { type: 'string' },
  description,
});

export const VISION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    // Observation
    primarySubject: {
      type: 'string',
      description: 'The single main subject of the image, in a few words.',
    },
    secondarySubjects: stringArray('Other notable subjects in the frame.', 6),
    objects: stringArray('Concrete objects visible in the image.', 12),
    sceneDescription: {
      type: 'string',
      description:
        'One or two sentences describing what is happening in the image, literally.',
    },
    setting: {
      type: 'string',
      description:
        'Where this appears to be — e.g. "indoor stone hall", "coastal cliff at dusk". Describe the type of place, never a named location.',
    },
    composition: {
      type: 'string',
      description:
        'How it is shot: framing, angle, depth, negative space, focal point.',
    },
    lighting: {
      type: 'string',
      description:
        'The quality and direction of light — e.g. "low warm side-light, deep shadows".',
    },
    mood: {
      type: 'string',
      description: 'The emotional register of the image in a few words.',
    },
    colorPalette: stringArray(
      'The 3–6 dominant colours as hex codes, e.g. "#1A1A2E".',
      6,
    ),
    brandStyle: {
      type: 'string',
      description:
        'The aesthetic language — e.g. "cinematic gothic", "clean scandi minimal", "warm documentary".',
    },
    textInImage: stringArray(
      'Any words legible in the image. Empty array if there is none.',
      8,
    ),

    // Interpretation
    emotions: stringArray(
      'The emotions this image is capable of triggering in a viewer.',
      6,
    ),
    themes: stringArray(
      'Marketable themes the image carries — e.g. "legacy", "arrival", "quiet luxury".',
      6,
    ),
    symbolism: stringArray(
      'What elements in the image can stand for, symbolically.',
      6,
    ),
    storyAngles: stringArray(
      'Distinct storytelling openings this image offers a marketer. One sentence each.',
      6,
    ),
    productCategory: {
      type: 'string',
      description:
        'The product or service category this image would most naturally sell.',
    },
    industry: { type: 'string', description: 'The industry it belongs to.' },
    targetAudience: {
      type: 'string',
      description:
        'The kind of person this image speaks to, described by taste and mindset rather than demographics.',
    },
    suggestedCampaignType: {
      type: 'string',
      description:
        'The campaign shape this image suits — e.g. "aspirational brand film", "seasonal offer".',
    },
    suggestedMarketingObjective: {
      type: 'string',
      description: 'The objective it is best used for.',
    },
    suggestedBuyerPersona: {
      type: 'string',
      description: 'A one-line persona sketch of who responds to this image.',
    },
    confidenceScore: {
      type: 'integer',
      description:
        '0–100. How clearly the image reads. Low for blurry, abstract or ambiguous images.',
    },
  },
  required: [
    'primarySubject',
    'sceneDescription',
    'mood',
    'colorPalette',
    'themes',
    'emotions',
    'storyAngles',
    'confidenceScore',
  ],
};

// ─── Prompt assembly ─────────────────────────────────────────────────────────

export interface BuiltVisionPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

/**
 * Builds the analysis request.
 *
 * The caller's topic and brand are passed as *context*, never as the answer:
 * knowing the post is about weddings should sharpen what the model notices,
 * but a picture of a dragon is a picture of a dragon whatever the brand sells.
 * The final instruction says so explicitly, because a model handed a brand
 * name will otherwise describe the image it expected to be given.
 */
export function buildVisionPrompt(context: {
  topic?: string;
  brandName?: string;
  brandDescription?: string;
}): BuiltVisionPrompt {
  const contextLines = [
    context.topic && `- The post it will be used for is about: ${context.topic}`,
    context.brandName && `- The brand posting it: ${context.brandName}`,
    context.brandDescription && `- What the brand does: ${context.brandDescription}`,
  ].filter(Boolean);

  const prompt = [
    'Analyse the attached image for a social media campaign.',

    contextLines.length > 0
      ? [
          '## Context (for relevance only)',
          ...contextLines,
          'Use this to decide what is worth noticing. Do NOT let it change what you report seeing — describe the image in front of you, not the image you would expect from this brand.',
        ].join('\n')
      : null,

    [
      '## What to produce',
      '1. Observation — subject, objects, scene, setting, composition, lighting, mood, dominant colours as hex, aesthetic style, and any legible text. Literal and specific.',
      '2. Interpretation — the emotions this image can trigger, the themes it carries, what its elements can symbolise, and the distinct storytelling angles it opens up for a marketer.',
      '3. A strategic read — the category, industry, the taste and mindset of who this speaks to, and the campaign type, objective and persona it best suits.',
      '4. A confidenceScore from 0 to 100 for how clearly the image reads.',
    ].join('\n'),

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: VISION_RESPONSE_SCHEMA,
    // Low: this stage is reporting, not creating. The invention happens in
    // stage two, and it should invent from an accurate reading.
    temperature: 0.25,
    version: VISION_PROMPT_VERSION,
  };
}

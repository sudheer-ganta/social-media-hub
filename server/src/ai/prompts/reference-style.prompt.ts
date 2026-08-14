/**
 * One call: N reference images in, a structured ReferenceStyleProfile out.
 * Modelled on creative-research.prompt.ts's exact "inspiration, never content
 * to copy" framing — the job is identical, only the source differs (uploaded
 * images instead of grounded web search).
 */

export const REFERENCE_STYLE_PROMPT_VERSION = 2;

const SYSTEM_INSTRUCTION = `You are a visual-style analyst. A member uploaded a few images they like. Your job is to understand their TASTE — the visual language — never to describe the images well enough that someone could recreate them.

Rules you never break:
- Extract the mechanism, not the content. "Tactile paper texture" is a pattern. The exact composition, the exact objects in frame, the exact headline, the exact logo placement, the exact person/character shown, the exact campaign concept — none of that is something to repeat. Those go in doNotCopy.
- For each reference, ask: what's INTERESTING about it? Unusual perspective, editorial framing, tactile texture, hand-drawn typography, asymmetric composition, unexpected placement, playful interaction, restrained palette, imperfect photography, collage, visual metaphor, negative space — name the actual techniques you see, in your own words.
- If several references were given, do not just average them into a beige middle. Find what's genuinely common across them — creativeMechanisms and visualLanguage should describe the shared thread, not a blend of everything. If the references pull in two different directions, say so plainly in dominantDirection rather than inventing false coherence (e.g. "References suggest two different directions: warm editorial photography vs. bold graphic typography — leaning toward the former as dominant.").
- doNotCopy is mandatory and specific to what you actually saw — not a generic disclaimer. Name the exact things a generator must not reproduce: specific composition, specific objects, specific headline wording if any text is visible, specific logo/brand marks, specific people, specific campaign concept.
- influence should be 'low' for a single reference or genuinely thin/generic-stock-photo material, 'medium' for a clear but soft direction, 'high' only when the references show a strong, consistent, distinctive visual language.
- These are references for INSPIRATION on how to art-direct an ORIGINAL creative — never instructions to recreate what's shown. Everything you extract should help someone create something new that FEELS like the same taste, not the same picture.
- designRecipe is the DESIGN SYSTEM a renderer will execute, so classify honestly from what you actually see — never default every axis to the safest middle value. If the references use a big expressive serif, typographyFamily is 'serif-editorial' and headlineCharacter describes that serif's character. If their compositions are off-centre, layoutBehaviour is 'asymmetric'. If a paper texture or grain is visible, texture reflects it. colorPalette is 3-6 hex colours genuinely dominant across the references. An axis you truly cannot judge from the images gets the most neutral value for that axis, and free-text recipe fields you cannot judge stay empty strings.
- Return only the JSON object described. No commentary, no markdown fences.`;

const stringArray = (description: string, maxItems: number) => ({
  type: 'array',
  maxItems,
  items: { type: 'string' },
  description,
});

export const REFERENCE_STYLE_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    visualLanguage: { type: 'string', description: 'One line summing up the shared visual language — e.g. "editorial, tactile, asymmetric".' },
    compositionPatterns: stringArray('Recurring composition/layout choices across the references.', 6),
    typographyCharacter: { type: 'string', description: 'The character of any typography seen — weight, case, hand-drawn vs. set, empty string if not visually relevant.' },
    colorRelationships: { type: 'string', description: 'How colours relate to each other (contrast, restraint, harmony) — not a colour list.' },
    textureAndMaterial: { type: 'string', description: 'Tactile/material quality — paper, fabric, grain, print, digital-clean, etc.' },
    lightingAndMood: { type: 'string', description: 'Quality of light and the emotional register together.' },
    photographicOrIllustrative: { type: 'string', description: 'Photographic, illustrative, collage, graphic, or a mix — the medium register.' },
    visualDensity: { type: 'string', description: 'How busy vs. spacious the references feel, including use of negative space.' },
    brandTreatment: { type: 'string', description: 'How brand marks/identity appear in the references, if visible. Empty string if not applicable.' },
    creativeMechanisms: stringArray('What is actually INTERESTING about these references, named as techniques — not a description of what is shown.', 8),
    imperfectionLevel: { type: 'string', description: 'How polished vs. deliberately human/imperfect the references feel.' },
    interactionPatterns: { type: 'string', description: 'Any participatory/interactive quality visible in the references. Empty string if none.' },
    doNotCopy: stringArray(
      'Specific things a generator must NEVER reproduce from these references — exact composition, exact objects, exact headline, exact logo placement, exact person/character, exact campaign concept.',
      8,
    ),
    dominantDirection: {
      type: 'string',
      description: 'One sentence: the coherent creative direction across all references, or an explicit note when they pull in different directions.',
    },
    influence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'How strong and consistent a direction these references actually give — low for one thin reference, high only for a strong consistent language.',
    },
    designRecipe: {
      type: 'object',
      description: 'The design system a renderer will execute — classified from what is actually visible, never defaulted wholesale.',
      properties: {
        photographyStyle: { type: 'string', description: 'The photographic style, if photographic — e.g. "warm editorial, natural window light, shallow depth". Empty string otherwise.' },
        illustrationStyle: { type: 'string', description: 'The illustration style, if illustrative — e.g. "loose ink linework, flat colour". Empty string otherwise.' },
        headlineCharacter: { type: 'string', description: 'Character of the headline typography — e.g. "large expressive serif, tight leading, sentence case".' },
        supportingTypography: { type: 'string', description: 'Character of small supporting copy — e.g. "restrained grotesk caps, wide tracking".' },
        compositionBehaviour: { type: 'string', description: 'How the references compose a frame — e.g. "subject offset left, copy in cleared right third".' },
        textHierarchy: { type: 'string', description: 'The reading order the references use — e.g. "big headline first, one small supporting line, tiny footer detail".' },
        typographyFamily: { type: 'string', enum: ['serif-editorial', 'sans-modern', 'condensed-display', 'geometric-sans', 'mixed'] },
        colorPalette: stringArray('3-6 hex colours (like "#8b5e3c") genuinely dominant across the references.', 6),
        layoutBehaviour: { type: 'string', enum: ['asymmetric', 'centered', 'grid', 'stacked', 'diagonal'] },
        logoTreatment: { type: 'string', enum: ['integrated', 'corner', 'footer', 'watermark'], description: "'integrated' when brand marks sit within the composition/text stack; 'corner' when they float in a corner." },
        spacingBehaviour: { type: 'string', enum: ['tight', 'generous', 'airy'] },
        texture: { type: 'string', enum: ['none', 'paper-grain', 'film-grain', 'halftone', 'noise'] },
        graphicElements: stringArray('Recurring decorative devices — "hand-drawn underline", "thin rule dividers", "starburst badge". Empty when none.', 6),
        footerStyle: { type: 'string', enum: ['torn-paper', 'solid-band', 'hairline', 'none'], description: 'How the bottom of the frame is treated — a tactile paper band, a flat solid band, a thin rule, or nothing.' },
        borderStyle: { type: 'string', enum: ['none', 'hairline', 'thick', 'inset-frame'] },
        shapeLanguage: { type: 'string', enum: ['organic', 'geometric', 'editorial-rules', 'none'] },
        visualDensity: { type: 'string', enum: ['minimal', 'balanced', 'dense'] },
        imperfectionLevel: { type: 'string', enum: ['none', 'subtle', 'strong'] },
        imageTreatment: { type: 'string', enum: ['full-bleed', 'framed', 'inset'], description: 'How imagery sits in the frame — edge to edge, inside a visible frame, or as a smaller inset block.' },
      },
      required: [
        'typographyFamily', 'layoutBehaviour', 'logoTreatment', 'spacingBehaviour', 'texture',
        'footerStyle', 'borderStyle', 'shapeLanguage', 'visualDensity', 'imperfectionLevel', 'imageTreatment',
      ],
    },
  },
  required: ['visualLanguage', 'creativeMechanisms', 'doNotCopy', 'dominantDirection', 'influence', 'designRecipe'],
};

export interface BuiltReferenceStylePrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

export function buildReferenceStylePrompt(context: {
  referenceCount: number;
  labels?: string[];
}): BuiltReferenceStylePrompt {
  const prompt = [
    `${context.referenceCount} reference image(s) are attached, in order.`,
    context.labels?.length ? `Member-supplied labels, same order (may be absent/generic — infer the real role yourself where a label is missing or unhelpful): ${context.labels.join(', ')}` : null,
    'Analyse the visual LANGUAGE these references share — not their content. Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: REFERENCE_STYLE_RESPONSE_SCHEMA,
    temperature: 0.4,
    version: REFERENCE_STYLE_PROMPT_VERSION,
  };
}

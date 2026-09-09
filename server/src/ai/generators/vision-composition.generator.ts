import type { AiTextProvider } from '../providers';
import type { CreativeResearch } from '../types';

/**
 * After the visual image is generated (but before text is composited on it),
 * an AI vision pass looks at the actual pixels and decides:
 *
 *   - WHERE text is safe to place (which zones in the image are low-detail / low-contrast)
 *   - HOW MUCH text the design needs (based on visual complexity and engagement research)
 *   - What FONT SIZE CONTRAST is right (based on the image's visual weight)
 *   - Where the FOCAL POINT is (so text doesn't fight it)
 *   - Where the LOGO should go (an uncluttered corner or edge)
 *
 * This replaces the geometric anti-template checks and the fixed composition
 * archetypes. The AI sees the actual image and makes design decisions based on
 * what's actually in it — not a formula.
 *
 * The output feeds directly into designer-composition.ts's blueprint prompt
 * so the designer model knows the real image topology when it positions elements.
 */

export interface ImageTextZone {
  /** Which region of the image (e.g. "upper-third", "lower-left", "right-half", "center-band") */
  region: string;
  /** Why this zone works for text — what makes it safe/readable */
  reason: string;
  /** How prominent text placed here should be: "dominant" | "moderate" | "subtle" */
  prominence: 'dominant' | 'moderate' | 'subtle';
  /** Suggested text color approach for this zone */
  colorApproach: 'light-on-dark' | 'dark-on-light' | 'overlay-required' | 'any';
}

export interface VisionCompositionAnalysis {
  /** Primary safe zones for text placement, ordered best-first */
  textZones: ImageTextZone[];
  /** Where the strongest visual focal point is — text should complement, not compete */
  focalPoint: string;
  /** How visually complex the image is — affects how much text it can carry */
  visualComplexity: 'minimal' | 'moderate' | 'rich';
  /** Recommended copy approach based on the image */
  recommendedCopyApproach: string;
  /** Logo placement recommendation */
  logoPlacement: string;
  /** Overall composition strategy the AI recommends given what it sees */
  compositionStrategy: string;
  /** Whether a text background/overlay is needed anywhere */
  needsTextBackdrop: boolean;
  /** Short reasoning — what the AI saw that drove these decisions */
  reasoning: string;
}

const VISION_SYSTEM_INSTRUCTION = `You are a world-class social media art director analyzing a generated image to make typography and composition decisions.

You are looking at a VISUAL-ONLY image (no text yet). Your job is to tell the graphic designer:
1. WHERE to safely place text — identify zones in the image that are low-detail, low-contrast, or have natural breathing room
2. HOW MUCH TEXT the design needs — based on the image's visual complexity and what the creative goal requires
3. WHERE the focal point is — so typography complements rather than competes
4. WHERE the logo should go — an uncluttered area that lets the brand breathe
5. WHAT COMPOSITION STRATEGY will make this image + typography combination outstanding

Think like a senior designer at a world-class agency. Make decisions that feel creative and considered, not template-like. The goal is a social media creative that stops someone mid-scroll.

Return ONLY the JSON object.`;

const VISION_COMPOSITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    textZones: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          region: { type: 'string', description: 'Which part of the image (e.g. "upper third", "lower-left quadrant", "right strip")' },
          reason: { type: 'string', description: 'What makes this zone safe for text — low contrast, negative space, dark/light band, etc.' },
          prominence: { type: 'string', enum: ['dominant', 'moderate', 'subtle'], description: 'How large/bold text placed here should be.' },
          colorApproach: { type: 'string', enum: ['light-on-dark', 'dark-on-light', 'overlay-required', 'any'], description: 'Text color recommendation for this zone.' },
        },
        required: ['region', 'reason', 'prominence', 'colorApproach'],
      },
      description: 'Best zones for text placement, ordered best-first.',
    },
    focalPoint: { type: 'string', description: 'Where the image\'s strongest visual focal point is. Text should work with this, not against it.' },
    visualComplexity: { type: 'string', enum: ['minimal', 'moderate', 'rich'], description: 'How visually busy the image is — affects how much text the design can carry.' },
    recommendedCopyApproach: { type: 'string', description: 'How much and what kind of copy this image calls for: e.g. "One powerful headline only — the image is too rich for more", or "Two lines maximum: hero headline + one supporting detail".' },
    logoPlacement: { type: 'string', description: 'Where the brand logo should go and why.' },
    compositionStrategy: { type: 'string', description: 'The overall composition strategy: how image + type should work together to create something striking.' },
    needsTextBackdrop: { type: 'boolean', description: 'Whether any text zones need a semi-transparent overlay or scrim to be readable.' },
    reasoning: { type: 'string', description: 'One short paragraph: what you saw in the image that drove all these decisions.' },
  },
  required: ['textZones', 'focalPoint', 'visualComplexity', 'recommendedCopyApproach', 'logoPlacement', 'compositionStrategy', 'needsTextBackdrop', 'reasoning'],
};

export interface GenerateVisionCompositionOptions {
  /** The multimodal provider that can analyze images. */
  provider: AiTextProvider;
  /** The generated image as base64-encoded PNG. */
  imageBase64: string;
  /** Creative context — used to tell the AI what the creative is for, so it can make relevant decisions. */
  context: {
    concept: string;
    headline?: string;
    supportingLine?: string;
    cta?: string;
    brandName?: string;
    goal?: string;
    occasion?: string;
    styleName?: string;
  };
  /** Research findings from the brand+occasion research — tells the AI what engagement patterns apply. */
  research?: CreativeResearch;
}

/**
 * Analyzes the generated image and returns composition decisions.
 * Never throws — returns null when the analysis fails, and the caller
 * falls back to its own layout logic.
 */
export async function generateVisionComposition(
  options: GenerateVisionCompositionOptions,
): Promise<VisionCompositionAnalysis | null> {
  const { provider, imageBase64, context, research } = options;
  const startedAt = Date.now();

  const contextLines: string[] = [
    `Creative: ${context.concept}`,
    context.brandName && `Brand: ${context.brandName}`,
    context.styleName && `Design style: ${context.styleName}`,
    context.occasion && `Occasion/campaign: ${context.occasion}`,
    context.goal && `Goal: ${context.goal}`,
    context.headline && `Headline copy: "${context.headline}"`,
    context.supportingLine && `Supporting line: "${context.supportingLine}"`,
    context.cta && `CTA: "${context.cta}"`,
  ].filter(Boolean) as string[];

  const researchLines: string[] = [];
  if (research?.engagementInsights?.length) {
    researchLines.push('Engagement research:', ...research.engagementInsights.map((e) => `  - ${e}`));
  }
  if (research?.compositionInsights?.length) {
    researchLines.push('Composition research:', ...research.compositionInsights.map((c) => `  - ${c}`));
  }

  const prompt = [
    '## What this creative is for',
    ...contextLines,
    '',
    researchLines.length > 0 ? '## Research context (use this to inform your composition decisions)' : '',
    ...researchLines,
    '',
    'Analyze the image and provide composition decisions. Where should text go? How much copy can this image carry? Where is the focal point? Where should the logo be?',
    'Return ONLY the JSON object.',
  ].filter((l) => l !== undefined).join('\n');

  try {
    // Use multimodal prompt: image + text
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const raw = (await provider.generateJson({
      systemInstruction: VISION_SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: VISION_COMPOSITION_SCHEMA,
      temperature: 0.4,
      images: [{ mimeType: 'image/png', data: cleanBase64 }],
    })) as Record<string, unknown>;

    if (!raw || typeof raw !== 'object') return null;

    const textZones = Array.isArray(raw.textZones)
      ? (raw.textZones as unknown[])
          .filter((z) => z && typeof z === 'object')
          .map((z) => {
            const zone = z as Record<string, unknown>;
            return {
              region: String(zone.region ?? 'lower-third'),
              reason: String(zone.reason ?? ''),
              prominence: (['dominant', 'moderate', 'subtle'] as const).includes(zone.prominence as never)
                ? (zone.prominence as ImageTextZone['prominence'])
                : 'moderate',
              colorApproach: (['light-on-dark', 'dark-on-light', 'overlay-required', 'any'] as const).includes(zone.colorApproach as never)
                ? (zone.colorApproach as ImageTextZone['colorApproach'])
                : 'any',
            } satisfies ImageTextZone;
          })
          .slice(0, 3)
      : [];

    const analysis: VisionCompositionAnalysis = {
      textZones,
      focalPoint: String(raw.focalPoint ?? 'center'),
      visualComplexity: (['minimal', 'moderate', 'rich'] as const).includes(raw.visualComplexity as never)
        ? (raw.visualComplexity as VisionCompositionAnalysis['visualComplexity'])
        : 'moderate',
      recommendedCopyApproach: String(raw.recommendedCopyApproach ?? ''),
      logoPlacement: String(raw.logoPlacement ?? ''),
      compositionStrategy: String(raw.compositionStrategy ?? ''),
      needsTextBackdrop: Boolean(raw.needsTextBackdrop),
      reasoning: String(raw.reasoning ?? ''),
    };

    console.info('[vision-composition] image analyzed', {
      durationMs: Date.now() - startedAt,
      textZones: analysis.textZones.length,
      visualComplexity: analysis.visualComplexity,
      focalPoint: analysis.focalPoint,
      recommendedCopyApproach: analysis.recommendedCopyApproach,
    });

    return analysis;
  } catch (error) {
    console.warn('[vision-composition] analysis failed, composer will use its own judgment', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Converts vision analysis into prose instructions the designer model can read.
 * Injected into the art-director/composition prompt so the AI knows the real
 * image topology when it positions elements.
 */
export function renderVisionCompositionInstructions(analysis: VisionCompositionAnalysis | null): string | null {
  if (!analysis) return null;

  const zoneDescriptions = analysis.textZones
    .map((z, i) => `  Zone ${i + 1}: ${z.region} — ${z.reason}. ${z.prominence} prominence. Text color: ${z.colorApproach}.`)
    .join('\n');

  return [
    '## Vision Analysis of Generated Image',
    `Focal point: ${analysis.focalPoint}`,
    `Visual complexity: ${analysis.visualComplexity}`,
    `Composition strategy: ${analysis.compositionStrategy}`,
    '',
    'Safe text zones (use these, in order of preference):',
    zoneDescriptions || '  (none identified — use your judgment)',
    '',
    `Recommended copy approach: ${analysis.recommendedCopyApproach}`,
    `Logo placement: ${analysis.logoPlacement}`,
    analysis.needsTextBackdrop ? 'NOTE: Some text zones need a subtle backdrop/scrim for readability.' : '',
    '',
    `Visual reasoning: ${analysis.reasoning}`,
  ].filter((l) => l !== '').join('\n');
}

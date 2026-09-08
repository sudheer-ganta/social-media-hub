import type { AiTextProvider } from '../providers';
import type { InlineImagePart } from '../providers/provider.interface';
import type { CreativeBrief, GraphicDesignConcept } from '../brand/creative-brief';
import { claimSatisfied } from '../intent/claim-match';

export interface DesignCriticEvaluation {
  passed: boolean;
  observedSubject: string;
  observedEvent?: string;
  observedOffer?: string;
  observedHero: string;
  firstRead: string;
  templateLook: boolean;
  aiLook: boolean;
  humanCraft: boolean;
  visualTension: boolean;
  typographyAsDesign: boolean;
  styleExpression: string;
  logoClear: boolean;
  // ─── Template-collapse verdicts (spec §15) ───────────────────────────────
  /** Does the piece communicate ONE clear creative idea, or several half-ideas? */
  singleClearIdea: boolean;
  /** Does the LAYOUT express that idea, or is it a container the idea was poured into? */
  layoutExpressesIdea: boolean;
  /** Is the imagery doing a job, or occupying a quadrant that would otherwise be blank? */
  imageFillsEmptyQuadrant: boolean;
  /** Is the typography doing a job, or parked opposite the image? */
  typeParkedOppositeImage: boolean;
  /** Text blocks present that carry nothing the idea needed. */
  unnecessaryTextBlocks: boolean;
  /** Is the occasion/topic integrated into the idea, or applied as decoration on top of it? */
  contextIntegrated: boolean;
  /**
   * THE decisive question: would this creative still work, unchanged, if the
   * occasion were swapped for a different one? If yes, the design is generic —
   * it illustrates a category, not this campaign.
   */
  interchangeableWithAnotherEvent: boolean;
  problems: string[];
  strengths: string[];
  redesignFeedback?: string;
}

export interface EvaluateRenderedDesignOptions {
  provider: AiTextProvider;
  renderedPng: Buffer;
  brief: CreativeBrief;
  concept?: GraphicDesignConcept;
  productImages?: InlineImagePart[];
  referenceImages?: InlineImagePart[];
  logoImage?: InlineImagePart;
}

const CRITIC_SYSTEM_INSTRUCTION = `You are an independent, highly critical Visual Art Director evaluating a finished social marketing graphic.
You judge the ACTUAL PIXELS of the first attached image blind.
You do not know the designer's internal plan. You evaluate purely what a human consumer notices and understands on their feed.

Standards of evaluation:

1. CAMPAIGN MEANING
   - Does the artwork immediately communicate what is actually being promoted?
   - Is the stated offer, if there is one, clearly legible?
   - If the campaign is about an occasion, does the piece read as that occasion — or merely as a product advertisement that happens to sit near one?

2. IS THERE ONE CLEAR IDEA?
   - Can you state, in one sentence, the creative idea this piece is built on?
   - Or is it several fragments — a headline, a photograph, some labels — that were arranged together without an idea joining them?

3. DOES THE LAYOUT EXPRESS THE IDEA?
   - A designed piece has a layout that could only belong to its idea.
   - A template has a layout that would hold any content at all. Ask honestly: could the words and picture be swapped for a completely different campaign's, with no other change? If yes, the layout expresses nothing.

4. IS THE IMAGE DOING A JOB?
   - Does the imagery participate in the idea — cropped, crossed, bled, used as material or as evidence?
   - Or is it simply occupying a rectangle that would otherwise have been empty?

5. IS THE TYPOGRAPHY DOING A JOB?
   - Is it art-directed — scale contrast, deliberate line breaks, type used as visual material?
   - Or is it a block of words parked on the opposite side of the canvas from the image, in the space left over?
   - A piece made almost entirely of typography, with strong scale contrast and real negative space, is a legitimate and powerful design — do not mark it down for having no photograph.

6. IS THERE COPY THAT DOES NOTHING?
   - Count the separate text blocks. Does every one of them earn its place?
   - Supporting sentences, category labels, footer lines and taglines that add no information are a defect, not a finish.

7. IS THE CONTEXT INTEGRATED OR DECORATED?
   - When the campaign involves an occasion, culture, season or fandom: is that context part of the idea, or is it applied on top as motifs, colours and ornament?
   - Decoration is the signature of a template that had the occasion's name dropped into it.

8. THE INTERCHANGEABILITY TEST — the most important question you will answer.
   - Imagine the occasion or topic named in the brief is replaced by a completely different one, and the picture swapped to match. Nothing else changes.
   - Would the creative still work? If it would, this design is generic: it was never about this campaign, and it must be rejected however attractive it is.

9. INTEGRITY
   - Is the brand logo present and clean, in real negative space, not colliding with copy or key imagery?
   - Are there decorative stickers, ribbons or unmotivated clutter?

Judge what you see. Never assume an idea exists because the piece is competent.

Return ONLY a valid JSON object matching the schema.`;

export async function evaluateRenderedDesign(
  options: EvaluateRenderedDesignOptions,
): Promise<DesignCriticEvaluation> {
  const { provider, renderedPng, brief, productImages = [], referenceImages = [], logoImage } = options;

  const images: InlineImagePart[] = [
    { mimeType: 'image/png', data: renderedPng.toString('base64') },
    ...productImages,
    ...referenceImages,
    ...(logoImage ? [logoImage] : []),
  ];

  const prompt = `Inspect the FIRST image (the finished creative).
Following images are: ${productImages.length} uploaded product asset(s), ${referenceImages.length} style reference(s), and ${logoImage ? 1 : 0} brand logo.

CAMPAIGN BRIEF CONTEXT:
- Expected Subject / Event: "${brief.event || brief.subject}"
- Expected Offer: ${brief.offer ? `"${brief.offer}"` : 'NONE (Do NOT penalize if no discount/offer is visible)'}
- Required Claims: ${brief.requiredClaims.length ? brief.requiredClaims.map(c => `"${c}"`).join(', ') : 'None'}
${brief.event ? `\nFor the interchangeability test, the occasion to imagine replacing is: "${brief.event}".` : ''}

Answer the visual evaluation questions truthfully based on the pixels. Do not be generous: a competent-looking piece with no idea in it is exactly what you exist to catch.`;

  const responseSchema = {
    type: 'object',
    required: [
      'observedSubject',
      'observedHero',
      'firstRead',
      'templateLook',
      'aiLook',
      'humanCraft',
      'visualTension',
      'typographyAsDesign',
      'logoClear',
      'singleClearIdea',
      'layoutExpressesIdea',
      'imageFillsEmptyQuadrant',
      'typeParkedOppositeImage',
      'unnecessaryTextBlocks',
      'contextIntegrated',
      'interchangeableWithAnotherEvent',
      'criticalFlaws',
      'problems',
      'strengths',
    ],
    properties: {
      observedSubject: { type: 'string', description: 'What is being promoted in this graphic?' },
      observedEvent: { type: 'string', description: 'What event/occasion is identified, if any?' },
      observedOffer: { type: 'string', description: 'What discount/offer is visible, if any?' },
      observedHero: { type: 'string', description: 'What element does the viewer notice first?' },
      firstRead: { type: 'string', description: 'What does the viewer understand in the first 1-2 seconds?' },
      templateLook: { type: 'boolean', description: 'True if it resembles a generic Canva template or UI card.' },
      aiLook: { type: 'boolean', description: 'True if it feels like generic AI output with unmotivated decorations.' },
      humanCraft: { type: 'boolean', description: 'True if it feels deliberately designed by a human art director.' },
      visualTension: { type: 'boolean', description: 'True if there is dynamic visual balance and contrast.' },
      typographyAsDesign: { type: 'boolean', description: 'True if typography is used as a graphic design element.' },
      styleExpression: { type: 'string', description: 'The visual style observed in the design.' },
      logoClear: { type: 'boolean', description: 'True if the brand logo is present and clear without collision.' },
      singleClearIdea: { type: 'boolean', description: 'True if you can state the one creative idea this piece is built on in a single sentence.' },
      statedIdea: { type: 'string', description: 'That one-sentence idea, as YOU read it from the pixels. Say so plainly if there is none.' },
      layoutExpressesIdea: { type: 'boolean', description: 'True if the layout could only belong to this idea. False if the same arrangement would hold any campaign.' },
      imageFillsEmptyQuadrant: { type: 'boolean', description: 'True if the imagery is merely occupying a rectangle that would otherwise be blank. False if it participates in the idea, or if there is no imagery.' },
      typeParkedOppositeImage: { type: 'boolean', description: 'True if the typography is simply sitting in the leftover space on the other side of the image.' },
      unnecessaryTextBlocks: { type: 'boolean', description: 'True if any text block adds nothing — filler supporting sentences, category labels, footer lines.' },
      contextIntegrated: { type: 'boolean', description: 'True if the occasion/culture/topic is part of the idea rather than applied as decoration. True when the campaign has no such context.' },
      interchangeableWithAnotherEvent: { type: 'boolean', description: 'True if this creative would work unchanged with a completely different occasion and a swapped picture. True is a FAILURE.' },
      criticalFlaws: { type: 'array', items: { type: 'string' }, description: 'Fatal flaws: unreadable text, cut off logo, missing required subject/offer, template card look' },
      problems: { type: 'array', items: { type: 'string' }, description: 'All observed design critique points' },
      strengths: { type: 'array', items: { type: 'string' } },
    },
  };

  const raw = (await provider.generateJson({
    systemInstruction: CRITIC_SYSTEM_INSTRUCTION,
    prompt,
    images,
    responseSchema,
    temperature: 0.1,
  })) as Record<string, unknown>;

  const criticalFlaws = Array.isArray(raw.criticalFlaws) ? (raw.criticalFlaws as string[]) : [];
  const problems = Array.isArray(raw.problems) ? (raw.problems as string[]) : [];
  const strengths = Array.isArray(raw.strengths) ? (raw.strengths as string[]) : [];
  const observedSubject = typeof raw.observedSubject === 'string' ? raw.observedSubject : '';
  const observedEvent = typeof raw.observedEvent === 'string' ? raw.observedEvent : undefined;
  const observedOffer = typeof raw.observedOffer === 'string' ? raw.observedOffer : undefined;
  const observedHero = typeof raw.observedHero === 'string' ? raw.observedHero : 'typography';
  const firstRead = typeof raw.firstRead === 'string' ? raw.firstRead : '';
  const templateLook = Boolean(raw.templateLook);
  const aiLook = Boolean(raw.aiLook);
  const humanCraft = Boolean(raw.humanCraft);
  const visualTension = Boolean(raw.visualTension);
  const typographyAsDesign = Boolean(raw.typographyAsDesign);
  const styleExpression = typeof raw.styleExpression === 'string' ? raw.styleExpression : brief.creativeStyle.name;
  const logoClear = raw.logoClear !== false;
  const statedIdea = typeof raw.statedIdea === 'string' ? raw.statedIdea : '';
  // Absent verdicts read as "fine", never as "failed": a provider that dropped
  // a field must not reject an otherwise-good creative. The failure modes
  // below are only asserted when the critic positively reported them.
  const singleClearIdea = raw.singleClearIdea !== false;
  const layoutExpressesIdea = raw.layoutExpressesIdea !== false;
  const contextIntegrated = raw.contextIntegrated !== false;
  const imageFillsEmptyQuadrant = raw.imageFillsEmptyQuadrant === true;
  const typeParkedOppositeImage = raw.typeParkedOppositeImage === true;
  const unnecessaryTextBlocks = raw.unnecessaryTextBlocks === true;
  const interchangeableWithAnotherEvent = raw.interchangeableWithAnotherEvent === true;

  // Compare observed answers with canonical CreativeBrief
  const reasonsToReject: string[] = [];
  for (const flaw of criticalFlaws) {
    if (typeof flaw === 'string' && flaw.trim()) reasonsToReject.push(flaw.trim());
  }

  // Check 1: Event / Subject preservation
  if (brief.event && !claimSatisfied(brief.event, `${observedSubject} ${observedEvent || ''} ${firstRead}`)) {
    reasonsToReject.push(
      `Campaign event mismatch: The creative was supposed to promote "${brief.event}", but the visual reads as "${observedSubject || firstRead}".`,
    );
  }

  // Check 2: Offer preservation
  if (brief.offer && !claimSatisfied(brief.offer, `${observedOffer || ''} ${observedSubject} ${firstRead}`)) {
    reasonsToReject.push(
      `Offer missing: The required offer "${brief.offer}" was not clearly communicated in the visible design.`,
    );
  }

  // Check 3: Template look rejection
  if (templateLook) {
    reasonsToReject.push('The composition looks like a generic UI card or template. Use stronger graphic art direction.');
  }

  // Check 4: Logo collision rejection
  if (!logoClear && brief.assets.logo) {
    reasonsToReject.push('The brand logo is colliding with other elements or unreadable.');
  }

  // ─── Template-collapse checks (spec §15) ─────────────────────────────────
  //
  // These reject creatives that are competent and still worthless: pieces with
  // no idea, layouts that express nothing, images filling space, type parked in
  // the leftovers, copy nobody needed, and context applied as decoration. Each
  // rejection names the axis so the redesign changes the IDEA rather than the
  // arrangement.
  if (!singleClearIdea) {
    reasonsToReject.push(
      `No single creative idea is legible in the finished piece${statedIdea ? ` — it reads as: "${statedIdea}"` : ''}. Build the design on one idea and let the composition express it.`,
    );
  }
  if (!layoutExpressesIdea) {
    reasonsToReject.push(
      'The layout expresses nothing: the same arrangement would hold any other campaign. The composition must be derivable from this idea and no other.',
    );
  }
  if (imageFillsEmptyQuadrant) {
    reasonsToReject.push(
      'The image is filling an empty region rather than participating in the idea. Either give the imagery a job — crossed, cropped, bled, used as material — or remove it and let type, graphic form or emptiness carry the piece.',
    );
  }
  if (typeParkedOppositeImage) {
    reasonsToReject.push(
      'The typography is parked in the space left over beside the image. Type must be composed as visual material, not fitted into the remainder.',
    );
  }
  if (unnecessaryTextBlocks) {
    reasonsToReject.push(
      'There are text blocks carrying nothing the idea needed. Cut the copy to the minimum that communicates the concept.',
    );
  }
  if (!contextIntegrated) {
    reasonsToReject.push(
      'The occasion is decorated onto the design rather than integrated into the idea. Motifs and colours applied on top of a generic layout are the signature of a template.',
    );
  }
  // The decisive one — a creative that survives having its occasion swapped was
  // never about this campaign.
  if (interchangeableWithAnotherEvent) {
    reasonsToReject.push(
      `This creative would work unchanged with a completely different occasion${brief.event ? ` in place of "${brief.event}"` : ''} and a swapped picture. That makes it generic. The idea, not the caption, has to be specific to this campaign.`,
    );
  }

  // Check 5: Human craft failure
  if (!humanCraft && !reasonsToReject.length && problems.length > 0) {
    reasonsToReject.push(...problems);
  }

  const passed = reasonsToReject.length === 0;
  const redesignFeedback = passed ? undefined : reasonsToReject.join('; ');

  console.info('[creative] design critic evaluation complete', {
    passed,
    observedSubject,
    observedEvent,
    observedOffer,
    templateLook,
    humanCraft,
    singleClearIdea,
    layoutExpressesIdea,
    interchangeableWithAnotherEvent,
    reasonsToRejectCount: reasonsToReject.length,
  });

  return {
    passed,
    observedSubject,
    observedEvent,
    observedOffer,
    observedHero,
    firstRead,
    templateLook,
    aiLook,
    humanCraft,
    visualTension,
    typographyAsDesign,
    styleExpression,
    logoClear,
    singleClearIdea,
    layoutExpressesIdea,
    imageFillsEmptyQuadrant,
    typeParkedOppositeImage,
    unnecessaryTextBlocks,
    contextIntegrated,
    interchangeableWithAnotherEvent,
    problems: reasonsToReject,
    strengths,
    redesignFeedback,
  };
}

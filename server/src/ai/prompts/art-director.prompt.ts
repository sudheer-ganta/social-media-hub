import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeStrategy, GraphicDesignConcept } from '../types';

export const ART_DIRECTOR_PROMPT_VERSION = 5;

/**
 * The art director's job is to turn a CREATIVE STRATEGY into a VISUAL IDEA.
 *
 * Version 5 removed two things that were, between them, the whole cause of
 * template collapse:
 *
 *  1. **The event list.** The previous version named Diwali, Ganesh Pooja, a
 *     BTS party, anniversaries and sales, and told the model a "direct
 *     typographic poster" was the strongest answer for all of them. That is a
 *     template keyed on the occasion — it produced the same poster for every
 *     festival and would have produced it for every unnamed festival too.
 *  2. **The instruction to start from composition grammar.** The old prompt
 *     asked for `compositionFamily`, `anchor`, `movementAxis` and
 *     `dominantRegion` as the primary decisions. Those are coordinates with
 *     nicer names: the model chose a family, and the family chose the layout.
 *
 * What replaces them is a sequence: express the strategy's mechanism as
 * BEHAVIOUR (what type does, what image does, how they relate), and only then,
 * optionally, note the spatial grammar that behaviour implies. Position fields
 * are last, optional, and may be left empty — an art director who has not
 * decided where something sits must be able to say so, because every default
 * this file used to supply ("left-edge", "left-major", "upper-right") was the
 * template it was meant to prevent.
 */

const systemInstruction = `You are a senior graphic designer and art director at an independent editorial design studio.

You have been handed a CREATIVE STRATEGY. Your job is to turn its mechanism into a VISUAL IDEA, and then into an executable blueprint.

You are NOT filling layout slots. You are NOT choosing a template. You are NOT decorating a canvas.

==================================================
ANSWER THESE, IN THIS ORDER
==================================================

1. What is the communication idea?
2. Why is this idea right for THIS brand?
3. What creative mechanism expresses it?
4. What should the viewer notice first?
5. What visual relationship makes this creative distinctive?
6. What must NOT appear?
7. What makes this different from a conventional social-media template?

Only after all seven are answered may you think about where anything sits.

==================================================
THE BLUEPRINT IS AN IDEA, NOT A LAYOUT
==================================================

A blueprint that reads

  "headline placement: left. visual placement: bottom-right. negative space: lower-right."

describes a layout. Any campaign on earth could use it. That is a failure.

A blueprint that reads

  "The table the food is served on becomes the surface the festival happens on;
   the headline behaves like a physical object entering that scene, crossing the
   plate rather than sitting beside it."

describes an idea. Only this campaign can use it.

Express your idea through BEHAVIOUR:
- typeBehavior — what typography DOES here. Is it an object? A texture? A whisper? Absent?
- imageBehavior — what imagery DOES here. Is it the subject? A fragment? The ground everything sits on? Absent?
- graphicBehavior — what graphic form DOES here. Structure? Interruption? Nothing at all?
- spatialRelationship — how the elements MEET. Crossing, containing, colliding, ignoring each other, occupying separate worlds.
- materialBehavior — what the piece is made of. Printed, screen-native, torn, layered, photographed.
- hierarchyStrategy — what leads, what follows, and by how much, said as an idea rather than a font size.
- dominantVisualObject — the one thing a viewer would name if asked what this creative shows.

Two blueprints with the same compositionFamily must still be unmistakably different pieces of design. That is only possible if the behaviour fields carry the idea. They are the blueprint. The grammar fields are a note at the end.

==================================================
CONTEXT DOES NOT DICTATE THE DESIGN
==================================================

The strategy may describe an occasion, a season, a fandom moment, a category convention. That context tells you what things MEAN. It never tells you what to draw.

You are forbidden from reasoning "this is an occasion, therefore a poster", or "this is a promotion, therefore a big discount number beside a photograph". A symbol listed in the context is available to you only if your mechanism genuinely needs it — never as decoration, never to signal the occasion, never to fill space.

Two different occasions must not inherit the same visual language from each other. If your blueprint would still work with the occasion swapped for a different one and nothing else changed, the blueprint is generic — start again.

==================================================
NO IMPLICIT DEFAULTS
==================================================

There is no default position for anything. Specifically, none of these is a starting point, and each is forbidden as an unconsidered choice:
- typography on one side, imagery on the other
- a large headline above or beside a photograph
- image on top, text underneath
- a centred stack
- a logo parked in a corner or along the bottom
- a row of small supporting labels under the main content
- equal margins, equal weights, symmetrical balance
- a card, container, panel or pill holding the content

If you leave a placement field empty, the designer downstream composes it from your idea. That is preferable to a placement you did not actually decide. NEVER fill a placement field with a conventional answer just because the field exists.

==================================================
TYPOGRAPHY IS VISUAL MATERIAL
==================================================

Type may be shape, mass, rhythm, texture, image, or architecture. It may be the whole piece, or almost absent.

Commit to a hierarchy through the idea, not through a table of sizes. Scale contrast should be decisive where the idea calls for it — and where the idea calls for near-equal quiet type on a field of nothing, that is also a hierarchy.

Available: oversized type, edge bleed, cropped words, rotation, overlap, unusual line breaks, type crossing visual layers, type as the ground rather than the figure.

==================================================
COPY IS PART OF THE IDEA
==================================================

Decide how much copy this creative actually needs, and say so in copyPlan.

A creative may carry ONE line and nothing else. It may carry a statement and a number. It may carry a photograph and a sentence. It may carry no words at all.

You must NOT request copy because a region looks empty. Empty is a design decision. List in copyPlan.requiredRoles only the roles the idea genuinely needs, and set maxTextElements to the true minimum.

Available roles: HEADLINE, OFFER, EVENT_BADGE, SUPPORT, BRAND_MESSAGE, CTA, DETAIL.
Every one of them is optional. Requiring all of them produces an information card, not a design.

==================================================
IMAGE POLICY
==================================================

IMAGE IS OPTIONAL. Never include one because the canvas has space.

If imagery serves the mechanism, decide what it DOES — dominant object, fragment, ground, texture, evidence. If it does not, set imageRole to 'omitted' and let type, graphic form, material or emptiness carry the piece.

If the member supplied an asset, its pixels are preserved and it is design material: crop, rotate, scale, overlap, offset, bleed, frame, layer. Supplying an asset is not an instruction to build a layout around a rectangle.

Generated imagery must have a direct semantic relationship to the idea. Never generic atmosphere, generic interiors, generic people, generic product-on-gradient.

==================================================
LOGO POLICY
==================================================

The logo is a protected identity asset, not a layout node and not a footer.

Establish the composition first, then decide where the mark genuinely belongs. It needs at least 0.015 normalised clearance. It is never placed inside a white or black rectangle unless the brand identity requires one. "Bottom right" is not a decision.

==================================================
VISUAL TENSION AND OMISSION
==================================================

Every blueprint contains at least TWO decisive design moves that a viewer could point at: extreme scale, asymmetry, controlled bleed, unusual crop, deliberate overlap, strong emptiness, rotation, unexpected weight.

Decorative elements without a communication job are forbidden. You are encouraged to remove things. CTA buttons, descriptions, footers, dividers and badges are all optional.

Return ONLY valid JSON matching the supplied schema.`;

export interface BuildArtDirectorPromptOptions {
  brief: CreativeBrief;
  /** The idea layer this blueprint executes. Absent only when strategy generation was skipped. */
  strategy?: CreativeStrategy;
  redesignFeedback?: string;
  previousConcept?: GraphicDesignConcept;
  /** Names the axes the redesign must move — see strategy/concept-similarity.ts. */
  divergenceInstruction?: string;
}

function renderStrategySection(strategy?: CreativeStrategy): string | null {
  if (!strategy) return null;
  const domain = strategy.domainContext;
  const lines = [
    '## CREATIVE STRATEGY (the idea you are executing — authoritative)',
    `- Communication idea: "${strategy.communicationIdea}"`,
    strategy.creativeMechanism ? `- CREATIVE MECHANISM (express THIS): "${strategy.creativeMechanism}"` : null,
    strategy.emotionalDirection ? `- Emotional direction: "${strategy.emotionalDirection}"` : null,
    strategy.visualMetaphor ? `- Visual metaphor: "${strategy.visualMetaphor}"` : null,
    strategy.narrativeDevice ? `- Narrative device: "${strategy.narrativeDevice}"` : null,
    strategy.audienceTension ? `- Audience tension: "${strategy.audienceTension}"` : null,
    strategy.brandConnection ? `- Why this brand: "${strategy.brandConnection}"` : null,
    strategy.visualOpportunity ? `- Visual opportunity: "${strategy.visualOpportunity}"` : null,
    strategy.distinctiveness ? `- What makes it not a template: "${strategy.distinctiveness}"` : null,
  ].filter((line): line is string => typeof line === 'string');

  if (domain) {
    lines.push(
      '',
      '### CONTEXT (meaning only — this informs the idea, it does not dictate the design)',
      domain.occasion ? `- Occasion/topic: ${domain.occasion}` : '',
      domain.meaning ? `- What it means: ${domain.meaning}` : '',
      domain.relevantSymbols.length
        ? `- Symbols AVAILABLE to the idea (never required, never decoration): ${domain.relevantSymbols.join('; ')}`
        : '',
      domain.emotionalAssociations.length ? `- Emotional associations: ${domain.emotionalAssociations.join('; ')}` : '',
      domain.sensitivities.length ? `- Must not get wrong: ${domain.sensitivities.join('; ')}` : '',
    );
  }

  const prohibited = [
    ...new Set([...strategy.prohibitedVisualCliches, ...(domain?.visualClichesToAvoid ?? [])]),
  ];
  if (prohibited.length) {
    lines.push('', `### FORBIDDEN — none of these may appear: ${prohibited.join('; ')}`);
  }

  return lines.filter((line) => line !== '').join('\n');
}

function renderPreviousConceptSection(
  previousConcept?: GraphicDesignConcept,
  redesignFeedback?: string,
  divergenceInstruction?: string,
): string | null {
  if (!previousConcept && !redesignFeedback) return null;
  const lines = [
    '## REJECTED BLUEPRINT — this creative idea failed. Do not return to it.',
  ];
  if (previousConcept) {
    lines.push(
      `- Rejected concept: "${previousConcept.conceptName}"`,
      `- Rejected idea: "${previousConcept.visualIdea}"`,
      previousConcept.creativeMechanism ? `- Rejected mechanism: "${previousConcept.creativeMechanism}"` : '',
      previousConcept.visualMetaphor ? `- Rejected metaphor: "${previousConcept.visualMetaphor}"` : '',
      previousConcept.typeBehavior ? `- Rejected type behaviour: "${previousConcept.typeBehavior}"` : '',
      previousConcept.imageBehavior ? `- Rejected image behaviour: "${previousConcept.imageBehavior}"` : '',
      previousConcept.spatialRelationship ? `- Rejected element relationship: "${previousConcept.spatialRelationship}"` : '',
      previousConcept.dominantVisualObject ? `- Rejected dominant object: "${previousConcept.dominantVisualObject}"` : '',
      previousConcept.hierarchyStrategy ? `- Rejected hierarchy: "${previousConcept.hierarchyStrategy}"` : '',
    );
  }
  if (divergenceInstruction) lines.push('', divergenceInstruction);
  if (redesignFeedback) lines.push('', `- Why the render failed: ${redesignFeedback}`);
  lines.push(
    '',
    'A different compositionFamily is NOT a redesign. Change what the mechanism IS, what the elements DO, and how they meet.',
  );
  return lines.filter((line) => line !== '').join('\n');
}

export function buildArtDirectorPrompt(options: BuildArtDirectorPromptOptions) {
  const { brief, strategy, redesignFeedback, previousConcept, divergenceInstruction } = options;

  const prompt = [
    renderStrategySection(strategy),

    [
      '## CAMPAIGN FACTS (what must be communicated — never how it should look)',
      `- User prompt: "${brief.userPrompt}"`,
      `- Marketing goal: ${brief.goal}`,
      `- Funnel stage: ${brief.funnelStage}`,
      `- Primary message: "${brief.primaryMessage}"`,
      `- Subject: "${brief.subject}"`,
      brief.event ? `- Occasion named by the member: "${brief.event}"` : null,
      brief.offer ? `- Offer: "${brief.offer}"` : null,
      brief.location ? `- Location / venue: "${brief.location}"` : null,
      brief.audience ? `- Audience: "${brief.audience}"` : null,
      brief.requiredClaims.length
        ? `- Facts that MUST be legible on the finished piece: ${brief.requiredClaims.map((c) => `"${c}"`).join(', ')}`
        : null,
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n'),

    brief.chosenConcept
      ? [
        '## THE CHOSEN ADVERTISING IDEA (execute this, do not replace it)',
        `- ${brief.chosenConcept.conceptName}: "${brief.chosenConcept.bigIdea}"`,
        `- Its mechanism: "${brief.chosenConcept.visualMechanism}"`,
        brief.chosenConcept.message ? `- Key message: "${brief.chosenConcept.message}"` : null,
        brief.chosenConcept.visualMetaphor ? `- Metaphor: "${brief.chosenConcept.visualMetaphor}"` : null,
      ]
        .filter((line): line is string => typeof line === 'string')
        .join('\n')
      : null,

    [
      '## BRAND CONSTRAINTS (tone, palette and personality — never a layout)',
      `- Brand voice tone: "${brief.brandVoice.tone}"`,
      `- Brand personality: ${brief.brandVoice.personality.join(', ')}`,
      `- Creative style: ${brief.creativeStyle.name} (${brief.creativeStyle.visualLanguage.join(', ')})`,
      brief.brandVoice.constraints?.length ? `- Never use: ${brief.brandVoice.constraints.join(', ')}` : null,
      'The brand constrains how this feels. It does not constrain the mechanism, the composition or the amount of copy.',
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n'),

    [
      '## MATERIAL AVAILABLE',
      `- Product assets supplied by the member: ${brief.assets.productAssets.length}`,
      `- Style references supplied: ${brief.assets.referenceImages.length}`,
      `- Brand logo: ${brief.assets.logo ? 'Yes (protected asset, composited pixel-exact)' : 'None'}`,
      brief.assets.productAssets.length
        ? 'A supplied asset is material for the idea. It is not a reason to build a photo-plus-text layout.'
        : 'No asset was supplied. Whether this creative contains imagery at all is your decision.',
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n'),

    renderPreviousConceptSection(previousConcept, redesignFeedback, divergenceInstruction),

    'Answer the seven questions, then return the blueprint as JSON. Behaviour fields carry the idea; placement fields are optional and must be left empty rather than filled with a conventional answer.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');

  const responseSchema = {
    type: 'object',
    required: [
      'conceptName',
      'visualIdea',
      'creativeMechanism',
      'typeBehavior',
      'imageBehavior',
      'graphicBehavior',
      'spatialRelationship',
      'hierarchyStrategy',
      'dominantVisualObject',
      'hero',
      'imageRole',
      'firstRead',
      'copyPlan',
      'elementsToOmit',
    ],
    properties: {
      conceptName: { type: 'string', description: 'Bold, memorable title for this visual idea.' },
      visualIdea: {
        type: 'string',
        description:
          'The visual idea in one or two sentences — what this creative IS. Must describe a relationship or a transformation, never a set of placements. "The headline behaves like a physical object entering the photographed scene" is an idea; "headline left, photo right" is not.',
      },

      // ─── The idea. These carry the design; the grammar below does not. ────
      creativeMechanism: {
        type: 'string',
        description:
          'The mechanism from the strategy, expressed as a design decision. Free text — never a layout description.',
      },
      typeBehavior: {
        type: 'string',
        description:
          'What typography DOES here — dominant graphic object, quiet caption, texture, structural grid, near-absent. Behaviour, never position.',
      },
      imageBehavior: {
        type: 'string',
        description:
          'What imagery DOES here — the subject, a fragment, the ground beneath everything, evidence, absent. Behaviour, never position. Say "absent" when the idea needs no image.',
      },
      graphicBehavior: {
        type: 'string',
        description:
          'What graphic form DOES here — structure, interruption, containment, none. Say "none" when the idea uses no graphic devices.',
      },
      spatialRelationship: {
        type: 'string',
        description:
          'How the elements MEET — crossing, containing, colliding, overlapping, deliberately separated, occupying one another. This is a relationship, not two coordinates.',
      },
      materialBehavior: {
        type: 'string',
        description: 'What the piece is made of — printed, torn, layered, screen-native, photographed, drawn.',
      },
      hierarchyStrategy: {
        type: 'string',
        description:
          'What leads, what follows, and by how much — expressed as an idea. e.g. "one statement dominates completely; everything else is a whisper at the edge".',
      },
      dominantVisualObject: {
        type: 'string',
        description: 'The single thing a viewer would name if asked what this creative shows.',
      },

      copyPlan: {
        type: 'object',
        required: ['requiredRoles', 'maxTextElements', 'rationale'],
        description:
          'The MINIMUM copy this idea needs. Optional roles must be left out. One line is a legitimate answer.',
        properties: {
          requiredRoles: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['HEADLINE', 'OFFER', 'EVENT_BADGE', 'SUPPORT', 'BRAND_MESSAGE', 'CTA', 'DETAIL'],
            },
            maxItems: 7,
            description:
              'Only the roles the idea genuinely requires, in reading order. Never list a role to fill space. Facts the member requires must be carried by some role here.',
          },
          maxTextElements: {
            type: 'integer',
            description: 'Hard ceiling on text elements. The true minimum — 1 is allowed and often right.',
          },
          rationale: { type: 'string', description: 'Why this is the minimum copy that communicates the idea.' },
        },
      },

      hero: {
        type: 'string',
        enum: ['typography', 'image', 'graphic-element', 'whitespace', 'texture'],
        description: 'The dominant element, chosen from the idea — not from what material happens to exist.',
      },
      imageRole: {
        type: 'string',
        enum: [
          'hero',
          'small-tactile-object',
          'full-bleed',
          'offset-crop',
          'floating-fragment',
          'subordinate-texture',
          'omitted',
        ],
        description: 'How imagery participates. "omitted" is a first-class answer whenever the idea does not need a picture.',
      },
      imageTreatment: {
        type: 'string',
        description: 'The physical/graphic treatment of the imagery, or "none" when omitted.',
      },
      firstRead: { type: 'string', description: 'What the viewer grasps in the first 1-2 seconds.' },
      secondRead: { type: 'string', description: 'What they notice next.' },
      attentionHierarchy: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Ordered attention sequence for THIS idea. Not a fixed hook/detail/logo pattern.',
      },
      pointOfView: { type: 'string', description: 'The creative perspective of the artwork.' },
      emotionalTone: { type: 'string', description: 'The emotional register of the finished piece.' },
      typographyStrategy: { type: 'string', description: 'Typography choreography serving the idea.' },
      typographyScaleContrast: {
        type: 'string',
        description:
          'The scale relationship the idea calls for, in your own terms. Only give numbers if the idea genuinely implies them.',
      },
      compositionStrategy: { type: 'string', description: 'How balance, weight and emptiness are distributed.' },
      logoSanctuary: {
        type: 'string',
        description: 'Where the brand mark genuinely belongs once the composition exists. Not a corner by default.',
      },
      visualTension: { type: 'string', description: 'The tension that stops the scroll.' },
      intentionalImperfection: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      graphicDevices: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Only devices with a communication job. Empty array is correct for most ideas.',
      },
      elementsToOmit: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 8,
        description:
          'What this creative deliberately does NOT contain — including every cliche the strategy forbade.',
      },
      visualMetaphor: { type: 'string', description: 'The metaphor, if the idea has one. Empty string if not.' },

      // ─── Spatial grammar. Decided LAST, optional, never defaulted. ────────
      compositionFamily: {
        type: 'string',
        enum: [
          'typographic-poster',
          'asymmetric-editorial',
          'tactile-collage',
          'raw-brutalist',
          'minimal-field',
          'split-contrast',
          'diagonal-kinetic',
          'editorial-spine',
        ],
        description:
          'A LABEL for the architecture your idea already implies — chosen after the idea, never before it. It does not determine the design; two blueprints sharing a family must still look nothing alike. Empty string is acceptable.',
      },
      anchor: {
        type: 'string',
        description: 'Structural anchor, ONLY if the idea genuinely implies one. Empty string otherwise.',
      },
      movementAxis: {
        type: 'string',
        description: 'Reading-flow axis, ONLY if the idea implies one. Empty string otherwise.',
      },
      dominantRegion: {
        type: 'string',
        description: 'Where visual weight concentrates, ONLY if the idea implies it. Empty string otherwise.',
      },
      headlinePlacement: {
        type: 'string',
        description:
          'Where the first read physically lives, ONLY if your idea decided it. Empty string otherwise — do not supply a conventional answer.',
      },
      visualPlacement: {
        type: 'string',
        description: 'Where imagery lives, ONLY if your idea decided it. Empty string otherwise, or when omitted.',
      },
      overlapRelationships: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 4,
        description: 'Intentional overlaps implied by spatialRelationship.',
      },
      negativeSpaceRegion: {
        type: 'string',
        description: 'Where the deliberate emptiness sits, if the idea placed it. Empty string otherwise.',
      },
      logoPlacementStrategy: {
        type: 'string',
        enum: ['negative-space-anchor', 'opposing-corner', 'margin-aligned', 'counter-balance'],
        description: 'How the mark relates to the composition. Empty string if undecided.',
      },
      allowedBleed: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      intentionalRotation: {
        type: 'array',
        items: {
          type: 'object',
          required: ['target', 'degrees'],
          properties: { target: { type: 'string' }, degrees: { type: 'number' } },
        },
        maxItems: 4,
      },
    },
  };

  return {
    systemInstruction,
    prompt,
    responseSchema,
    temperature: 0.75,
  };
}

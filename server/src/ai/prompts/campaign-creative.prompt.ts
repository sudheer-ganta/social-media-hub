import type {
  BrandProfile,
  CreativeDirection,
  CreativeIntentBrief,
  MarketingGoal,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';
import { describePaletteColor } from '../render/palette-words';

/**
 * Stage B — the campaign design pass.
 *
 * Stage A produced the visual: a real, wordless photograph/illustration of the
 * idea. This prompt hands that image back to the image model as the FOUNDATION
 * and asks for the finished campaign creative built around it — typography,
 * hierarchy, brand furniture, offer, CTA — rather than a new picture.
 *
 * Two rules carry most of the weight, and both exist because of what actually
 * goes wrong:
 *
 *  1. **The scene is fixed.** Every instruction is phrased as designing ONTO
 *     the attached image. A model given a rich brief and a reference photo
 *     will happily produce a different, "better" photo; the campaign is then
 *     built around something the member never approved.
 *  2. **The words are quoted, closed, and exact.** The copy was already
 *     authored, validated against the member's hard requirements, and is
 *     supplied here verbatim. The model transcribes it — it does not write,
 *     translate, shorten, or add to it. Every observed garbled-text failure
 *     came from a prompt that described what the copy should say instead of
 *     stating what it says.
 *
 * The logo is never drawn here. A real logo file is composited pixel-exact
 * afterward (`ai/render/logo-composite.ts`), so this prompt only reserves the
 * space for it — see spec: "Gemini must NOT draw / recreate / approximate the
 * logo."
 */

export const CAMPAIGN_CREATIVE_PROMPT_VERSION = 2;

/** One line of copy, and the job it does in the layout. */
export interface CampaignCopyLine {
  role: 'HEADLINE' | 'OFFER' | 'EVENT_BADGE' | 'SUPPORT' | 'BRAND_MESSAGE' | 'CTA' | 'DETAIL';
  text: string;
}

/** The exact words this creative carries, in reading order. Never re-authored here. */
export function collectCampaignCopy(direction: CreativeDirection): CampaignCopyLine[] {
  const lines: CampaignCopyLine[] = [];
  const push = (role: CampaignCopyLine['role'], text?: string) => {
    const trimmed = (text ?? '').trim();
    if (trimmed) lines.push({ role, text: trimmed });
  };

  if (direction.copyTreatment !== 'none') {
    push('HEADLINE', direction.headline);
  }
  push('OFFER', direction.marketingCreative?.offerText);
  if (direction.copyTreatment !== 'none') {
    push('SUPPORT', direction.copyTreatment === 'headline_support' ? direction.supportingLine : undefined);
    push('SUPPORT', direction.copyTreatment === 'interactive' ? direction.interactionInstructions : undefined);
  }
  push('EVENT_BADGE', direction.marketingCreative?.eventBadge);
  push('BRAND_MESSAGE', direction.marketingCreative?.brandMessage);
  for (const detail of direction.marketingCreative?.secondaryInfo ?? []) push('DETAIL', detail);
  push('CTA', direction.cta);

  // The direction model occasionally files the same sentence twice (headline
  // and brandMessage). Rendering it twice reads as a design mistake.
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ROLE_GUIDANCE: Record<CampaignCopyLine['role'], string> = {
  HEADLINE: 'the largest type on the piece — the first thing read, set with real display energy',
  OFFER: 'the campaign\'s star device — build it as a DESIGNED graphic element (a burst, badge, brush-stroke panel, colour block, or oversized stacked display type with the number huge), the second focal element after the headline. Never a line of body copy',
  EVENT_BADGE: 'a small designed badge, ribbon, stamp or sticker device — peripheral to the main reading path, clearly an event marker',
  SUPPORT: 'one step down from the headline, clearly subordinate to it',
  BRAND_MESSAGE: 'small, quiet, positioned as the brand’s own voice',
  CTA: 'a distinct call-to-action treatment — a button, a rule, or a coloured block',
  DETAIL: 'the smallest type on the piece — practical detail, footer weight, may be paired with a small wordless pictogram icon',
};

/** Where the real logo will be composited. Named in plain words so the model leaves that area clean. */
export function describeLogoZone(placement: string): string {
  const p = placement.toLowerCase();
  const vertical = /top|upper|header|masthead/.test(p) ? 'top' : /middle|centre|center/.test(p) && !/bottom/.test(p) ? 'middle' : 'bottom';
  const horizontal = /left/.test(p) ? 'left' : /right/.test(p) ? 'right' : /centre|center|middle/.test(p) ? 'centre' : 'right';
  return `${vertical}-${horizontal}`;
}

function renderReferenceDesignLanguage(style?: ReferenceStyleProfile): string | null {
  if (!style?.analysed) return null;
  const recipe = style.designRecipe;
  const lines = [
    style.visualLanguage && `- Overall design language: ${style.visualLanguage}`,
    recipe?.headlineCharacter && `- Headline type character: ${recipe.headlineCharacter}`,
    recipe?.supportingTypography && `- Supporting type character: ${recipe.supportingTypography}`,
    recipe?.textHierarchy && `- Reading order: ${recipe.textHierarchy}`,
    recipe?.compositionBehaviour && `- How type sits against imagery: ${recipe.compositionBehaviour}`,
    recipe?.layoutBehaviour && `- Layout behaviour: ${recipe.layoutBehaviour.replace(/-/g, ' ')}`,
    recipe?.spacingBehaviour && `- Spacing: ${recipe.spacingBehaviour}`,
    recipe?.footerStyle && recipe.footerStyle !== 'none' && `- Footer treatment: ${recipe.footerStyle.replace(/-/g, ' ')}`,
    recipe?.borderStyle && recipe.borderStyle !== 'none' && `- Border/frame: ${recipe.borderStyle.replace(/-/g, ' ')}`,
    recipe?.texture && recipe.texture !== 'none' && `- Surface texture: ${recipe.texture.replace(/-/g, ' ')}`,
    recipe?.shapeLanguage && recipe.shapeLanguage !== 'none' && `- Shape language: ${recipe.shapeLanguage.replace(/-/g, ' ')}`,
    recipe?.graphicElements?.length && `- Recurring graphic devices: ${recipe.graphicElements.join('; ')}`,
    recipe?.visualDensity && `- Visual density: ${recipe.visualDensity}`,
    recipe?.imperfectionLevel && recipe.imperfectionLevel !== 'none' && `- Deliberate imperfection: ${recipe.imperfectionLevel}`,
    style.typographyCharacter && `- Typography character seen in references: ${style.typographyCharacter}`,
    style.brandTreatment && `- How brand identity appears: ${style.brandTreatment}`,
    style.doNotCopy.length && `- Never reproduce any of these from the references: ${style.doNotCopy.join('; ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (lines.length === 0) return null;
  return `DESIGN LANGUAGE (from the ${style.referenceCount} reference image(s) the member chose — this defines HOW the campaign is designed, never what it depicts):\n${lines.join('\n')}`;
}

/**
 * Stage B's quality gate (spec §14): the finished campaign is INSPECTED, not
 * assumed. A vision call reads the actual pixels against the exact copy list
 * and reports concrete problems; an empty list is a pass. One targeted
 * regeneration is allowed on failure — the problems become fix instructions.
 * Deterministic string checks can't do this job: the failure modes are visual
 * (a misspelled headline, a garbled letterform, an invented logo).
 */
/** One QC finding: what to fix, and whether it is worth a regeneration. */
export interface CampaignQcProblem {
  severity: 'critical' | 'minor';
  fix: string;
}

export const CAMPAIGN_QC_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'minor'],
            description:
              'critical = wrong/missing/misspelled listed copy, missing required claim, invented logo, unreadable primary headline, major text overlap, placeholder artifacts. minor = tiny prop text, decorative microcopy typo, small artifact outside the key content.',
          },
          fix: {
            type: 'string',
            description:
              'The defect phrased as a designer\'s fix instruction, e.g. \'The word "comeback" is misspelled as "comback" — spell it exactly "comeback"\'.',
          },
        },
        required: ['severity', 'fix'],
      },
      description: 'Each REAL defect found. Empty array when the creative is publishable.',
    },
  },
  required: ['problems'],
};

export function buildCampaignQcPrompt(copy: CampaignCopyLine[], requiredClaims: string[]): string {
  return [
    'You are proofing a finished social campaign creative before it is published. The attached image is that creative. Report every REAL defect — and nothing else. Do not review taste, style, colour or layout choices; only defects.',
    '',
    'The exact words that must appear on it, character for character:',
    ...copy.map((line, index) => `  ${index + 1}. ${line.role} — "${line.text}"`),
    '',
    'Check for these defects only:',
    '- A listed line that is missing, or whose words are misspelled, altered, duplicated, or partially rendered. (ALL-CAPS or small-caps styling of the same words is fine — different words or letters are not.)',
    '- Any word, label, caption or text on the image that is NOT in the list above (ignore natural text inside the photographed scene itself, e.g. on packaging).',
    '- Garbled, broken, or half-formed letterforms; text cropped by the canvas edge; text colliding with other text.',
    '- An invented logo, wordmark or brand signature. (The real logo is composited separately afterward, so a missing logo is fine; graphic badges carrying only listed text are fine.)',
    '- Placeholder/template artifacts: lorem ipsum, empty labelled boxes, annotation callouts, a UI wireframe look, a transparency checkerboard.',
    requiredClaims.length
      ? `- A viewer glancing at the creative must take in: ${requiredClaims.map((claim) => `"${claim}"`).join(', ')}. Flag any of these that is illegible or effectively invisible.`
      : null,
    '',
    'Rate each defect:',
    '- "critical" — the creative says the wrong thing or is unpublishable: a listed line missing, misspelled or altered; a required claim illegible; an invented logo; the headline unreadable; text colliding with text; placeholder/template artifacts.',
    '- "minor" — real but cosmetic: tiny incidental text on a prop, a typo inside decorative microcopy that is not a listed line, a small artifact away from the headline, offer, claims and logo area.',
    '',
    'Return JSON: { "problems": [{ "severity": "critical"|"minor", "fix": "..." }] } — one entry per real defect, each fix phrased as a concrete instruction. Empty array if the creative is publishable.',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

export interface CampaignCreativeContext {
  direction: CreativeDirection;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  referenceStyle?: ReferenceStyleProfile;
  intent?: CreativeIntentBrief;
  goal: MarketingGoal;
  platforms: string[];
  /** True when a real logo file will be composited afterward. */
  hasLogo: boolean;
  /** True when the member attached product/reference assets that also ride along. */
  hasProductAssets: boolean;
}

/**
 * Builds the Stage B image prompt. Deterministic assembly, no model call —
 * same reasoning as `buildImagePrompt`: the copy and the art direction are
 * already decided, and asking a model to restate them only adds a way to lose
 * them.
 */
export function buildCampaignCreativePrompt(context: CampaignCreativeContext): string {
  const { direction, brand, creativeDna, referenceStyle, intent, hasLogo, hasProductAssets } = context;
  const layout = direction.layoutDirection;
  const copy = collectCampaignCopy(direction);
  const palette = [...new Set([...creativeDna.brandColors, ...direction.palette].map(describePaletteColor))];

  const copyBlock = copy.length
    ? [
        'THE EXACT WORDS ON THIS CREATIVE. Reproduce each string character for character, spelled exactly as written between the quotation marks. Do not translate, rephrase, shorten, expand, correct, or re-punctuate any of them. Do not add ANY other word, letter, number, label, caption, watermark, or signature that is not listed here:',
        ...copy.map(
          (line, index) => `  ${index + 1}. ${line.role} — "${line.text}"  (${ROLE_GUIDANCE[line.role]})`,
        ),
        `Exactly ${copy.length} text element${copy.length === 1 ? '' : 's'} appear${copy.length === 1 ? 's' : ''} on this creative. No more.`,
      ].join('\n')
    : 'This creative carries NO text at all. Do not render any words, letters, numerals, labels, or typography anywhere in the image — the idea communicates visually.';

  const requirementsBlock = intent?.requiredClaims.length
    ? `NON-NEGOTIABLE: the finished creative must clearly communicate ${intent.requiredClaims
        .map((claim) => `"${claim}"`)
        .join(', ')}. These are the member's own stated requirements and are already carried by the copy above — render that copy legibly and prominently enough that a viewer takes them in at a glance. Never omit, abbreviate, or restyle them into illegibility.`
    : null;

  const logoBlock = hasLogo
    ? `LOGO: a real brand logo file is composited onto this creative afterward, in the ${describeLogoZone(
        layout?.logoPlacement || creativeDna.logoTreatment || 'bottom-right',
      )} area. Leave that area as plain, calm background — no text, no busy detail, no graphic element there, and NO box, frame, plate, chip, or container drawn to "hold" the logo; the logo file arrives with its own shape. Do NOT draw, letter, invent, approximate, or place any logo, wordmark, monogram, badge, emblem, or brand signature yourself, anywhere in the image.`
    : 'LOGO: this creative has no logo. Do not draw or invent a logo, wordmark, monogram, badge, emblem, or brand signature anywhere in the image.';

  const lines = [
    'You are a senior graphic designer finishing a social campaign creative.',
    '',
    `THE ATTACHED IMAGE IS THE CREATIVE'S VISUAL FOUNDATION AND IS ALREADY APPROVED.${
      hasProductAssets ? ' (The first attached image is that foundation; any further attachments are the member\'s real product/reference photos.)' : ''
    } Keep its scene, subject, framing, materials, colour and light. Do not replace the subject, restage the shot, change the setting, or generate a different photograph — you are designing ON TOP OF this exact image, the way a designer lays out a page over a supplied photo. Reframing, extending the canvas, colour-grading to suit the layout and adding design surfaces (bands, panels, scrims, frames, texture) are all fine; inventing a new picture is not.`,
    '',
    `THE CAMPAIGN: ${direction.concept}. ${direction.visualStory}`,
    brand.name && `Brand: ${brand.name}${brand.industry ? ` — ${brand.industry}` : ''}.`,
    brand.personality && `Brand personality the design should feel like: ${brand.personality}.`,
    brand.tone && `Brand tone: ${brand.tone}.`,
    '',
    copyBlock,
    '',
    requirementsBlock,
    requirementsBlock && '',
    logoBlock,
    '',
    'DESIGN THE PAGE:',
    layout?.layoutType && `- Layout approach: ${layout.layoutType}`,
    layout?.textHierarchy?.length && `- Reading order: ${layout.textHierarchy.join(' → ')}`,
    layout?.headlinePlacement && `- Headline sits: ${layout.headlinePlacement}`,
    layout?.supportingCopyPlacement && `- Supporting copy sits: ${layout.supportingCopyPlacement}`,
    layout?.ctaPlacement && `- CTA sits: ${layout.ctaPlacement}`,
    layout?.secondaryInformation && `- Practical detail sits: ${layout.secondaryInformation}`,
    layout?.brandTreatment && `- Brand identity across the piece: ${layout.brandTreatment}`,
    layout?.typographyDirection && `- Type character: ${layout.typographyDirection}`,
    layout?.visualDensity && `- Visual density: ${layout.visualDensity}`,
    layout?.textureDirection && `- Texture: ${layout.textureDirection}`,
    creativeDna.typographyCharacter && `- The brand's typography character: ${creativeDna.typographyCharacter}`,
    creativeDna.spacing && `- The brand's spacing/density habit: ${creativeDna.spacing}`,
    palette.length && `- Palette for type, panels and graphic elements: ${palette.join(', ')}. Take these from the brand, not from a default.`,
    layout?.safeAreas && `- Keep completely clear of type and graphics: ${layout.safeAreas}`,
    '',
    renderReferenceDesignLanguage(referenceStyle),
    referenceStyle?.analysed ? '' : null,
    'DESIGN LIKE A CAMPAIGN, NOT A CAPTIONED PHOTO — this is what separates a finished ad from a stock image with text:',
    '- The graphic design IS part of the creative idea. Use real graphic devices where the roles above call for them: badges, ribbons, bursts, brush-stroke panels, colour blocks, stamps, sticker shapes, torn-paper notes, rules and underlines, small wordless pictogram icons next to DETAIL lines. Every device must have a job — never decoration for its own sake.',
    '- Commit to a campaign colour identity. Take the palette listed above and USE it — saturated panels, tinted overlays, coloured type — rather than leaving the photo untouched with pale text over it.',
    '- Typography carries the energy: one expressive display voice for the headline (it may be bold, condensed, brushed, or hand-painted in character), a clean supporting voice for everything small, and at most one accent voice where the concept needs it. Real type on a baseline, deliberate margins, consistent optical alignment.',
    '- Build genuine hierarchy — the headline and the OFFER device should each be several times the size of the smallest detail line, not marginally bigger. A viewer must know what to read first without deciding. Scale contrast is the whole game.',
    '- Every line must be fully legible against what sits behind it. Where copy crosses busy imagery, put it on a real design surface — a colour block, a band, a panel, a controlled gradient scrim, a cleared area of the photograph — never light grey text floating on a detailed photo.',
    '- Nothing may be cropped, clipped by the canvas edge, run off the frame, or collide with anything else. Leave a clear margin around the whole composition.',
    '- Compose with intent: asymmetry, overlap, diagonal energy and layered depth are all available. Match the visual density the direction above asks for — a dense promotional layout should feel FULL and alive, edge to edge, not like a minimal editorial page with a few floating lines.',
    '- Texture makes it feel made by hand: grain, print texture, paper, brush edges, subtle imperfection where it serves the concept.',
    '- The result should look art-directed by a person for THIS campaign: specific, considered, memorable — not a template with content dropped into slots, and not the same look this tool would give any other brand.',
    '',
    'NEVER PRODUCE:',
    '- Any word not listed above; any lorem ipsum, placeholder, dummy label, sample text, or repeated/duplicated line.',
    '- Misspelled, malformed, broken, or half-formed letterforms; text running off the edge; text overlapping other text.',
    '- A drawn, invented or approximated logo, wordmark, monogram or brand signature of any kind. (Graphic badge/ribbon devices carrying ONLY the quoted text above are design elements, not logos, and are allowed.)',
    '- A transparency checkerboard or grey-and-white grid anywhere — fill the entire canvas edge to edge.',
    '- A UI mockup, wireframe, browser window, device frame, spec diagram, annotation callout or leader line.',
    '- Generic AI-ad defaults unless the concept genuinely calls for them: a centred product on a blue-white gradient, floating 3D glass objects, neon glow, a fake premium pedestal, a stock corporate model, meaningless swooshes or particles.',
    direction.negativeVisualConstraints.length && `- ${direction.negativeVisualConstraints.join('; ')}.`,
    brand.wordsToAvoid.length && `- Any of these words: ${brand.wordsToAvoid.join(', ')}.`,
    '',
    'Output the finished campaign creative as a single flat image, edge to edge, ready to publish.',
  ];

  return lines
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
    // Hex codes have been rendered INTO images as literal text ("#2563EEb"
    // on a prop). Every one becomes a plain-words colour description.
    .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => describePaletteColor(hex));
}

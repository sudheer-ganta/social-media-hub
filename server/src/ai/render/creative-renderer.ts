import sharp, { type OverlayOptions } from 'sharp';
import { resolveDesignRecipe, type RecipeSource } from './design-recipe';
import {
  buildLayoutPlan,
  resolvePalette,
  type ContentInput,
  type LayoutPlan,
  type PlannedBlock,
  type Rect,
} from './layout-plan';
import { validateDesign, validateStyleFidelity, type DesignValidationResult, type StyleFidelityResult } from './design-validator';
import {
  renderBadge,
  renderBandFooter,
  renderBorder,
  renderCta,
  renderDefs,
  renderDivider,
  renderHairlineFooter,
  renderHandDrawnLine,
  renderHandwrittenNote,
  renderScrim,
  renderStamp,
  renderTape,
  renderTextBlock,
  renderTexture,
  renderTornFooter,
  wrapText,
} from './primitives';
import { rasterizeTextOverlay } from './text-rasterizer';
import { selectTypography, type TypographySelection } from '../typography/font-selector';
import type { AiTextProvider } from '../providers';
import type { CreativeDirection, GraphicDesignConcept, ImageCapabilities, ReferenceStyleProfile, ResolvedCreativeDna } from '../types';
import type { StyleDNA } from '../style-dna/style-dna';

/**
 * The "FlowPost Creative Renderer" — the deterministic graphic-design layer
 * that used to be Gemini's job. Takes the visual-only image Gemini generated
 * plus the already-authored copy (`CreativeDirection`), resolves the
 * ReferenceDesignRecipe (analysed from the member's references, or derived),
 * builds a parameterized LayoutPlan, and executes it with real vector text,
 * the real logo file, and real decorative treatments — never re-rendered
 * pixels of any of it, and never one-of-N fixed templates.
 */

const ASPECT_RATIOS: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1.91:1': 1.91,
};
const DEFAULT_ASPECT = 1;
const LONG_EDGE = 1600;

/** Long edge fixed at 1600px; the short edge follows the aspect ratio — covers every platform ratio FlowPost offers without a lookup table per platform. */
export function resolveCanvasSize(aspectRatio: string): { width: number; height: number } {
  const ratio = ASPECT_RATIOS[aspectRatio.trim()] ?? DEFAULT_ASPECT;
  if (ratio >= 1) return { width: LONG_EDGE, height: Math.round(LONG_EDGE / ratio) };
  return { width: Math.round(LONG_EDGE * ratio), height: LONG_EDGE };
}

/**
 * Turns the copy the direction generator already authored into render-ready
 * content. Only includes what the concept's `copyTreatment` actually calls
 * for and what has real text — the renderer never invents copy.
 */
/** Case/punctuation-insensitive equality — "The single-composer workflow." vs "THE SINGLE-COMPOSER WORKFLOW." is the same line twice. */
const sameCopy = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildContent(direction: CreativeDirection, hasLogo: boolean): ContentInput {
  const omissions = new Set(direction.graphicConcept?.elementsToOmit ?? []);
  const wantsCopy = direction.copyTreatment !== 'none';
  let support =
    !omissions.has('description') && direction.copyTreatment === 'headline_support' && direction.supportingLine
      ? direction.supportingLine
      : undefined;
  const brandMessage = !omissions.has('description') ? direction.marketingCreative?.brandMessage : undefined;
  // Stage A has no dedicated offer device — the offer display fragment rides
  // as the support line (or joins the footer) so the standalone creative
  // still carries it. Stage B gives it its own graphic treatment.
  const offerText = direction.marketingCreative?.offerText;
  const secondaryInfo = !omissions.has('secondaryInfo') ? [...(direction.marketingCreative?.secondaryInfo ?? [])] : [];
  if (offerText && !(direction.headline && sameCopy(offerText, direction.headline)) && !(support && sameCopy(offerText, support))) {
    if (wantsCopy && !support && !omissions.has('description')) support = offerText;
    else if (!secondaryInfo.some((line) => sameCopy(line, offerText)) && !omissions.has('secondaryInfo')) secondaryInfo.unshift(offerText);
  }
  const cta = !omissions.has('cta') && direction.cta ? direction.cta : undefined;
  return {
    ...(wantsCopy && direction.headline && { headline: direction.headline }),
    ...(support && { support }),
    ...(direction.copyTreatment === 'interactive' &&
      direction.interactionInstructions && { support: direction.interactionInstructions, supportIsInteraction: true }),
    // The direction model sometimes files the same line as both supportingLine
    // and brandMessage — one of them renders, never both.
    ...(brandMessage && !(support && sameCopy(brandMessage, support)) && { brandMessage }),
    ...(secondaryInfo.length && {
      secondaryInfo: secondaryInfo.join(' · '),
    }),
    ...(cta && { cta }),
    ...(!omissions.has('badge') && direction.marketingCreative?.eventBadge && { eventBadge: direction.marketingCreative.eventBadge }),
    hasLogo: !omissions.has('footer') && hasLogo,
  };
}

const px = (rect: Rect, w: number, h: number) => ({
  x: rect.x * w,
  y: rect.y * h,
  width: rect.width * w,
  height: rect.height * h,
});

/** One SVG fragment per planned block — logos are skipped here and composited pixel-exact afterward. */
function renderBlock(block: PlannedBlock, plan: LayoutPlan): string {
  const { width: w, height: h } = plan.canvas;
  switch (block.kind) {
    case 'scrim': {
      const r = px(block.rect, w, h);
      return renderScrim(r.x, r.y, r.width, r.height, block.direction, block.maxOpacity, block.color);
    }
    case 'footer': {
      const r = px(block.rect, w, h);
      if (block.style === 'torn-paper') return renderTornFooter(w, h, r.y, block.fill);
      if (block.style === 'hairline') return renderHairlineFooter(w, h, r.y, block.fill, '#00000055', w * 0.06);
      return renderBandFooter(w, h, r.y, block.fill);
    }
    case 'panel': {
      const r = px(block.rect, w, h);
      const rx = block.radius ? ` rx="${block.radius}" ry="${block.radius}"` : '';
      const stroke = block.stroke ? ` stroke="${block.stroke}" stroke-width="${block.strokeWidth ?? 1}"` : '';
      const rot = block.rotationDeg ? ` transform="rotate(${block.rotationDeg} ${r.x + r.width / 2} ${r.y + r.height / 2})"` : '';
      const shadow = block.offsetShadow ? ' filter="url(#fp-soft-shadow)"' : '';
      return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${block.fill}"${rx}${stroke}${rot}${shadow}/>`;
    }
    case 'text':
      return renderTextBlock(block.spec);
    case 'badge': {
      const r = px(block.rect, w, h);
      if (block.text === '') {
        return `<circle cx="${r.x + r.width / 2}" cy="${r.y + r.height / 2}" r="${r.width / 2}" fill="${block.fill}"/>`;
      }
      return renderBadge(block.text, r.x, r.y, block.fontSize, block.fontFamily, block.fill, block.textFill, block.shapeLanguage);
    }
    case 'cta':
      return renderCta(block.spec);
    case 'underline': {
      const r = px(block.rect, w, h);
      if (block.rotationDeg) {
        return `<g transform="rotate(${block.rotationDeg} ${r.x + r.width / 2} ${r.y})">${renderHandDrawnLine(r.x, r.y, r.width, block.stroke, block.strokeWidth)}</g>`;
      }
      return renderHandDrawnLine(r.x, r.y, r.width, block.stroke, block.strokeWidth);
    }
    case 'divider': {
      const r = px(block.rect, w, h);
      if (block.rect.width < block.rect.height) {
        return `<line x1="${r.x}" y1="${r.y}" x2="${r.x}" y2="${r.y + r.height}" stroke="${block.stroke}" stroke-width="2" opacity="${block.opacity}"/>`;
      }
      return renderDivider(r.x, r.y, r.width, block.stroke, 3, block.opacity);
    }
    case 'border': {
      if (block.style === 'inset-frame') {
        return renderBorder(w, h, block.stroke, 2, w * 0.028) + renderBorder(w, h, block.stroke, 1, w * 0.034);
      }
      return renderBorder(w, h, block.stroke, block.style === 'thick' ? 8 : 2, w * 0.03);
    }
    case 'texture':
      return renderTexture(block.texture, w, h);
    case 'tape': {
      const r = px(block.rect, w, h);
      return renderTape(r.x, r.y, r.width, r.height, block.rotationDeg ?? 0, block.color ?? '#f5f0e1', block.opacity ?? 0.82);
    }
    case 'stamp': {
      const r = px(block.rect, w, h);
      const defaultFontSize = Math.round(Math.min(r.width, r.height) * 0.16);
      return renderStamp(r.x, r.y, r.width, r.height, block.text, block.rotationDeg ?? -10, block.borderStyle ?? 'double', block.fill ?? 'none', block.stroke ?? '#e11d48', block.fontFamily ?? 'sans-serif', block.fontSize ?? defaultFontSize);
    }
    case 'handwritten-note': {
      const r = px(block.rect, w, h);
      return renderHandwrittenNote(r.x, r.y + (block.fontSize ?? 18) * 0.85, block.text, block.fontFamily ?? 'cursive, sans-serif', block.rotationDeg ?? -3, block.fill ?? '#e11d48', block.fontSize ?? 18);
    }
    case 'logo':
      return '';
  }
}

/**
 * Measures how bright the visual is where full-bleed copy will sit ('stacked'
 * anchors top, everything else anchors bottom) so the planner can flip to ink
 * text on a pale scrim over bright photography.
 */
async function measureCopyZoneTone(visual: Buffer, anchorTop: boolean): Promise<'light' | 'dark'> {
  try {
    const image = sharp(visual).greyscale();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return 'dark';
    const zoneH = Math.max(1, Math.round(meta.height * 0.42));
    const stats = await image
      .extract({ left: 0, top: anchorTop ? 0 : meta.height - zoneH, width: meta.width, height: zoneH })
      .stats();
    return stats.channels[0].mean / 255 > 0.62 ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Scales a PNG's alpha channel — watermark logos keep their real pixels at reduced opacity. */
async function withOpacity(image: Buffer, opacity: number): Promise<Buffer> {
  if (opacity >= 1) return image;
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export class RenderValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Layout plan failed validation: ${issues.join('; ')}`);
    this.name = 'RenderValidationError';
  }
}

export interface RenderCreativeOptions {
  /** The visual-only image Gemini generated — no text, no logo. */
  visualImage: { mimeType: string; data: string };
  direction: CreativeDirection;
  creativeDna: ResolvedCreativeDna;
  referenceStyle?: ReferenceStyleProfile;
  styleDna?: StyleDNA;
  /** The deterministic pick among the selected style's own option pools (style-dna.ts `choose()`) — required alongside `styleDna` for a stable, reproducible recipe. */
  styleDnaVariant?: number;
  /** Fetched once by the caller and reused here — the actual brand logo file, composited pixel-exact, never redrawn. */
  logoImage?: { mimeType: string; data: string };
  /** Image capabilities: cutout, transparency, aspect ratio. */
  capabilities?: ImageCapabilities;
  /** Optional AI text provider for AI-driven font selection. When absent, uses safe editorial defaults. */
  textProvider?: AiTextProvider;
}

export interface RenderedCreative {
  mimeType: string;
  data: string;
  /** For logging/QA — the structural choices the plan made, e.g. "full-bleed/asymmetric/torn-paper-footer/logo:integrated/type:serif-editorial". */
  structure: string;
  /** Where `structure`'s choices actually came from — 'style-dna' when the member explicitly selected a style. Never silently 'generic-fallback' for an explicit selection (see design-recipe.ts). */
  recipeSource: RecipeSource;
  /** The full plan, for dogfood scripts and QA — never sent to the browser. */
  plan: LayoutPlan;
  /** The automatic typography engine's choice for this creative — persisted and shown read-only in the UI (spec §9). */
  typography: TypographySelection;
  validation: DesignValidationResult;
  /** Deterministic check of the finished creative against the selected Style DNA (design-validator.ts `validateStyleFidelity`) — `compliant: true` with no `styleDna` selected. Never blocks the render; the caller decides what a non-compliant report means. */
  styleFidelity: StyleFidelityResult;
}

export async function renderCreative({
  visualImage,
  direction,
  creativeDna,
  referenceStyle,
  styleDna,
  styleDnaVariant,
  logoImage,
  capabilities,
  textProvider,
}: RenderCreativeOptions): Promise<RenderedCreative> {
  const { width, height } = resolveCanvasSize(direction.aspectRatio);
  const { recipe, source: recipeSource } = resolveDesignRecipe(direction, creativeDna, {
    styleDna,
    styleDnaVariant,
    referenceStyle,
    capabilities,
  });
  const palette = resolvePalette(creativeDna.brandColors, recipe.colorPalette, direction.palette);
  const content = buildContent(direction, Boolean(logoImage));

  const copyZoneTone =
    recipe.imageTreatment === 'full-bleed'
      ? await measureCopyZoneTone(Buffer.from(visualImage.data, 'base64'), recipe.layoutBehaviour === 'stacked')
      : 'dark';

  // AI-driven typography selection — the AI reads the brand, style, and creative
  // context and picks the best fonts from the available 26 families.
  // Falls back to safe editorial defaults when no provider is available.
  const typography = await selectTypography({
    direction,
    creativeDna,
    recipe,
    styleDna,
    provider: textProvider,
  });

  const plan = buildLayoutPlan({
    width,
    height,
    recipe,
    content,
    palette,
    aspectRatio: direction.aspectRatio,
    copyZoneTone,
    typography: typography.baseFontStack,
    accentFontFamily: typography.accentFont,
    compositionArchetype: recipe.compositionArchetype,
    capabilities,
    graphicConcept: direction.graphicConcept,
    compositionIntent: direction.compositionIntent,
    seed: styleDnaVariant,
  });

  const validation = validateDesign(plan, content);
  if (!validation.valid) throw new RenderValidationError(validation.errors.map((issue) => issue.message));

  const styleFidelity = validateStyleFidelity({ styleDna, recipe, typography, palette });
  if (!styleFidelity.compliant) {
    console.warn('[creative] finished render does not fully match the selected style', {
      styleId: styleDna?.id,
      recipeSource,
      violations: styleFidelity.violations,
    });
  }

  const underBlocks = plan.blocks.filter((block) => block.kind === 'panel' && !(block as any).overImage);
  const overBlocks = plan.blocks.filter((block) => block.kind !== 'panel' || (block as any).overImage);

  let underPng: Buffer | null = null;
  if (underBlocks.length > 0) {
    const underSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${renderDefs()}${underBlocks.map((b) => renderBlock(b, plan)).join('')}</svg>`;
    underPng = rasterizeTextOverlay(underSvg, typography.facesUsed);
  }

  const overSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${renderDefs()}${overBlocks.map((b) => renderBlock(b, plan)).join('')}</svg>`;
  // Rasterized with the REAL selected font files (spec §6) — never the AI
  // image model, never whatever fonts happen to be installed on this host.
  const overlayPng = rasterizeTextOverlay(overSvg, typography.facesUsed);

  const imagePx = px(plan.imageRect, width, height);
  let imgPipeline = sharp(Buffer.from(visualImage.data, 'base64'))
    .resize(Math.round(imagePx.width), Math.round(imagePx.height), { fit: 'cover' });

  let imgTop = Math.round(imagePx.y);
  let imgLeft = Math.round(imagePx.x);

  if (plan.imageRotationDeg) {
    imgPipeline = imgPipeline.ensureAlpha().rotate(plan.imageRotationDeg, { background: '#00000000' });
    const { width: rotW, height: rotH } = await imgPipeline.metadata();
    if (rotW && rotH) {
      imgTop = Math.round(imagePx.y - (rotH - imagePx.height) / 2);
      imgLeft = Math.round(imagePx.x - (rotW - imagePx.width) / 2);
    }
  } else {
    imgPipeline = imgPipeline.flatten({ background: plan.paper });
  }
  const background = await imgPipeline.toBuffer();

  const composites: OverlayOptions[] = [];
  if (underPng) {
    composites.push({ input: underPng, top: 0, left: 0 });
  }
  composites.push({ input: background, top: imgTop, left: imgLeft });
  composites.push({ input: overlayPng, top: 0, left: 0 });

  if (logoImage) {
    for (const block of plan.blocks) {
      if (block.kind !== 'logo') continue;
      const r = px(block.rect, width, height);
      const logoBuffer = await withOpacity(
        await sharp(Buffer.from(logoImage.data, 'base64'))
          .resize(Math.round(r.width), Math.round(r.height), { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer(),
        block.opacity,
      );
      composites.push({ input: logoBuffer, top: Math.round(r.y), left: Math.round(r.x) });
    }
  }

  const output = await sharp({
    create: { width, height, channels: 3, background: plan.paper },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { mimeType: 'image/png', data: output.toString('base64'), structure: plan.structure, recipeSource, plan, typography, validation, styleFidelity };
}

export { wrapText, resolvePalette };

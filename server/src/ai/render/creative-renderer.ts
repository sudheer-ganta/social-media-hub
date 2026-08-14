import sharp, { type OverlayOptions } from 'sharp';
import { resolveDesignRecipe } from './design-recipe';
import {
  buildLayoutPlan,
  resolvePalette,
  validateLayoutPlan,
  type ContentInput,
  type LayoutPlan,
  type PlannedBlock,
  type Rect,
} from './layout-plan';
import {
  renderBadge,
  renderBandFooter,
  renderBorder,
  renderCta,
  renderDefs,
  renderDivider,
  renderHairlineFooter,
  renderHandDrawnLine,
  renderScrim,
  renderTextBlock,
  renderTexture,
  renderTornFooter,
  wrapText,
} from './primitives';
import type { CreativeDirection, ReferenceStyleProfile, ResolvedCreativeDna } from '../types';

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
  const wantsCopy = direction.copyTreatment !== 'none';
  const support =
    direction.copyTreatment === 'headline_support' && direction.supportingLine ? direction.supportingLine : undefined;
  const brandMessage = direction.marketingCreative?.brandMessage;
  return {
    ...(wantsCopy && direction.headline && { headline: direction.headline }),
    ...(support && { support }),
    ...(direction.copyTreatment === 'interactive' &&
      direction.interactionInstructions && { support: direction.interactionInstructions, supportIsInteraction: true }),
    // The direction model sometimes files the same line as both supportingLine
    // and brandMessage — one of them renders, never both.
    ...(brandMessage && !(support && sameCopy(brandMessage, support)) && { brandMessage }),
    ...(direction.marketingCreative?.secondaryInfo?.length && {
      secondaryInfo: direction.marketingCreative.secondaryInfo.join(' · '),
    }),
    ...(direction.cta && { cta: direction.cta }),
    hasLogo,
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
    case 'text':
      return renderTextBlock(block.spec);
    case 'badge': {
      const r = px(block.rect, w, h);
      return renderBadge(block.text, r.x, r.y, block.fontSize, block.fontFamily, block.fill, block.textFill);
    }
    case 'cta':
      return renderCta(block.spec);
    case 'underline': {
      const r = px(block.rect, w, h);
      return renderHandDrawnLine(r.x, r.y, r.width, block.stroke, block.strokeWidth);
    }
    case 'divider': {
      const r = px(block.rect, w, h);
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
  /** Fetched once by the caller and reused here — the actual brand logo file, composited pixel-exact, never redrawn. */
  logoImage?: { mimeType: string; data: string };
}

export interface RenderedCreative {
  mimeType: string;
  data: string;
  /** For logging/QA — the structural choices the plan made, e.g. "full-bleed/asymmetric/torn-paper-footer/logo:integrated/type:serif-editorial". */
  structure: string;
  /** The full plan, for dogfood scripts and QA — never sent to the browser. */
  plan: LayoutPlan;
}

export async function renderCreative({
  visualImage,
  direction,
  creativeDna,
  referenceStyle,
  logoImage,
}: RenderCreativeOptions): Promise<RenderedCreative> {
  const { width, height } = resolveCanvasSize(direction.aspectRatio);
  const recipe = resolveDesignRecipe(direction, creativeDna, referenceStyle);
  const palette = resolvePalette(creativeDna.brandColors, recipe.colorPalette);
  const content = buildContent(direction, Boolean(logoImage));

  const copyZoneTone =
    recipe.imageTreatment === 'full-bleed'
      ? await measureCopyZoneTone(Buffer.from(visualImage.data, 'base64'), recipe.layoutBehaviour === 'stacked')
      : 'dark';

  const plan = buildLayoutPlan({
    width,
    height,
    recipe,
    content,
    palette,
    aspectRatio: direction.aspectRatio,
    copyZoneTone,
  });

  const issues = validateLayoutPlan(plan, content);
  if (issues.length > 0) throw new RenderValidationError(issues);

  const overlayBody = plan.blocks.map((block) => renderBlock(block, plan)).join('');
  const overlaySvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${renderDefs()}${overlayBody}</svg>`;

  const imagePx = px(plan.imageRect, width, height);
  // Flattened onto paper first: a visual with real transparency must never
  // leak alpha (or a checkerboard look) into the finished creative.
  const background = await sharp(Buffer.from(visualImage.data, 'base64'))
    .flatten({ background: plan.paper })
    .resize(Math.round(imagePx.width), Math.round(imagePx.height), { fit: 'cover' })
    .toBuffer();

  const composites: OverlayOptions[] = [
    { input: background, top: Math.round(imagePx.y), left: Math.round(imagePx.x) },
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
  ];

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

  return { mimeType: 'image/png', data: output.toString('base64'), structure: plan.structure, plan };
}

export { wrapText, resolvePalette };

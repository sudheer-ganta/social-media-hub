import { existsSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { fontFilePath, getFontDefinition, nearestAvailableWeight } from '../typography/font-catalog';
import { esc } from './primitives';
import { generateLineBreakHypotheses, tokenizeCopy } from './copy-model';
import type { DesignNode, DesignerPlan } from './designer-composition';
import {
  SIZE_SCALE_MAX,
  SIZE_SCALE_MIN,
  TextStyleError,
  type PersistedLayout,
  type RoleTextStyle,
  type TextStylesByRole,
  type TypesetLine,
} from './type-style';

/**
 * Applies a member's wording and typography choices to a plan that is ALREADY
 * solved, changing only the lines they touched.
 *
 * Leaving the layout alone is the point: the plan is the creative's saved
 * layout, so every line the member did not touch keeps its box, size, breaks
 * and colour exactly, and the edited line stays in its own spot. (Re-running the
 * layout search instead would rearrange the whole creative around one edit.)
 *
 * The solver chose a size to fit a region and a weight to suit a font, so a
 * choice made afterwards can leave text that no longer fits its box. The
 * renderer fails closed on that (rightly), so this step measures the real
 * glyphs and makes the choice fit rather than hoping it does:
 *
 *   1. New wording is re-broken into lines and, if need be, stepped down in size
 *      until it fits the line's existing box.
 *   2. A larger size, or a face that needs more room, grows the box about its
 *      alignment edge, but only into space that is free: never closer to other
 *      text or the logo than the box already was, and never past the canvas margin.
 *   3. If it cannot grow enough, the size steps down until it fits.
 *
 * The size actually applied is returned, so "make it bigger" is honest about
 * "bigger, as far as it fits here".
 */

const CANVAS_MARGIN = 0.04;
/** The clear gap a grown box must keep from other text and the logo. */
const NEIGHBOUR_GAP = 0.004;
/** The renderer lets text exceed its box by this much (see fittedCopySvg), so growing for less than that is pointless. */
const RENDER_TOLERANCE_PX = 24;
const MIN_SCALE_HEADLINE = 0.02;
const MIN_SCALE_OTHER = 0.014;
const MAX_FONT_SCALE = 0.4;
const SHRINK_STEP = 0.95;
const MAX_FIT_STEPS = 60;

export type AppliedTextStyles = Record<string, Required<Pick<RoleTextStyle, 'sizeScale'>> & RoleTextStyle>;

interface Rect { x: number; y: number; width: number; height: number }

const rectOf = (n: Rect): Rect => ({ x: n.x, y: n.y, width: n.width, height: n.height });

/**
 * How far apart two boxes are: 0 when they touch or overlap, otherwise the
 * larger of the horizontal and vertical clearances.
 */
function clearance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.max(dx, dy);
}

/** The pixel size of this node's text as the renderer would typeset it. */
function measure(n: DesignNode, w: number, h: number): { width: number; height: number } {
  const family = n.fontFamily!;
  const weight = n.fontWeight!;
  const size = Math.min(w, h) * n.fontScale;
  const spacing = n.lineHeight ?? 1.15;
  const tracking = n.tracking ?? n.letterSpacing ?? 0;
  const letter = tracking !== 0 ? ` letter-spacing="${(tracking * size).toFixed(2)}"` : '';
  const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start';
  const lines = Array.isArray(n.lines) && n.lines.length ? n.lines : [''];
  const body = `<g font-family="${esc(family)}" font-weight="${weight}" font-size="${size}"${letter} text-anchor="${anchor}">` +
    lines.map((l, i) => `<text x="0" y="${size + i * size * spacing}">${esc(l)}</text>`).join('') + '</g>';
  const box = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`, {
    font: { fontFiles: [fontFilePath(family, weight, 'normal')], loadSystemFonts: false },
  }).getBBox();
  if (!box || box.width <= 0 || box.height <= 0) throw new TextStyleError('That font could not be measured for this wording.');
  return { width: box.width, height: box.height };
}

/** A box of the requested size, anchored on the edge the text is aligned to and centred vertically. */
function anchored(orig: Rect, align: DesignNode['align'], width: number, height: number): Rect {
  const x = align === 'right' ? orig.x + orig.width - width : align === 'center' ? orig.x + orig.width / 2 - width / 2 : orig.x;
  return { x, y: orig.y + orig.height / 2 - height / 2, width, height };
}

/** Inside the canvas margins, or no further out than the box already was. */
function withinCanvas(box: Rect, orig: Rect): boolean {
  return box.x >= Math.min(CANVAS_MARGIN, orig.x) - 1e-6
    && box.x + box.width <= Math.max(1 - CANVAS_MARGIN, orig.x + orig.width) + 1e-6
    && box.y >= Math.min(CANVAS_MARGIN, orig.y) - 1e-6
    && box.y + box.height <= Math.max(1 - CANVAS_MARGIN, orig.y + orig.height) + 1e-6;
}

function ensureFace(family: string, weight: number): void {
  const def = getFontDefinition(family);
  if (!def || !def.weights.includes(weight) || !existsSync(fontFilePath(family, weight, 'normal'))) {
    throw new TextStyleError(`${family} is not available in weight ${weight}.`);
  }
}

/** Does text of this measured size sit inside the box, as far as the renderer is concerned? */
function fitsBox(m: { width: number; height: number }, box: Rect, w: number, h: number): boolean {
  return m.width <= box.width * w + RENDER_TOLERANCE_PX && m.height <= box.height * h + RENDER_TOLERANCE_PX;
}

const BREAKS_PER_LINE_COUNT = 3;

/** Keeps the first few hypotheses for each line count, preserving the incoming order. */
function capPerLineCount<T extends { lineCount: number }>(sorted: T[]): T[] {
  const seen = new Map<number, number>();
  return sorted.filter((hyp) => {
    const n = (seen.get(hyp.lineCount) ?? 0) + 1;
    seen.set(hyp.lineCount, n);
    return n <= BREAKS_PER_LINE_COUNT;
  });
}

/**
 * Re-breaks new wording into lines that fit the node's EXISTING box, stepping the
 * size down only if it must. Keeps the line count the layout already had when it
 * can, so a reworded headline keeps the shape of the headline it replaces.
 */
function refitText(node: DesignNode, text: string, canvas: { width: number; height: number }, floor: number): void {
  const { width: w, height: h } = canvas;
  const box = rectOf(node);
  const previousLines = node.lines?.length || 1;
  const hypotheses = generateLineBreakHypotheses(tokenizeCopy(text), Math.max(3, previousLines + 1));
  const candidates = hypotheses.length ? hypotheses.map((hyp) => hyp.lines) : [[text]];
  // Long wording yields hundreds of possible breaks and each is measured with the real font at every size
  // step: keep the best few per line count, which is all a layout would ever choose between.
  const ordered = hypotheses.length
    ? capPerLineCount(
        [...hypotheses].sort((a, b) => Math.abs(a.lineCount - previousLines) - Math.abs(b.lineCount - previousLines) || b.structuralScore - a.structuralScore),
      ).map((hyp) => hyp.lines)
    : candidates;

  let scale = node.fontScale;
  for (let step = 0; step < MAX_FIT_STEPS; step++) {
    node.fontScale = scale;
    for (const lines of ordered) {
      node.lines = lines;
      if (fitsBox(measure(node, w, h), box, w, h)) return;
    }
    if (scale <= floor) break;
    scale = Math.max(floor, scale * SHRINK_STEP);
  }
  throw new TextStyleError('That wording is too long to fit in this spot. Try something shorter.');
}

/**
 * Mutates the copy nodes of `nodes` in place and returns what was applied per
 * role. `roleByNodeId` maps a copy node's id to its copy role.
 *
 * `texts` is new wording by node id. `baseScales` is each node's 100% size (see
 * {@link PersistedLayout}); without it the node's current size is the 100%.
 */
export function applyTextStyles(options: {
  nodes: DesignNode[];
  roleByNodeId: Record<string, string>;
  styles: TextStylesByRole;
  canvas: { width: number; height: number };
  texts?: Record<string, string>;
  baseScales?: Record<string, number>;
}): AppliedTextStyles {
  const { nodes, roleByNodeId, styles, canvas, texts = {}, baseScales = {} } = options;
  const { width: w, height: h } = canvas;
  const applied: AppliedTextStyles = {};

  for (const node of nodes) {
    if (node.kind !== 'copy') continue;
    const role = roleByNodeId[node.id];
    const style: RoleTextStyle | undefined = role ? styles[role] : undefined;
    const newText = texts[node.id];
    if (!role || (!style && newText === undefined)) continue;

    const baseScale = baseScales[node.id] ?? node.fontScale;
    const floor = role === 'HEADLINE' ? MIN_SCALE_HEADLINE : MIN_SCALE_OTHER;

    if (style?.color) node.color = style.color;

    // Font: the weight is honoured here because the solver recommends its own.
    const family = style?.fontFamily ?? node.fontFamily;
    if (!family) throw new TextStyleError('This line has no font to restyle.');
    const weight = style?.fontWeight ?? (style?.fontFamily && node.fontWeight !== undefined
      ? nearestAvailableWeight(style.fontFamily, node.fontWeight)
      : node.fontWeight ?? 400);
    ensureFace(family, weight);
    node.fontFamily = family;
    node.fontWeight = weight;

    // New wording: re-break it into the line's own box, using the face it will now be set in.
    if (newText !== undefined) refitText(node, newText, canvas, floor);

    const sizeChange = style?.sizeScale !== undefined && Math.abs(style.sizeScale * baseScale - node.fontScale) > 1e-4;
    const faceChange = style?.fontFamily !== undefined || style?.fontWeight !== undefined;
    if (!sizeChange && !faceChange) {
      applied[role] = {
        ...(style?.color && { color: style.color }),
        sizeScale: Number((node.fontScale / baseScale).toFixed(2)),
      };
      continue;
    }

    const requested = Math.min(SIZE_SCALE_MAX, Math.max(SIZE_SCALE_MIN, style?.sizeScale ?? node.fontScale / baseScale));
    const orig = rectOf(node);

    // Text that must not be driven into: every other line and the logo. A box may
    // never end up closer to one than it already was (the solver packs lines
    // tightly, so the box as it stands must always be acceptable), nor closer
    // than the standard gap when it was further away.
    const others = nodes.filter((o) => o !== node && (o.kind === 'copy' || o.kind === 'logo')).map(rectOf);
    const allowedClearance = others.map((o) => Math.min(NEIGHBOUR_GAP, clearance(orig, o)));
    const collides = (box: Rect) => others.some((o, i) => clearance(box, o) < allowedClearance[i] - 1e-9);

    let scale = Math.min(MAX_FONT_SCALE, Math.max(floor, baseScale * requested));
    let fitted = false;
    for (let step = 0; step < MAX_FIT_STEPS; step++) {
      node.fontScale = scale;
      const m = measure(node, w, h);
      // Only grow past the box when the type really overflows it by more than the renderer tolerates.
      const needW = m.width <= orig.width * w + RENDER_TOLERANCE_PX ? orig.width : m.width / w;
      const needH = m.height <= orig.height * h + RENDER_TOLERANCE_PX ? orig.height : m.height / h;
      const box = anchored(orig, node.align, needW, needH);
      if (withinCanvas(box, orig) && !collides(box)) {
        node.x = Number(box.x.toFixed(4));
        node.y = Number(box.y.toFixed(4));
        node.width = Number(box.width.toFixed(4));
        node.height = Number(box.height.toFixed(4));
        fitted = true;
        break;
      }
      if (scale <= floor) break;
      scale = Math.max(floor, scale * SHRINK_STEP);
    }
    if (!fitted) throw new TextStyleError('That style does not fit this wording here. Try a smaller size or another font.');

    node.fontScale = Number(scale.toFixed(4));
    applied[role] = {
      ...(style?.fontFamily && { fontFamily: family }),
      ...(style?.fontWeight !== undefined && { fontWeight: weight }),
      ...(style?.color && { color: style.color }),
      // Relative to what the engine fitted for this layout, so it stays meaningful across later edits.
      sizeScale: Number((scale / baseScale).toFixed(2)),
    };
  }
  return applied;
}

/** What the composer typeset per role: stored so the editor can show the current font, weight and colour. */
export function summariseTypeset(nodes: DesignNode[], roleByNodeId: Record<string, string>): Record<string, TypesetLine> {
  const out: Record<string, TypesetLine> = {};
  for (const n of nodes) {
    const role = n.kind === 'copy' ? roleByNodeId[n.id] : undefined;
    if (!role || !n.fontFamily || n.fontWeight === undefined) continue;
    out[role] = { fontFamily: n.fontFamily, fontWeight: n.fontWeight, fontScale: n.fontScale, color: n.color };
  }
  return out;
}

/** Each copy node's current size: taken BEFORE any member styling, this is the 100% that sizes are measured against. */
export function copyBaseScales(nodes: DesignNode[]): Record<string, number> {
  return Object.fromEntries(nodes.filter((n) => n.kind === 'copy').map((n) => [n.id, n.fontScale]));
}

/** Snapshots a solved plan so a later edit can re-render it as it was. */
export function buildPersistedLayout(options: {
  plan: DesignerPlan;
  roles: Record<string, string>;
  copy: Record<string, string>;
  baseScales: Record<string, number>;
}): PersistedLayout {
  return structuredClone({ plan: options.plan, roles: options.roles, copy: options.copy, baseScales: options.baseScales });
}

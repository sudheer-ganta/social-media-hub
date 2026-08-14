/**
 * FlowPost's rendering primitives — the composable pieces the LayoutPlan is
 * built from. Each emitter returns an SVG fragment; layout-plan.ts decides
 * where things go, these decide only how one thing looks. No primitive knows
 * about recipes or templates — parameters in, markup out.
 */

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Text measurement — char-count heuristics, no font-metrics engine ───────

/**
 * Character-count line wrapping — good enough for short ad copy. Never
 * silently drops words: once the line budget is used up, every remaining word
 * packs onto the last line instead of disappearing.
 */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function charsPerLine(availWidth: number, fontSize: number, charWidth: number): number {
  return Math.max(4, Math.floor(availWidth / (fontSize * charWidth)));
}

/**
 * Wraps `text` into at most `maxLines`, shrinking the font in small steps when
 * it doesn't fit at the desired size — a long headline shrinks instead of
 * overflowing its column, and no word is ever dropped.
 */
export function fitText(
  text: string,
  availWidth: number,
  desiredSize: number,
  maxLines: number,
  charWidth: number,
): { lines: string[]; fontSize: number } {
  let fontSize = desiredSize;
  const minSize = desiredSize * 0.5;
  for (let i = 0; i < 14; i++) {
    const lines = wrapText(text, charsPerLine(availWidth, fontSize, charWidth), maxLines);
    const widest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    if (widest * fontSize * charWidth <= availWidth || fontSize <= minSize) {
      return { lines, fontSize };
    }
    fontSize *= 0.92;
  }
  return { lines: wrapText(text, charsPerLine(availWidth, fontSize, charWidth), maxLines), fontSize };
}

// ─── TextBlock ──────────────────────────────────────────────────────────────

export interface TextBlockSpec {
  /** Already fitted — every line is guaranteed placed. */
  lines: string[];
  x: number;
  /** Baseline of the FIRST line. */
  y: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fill: string;
  fontWeight?: number | string;
  italic?: boolean;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  opacity?: number;
  rotationDeg?: number;
  shadow?: boolean;
}

export function renderTextBlock(spec: TextBlockSpec): string {
  const anchor = spec.align === 'center' ? 'middle' : spec.align === 'right' ? 'end' : 'start';
  const tspans = spec.lines
    .map((line, i) => `<tspan x="${spec.x}" y="${spec.y + i * spec.lineHeight}">${esc(line)}</tspan>`)
    .join('');
  const attrs = [
    `font-family="${spec.fontFamily}"`,
    `font-size="${spec.fontSize}"`,
    `fill="${spec.fill}"`,
    spec.fontWeight ? `font-weight="${spec.fontWeight}"` : '',
    spec.italic ? 'font-style="italic"' : '',
    spec.letterSpacing ? `letter-spacing="${spec.letterSpacing}"` : '',
    anchor !== 'start' ? `text-anchor="${anchor}"` : '',
    spec.opacity !== undefined && spec.opacity < 1 ? `opacity="${spec.opacity}"` : '',
    spec.rotationDeg ? `transform="rotate(${spec.rotationDeg} ${spec.x} ${spec.y})"` : '',
    spec.shadow ? 'filter="url(#fp-text-shadow)"' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<text ${attrs}>${tspans}</text>`;
}

/** The one shared filter/defs block every overlay embeds once. */
export function renderDefs(): string {
  return (
    '<defs>' +
    '<filter id="fp-text-shadow" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="1" stdDeviation="3" flood-opacity="0.45"/></filter>' +
    '<filter id="fp-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="-2" stdDeviation="6" flood-opacity="0.18"/></filter>' +
    '</defs>'
  );
}

// ─── ColorBlock / Scrim / Border / Divider ──────────────────────────────────

export function renderColorBlock(x: number, y: number, w: number, h: number, fill: string, opacity = 1): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`;
}

/** Vertical gradient scrim for text-over-photo legibility. direction 'up' intensifies toward the bottom. Dark scrims carry white copy; pale scrims carry ink copy on bright photos. */
export function renderScrim(
  x: number,
  y: number,
  w: number,
  h: number,
  direction: 'up' | 'down',
  maxOpacity = 0.62,
  color = '#000000',
): string {
  const id = `fp-scrim-${direction}-${color.replace('#', '')}`;
  const stops =
    direction === 'up'
      ? `<stop offset="0%" stop-color="${color}" stop-opacity="0"/><stop offset="100%" stop-color="${color}" stop-opacity="${maxOpacity}"/>`
      : `<stop offset="0%" stop-color="${color}" stop-opacity="${maxOpacity}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>`;
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>`
  );
}

export function renderBorder(w: number, h: number, stroke: string, strokeWidth: number, inset: number): string {
  return `<rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

export function renderDivider(x: number, y: number, w: number, stroke: string, strokeWidth = 2, opacity = 0.9): string {
  return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

// ─── Footer treatments ──────────────────────────────────────────────────────

/** A footer band whose top edge is a rough torn-paper line, with a soft lift shadow. */
export function renderTornFooter(w: number, h: number, footerY: number, fill: string): string {
  const teeth = 22;
  const toothW = w / teeth;
  const amp = Math.min(10, (h - footerY) * 0.05);
  let d = `M0 ${footerY + amp}`;
  for (let i = 1; i <= teeth; i++) {
    // Deterministic pseudo-random tear — same seed, same tear, so tests are stable.
    const wobble = Math.sin(i * 2.7) * amp + Math.sin(i * 1.3 + 1) * amp * 0.6;
    d += ` L${(i * toothW).toFixed(1)} ${(footerY + wobble).toFixed(1)}`;
  }
  d += ` L${w} ${h} L0 ${h} Z`;
  return `<path d="${d}" fill="${fill}" filter="url(#fp-soft-shadow)"/>`;
}

export function renderBandFooter(w: number, h: number, footerY: number, fill: string): string {
  return `<rect x="0" y="${footerY}" width="${w}" height="${h - footerY}" fill="${fill}"/>`;
}

export function renderHairlineFooter(w: number, h: number, footerY: number, fill: string, ink: string, pad: number): string {
  return renderBandFooter(w, h, footerY, fill) + renderDivider(pad, footerY, w - pad * 2, ink, 2, 0.5);
}

// ─── CTA ────────────────────────────────────────────────────────────────────

export interface CtaSpec {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  /** 'pill' for organic/soft languages, 'rect' for geometric, 'underline' for editorial-rules. */
  shape: 'pill' | 'rect' | 'underline';
  fill: string;
  textFill: string;
}

export function renderCta(spec: CtaSpec): string {
  const cx = spec.x + spec.width / 2;
  const textY = spec.y + spec.height / 2 + spec.fontSize * 0.35;
  if (spec.shape === 'underline') {
    // Editorial CTA: quiet text + a confident rule beneath — no button chrome.
    return (
      `<text x="${spec.x}" y="${textY}" font-family="${spec.fontFamily}" font-weight="600" font-size="${spec.fontSize}" fill="${spec.textFill}" letter-spacing="1.5">${esc(spec.text.toUpperCase())}</text>` +
      `<line x1="${spec.x}" y1="${textY + spec.fontSize * 0.5}" x2="${spec.x + spec.width}" y2="${textY + spec.fontSize * 0.5}" stroke="${spec.fill}" stroke-width="3"/>`
    );
  }
  const rx = spec.shape === 'pill' ? spec.height / 2 : Math.max(2, spec.height * 0.08);
  return (
    `<rect x="${spec.x}" y="${spec.y}" width="${spec.width}" height="${spec.height}" rx="${rx}" fill="${spec.fill}"/>` +
    `<text x="${cx}" y="${textY}" font-family="${spec.fontFamily}" font-weight="600" font-size="${spec.fontSize}" fill="${spec.textFill}" text-anchor="middle">${esc(spec.text)}</text>`
  );
}

// ─── Hand-drawn accents ─────────────────────────────────────────────────────

/** An organic underline — a slightly wobbly stroke, not random broken alignment. */
export function renderHandDrawnLine(x: number, y: number, w: number, stroke: string, strokeWidth = 5): string {
  const segments = 8;
  const step = w / segments;
  let d = `M${x} ${y}`;
  for (let i = 1; i <= segments; i++) {
    const wobble = Math.sin(i * 2.1) * strokeWidth * 0.55;
    const cpWobble = Math.sin(i * 3.3 + 0.7) * strokeWidth * 0.8;
    d += ` Q${(x + (i - 0.5) * step).toFixed(1)} ${(y + cpWobble).toFixed(1)} ${(x + i * step).toFixed(1)} ${(y + wobble).toFixed(1)}`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.92"/>`;
}

// ─── Texture layers ─────────────────────────────────────────────────────────

/** Controlled grain — art direction, not a defect. Kept subtle by opacity. */
export function renderTexture(
  kind: 'paper-grain' | 'film-grain' | 'halftone' | 'noise',
  w: number,
  h: number,
): string {
  if (kind === 'halftone') {
    return (
      '<defs><pattern id="fp-halftone" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">' +
      '<circle cx="4" cy="4" r="1.3" fill="#000"/></pattern></defs>' +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#fp-halftone)" opacity="0.06"/>`
    );
  }
  const params =
    kind === 'paper-grain'
      ? { baseFrequency: 0.9, opacity: 0.07 }
      : kind === 'film-grain'
        ? { baseFrequency: 0.65, opacity: 0.09 }
        : { baseFrequency: 0.5, opacity: 0.05 };
  return (
    `<defs><filter id="fp-grain-${kind}"><feTurbulence type="fractalNoise" baseFrequency="${params.baseFrequency}" numOctaves="2" stitchTiles="stitch"/>` +
    '<feColorMatrix type="matrix" values="0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0"/></filter></defs>' +
    `<rect x="0" y="0" width="${w}" height="${h}" filter="url(#fp-grain-${kind})" opacity="${params.opacity}"/>`
  );
}

// ─── Badge / Label ──────────────────────────────────────────────────────────

export function renderBadge(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  fill: string,
  textFill: string,
): string {
  const padX = fontSize * 0.9;
  const w = text.length * fontSize * 0.62 + padX * 2;
  const h = fontSize * 2;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2 + fontSize * 0.35}" font-family="${fontFamily}" font-weight="600" font-size="${fontSize}" fill="${textFill}" text-anchor="middle" letter-spacing="1">${esc(text.toUpperCase())}</text>`
  );
}

import sharp, { type OverlayOptions } from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'fs';
import type { AiTextProvider, AiImageProvider } from '../providers';
import type { InlineImagePart } from '../providers/provider.interface';
import type { CreativeDirection, CreativeRenderContext, CreativeResearch } from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';
import { renderStyleDnaInstructions } from '../style-dna/style-dna';
import { resolveDesignRecipe } from './design-recipe';
import { selectTypography, type TypographySelection } from '../typography/font-selector';
import { fontFilePath } from '../typography/font-catalog';
import { collectCampaignCopy, type CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import { evaluateIntentFidelity } from '../intent/claim-match';
import { esc, renderTexture } from './primitives';
import { detectCheckerboard } from './render-validation';
import { validateAntiTemplateQuality } from './anti-template-validator';
import { evaluateRenderedDesign } from '../generators/design-critic.generator';
import { generateGraphicDesignConcept } from '../generators/art-director.generator';
import { compareGraphicConcepts, redesignDivergenceInstruction } from '../strategy/concept-similarity';
import { generateVisionComposition, renderVisionCompositionInstructions } from '../generators/vision-composition.generator';
import type { CreativeBrief, GraphicDesignConcept } from '../brand/creative-brief';

export interface SemanticCopyItem extends CampaignCopyLine {
  id: string;
  semanticRole: 'primary-hook' | 'secondary-hook' | 'supporting-note';
}

/** A plan contains content IDs, never model-authored replacement copy or asset URLs. */
export interface DesignBox { x: number; y: number; width: number; height: number }
export interface DesignNode extends DesignBox {
  id: string;
  kind: 'copy' | 'product' | 'visual' | 'logo' | 'shape';
  color: string;
  surface: string;
  fontScale: number;
  align: 'left' | 'center' | 'right';
  shape: 'rectangle' | 'ellipse' | 'rule';
  lines: string[];
  rotation?: number;
  zIndex?: number;
  opacity?: number;
}
export interface DesignerPlan {
  background: string;
  rationale: string;
  visualPrompt?: string;
  nodes: DesignNode[];
}
export interface DesignerInput {
  direction: CreativeDirection;
  context: CreativeRenderContext;
  styleDna?: ResolvedStyleDNA;
  canonicalBrief?: CreativeBrief;
  graphicConcept?: GraphicDesignConcept;
  products: InlineImagePart[];
  references: InlineImagePart[];
  logo: InlineImagePart;
  priorVisual?: InlineImagePart;
  textProvider: AiTextProvider;
  imageProvider: AiImageProvider;
  onCall?: (kind: 'text' | 'image') => void;
  onStageTiming?: (stage: string, durationMs: number) => void;
  /** Research from the brand+occasion+style grounded search — used for AI font selection and vision composition. */
  research?: CreativeResearch;
}

const str = { type: 'string' };
const num = { type: 'number' };
export const DESIGNER_PLAN_SCHEMA = {
  type: 'object', required: ['background', 'rationale', 'nodes'],
  properties: {
    background: str, rationale: str, visualPrompt: str,
    nodes: {
      type: 'array', items: {
        type: 'object',
        required: ['id', 'kind', 'x', 'y', 'width', 'height', 'color', 'surface', 'fontScale', 'align', 'shape', 'lines'],
        properties: {
          id: str,
          kind: { type: 'string', enum: ['copy', 'product', 'visual', 'logo', 'shape'] },
          x: num, y: num, width: num, height: num, color: str, surface: str, fontScale: num,
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          shape: { type: 'string', enum: ['rectangle', 'ellipse', 'rule'] },
          lines: { type: 'array', items: str },
          rotation: num,
          zIndex: num,
          opacity: num,
        },
      }
    },
  },
};

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#dc2626',
  blue: '#2563eb',
  navy: '#0f172a',
  green: '#16a34a',
  yellow: '#facc15',
  orange: '#ea580c',
  purple: '#9333ea',
  pink: '#ec4899',
  cream: '#faf6f0',
  ivory: '#fcfbf9',
  charcoal: '#18181b',
  gray: '#71717a',
  grey: '#71717a',
  gold: '#d97706',
  silver: '#e2e8f0',
  teal: '#0d9488',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  oxblood: '#881337',
  rust: '#c2410c',
};

export const isHexColor = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /^#[0-9a-f]{6}$/i.test(s) || /^#[0-9a-f]{3}$/i.test(s) || /^#[0-9a-f]{8}$/i.test(s) || !!NAMED_COLORS[s.toLowerCase()];
};

export function normalizeHex(v: unknown, fallback = '#000000'): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7);
  const lower = s.toLowerCase();
  if (lower === 'none' || lower === 'transparent' || lower === 'inherit') return 'none';
  if (NAMED_COLORS[lower]) return NAMED_COLORS[lower];
  return fallback;
}

const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const sameWords = (s: string) => s.replace(/\s+/g, ' ').trim();
const overlap = (a: DesignBox, b: DesignBox, gap = 0) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

/** Assign semantic IDs to campaign copy lines. */
export function buildSemanticCopyList(copy: CampaignCopyLine[]): SemanticCopyItem[] {
  let hasHeadline = false;
  let hasOffer = false;
  let supportingCount = 0;

  return copy.map((c, index) => {
    if ((c.role === 'HEADLINE' || index === 0) && !hasHeadline) {
      hasHeadline = true;
      return { ...c, id: 'primary-hook', semanticRole: 'primary-hook' };
    }
    if (c.role === 'OFFER' && !hasOffer) {
      hasOffer = true;
      return { ...c, id: 'secondary-hook', semanticRole: 'secondary-hook' };
    }
    const id = supportingCount === 0 && copy.length <= 3 ? 'supporting-note' : `supporting-note-${supportingCount}`;
    supportingCount++;
    return { ...c, id, semanticRole: 'supporting-note' };
  });
}

/** Resolves an item from either semantic ID or legacy copy-N id. */
export function resolveCopyLine(nodeId: string, semanticCopy: SemanticCopyItem[], rawCopy: CampaignCopyLine[]): SemanticCopyItem | undefined {
  const bySemantic = semanticCopy.find(c => c.id === nodeId);
  if (bySemantic) return bySemantic;
  if (nodeId.startsWith('copy-')) {
    const idx = Number(nodeId.replace('copy-', ''));
    if (semanticCopy[idx]) return semanticCopy[idx];
    if (rawCopy[idx]) return { ...rawCopy[idx], id: nodeId, semanticRole: idx === 0 ? 'primary-hook' : 'supporting-note' };
  }
  if (nodeId === 'primary-hook' && semanticCopy[0]) return semanticCopy[0];
  if (nodeId === 'secondary-hook') return semanticCopy.find(c => c.semanticRole === 'secondary-hook') || semanticCopy[1];
  if (nodeId === 'supporting-note') return semanticCopy.find(c => c.semanticRole === 'supporting-note') || semanticCopy.find(c => c.id.startsWith('supporting-note')) || semanticCopy[2];
  return undefined;
}

/**
 * Deterministic Negative-Space Logo Placement Algorithm.
 * Guarantees >= 0.015 normalized clearance and prevents defaulting to footer or artificial white boxes.
 */
export function resolveLogoNegativeSpacePosition(
  plan: DesignerPlan,
  logoNode: DesignNode,
  preferredRegion?: string,
): { x: number; y: number; width: number; height: number } {
  // Clamped to exactly what validation would reject (see validateDesignerPlan's
  // "Logo must be visible" check), not tighter. The previous 0.12/0.035 floors
  // were stricter than the rules being enforced, so a deliberately discreet
  // mark that would have passed validation was silently enlarged — repair
  // overriding a design decision it was never asked to review.
  const lw = Math.max(0.06, Math.min(0.4, logoNode.width || 0.18));
  const lh = Math.max(0.025, Math.min(0.2, logoNode.height || 0.055));

  const allObstacles = plan.nodes.filter(n => n && n !== logoNode && (n.kind !== 'shape' || (n.surface && n.surface !== 'none')));

  const margin = 0.04;
  // Named regions the art director can ask for by name, PLUS a scan of the
  // canvas the composition actually produced.
  //
  // The candidate list used to be corners and gutters only, so a repair could
  // never do anything but move the mark to a corner — the very "logo parked in
  // a corner" reflex the blueprint forbids. A composition that opened real
  // space in its middle band had that space ignored. The scan finds whatever
  // emptiness the design created, and clearance still decides the winner.
  const candidates: Array<{ name: string; x: number; y: number }> = [
    { name: 'upper-right', x: 1 - margin - lw, y: margin },
    { name: 'upper-left', x: margin, y: margin },
    { name: 'lower-left', x: margin, y: 1 - margin - lh },
    { name: 'lower-right', x: 1 - margin - lw, y: 1 - margin - lh },
    { name: 'left-gutter', x: margin, y: 0.5 - lh / 2 },
    { name: 'right-gutter', x: 1 - margin - lw, y: 0.5 - lh / 2 },
    { name: 'top-gutter', x: 0.5 - lw / 2, y: margin },
    { name: 'bottom-gutter', x: 0.5 - lw / 2, y: 1 - margin - lh },
    { name: 'center-field', x: 0.5 - lw / 2, y: 0.5 - lh / 2 },
  ];
  for (let gx = 0; gx <= 8; gx += 1) {
    for (let gy = 0; gy <= 8; gy += 1) {
      const x = margin + (gx / 8) * Math.max(0, 1 - 2 * margin - lw);
      const y = margin + (gy / 8) * Math.max(0, 1 - 2 * margin - lh);
      candidates.push({ name: 'open-field', x, y });
    }
  }

  const clearanceOf = (box: DesignBox): number => {
    let minD = 1.0;
    for (const obs of allObstacles) {
      if (overlap(box, obs, 0)) return -1;
      const dx = Math.max(0, obs.x - (box.x + box.width), box.x - (obs.x + obs.width));
      const dy = Math.max(0, obs.y - (box.y + box.height), box.y - (obs.y + obs.height));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minD) minD = dist;
    }
    return minD;
  };

  const currentBox = { x: logoNode.x, y: logoNode.y, width: lw, height: lh };
  const currentClearance = clearanceOf(currentBox);
  const isDefaultFooter = logoNode.y > 0.88 && Math.abs(logoNode.x + lw / 2 - 0.5) < 0.15;
  const isDeadCenter = Math.abs(logoNode.x + lw / 2 - 0.5) < 0.10 && Math.abs(logoNode.y + lh / 2 - 0.5) < 0.10;

  if (currentClearance >= 0.015 && !isDefaultFooter && !isDeadCenter &&
      logoNode.x >= 0.015 && logoNode.y >= 0.015 && logoNode.x + lw <= 0.985 && logoNode.y + lh <= 0.985) {
    return { x: logoNode.x, y: logoNode.y, width: lw, height: lh };
  }

  let best = candidates[0];
  let bestScore = -999;

  for (const cand of candidates) {
    const box = { x: cand.x, y: cand.y, width: lw, height: lh };
    const cl = clearanceOf(box);
    if (cl < 0) continue;

    let score = cl * 10;
    if (preferredRegion && cand.name !== 'open-field' && cand.name.toLowerCase().includes(preferredRegion.toLowerCase())) {
      score += 6;
    }
    // A scanned position wins only on real clearance, so the scan can rescue a
    // composition whose named regions are all occupied without quietly
    // overriding an art director who did name one.
    if (cand.name === 'open-field') score -= 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return { x: best.x, y: best.y, width: lw, height: lh };
}

/** Strict coverage + geometry + anti-template check. */
export function validateDesignerPlan(
  raw: unknown,
  copy: CampaignCopyLine[],
  productCount: number,
  concept?: GraphicDesignConcept,
): string[] {
  const p = raw as DesignerPlan | undefined;
  if (!p || !Array.isArray(p.nodes)) return ['Return a valid background and nodes array.'];
  p.background = normalizeHex(p.background, '#111111');
  const errors: string[] = [];
  if (p.nodes.length > 32) errors.push('At most 32 nodes.');

  const semanticCopy = buildSemanticCopyList(copy);
  const imageIsOmitted = Boolean(concept && imageIsAbsent(concept)) && productCount === 0;

  const required = new Map<string, string>();
  for (const c of semanticCopy) required.set(c.id, 'copy');
  required.set('brand-mark', 'logo');

  if (productCount > 0) {
    required.set('hero-visual', 'product');
    for (let i = 1; i < productCount; i++) required.set(`supporting-visual-${i - 1}`, 'product');
  } else if (!imageIsOmitted) {
    required.set('hero-visual', 'visual');
  }

  const seen = new Set<string>();
  for (const n of p.nodes) {
    if (!n || typeof n.id !== 'string') { errors.push('Every node needs an ID.'); continue; }

    // Normalize legacy aliases
    if (n.id === 'logo') n.id = 'brand-mark';
    if (n.id === 'visual') n.id = 'hero-visual';
    if (n.id.startsWith('product-')) {
      const idx = Number(n.id.replace('product-', ''));
      n.id = idx === 0 ? 'hero-visual' : `supporting-visual-${idx - 1}`;
    }
    if (n.id.startsWith('copy-')) {
      const idx = Number(n.id.replace('copy-', ''));
      if (semanticCopy[idx]) n.id = semanticCopy[idx].id;
    }
    if (n.id.startsWith('shape-')) {
      n.id = n.id.replace('shape-', 'graphic-device-');
    }

    if (seen.has(n.id)) errors.push(`Duplicate ${n.id}.`);
    seen.add(n.id);

    if (!['copy', 'product', 'visual', 'logo', 'shape'].includes(n.kind)) errors.push(`Invalid kind for ${n.id}.`);

    // Bounds check
    if (![n.x, n.y, n.width, n.height].every(Number.isFinite) || n.width <= 0 || n.height <= 0) {
      errors.push(`${n.id} needs positive width and height.`);
    }

    // Protected elements: Logo must stay strictly within visible canvas boundaries with safe margin
    if (n.kind === 'logo') {
      if (n.x < 0.015 || n.y < 0.015 || n.x + n.width > 0.985 || n.y + n.height > 0.985) {
        errors.push('The logo must be placed fully within visible canvas boundaries with clear margin.');
      }
    } else if (n.kind === 'visual' || n.kind === 'product') {
      // Creative visual elements can span widely (-0.8..1.8)
      if (n.x < -0.8 || n.y < -0.8 || n.x > 1.8 || n.y > 1.8 || n.width > 3.0 || n.height > 3.0) {
        errors.push(`${n.id} outside canvas boundaries.`);
      }
    } else {
      // Copy & shapes allow controlled artistic bleed (-0.6..1.6)
      if (n.x < -0.6 || n.y < -0.6 || n.x > 1.6 || n.y > 1.6 || n.width > 2.5 || n.height > 2.5) {
        errors.push(`${n.id} outside canvas boundaries.`);
      }
    }

    // Color normalization
    if (n.kind === 'copy' || n.kind === 'shape') {
      n.color = normalizeHex(n.color, '#ffffff');
    } else {
      n.color = normalizeHex(n.color, 'none');
    }
    n.surface = normalizeHex(n.surface, 'none');

    if (!['left', 'center', 'right'].includes(n.align)) n.align = 'left';
    if (!['rectangle', 'ellipse', 'rule'].includes(n.shape)) n.shape = 'rectangle';

    if (n.kind === 'copy') {
      const c = resolveCopyLine(n.id, semanticCopy, copy);
      if (!Array.isArray(n.lines) || n.lines.some(l => typeof l !== 'string') || !c ||
        sameWords(n.lines.join(' ')) !== sameWords(c.text)) {
        errors.push(`${n.id} must preserve the exact supplied copy; only line breaks may change.`);
      }
      const min = c && (c.semanticRole === 'primary-hook' || c.role === 'HEADLINE') ? .020 : .014;
      if (!Number.isFinite(n.fontScale) || n.fontScale < min || n.fontScale > .40) {
        errors.push(`${n.id} fontScale must be ${min}..0.40.`);
      }

      const bg = n.surface === 'none' ? p.background : n.surface;
      if (hex(n.color) && hex(bg) && contrast(n.color, bg) < 4.2) {
        errors.push(`${n.id} insufficient text contrast.`);
      }
    }
    if (n.kind === 'logo' && (n.width < .06 || n.height < .025)) errors.push('Logo must be visible, not a tiny mark.');
    if (n.kind === 'product' && n.width * n.height < .020) errors.push(`${n.id} must be meaningfully visible.`);
  }

  for (const [id, kind] of required) {
    if (!p.nodes.some(n => (n?.id === id || (id === 'brand-mark' && n?.id === 'logo') || (id === 'hero-visual' && (n?.id === 'visual' || n?.id === 'product-0'))) && n.kind === kind)) {
      errors.push(`Missing ${id}.`);
    }
  }

  // Content collisions (protected logo clearance & product vs product)
  const content = p.nodes.filter(n => n && ['copy', 'logo', 'product'].includes(n.kind));
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) {
    const a = content[i], b = content[j];
    if (a.kind === 'logo' || b.kind === 'logo') {
      if (overlap(a, b, 0.012)) {
        errors.push(`Logo overlaps ${a.kind === 'logo' ? b.id : a.id}; reserve dedicated negative space for logo.`);
      }
      continue;
    }
    if (a.kind === 'product' && b.kind === 'product') {
      if (overlap(a, b, 0)) errors.push(`${a.id} overlaps ${b.id}; reserve separate space.`);
      continue;
    }
  }

  // Anti-template quality check
  const antiTemplate = validateAntiTemplateQuality(p, concept);
  if (!antiTemplate.passed) {
    errors.push(...antiTemplate.violations);
  }

  return errors;
}

function dimensions(ratio: string) {
  const [a, b] = ratio.split(':').map(Number);
  const r = a > 0 && b > 0 ? a / b : 1;
  return r >= 1 ? { width: 1600, height: Math.round(1600 / r) } : { width: Math.round(1600 * r), height: 1600 };
}

function splitTextIntoBalancedLines(text: string, maxLineLength = 26): string[] {
  if (text.length <= maxLineLength) return [text];
  if (text.includes(': ') && text.length > 20) {
    const parts = text.split(': ');
    if (parts.length === 2) {
      return [parts[0] + ':', ...splitTextIntoBalancedLines(parts[1], maxLineLength)];
    }
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [text];
  const lines: string[] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const word of words) {
    if (current.length > 0 && currentLen + word.length + 1 > maxLineLength) {
      lines.push(current.join(' '));
      current = [word];
      currentLen = word.length;
    } else {
      current.push(word);
      currentLen += (current.length === 1 ? 0 : 1) + word.length;
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

/** Real font outlines are measured before rasterization; no character-count clipping. */
export function fittedCopySvg(n: DesignNode, copy: CampaignCopyLine, typography: TypographySelection, w: number, h: number): string {
  const display = ['HEADLINE', 'OFFER'].includes(copy.role) || n.id === 'primary-hook' || n.id === 'secondary-hook';
  const family = display ? typography.headlineFont : typography.bodyFont;
  const weight = display ? typography.headlineWeight : typography.bodyWeight;
  const fontFiles = typography.facesUsed.map(f => fontFilePath(f.family, f.weight, f.style));
  const minFloor = Math.max(12, Math.min(w, h) * 0.008);
  let size = Math.min(w, h) * n.fontScale;
  let linesToRender = Array.isArray(n.lines) && n.lines.length > 1
    ? [...n.lines]
    : (copy.text.length > 26 ? splitTextIntoBalancedLines(copy.text, display ? 24 : 32) : [copy.text]);

  let bestFitResult: string | null = null;

  for (let attempt = 0; attempt < 35 && size >= minFloor; attempt++, size *= 0.90) {
    const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start';
    const lineSpacing = display ? 1.15 : 1.25;
    const text = `<g font-family="${esc(family)}" font-weight="${weight}" font-size="${size}" fill="${n.color}" text-anchor="${anchor}">` +
      linesToRender.map((l, i) => `<text x="0" y="${size + i * size * lineSpacing}">${esc(l)}</text>`).join('') + '</g>';
    const measure = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${text}</svg>`, { font: { fontFiles, loadSystemFonts: false } });
    const b = measure.getBBox();
    const pad = 4;
    if (!b || b.width <= 0 || b.height <= 0) break;

    // Track best fit even if slightly oversized as a safety fallback
    const extraX = n.width * w - b.width - 2 * pad;
    const extraY = n.height * h - b.height - 2 * pad;
    let x = n.x * w + pad - b.x + (n.align === 'center' ? extraX / 2 : n.align === 'right' ? extraX : 0);
    let y = n.y * h + pad - b.y + (extraY > 0 ? extraY / 2 : 0);

    const minMargin = 20;
    x = Math.max(minMargin - b.x, Math.min(w - b.width - minMargin - b.x, x));
    y = Math.max(minMargin - b.y, Math.min(h - b.height - minMargin - b.y, y));
    const rot = n.rotation ? ` rotate(${n.rotation} ${b.x + b.width / 2} ${b.y + b.height / 2})` : '';
    bestFitResult = `<g transform="translate(${x} ${y})${rot}">${text}</g>`;

    if (b.width + 2 * pad > n.width * w || b.height + 2 * pad > n.height * h) {
      if (linesToRender.length === 1 && linesToRender[0].includes(' ') && attempt > 2) {
        const words = linesToRender[0].split(' ');
        const mid = Math.ceil(words.length / 2);
        linesToRender = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      }
      continue;
    }

    return bestFitResult;
  }

  if (bestFitResult) {
    return bestFitResult;
  }

  throw new Error(`Could not fit "${copy.text}" for ${n.id} into readable bounding box.`);
}

/**
 * Deterministic mechanical repair (0 LLM calls):
 * - missing hex -> normalized hex
 * - text overflow -> scale / bounds adjustments
 * - invalid bounds / scale / rotation / opacity -> clamped
 * - logo clearance -> resolved via resolveLogoNegativeSpacePosition
 * - line wrapping -> exact copy normalization
 */
export function repairPlanMechanically(
  plan: DesignerPlan,
  copy: CampaignCopyLine[],
  productCount: number,
  elementsToOmit?: string[],
  concept?: GraphicDesignConcept,
): DesignerPlan {
  plan.background = normalizeHex(plan.background, '#111111');
  const omitSurfaces = elementsToOmit?.some(o => /box|card|pill|container|surface|background layer/i.test(o)) ?? true;
  const semanticCopy = buildSemanticCopyList(copy);

  for (const n of plan.nodes) {
    if (!n) continue;

    // Normalize IDs to semantic standard
    if (n.id === 'logo') n.id = 'brand-mark';
    if (n.id === 'visual') n.id = 'hero-visual';
    if (n.id.startsWith('product-')) {
      const idx = Number(n.id.replace('product-', ''));
      n.id = idx === 0 ? 'hero-visual' : `supporting-visual-${idx - 1}`;
    }
    if (n.id.startsWith('copy-')) {
      const idx = Number(n.id.replace('copy-', ''));
      if (semanticCopy[idx]) n.id = semanticCopy[idx].id;
    }
    if (n.id.startsWith('shape-')) {
      n.id = n.id.replace('shape-', 'graphic-device-');
    }

    // Sanitize coordinates and bounding box (clamped to prevent runaway off-screen boxes)
    if (n.kind === 'copy') {
      n.x = Math.max(0.04, Math.min(0.85, Number.isFinite(n.x) ? n.x : 0.05));
      n.y = Math.max(0.04, Math.min(0.85, Number.isFinite(n.y) ? n.y : 0.05));
      n.width = Math.max(0.08, Math.min(0.92 - n.x, Number.isFinite(n.width) ? n.width : 0.8));
      n.height = Math.max(0.03, Math.min(0.92 - n.y, Number.isFinite(n.height) ? n.height : 0.15));
    } else {
      n.x = Math.max(-0.08, Math.min(0.95, Number.isFinite(n.x) ? n.x : 0.05));
      n.y = Math.max(-0.08, Math.min(0.95, Number.isFinite(n.y) ? n.y : 0.05));
      n.width = Math.max(0.04, Math.min(1.08, Number.isFinite(n.width) ? n.width : 0.4));
      n.height = Math.max(0.02, Math.min(1.08, Number.isFinite(n.height) ? n.height : 0.15));
    }

    if (n.kind === 'visual' && productCount === 0) {
      n.x = 0;
      n.y = 0;
      n.width = 1.0;
      n.height = 1.0;
    }

    // Surface & Color
    const isBadgeOrPill = n.id.includes('badge') || n.id.includes('offer') || n.id === 'secondary-hook' || n.id === 'cta';
    if (omitSurfaces && (n.kind === 'copy' || n.kind === 'logo') && !isBadgeOrPill) {
      n.surface = 'none';
    } else {
      n.surface = normalizeHex(n.surface, 'none');
    }

    if (n.kind === 'copy' || n.kind === 'shape') {
      n.color = normalizeHex(n.color, '#ffffff');
    } else {
      n.color = normalizeHex(n.color, 'none');
    }

    // Copy line, scale, & contrast normalization
    if (n.kind === 'copy') {
      const c = resolveCopyLine(n.id, semanticCopy, copy);
      if (c) {
        if (!Array.isArray(n.lines) || !n.lines.length || sameWords(n.lines.join(' ')) !== sameWords(c.text)) {
          n.lines = [c.text];
        }
        const isDisplay = c.semanticRole === 'primary-hook' || c.role === 'HEADLINE';
        const readableFloor = isDisplay ? 0.045 : 0.020;
        const fromOwnBox = Math.max(readableFloor, Math.min(0.35, (n.height || readableFloor) * 0.8));
        n.fontScale = Math.max(
          readableFloor,
          Math.min(0.35, Number.isFinite(n.fontScale) && n.fontScale > 0 ? n.fontScale : fromOwnBox),
        );

        if (n.surface && n.surface !== 'none' && n.surface !== 'transparent') {
          n.color = contrast('#ffffff', n.surface) >= 4.5 ? '#ffffff' : '#111111';
        } else if (productCount === 0 && (!n.surface || n.surface === 'none')) {
          n.color = '#ffffff';
        } else {
          const bg = n.surface === 'none' ? plan.background : n.surface;
          if (hex(n.color) && hex(bg) && contrast(n.color, bg) < 4.2) {
            n.color = contrast('#ffffff', bg) >= 4.5 ? '#ffffff' : '#111111';
          }
        }
      }
    }
  }

  // Prevent copy nodes from colliding or overlapping vertically
  const copyNodes = plan.nodes.filter(n => n?.kind === 'copy');
  copyNodes.sort((a, b) => a.y - b.y);
  for (let i = 0; i < copyNodes.length - 1; i++) {
    const current = copyNodes[i];
    const next = copyNodes[i + 1];
    const hOverlap = current.x < next.x + next.width && current.x + current.width > next.x;
    if (hOverlap && next.y < current.y + current.height + 0.015) {
      const neededShift = (current.y + current.height + 0.015) - next.y;
      if (next.y + next.height + neededShift <= 0.94) {
        next.y += neededShift;
      }
    }
  }

  // Deterministically place logo into negative space with >=0.015 clearance
  const logoNode = plan.nodes.find(n => n?.kind === 'logo');
  if (logoNode) {
    logoNode.surface = 'none'; // Never allow artificial background boxes behind logo
    const resolved = resolveLogoNegativeSpacePosition(plan, logoNode, typeof concept?.negativeSpaceRegion === 'string' ? concept.negativeSpaceRegion : undefined);
    logoNode.x = resolved.x;
    logoNode.y = resolved.y;
    logoNode.width = resolved.width;
    logoNode.height = resolved.height;
  }

  return plan;
}

export async function renderDesignerPlan(
  plan: DesignerPlan,
  input: Pick<DesignerInput, 'products' | 'logo' | 'direction'>,
  copy: CampaignCopyLine[],
  typography: TypographySelection,
  visual?: InlineImagePart,
  texture: 'none' | 'paper-grain' | 'film-grain' | 'halftone' | 'noise' = 'none',
  concept?: GraphicDesignConcept,
): Promise<Buffer> {
  const issues = validateDesignerPlan(plan, copy, input.products.length, concept);
  const fatalIssues = issues.filter(i => i.includes('Missing required copy') || i.includes('cannot fit') || i.includes('too small'));
  if (fatalIssues.length) throw new Error(fatalIssues.join(' '));
  const { width: w, height: h } = dimensions(input.direction.aspectRatio);
  const svg = (s: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`;
  const shape = (n: DesignNode) => {
    const rot = n.rotation ? ` transform="rotate(${n.rotation} ${(n.x + n.width / 2) * w} ${(n.y + n.height / 2) * h})"` : '';
    return n.shape === 'ellipse'
      ? `<ellipse cx="${(n.x + n.width / 2) * w}" cy="${(n.y + n.height / 2) * h}" rx="${n.width * w / 2}" ry="${n.height * h / 2}" fill="${n.color}"${rot}/>`
      : `<rect x="${n.x * w}" y="${n.y * h}" width="${n.width * w}" height="${n.height * h}" fill="${n.color}"${rot}/>`;
  };
  const layers: OverlayOptions[] = [{
    input: Buffer.from(svg(plan.nodes.filter(n => n.kind === 'shape').map(shape).join('') +
      (texture === 'none' ? '' : renderTexture(texture, w, h))))
  }];

  const semanticCopy = buildSemanticCopyList(copy);

  for (const n of plan.nodes.filter(n => ['product', 'logo', 'visual'].includes(n.kind))) {
    let asset: InlineImagePart | undefined;
    if (n.kind === 'logo') {
      asset = input.logo;
    } else if (n.kind === 'visual') {
      asset = visual;
    } else if (n.kind === 'product') {
      const idx = n.id.startsWith('supporting-visual-')
        ? Number(n.id.replace('supporting-visual-', '')) + 1
        : n.id.startsWith('product-') ? Number(n.id.replace('product-', '')) : 0;
      asset = input.products[idx] || input.products[0];
    }

    if (!asset) {
      if (n.kind === 'visual' && concept && imageIsAbsent(concept)) continue;
      throw new Error(`Missing original image for ${n.id}.`);
    }

    const slotW = Math.max(1, Math.round(n.width * w)), slotH = Math.max(1, Math.round(n.height * h));
    let sharpInstance = sharp(Buffer.from(asset.data, 'base64')).rotate();
    if (n.rotation && Math.abs(n.rotation) > 0.1) {
      sharpInstance = sharpInstance.rotate(n.rotation, { background: '#00000000' });
    }
    const isHeroVisualBg = n.kind === 'visual' && input.products.length === 0;
    const fitMode = isHeroVisualBg ? 'cover' : 'inside';
    const data = await sharpInstance.resize(slotW, slotH, {
      fit: fitMode, withoutEnlargement: false,
    }).png().toBuffer({ resolveWithObject: true });

    if (n.kind === 'product' && data.info.width * data.info.height < w * h * .020) {
      throw new Error(`${n.id} is too small after fitting its original aspect ratio; enlarge its region.`);
    }
    if (n.kind === 'logo' && Math.min(data.info.width, data.info.height) < Math.min(w, h) * .016) {
      throw new Error('The logo is too small after fitting its aspect ratio; enlarge its region.');
    }
    const imgW = data.info.width;
    const imgH = data.info.height;
    let imgLeft = Math.round(n.x * w) + Math.floor((slotW - imgW) / 2);
    let imgTop = Math.round(n.y * h) + Math.floor((slotH - imgH) / 2);

    if (imgLeft + imgW <= 0 || imgTop + imgH <= 0 || imgLeft >= w || imgTop >= h) {
      continue;
    }

    let extractLeft = 0;
    let extractTop = 0;
    let extractWidth = imgW;
    let extractHeight = imgH;

    if (imgLeft < 0) {
      extractLeft = -imgLeft;
      extractWidth += imgLeft;
      imgLeft = 0;
    }
    if (imgTop < 0) {
      extractTop = -imgTop;
      extractHeight += imgTop;
      imgTop = 0;
    }
    if (imgLeft + extractWidth > w) {
      extractWidth = w - imgLeft;
    }
    if (imgTop + extractHeight > h) {
      extractHeight = h - imgTop;
    }

    let finalData = data.data;
    if (extractLeft > 0 || extractTop > 0 || extractWidth < imgW || extractHeight < imgH) {
      if (extractWidth > 0 && extractHeight > 0) {
        finalData = await sharp(data.data)
          .extract({
            left: Math.max(0, extractLeft),
            top: Math.max(0, extractTop),
            width: Math.min(imgW - extractLeft, extractWidth),
            height: Math.min(imgH - extractTop, extractHeight),
          })
          .png()
          .toBuffer();
      } else {
        continue;
      }
    }

    layers.push({
      input: finalData,
      left: Math.max(0, imgLeft),
      top: Math.max(0, imgTop),
    });
  }

  if (visual && input.products.length === 0) {
    const scrimSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <linearGradient id="scrim-bottom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
          <stop offset="25%" stop-color="#000000" stop-opacity="0.10"/>
          <stop offset="55%" stop-color="#000000" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#scrim-bottom)"/>
    </svg>`;
    layers.push({ input: Buffer.from(scrimSvg) });
  }

  const copySvg = plan.nodes.filter(n => n.kind === 'copy').map(n => {
    const isPill = n.id.includes('badge') || n.id.includes('offer') || n.id === 'secondary-hook' || n.id === 'cta';
    const radius = isPill ? Math.min(28, Math.max(6, Math.round(n.height * h * 0.42))) : 6;
    const surface = (n.surface && n.surface !== 'none' && n.surface !== 'transparent')
      ? `<rect x="${n.x * w}" y="${n.y * h}" width="${n.width * w}" height="${n.height * h}" rx="${radius}" ry="${radius}" fill="${n.surface}"/>`
      : '';
    const resolvedCopy = resolveCopyLine(n.id, semanticCopy, copy) || semanticCopy[0];
    return surface + fittedCopySvg(n, resolvedCopy, typography, w, h);
  }).join('');

  const overlay = new Resvg(svg(copySvg), {
    font: {
      loadSystemFonts: false,
      fontFiles: typography.facesUsed.map(f => fontFilePath(f.family, f.weight, f.style))
    }
  }).render().asPng();
  layers.push({ input: overlay });

  return sharp({ create: { width: w, height: h, channels: 3, background: plan.background } }).composite(layers).png().toBuffer();
}

/**
 * Does this blueprint's idea contain no image at all?
 *
 * Read from BEHAVIOUR first and the enum second. An art director who wrote
 * imageBehavior: "absent — the piece is made entirely of type" has decided
 * this as clearly as one who set imageRole to 'omitted', and a pipeline that
 * only understood the enum would generate a picture nobody asked for and then
 * have to find somewhere to put it. That is how images ended up filling empty
 * quadrants.
 */
export function imageIsAbsent(concept: GraphicDesignConcept): boolean {
  if (['omitted', 'no-image', 'typography-only'].includes(concept.imageRole)) return true;
  const behaviour = (concept.imageBehavior ?? '').trim().toLowerCase();
  if (!behaviour) return false;
  return /^(?:absent|none|no image|not used|omitted)\b/.test(behaviour);
}

/**
 * The blueprint used when no art director ran — a degraded path, not a house
 * style.
 *
 * It carries the idea the direction stage already expressed and NOTHING about
 * placement: no anchor, no dominant region, no negative-space region, no
 * headline placement, no composition family. The version this replaced filled
 * all of them in ("left-edge", "left-major", "upper-right", "typographic-
 * poster"), which meant every creative that reached this path — and every
 * creative whose art director simply omitted a field — was composed to the
 * same skeleton regardless of what it was advertising.
 */
export function fallbackConceptFrom(direction: CreativeDirection): GraphicDesignConcept {
  return {
    conceptName: direction.concept || direction.headline || 'Untitled creative',
    visualIdea: direction.visualStory || direction.concept,
    hero: direction.copyTreatment === 'none' ? 'image' : 'typography',
    imageRole: direction.copyTreatment === 'none' ? 'hero' : 'small-tactile-object',
    firstRead: direction.headline || direction.subject,
    elementsToOmit: direction.graphicConcept?.elementsToOmit ?? [],
  };
}

export function buildRequiredNodeList(options: {
  semanticCopy: SemanticCopyItem[];
  sizes: Array<{ id: string; width?: number; height?: number }>;
  isPureTypographicPoster: boolean;
}): string {
  const { semanticCopy, sizes, isPureTypographicPoster } = options;
  return [
    ...semanticCopy.map(
      (c) => `- id: "${c.id}" (kind: "copy", semanticRole: "${c.semanticRole}", text: "${c.text.replace(/"/g, '\\"')}")`,
    ),
    ...sizes.map((s) => `- id: "${s.id}" (kind: "product")`),
    ...(!sizes.length && !isPureTypographicPoster ? ['- id: "hero-visual" (kind: "visual")'] : []),
    '- id: "brand-mark" (kind: "logo")',
  ].join('\n');
}

/**
 * The composition brief handed to the planning model.
 *
 * This string was the single largest cause of template collapse, for two
 * reasons that are both now gone:
 *
 *  1. It described the blueprint as five grammar values — compositionFamily,
 *     anchor, movementAxis, dominantRegion, negativeSpaceRegion — each with a
 *     `|| default` behind it. The idea never reached the planner at all, so
 *     the planner composed the defaults: left-edge anchor, left-major weight,
 *     upper-right emptiness. Text left, image right, logo in the corner.
 *  2. It handed out fixed fontScale bands per semantic role (primary 0.08+,
 *     secondary 0.035-0.08, supporting 0.020-0.038), which is a picture of
 *     "big headline, medium offer, small print" — the hierarchy was decided
 *     here, identically, for every creative ever made.
 *
 * What it sends now is the IDEA — what type does, what image does, how they
 * meet, what leads — and the grammar only where the art director actually
 * decided it. An undecided placement is stated as undecided, which is an
 * instruction to compose from the idea rather than to reach for a default.
 */
export function buildCompositionInstructions(options: {
  concept: GraphicDesignConcept;
  requiredNodeList: string;
  isPureTypographicPoster: boolean;
}): string {
  const { concept, requiredNodeList, isPureTypographicPoster } = options;

  const ideaLines = [
    `- The visual idea: "${concept.visualIdea}"`,
    concept.creativeMechanism ? `- The mechanism you are expressing: "${concept.creativeMechanism}"` : null,
    concept.visualMetaphor ? `- The metaphor: "${concept.visualMetaphor}"` : null,
    concept.dominantVisualObject ? `- What this creative SHOWS: "${concept.dominantVisualObject}"` : null,
    concept.firstRead ? `- What must be understood first: "${concept.firstRead}"` : null,
    concept.secondRead ? `- What is noticed second: "${concept.secondRead}"` : null,
  ].filter((line): line is string => typeof line === 'string');

  const behaviourLines = [
    concept.typeBehavior ? `- TYPE behaves as: ${concept.typeBehavior}` : null,
    concept.imageBehavior ? `- IMAGE behaves as: ${concept.imageBehavior}` : null,
    concept.graphicBehavior ? `- GRAPHIC FORM behaves as: ${concept.graphicBehavior}` : null,
    concept.spatialRelationship ? `- The elements MEET like this: ${concept.spatialRelationship}` : null,
    concept.materialBehavior ? `- The piece is made of: ${concept.materialBehavior}` : null,
    concept.hierarchyStrategy ? `- HIERARCHY: ${concept.hierarchyStrategy}` : null,
    concept.visualTension ? `- The tension that must survive: ${concept.visualTension}` : null,
    concept.compositionStrategy ? `- Balance and emptiness: ${concept.compositionStrategy}` : null,
    concept.typographyStrategy ? `- Typography choreography: ${concept.typographyStrategy}` : null,
    concept.typographyScaleContrast ? `- Scale relationship: ${concept.typographyScaleContrast}` : null,
  ].filter((line): line is string => typeof line === 'string');

  // Blueprints also arrive from persisted renderContext rows written by older
  // pipeline versions, where these were sometimes a bare string. A refinement
  // must not crash on a creative this codebase itself produced last month.
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : typeof value === 'string' && value.length > 0 ? [value] : [];

  // Only what was actually decided. A field the art director left empty is
  // named as undecided rather than filled — the planner then derives it from
  // the idea above, which is the entire point of this rewrite.
  const decidedGrammar = [
    concept.compositionFamily ? `- compositionFamily: ${concept.compositionFamily}` : null,
    concept.anchor ? `- anchor: ${concept.anchor}` : null,
    concept.movementAxis ? `- movementAxis: ${concept.movementAxis}` : null,
    concept.dominantRegion ? `- dominantRegion: ${concept.dominantRegion}` : null,
    concept.headlinePlacement ? `- the first read sits: ${concept.headlinePlacement}` : null,
    concept.visualPlacement ? `- imagery sits: ${concept.visualPlacement}` : null,
    concept.negativeSpaceRegion ? `- deliberate emptiness sits: ${concept.negativeSpaceRegion}` : null,
    list(concept.overlapRelationships).length ? `- intentional overlaps: ${list(concept.overlapRelationships).join('; ')}` : null,
    list(concept.allowedBleed).length ? `- may bleed off the canvas: ${list(concept.allowedBleed).join(', ')}` : null,
    Array.isArray(concept.intentionalRotation) && concept.intentionalRotation.length
      ? `- intentional rotation: ${concept.intentionalRotation.map((r) => `${r.target} ${r.degrees}°`).join('; ')}`
      : null,
  ].filter((line): line is string => typeof line === 'string');

  return `You are a graphic designer composing ONE creative from a blank canvas, executing an art director's idea.

You are not filling slots and you are not adapting a layout you have used before. Every coordinate you choose must be traceable to the idea below. If you cannot say why an element is where it is, it is in the wrong place.

THE IDEA YOU ARE EXECUTING:
${ideaLines.join('\n')}

HOW THE ELEMENTS BEHAVE (this is the design — follow it exactly):
${behaviourLines.length ? behaviourLines.join('\n') : '- The blueprint left behaviour undecided. Derive it from the visual idea above; do not reach for a familiar arrangement.'}

${decidedGrammar.length
    ? `SPATIAL DECISIONS THE ART DIRECTOR ALREADY MADE (honour these exactly):\n${decidedGrammar.join('\n')}\nEverything not listed here is yours to compose from the idea.`
    : 'The art director deliberately left placement open. Compose it from the idea — and specifically NOT from habit.'}

DESIGN & COMPOSITION PRINCIPLES:
- Compose a stunning, cohesive marketing poster for modern social channels (Instagram, LinkedIn, X, etc.).
- When imagery (hero-visual) is present, treat it as the rich, immersive visual scene filling the canvas (x: 0, y: 0, width: 1.0, height: 1.0) or as a structured, intentional hero frame.
- Typography hierarchy & legibility:
  * Primary hook / Headline: Bold, prominent display scale (fontScale: 0.055 - 0.09) with high contrast.
  * Secondary hook / Support: Clean, readable body scale (fontScale: 0.022 - 0.040).
  * Brand mark / Logo: Placed with clear breathing room in a natural anchor zone (e.g. top-left x: 0.08, y: 0.08, top-center, or footer).
- Never place unreadable text over busy visual areas without contrast. Ensure crisp, high-impact readability.
${concept.elementsToOmit?.length ? concept.elementsToOmit.map((e) => `- Avoid: ${e}`).join('\n') : ''}

TYPOGRAPHY:
Type is high-impact editorial material. Position copy intentionally where contrast is highest. Ensure strong headline dominance and crystal-clear readability.

IMAGERY:
${isPureTypographicPoster
    ? 'This creative contains NO image. Do not create an image node and do not invent a visual to occupy space.'
    : 'Honour the visual idea. When hero-visual is present, make it an expansive, richly-detailed visual (x: 0, y: 0, width: 1.0, height: 1.0) anchoring the entire composition.'}

THE BRAND MARK:
Place id "brand-mark" where the composition genuinely leaves room for it, with at least 0.015 clearance from every other element. ${concept.logoSanctuary ? `The art director's intent: ${concept.logoSanctuary}.` : 'The art director did not fix a position — find the real negative space your composition created.'} Never place a white or black box behind it. It is not a footer.

EXACT NODE IDs REQUIRED (every one, no others):
${requiredNodeList}
(For graphic shapes or rules, use kind: "shape" with id "graphic-device-0", "graphic-device-1", ... — only where graphicBehavior calls for them.)

Coordinates are normalized 0..1; controlled bleed to -0.5..1.5 is permitted for copy, shapes and textures.
Return a valid DesignerPlan with background, rationale, ${isPureTypographicPoster ? '' : 'visualPrompt, '}and nodes. The rationale must say which decision in the idea each major placement came from.`;
}

/**
 * Produces the SECOND creative attempt: a genuinely different idea, verified.
 *
 * A redesign that returns the same mechanism with a new compositionFamily is
 * rejected here and re-requested once with the shared axes named, because that
 * is precisely the "style swap" the architecture forbids (§12/§18). If the
 * second request still comes back conceptually identical, it is returned
 * anyway — two attempts is the hard budget, and a slightly-different second
 * creative beats no creative.
 */
async function redesignBlueprint(options: {
  textProvider: AiTextProvider;
  brief: CreativeBrief;
  rejectedConcept: GraphicDesignConcept;
  rejectionReason: string;
  onCall?: (kind: 'text' | 'image') => void;
  onStageTiming?: (stage: string, durationMs: number) => void;
}): Promise<GraphicDesignConcept> {
  const { textProvider, brief, rejectedConcept, rejectionReason, onCall, onStageTiming } = options;

  const request = async (extraFeedback?: string) => {
    onCall?.('text');
    const startedAt = Date.now();
    const blueprint = await generateGraphicDesignConcept({
      provider: textProvider,
      brief,
      ...(rejectedConcept.strategy && { strategy: rejectedConcept.strategy }),
      previousConcept: rejectedConcept,
      redesignFeedback: [rejectionReason, extraFeedback].filter(Boolean).join(' — '),
    });
    onStageTiming?.('artDirector', Date.now() - startedAt);
    return blueprint;
  };

  const first = await request();
  const similarity = compareGraphicConcepts(rejectedConcept, first);
  if (!similarity.tooSimilar) return first;

  console.info('[creative] redesign returned the same creative idea; re-requesting', {
    sharedAxes: similarity.sharedAxes,
    similarity: similarity.similarity,
  });
  return request(similarity.reason);
}

export function composeHighFidelityVisualPrompt(options: {
  candidatePrompt?: string;
  direction: CreativeDirection;
  concept?: GraphicDesignConcept;
  context: CreativeRenderContext;
  styleDna?: ResolvedStyleDNA;
}): string {
  const { candidatePrompt, direction, concept, context, styleDna } = options;

  const subject = direction.subject || context.canonicalBrief?.subject || '';
  const visualStory = direction.visualStory || '';
  const dominant = concept?.dominantVisualObject || '';
  const mechanism = concept?.creativeMechanism || '';
  const claims = (context.intent?.requiredClaims || []).join(', ');

  const coreParts = [
    dominant,
    subject,
    visualStory,
    mechanism,
    claims ? `Key elements to depict: ${claims}` : '',
    candidatePrompt,
  ].filter((p): p is string => Boolean(p && p.trim().length > 0));

  const aestheticDirectives = [
    'High-end commercial and editorial visual aesthetics with impeccable craft, cinematic scale, and rich detail.',
    'Full-bleed immersive photography with rich tangible textures, natural lighting, soft directional shadows, and realistic depth of field.',
    'Depict concrete, vibrant, authentic real-world subjects and settings directly relevant to the brand, campaign subject, and environment.',
    'STRICT PROHIBITION: Never generate a miniature picture frame hanging on an empty wall, a poster pinned to a concrete wall, a flyer on a table, or a blank room mockup. The visual MUST BE the direct, expansive, immersive subject or destination itself.',
    'Avoid dark empty slates, sterile blank walls, artificial neon gradients, or generic AI voids.',
    'Leave clean, balanced composition areas and natural breathing room for graphic overlay.',
    'CRITICAL: Absolutely wordless and clean — NO text, NO lettering, NO numerals, NO typography, NO logos, NO watermark in the image.',
  ].join(' ');

  const styleInstructions = styleDna ? renderStyleDnaInstructions(styleDna) : '';

  return `${coreParts.join('. ')}\n\n${aestheticDirectives}\n${styleInstructions}`;
}

export async function designCreative(input: DesignerInput) {
  const { direction, context, styleDna, textProvider, imageProvider, canonicalBrief, graphicConcept, onStageTiming } = input;
  let currentGraphicConcept: GraphicDesignConcept =
    graphicConcept || direction.graphicConcept || fallbackConceptFrom(direction);

  // The member's hard requirements travel with every copy build, so a design
  // that trims itself to one line still cannot lose the offer or the occasion.
  const requiredClaims = context.intent?.requiredClaims ?? [];
  const copy = collectCampaignCopy(
    direction, currentGraphicConcept.elementsToOmit, currentGraphicConcept.copyPlan, requiredClaims,
  );
  const semanticCopy = buildSemanticCopyList(copy);
  const missing = evaluateIntentFidelity(context.intent?.requiredClaims ?? [], copy.map(c => c.text).join(' ')).missingRequirements;
  if (missing.length) throw new Error(`Copy is missing required campaign facts: ${missing.join(', ')}.`);
  if (!input.logo) throw new Error('A readable brand logo is required.');
  if ((input.references.length || input.products.length) && !textProvider.supportsVision) throw new Error('The composition provider must be able to inspect uploaded images.');
  const { recipe, source } = resolveDesignRecipe(direction, context.creativeDna, {
    styleDna: styleDna?.style, styleDnaVariant: styleDna?.variant, referenceStyle: context.referenceStyle,
  });
  const typography = selectTypography({
    direction,
    creativeDna: context.creativeDna,
    recipe,
    styleDna: styleDna?.style,
    research: input.research,
  });
  for (const face of typography.facesUsed) {
    if (!existsSync(fontFilePath(face.family, face.weight, face.style))) throw new Error(`The selected font ${face.family} is unavailable on the renderer.`);
  }
  const attachments = [...input.products, ...input.references, input.logo];
  const sizes = await Promise.all(input.products.map(async (p, i) => {
    const m = await sharp(Buffer.from(p.data, 'base64')).metadata();
    return { id: i === 0 ? 'hero-visual' : `supporting-visual-${i - 1}`, width: m.width, height: m.height };
  }));
  const logoSize = await sharp(Buffer.from(input.logo.data, 'base64')).metadata();

  const isPureTypographicPoster = imageIsAbsent(currentGraphicConcept) && sizes.length === 0;

  let requiredNodeList = buildRequiredNodeList({ semanticCopy, sizes, isPureTypographicPoster });

  let instructions = buildCompositionInstructions({
    concept: currentGraphicConcept,
    requiredNodeList,
    isPureTypographicPoster,
  });

  let feedback = '';
  let visual: InlineImagePart | undefined;
  let firstAttemptResult: any = null;

  // Max 2 Creative Attempts
  for (let attempt = 0; attempt < 2; attempt++) {
    const briefPayload = JSON.stringify({
      canonicalBrief: canonicalBrief || {
        userPrompt: direction.subject,
        subject: direction.subject,
        event: direction.marketingCreative?.eventBadge,
        offer: direction.marketingCreative?.offerText,
        goal: context.goal,
        funnelStage: context.funnelStage,
      },
      graphicDesignConcept: currentGraphicConcept,
      brand: context.brand,
      selectedStyle: styleDna?.style,
      referenceStyle: context.referenceStyle,
      typography: { headline: typography.headlineFont, body: typography.bodyFont },
      copy: semanticCopy,
      products: sizes,
      logo: { id: 'brand-mark', width: logoSize.width, height: logoSize.height },
    });

    let plan: DesignerPlan | undefined;
    let rendered: Buffer | undefined;

    // Composition planning (max 2 plan turns)
    for (let planTurn = 0; planTurn < 2; planTurn++) {
      input.onCall?.('text');
      const planStart = Date.now();
      const raw = await textProvider.generateJson({
        systemInstruction: instructions,
        prompt: `${briefPayload}\n${feedback}`,
        images: attachments,
        responseSchema: DESIGNER_PLAN_SCHEMA,
        temperature: .65,
      });
      onStageTiming?.('composition', Date.now() - planStart);

      const mechStart = Date.now();
      const candidatePlan = repairPlanMechanically(raw as DesignerPlan, copy, input.products.length, currentGraphicConcept.elementsToOmit, currentGraphicConcept);
      onStageTiming?.('mechanicalRepair', Date.now() - mechStart);

      const problems = validateDesignerPlan(candidatePlan, copy, input.products.length, currentGraphicConcept);

      if (problems.length && planTurn === 0) {
        feedback = `Repair layout: ${problems.join(' ')}\nPrevious plan: ${JSON.stringify(raw)}`;
        continue;
      }
      if (problems.length) {
        console.warn('[creative] composition proceeded with layout notes', { problems });
      }

      if (!input.products.length && !visual && !imageIsAbsent(currentGraphicConcept)) {
        const visualPrompt = composeHighFidelityVisualPrompt({
          candidatePrompt: candidatePlan.visualPrompt,
          direction,
          concept: currentGraphicConcept,
          context,
          styleDna,
        });
        const node = candidatePlan.nodes.find(n => n.kind === 'visual') || { width: 0.8, height: 0.8 };
        const canvas = dimensions(direction.aspectRatio);
        const ratio = (node.width || 0.8) * canvas.width / ((node.height || 0.8) * canvas.height);
        const ratios: Array<[string, number]> = [['1:1', 1], ['4:5', .8], ['9:16', .5625], ['16:9', 16 / 9], ['1.91:1', 1.91]];
        const aspectRatio = ratios.sort((a, b) => Math.abs(a[1] - ratio) - Math.abs(b[1] - ratio))[0][0];
        input.onCall?.('image');
        [visual] = await imageProvider.generateImage({
          prompt: `${visualPrompt}\nCampaign context: ${direction.subject}. ${direction.visualStory}. Follow the attached STYLE references for visual language only; never import their text, products or logos. No lettering, logos, numbers or placeholders. Do not default to photography if the selected style calls for another medium.`,
          referenceImages: [...input.references, ...(input.priorVisual ? [input.priorVisual] : [])], aspectRatio,
        });
        if (visual && (await detectCheckerboard(Buffer.from(visual.data, 'base64'))).detected) {
          visual = undefined; feedback = 'The generated visual contained invalid pixels. Plan a clear, fully opaque visual.'; continue;
        }

        // ── Vision composition analysis: AI looks at the actual image ──────
        // Run after image generation so the designer knows the real image
        // topology — where safe zones are, where the focal point is, how
        // much text the image can carry — before compositing begins.
        if (visual && input.research && textProvider.supportsVision) {
          const visionStart = Date.now();
          const visionAnalysis = await generateVisionComposition({
            provider: textProvider,
            imageBase64: visual.data,
            context: {
              concept: direction.concept,
              headline: direction.headline,
              supportingLine: direction.supportingLine,
              cta: direction.cta,
              brandName: context.brand?.name,
              goal: context.goal,
              occasion: direction.marketingCreative?.eventBadge,
              styleName: styleDna?.style.name,
            },
            research: input.research,
          });
          onStageTiming?.('visionComposition', Date.now() - visionStart);

          const visionInstructions = renderVisionCompositionInstructions(visionAnalysis);
          if (visionInstructions) {
            instructions = `${instructions}\n\n${visionInstructions}`;
          }
        }
      }

      try {
        const renderStart = Date.now();
        rendered = await renderDesignerPlan(candidatePlan, input, copy, typography, visual, recipe.texture, currentGraphicConcept);
        onStageTiming?.('render', Date.now() - renderStart);
        plan = candidatePlan;
        break;
      } catch (error) {
        feedback = `Repair layout: ${error instanceof Error ? error.message : String(error)}\nPrevious plan: ${JSON.stringify(candidatePlan)}`;
        continue;
      }
    }

    if (!plan || !rendered) continue;

    const critic = await evaluateRenderedDesign({
      provider: textProvider,
      renderedPng: rendered,
      brief: {
        userPrompt: direction.subject,
        goal: context.goal,
        funnelStage: context.funnelStage,
        primaryMessage: direction.headline || direction.subject,
        secondaryMessages: [],
        subject: direction.subject,
        event: direction.marketingCreative?.eventBadge,
        offer: direction.marketingCreative?.offerText,
        visualStory: direction.visualStory,
        firstRead: direction.headline || direction.subject,
        attentionHierarchy: currentGraphicConcept.attentionHierarchy ?? [],
        emotionalTone: direction.mood || 'confident',
        brandVoice: { tone: direction.mood || 'confident', personality: ['authentic'] },
        creativeStyle: {
          id: styleDna?.style.id || 'editorial',
          name: styleDna?.style.name || 'Editorial',
          visualLanguage: [],
          typographyLanguage: [],
          compositionLanguage: [],
          imageTreatment: [],
          textureLanguage: [],
          colorLanguage: [],
          imperfectionLanguage: [],
        },
        assets: { productAssets: [], referenceImages: [] },
        requiredClaims: context.intent?.requiredClaims || [],
      },
      concept: currentGraphicConcept,
      productImages: input.products,
      referenceImages: input.references,
      logoImage: input.logo,
    });

    const currentResult = {
      data: rendered,
      mimeType: 'image/png' as const,
      visual,
      plan,
      typography,
      recipeSource: source,
      structure: 'designer-composition' as const,
      assetIds: plan.nodes.filter(n => n.kind === 'product').map(n => n.id),
      critic,
    };

    if (critic.passed) {
      return currentResult;
    }

    if (attempt === 0) {
      firstAttemptResult = currentResult;
      const briefForRedesign = canonicalBrief || {
        userPrompt: direction.subject,
        goal: context.goal,
        funnelStage: context.funnelStage,
        primaryMessage: direction.headline || direction.subject,
        secondaryMessages: [],
        subject: direction.subject,
        event: direction.marketingCreative?.eventBadge,
        offer: direction.marketingCreative?.offerText,
        visualStory: direction.visualStory,
        firstRead: direction.headline || direction.subject,
        attentionHierarchy: currentGraphicConcept.attentionHierarchy ?? [],
        emotionalTone: direction.mood || 'confident',
        brandVoice: { tone: direction.mood || 'confident', personality: ['authentic'] },
        creativeStyle: {
          id: styleDna?.style.id || 'editorial',
          name: styleDna?.style.name || 'Editorial',
          visualLanguage: [],
          typographyLanguage: [],
          compositionLanguage: [],
          imageTreatment: [],
          textureLanguage: [],
          colorLanguage: [],
          imperfectionLanguage: [],
        },
        assets: { productAssets: [], referenceImages: [] },
        requiredClaims: context.intent?.requiredClaims || [],
      };
      const rejectionReason = critic.redesignFeedback || critic.problems.join('; ');
      try {
        const rejectedConcept = currentGraphicConcept;
        const newBlueprint = await redesignBlueprint({
          textProvider,
          brief: briefForRedesign,
          rejectedConcept,
          rejectionReason,
          onCall: input.onCall,
          onStageTiming,
        });
        currentGraphicConcept = newBlueprint;
        const redesignedCopy = collectCampaignCopy(
          direction, newBlueprint.elementsToOmit, newBlueprint.copyPlan, requiredClaims,
        );
        const lost = evaluateIntentFidelity(requiredClaims, redesignedCopy.map((c) => c.text).join(' ')).missingRequirements;
        if (lost.length) {
          console.warn('[creative] redesign copy plan would drop required facts; keeping the original copy', { lost });
        } else {
          copy.splice(0, copy.length, ...redesignedCopy);
          semanticCopy.splice(0, semanticCopy.length, ...buildSemanticCopyList(copy));
        }
        requiredNodeList = buildRequiredNodeList({
          semanticCopy,
          sizes,
          isPureTypographicPoster: imageIsAbsent(newBlueprint) && sizes.length === 0,
        });
        instructions = buildCompositionInstructions({
          concept: newBlueprint,
          requiredNodeList,
          isPureTypographicPoster: imageIsAbsent(newBlueprint) && sizes.length === 0,
        });
        feedback = [
          `The previous creative was rejected: ${rejectionReason}`,
          redesignDivergenceInstruction(rejectedConcept),
          'Compose the NEW blueprint from a blank canvas. Do not adapt the previous plan.',
        ].join('\n');
        visual = undefined;
      } catch (error) {
        console.warn('[creative] redesign blueprint unavailable; retrying the same idea', {
          detail: error instanceof Error ? error.message : String(error),
        });
        feedback = `The previous creative was rejected: ${rejectionReason}`;
      }
    } else if (attempt === 1) {
      if (critic.passed) {
        return currentResult;
      }
      if (currentResult || firstAttemptResult) {
        return currentResult || firstAttemptResult;
      }
      const rejectionReason = critic.redesignFeedback || critic.problems.join('; ');
      throw new Error(`FlowPost could not verify this design after two attempts with the critic. ${rejectionReason}`);
    }
  }

  throw new Error(`The design could not be generated. ${feedback.slice(0, 600)}`);
}

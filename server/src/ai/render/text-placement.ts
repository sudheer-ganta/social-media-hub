import type { GraphicDesignConcept } from '../types';
import type { SemanticRole, TypeSystem } from '../typography/type-system';
import type { ImageField } from './image-field';
import type { DesignBox, DesignNode, DesignerPlan } from './designer-composition';

/**
 * Fits already-composed copy to the picture that was actually generated.
 *
 * The composition is planned before the image exists — the plan carries the
 * `visualPrompt` that produces it — so no earlier stage can know where the
 * subject ended up. This is the stage that looks at both and reconciles them.
 *
 * It is deliberately a REPAIR stage, in the sense the architecture already uses
 * that word (see CLAUDE.md: "Mechanical repair repairs, it does not
 * art-direct"). It may slide type along the axis the art director left free,
 * recolour it against what is measurably behind it, scrim the minimum area at
 * the minimum strength, and fix a hierarchy that came back inverted. It may not
 * choose a different composition, move type across the canvas, or override a
 * crossing the blueprint asked for.
 *
 * The distinction that makes this possible is between the IMAGE and the SUBJECT.
 * Type crossing the image is good design, and the anti-template validator
 * requires some form of it. Type crossing the subject's face is the failure. Only
 * `image-field.ts` can tell those apart, which is why this stage could not exist
 * before it.
 */

export interface ScrimSpec {
  /** Which edge the gradient is anchored to — it fades away from there. */
  direction: 'up' | 'down' | 'left' | 'right';
  color: string;
  /** Peak opacity at the anchored edge. The weakest value that achieves the contrast target. */
  opacity: number;
}

export interface PlacementReport {
  moved: string[];
  recoloured: string[];
  scrimmed: string[];
  resized: string[];
  notes: string[];
}

export interface FitCopyInput {
  plan: DesignerPlan;
  field: ImageField;
  typeSystem: TypeSystem;
  concept: GraphicDesignConcept;
  /** Brand colours, so a recolour keeps the brand rather than defaulting to black or white. */
  palette: string[];
  /** True when the visual actually fills the canvas — otherwise the measured field is not what sits behind the type. */
  imageIsBackdrop: boolean;
}

/** Past this share of the subject covered, the type is standing on the idea. */
const OCCLUSION_LIMIT = 0.25;

/** WCAG: large text clears at 3:1, everything else at 4.5:1. */
const LARGE_TEXT_SCALE = 0.03;
const TARGET_LARGE = 3;
const TARGET_BODY = 4.5;

/** Type may not be pushed outside this margin, whatever the picture wants. */
const SAFE_MARGIN = 0.035;

// ─── Colour maths ───────────────────────────────────────────────────────────
//
// Deliberately self-contained rather than imported from designer-composition:
// that module imports this one, and more importantly the comparison here is
// against a MEASURED luminance from the image rather than against another hex,
// which the existing helper cannot express.

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance on the same 0..1 scale `ImageField.toneAt` reports. */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

const contrastOf = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * The contrast the type will actually have at the WORST point of its box, not the
 * average. Averaging is how light type ends up over a bright highlight: the box
 * reads as mid-grey overall and fails only where the words happen to be.
 */
function worstCaseContrast(textLuminance: number, backdrop: { meanLuminance: number; stdDev: number }): number {
  const bright = Math.min(1, backdrop.meanLuminance + backdrop.stdDev);
  const dark = Math.max(0, backdrop.meanLuminance - backdrop.stdDev);
  return Math.min(contrastOf(textLuminance, bright), contrastOf(textLuminance, dark));
}

// ─── Occlusion repair ───────────────────────────────────────────────────────

/**
 * Did the blueprint ask for type and subject to meet? Crossing, colliding,
 * overlapping and interrupting are all legitimate and often the strongest thing
 * in a composition, so a declared crossing is protected here — it gets made
 * legible by the colour and scrim rules instead of being pushed aside.
 */
export function crossingIsDeclared(concept: GraphicDesignConcept): boolean {
  const declared = [
    concept.typeBehavior,
    concept.spatialRelationship,
    concept.imageBehavior,
    concept.visualTension,
    ...(Array.isArray(concept.overlapRelationships) ? concept.overlapRelationships : []),
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();

  return /cross|crossing|overlap|collide|colliding|through|over the|on top of|interrupt|pierce|cut into|straddl|sits on|lock(?:ed|s)? into/.test(
    declared,
  );
}

/**
 * Which canvas edge is this box anchored to? That anchor is the art director's
 * decision even when the exact offset was not, so the search below is free to
 * move the box ALONG that edge and must not move it away from it. Without this,
 * "headline at the bottom" becomes "headline wherever the picture is quietest",
 * which is how a composition system turns into a placement system.
 */
function anchoredAxis(box: DesignBox): 'vertical' | 'horizontal' | 'free' {
  const distances = {
    left: Math.max(0, box.x),
    right: Math.max(0, 1 - (box.x + box.width)),
    top: Math.max(0, box.y),
    bottom: Math.max(0, 1 - (box.y + box.height)),
  };
  const nearest = Object.entries(distances).sort((a, b) => a[1] - b[1])[0];
  // Nothing is near an edge: the box floats, and both axes are open.
  if (nearest[1] > 0.2) return 'free';
  // Anchored top or bottom -> the Y offset is the decision, X is free to slide.
  return nearest[0] === 'top' || nearest[0] === 'bottom' ? 'vertical' : 'horizontal';
}

const overlaps = (a: DesignBox, b: DesignBox, gap: number): boolean =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

/**
 * Searches translations of the box for one that clears the subject.
 *
 * A local search over a coarse lattice rather than a formula, because the four
 * things being traded off — occluding the subject, sitting somewhere legible,
 * honouring the declared anchor, and not landing on another element — have no
 * closed form, and `ImageField` answers each query in constant time so trying a
 * few hundred positions is free.
 */
function relocate(node: DesignNode, field: ImageField, obstacles: DesignBox[]): DesignBox | null {
  const axis = anchoredAxis(node);
  const startCost = field.occlusionOf(node) * 3 + field.busynessAt(node);
  const steps = 16;

  let best: { box: DesignBox; cost: number } | null = null;

  for (let ix = 0; ix <= steps; ix++) {
    for (let iy = 0; iy <= steps; iy++) {
      const x = SAFE_MARGIN + (ix / steps) * Math.max(0, 1 - 2 * SAFE_MARGIN - node.width);
      const y = SAFE_MARGIN + (iy / steps) * Math.max(0, 1 - 2 * SAFE_MARGIN - node.height);
      const box: DesignBox = { x, y, width: node.width, height: node.height };

      if (obstacles.some((o) => overlaps(box, o, 0.012))) continue;

      // Moving across the anchored axis costs an order of magnitude more than
      // moving along it, so the search slides rather than relocates.
      const dx = Math.abs(x - node.x);
      const dy = Math.abs(y - node.y);
      const drift = axis === 'vertical' ? dy * 4 + dx * 0.35 : axis === 'horizontal' ? dx * 4 + dy * 0.35 : (dx + dy) * 0.6;

      const cost = field.occlusionOf(box) * 3 + field.busynessAt(box) + drift;
      if (!best || cost < best.cost) best = { box, cost };
    }
  }

  // Only worth moving if it is a real improvement — a marginal gain is churn, and
  // churn is how a composition loses the intent it was built with.
  if (!best || best.cost > startCost - 0.12) return null;
  return best.box;
}

// ─── Colour and scrim ───────────────────────────────────────────────────────

interface ColourDecision {
  color: string;
  contrast: number;
  scrim?: ScrimSpec;
}

/** The edge nearest the box, so a scrim reads as a vignette rather than a floating band. */
function scrimDirection(box: DesignBox): ScrimSpec['direction'] {
  const distances: Array<[ScrimSpec['direction'], number]> = [
    ['down', Math.max(0, box.y)],
    ['up', Math.max(0, 1 - (box.y + box.height))],
    ['right', Math.max(0, box.x)],
    ['left', Math.max(0, 1 - (box.x + box.width))],
  ];
  return distances.sort((a, b) => a[1] - b[1])[0][0];
}

/**
 * Chooses the ink, and only reaches for a scrim when no ink can work.
 *
 * Order matters and is the whole point of the rule: a brand colour that clears
 * the target beats black, black or white beats a scrim, and a scrim beats an
 * illegible creative. The industry default of a flat 40–60% black wash is applied
 * here only at the strength the measurement actually demands, over only the box
 * the type occupies — so the picture survives everywhere else, which is what the
 * brief "text should not come on the idea unless it is needed" asks for.
 */
function decideColour(
  node: DesignNode,
  backdrop: { meanLuminance: number; stdDev: number },
  palette: string[],
  target: number,
): ColourDecision | null {
  // Order is the preference, and the preference is the rule: the colour the planner
  // chose, then the brand's own colours, then neutrals. A brand that can stay in its
  // own palette and still be legible should.
  const candidates = [...(node.color ? [node.color] : []), ...palette, '#ffffff', '#111111'];

  const scored = candidates
    .map((color) => {
      const luminance = relativeLuminance(color);
      return luminance === null ? null : { color, luminance, contrast: worstCaseContrast(luminance, backdrop) };
    })
    .filter((c): c is { color: string; luminance: number; contrast: number } => c !== null);
  if (!scored.length) return null;

  const clears = scored.find((c) => c.contrast >= target);
  if (clears) return { color: clears.color, contrast: clears.contrast };

  // Nothing clears it unaided. Take the strongest ink available and compute the
  // weakest wash that gets it over the line.
  const strongest = scored.reduce((a, b) => (b.contrast > a.contrast ? b : a));
  const wash = strongest.luminance > 0.5 ? { color: '#000000', towards: 0 } : { color: '#ffffff', towards: 1 };

  for (let opacity = 0.1; opacity <= 0.85; opacity += 0.05) {
    const washed = {
      meanLuminance: backdrop.meanLuminance * (1 - opacity) + wash.towards * opacity,
      // A wash flattens the backdrop as well as shifting it, which is most of why
      // it works: the unevenness that made no flat ink viable is reduced too.
      stdDev: backdrop.stdDev * (1 - opacity),
    };
    const contrast = worstCaseContrast(strongest.luminance, washed);
    if (contrast >= target) {
      return {
        color: strongest.color,
        contrast,
        scrim: { direction: scrimDirection(node), color: wash.color, opacity: Number(opacity.toFixed(2)) },
      };
    }
  }

  // Even a heavy wash cannot save it; report the best available and let the
  // critic judge the finished render rather than failing the creative here.
  return { color: strongest.color, contrast: strongest.contrast, scrim: { direction: scrimDirection(node), color: wash.color, opacity: 0.85 } };
}

// ─── Hierarchy repair ───────────────────────────────────────────────────────

const roleOf = (node: DesignNode): SemanticRole =>
  node.id === 'primary-hook' ? 'primary-hook' : node.id === 'secondary-hook' ? 'secondary-hook' : 'supporting-note';

/** Height a box needs for its own lines at its own size, so a resize cannot clip. */
const heightFor = (node: DesignNode, lineHeight: number): number => {
  const lines = Array.isArray(node.lines) && node.lines.length > 0 ? node.lines.length : 1;
  return Number((lines * node.fontScale * lineHeight + 0.015).toFixed(3));
};

// ─── Entry ──────────────────────────────────────────────────────────────────

/**
 * Returns a repaired copy of the plan, and a report of what was changed and why.
 * Mutates nothing the caller passed in: a caller that discards the result renders
 * exactly what it would have rendered before.
 */
export function fitCopyToField({
  plan,
  field,
  typeSystem,
  concept,
  palette,
  imageIsBackdrop,
}: FitCopyInput): { plan: DesignerPlan; report: PlacementReport } {
  const report: PlacementReport = { moved: [], recoloured: [], scrimmed: [], resized: [], notes: [] };
  const fitted: DesignerPlan = { ...plan, nodes: plan.nodes.map((n) => ({ ...n })) };
  const copyNodes = fitted.nodes.filter((n) => n?.kind === 'copy');
  if (!copyNodes.length) return { plan: fitted, report };

  // ── 1. Occlusion ──────────────────────────────────────────────────────────
  const declaredCrossing = crossingIsDeclared(concept);
  if (!imageIsBackdrop) {
    report.notes.push('The visual does not fill the canvas, so the measured field is not what sits behind the type; placement left as composed.');
  } else {
    for (const node of copyNodes) {
      const occlusion = field.occlusionOf(node);
      const busyness = field.busynessAt(node);
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;
      const distToFocal = Math.hypot(nodeCenterX - field.focalCentroid.x, nodeCenterY - field.focalCentroid.y);
      // Severe focal/face collision: sitting directly on the highest-energy subject center or extreme occlusion
      const severeFocalCollision = (distToFocal < 0.22 && busyness > 0.40) || occlusion > 0.45;

      if (declaredCrossing && !severeFocalCollision) {
        report.notes.push('The blueprint asked type and image to cross, so nothing was moved off the subject — legibility is carried by colour instead.');
        continue;
      }
      if (occlusion <= OCCLUSION_LIMIT && !severeFocalCollision) continue;

      const obstacles = fitted.nodes.filter((other) => other !== node && ['copy', 'logo', 'product'].includes(other?.kind));
      const moved = relocate(node, field, obstacles);
      if (!moved) {
        report.notes.push(`${node.id} sits on the subject and no better position was available without breaking its anchor.`);
        continue;
      }
      report.moved.push(`${node.id}: ${node.x.toFixed(2)},${node.y.toFixed(2)} -> ${moved.x.toFixed(2)},${moved.y.toFixed(2)}`);
      node.x = Number(moved.x.toFixed(3));
      node.y = Number(moved.y.toFixed(3));
    }
  }

  // ── 2. Hierarchy ──────────────────────────────────────────────────────────
  //
  // The floor and the ordering are repairs. The sizes themselves are not touched
  // when they are already in the right order and above the floor — a headline the
  // planner deliberately set enormous stays enormous.
  const byRole = new Map<SemanticRole, DesignNode[]>();
  for (const node of copyNodes) {
    const role = roleOf(node);
    byRole.set(role, [...(byRole.get(role) ?? []), node]);
  }
  const primary = byRole.get('primary-hook')?.[0];
  const secondary = byRole.get('secondary-hook')?.[0];

  for (const node of copyNodes) {
    const role = roleOf(node);
    const step = typeSystem.steps[role];
    let corrected = node.fontScale;

    if (!Number.isFinite(corrected) || corrected < typeSystem.opticalFloor) {
      corrected = step.fontScale;
      report.resized.push(`${node.id}: below the optical floor, set to the scale step ${step.fontScale}`);
    } else if (role !== 'primary-hook' && primary && corrected >= primary.fontScale) {
      // An inverted hierarchy is not a style choice, it is a mistake: the first
      // read has to be the first read.
      corrected = step.fontScale;
      report.resized.push(`${node.id}: was at or above the first read, set to the scale step ${step.fontScale}`);
    } else if (role === 'supporting-note' && secondary && corrected > secondary.fontScale) {
      corrected = step.fontScale;
      report.resized.push(`${node.id}: outranked the second read, set to the scale step ${step.fontScale}`);
    }

    if (corrected !== node.fontScale) {
      node.fontScale = Number(corrected.toFixed(4));
      node.height = Math.max(node.height, heightFor(node, step.lineHeight));
    }
  }

  // ── 3. Colour, and a scrim only where colour cannot do it ─────────────────
  if (imageIsBackdrop) {
    for (const node of copyNodes) {
      // A node on its own solid surface is already on a known backdrop; the
      // existing flat-hex contrast repair governs that case correctly.
      if (node.surface && node.surface !== 'none' && node.surface !== 'transparent') continue;

      const backdrop = field.toneAt(node);
      const target = node.fontScale >= LARGE_TEXT_SCALE ? TARGET_LARGE : TARGET_BODY;
      const decision = decideColour(node, backdrop, palette, target);
      if (!decision) continue;

      if (decision.color !== node.color) {
        report.recoloured.push(`${node.id}: ${node.color} -> ${decision.color} (${decision.contrast.toFixed(1)}:1 against the measured backdrop)`);
        node.color = decision.color;
      }
      if (decision.scrim) {
        node.scrim = decision.scrim;
        report.scrimmed.push(`${node.id}: ${decision.scrim.color} at ${decision.scrim.opacity}, fading ${decision.scrim.direction}`);
      }
    }
  }

  return { plan: fitted, report };
}

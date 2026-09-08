import { validateCompositionDiversity, validateLayoutPlan, type BrandPalette, type ContentInput, type LayoutPlan, type Rect } from './layout-plan';
import { getFontDefinition } from '../typography/font-catalog';
import { paletteComplianceViolations } from '../style-dna/style-compliance';
import type { TypographySelection } from '../typography/font-selector';
import type { StyleDNA } from '../style-dna/style-dna';
import type { ReferenceDesignRecipe } from '../types';

export type DesignValidationCode =
  | 'INVALID_CANVAS'
  | 'INVALID_GEOMETRY'
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'EMPTY_TEXT'
  | 'PLACEHOLDER_TEXT'
  | 'MISSING_CONTENT'
  | 'SAFE_MARGIN'
  | 'INVALID_TYPOGRAPHY'
  | 'UNREADABLE_CONTRAST'
  | 'LEGACY_TEMPLATE_COLLAPSE';

export interface DesignValidationIssue { code: DesignValidationCode; message: string; block?: string }
export interface DesignValidationResult { valid: boolean; errors: DesignValidationIssue[]; warnings: DesignValidationIssue[] }

export { validateCompositionDiversity };

function codeFor(message: string): DesignValidationCode {
  if (message.includes('out of canvas')) return 'OUT_OF_BOUNDS';
  if (message.includes('overlaps')) return 'OVERLAP';
  if (message.includes('empty line')) return 'EMPTY_TEXT';
  if (message.includes('placeholder')) return 'PLACEHOLDER_TEXT';
  if (message.includes('LEGACY_TEMPLATE_COLLAPSE') || message.includes('legacy repetitive template')) return 'LEGACY_TEMPLATE_COLLAPSE';
  return 'MISSING_CONTENT';
}

function validRect(rect: Rect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0;
}

function luminance(hex: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return undefined;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrast(a: string, b: string): number | undefined {
  const left = luminance(a); const right = luminance(b);
  if (left === undefined || right === undefined) return undefined;
  return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
}

/** Structured, deterministic pre-export gate. It performs no model calls and changes no state. */
export function validateDesign(plan: LayoutPlan, content: ContentInput): DesignValidationResult {
  const errors: DesignValidationIssue[] = [];
  const warnings: DesignValidationIssue[] = [];
  if (![plan.canvas.width, plan.canvas.height].every(Number.isFinite) || plan.canvas.width <= 0 || plan.canvas.height <= 0) {
    errors.push({ code: 'INVALID_CANVAS', message: 'Canvas dimensions must be positive finite numbers.' });
  }
  if (!validRect(plan.imageRect)) errors.push({ code: 'INVALID_GEOMETRY', message: 'Image rectangle contains invalid geometry.', block: 'image' });
  for (const message of validateLayoutPlan(plan, content)) errors.push({ code: codeFor(message), message });
  for (const message of validateCompositionDiversity(plan)) errors.push({ code: 'LEGACY_TEMPLATE_COLLAPSE', message });
  for (const block of plan.blocks) {
    if (!('rect' in block)) continue;
    if (!validRect(block.rect)) {
      errors.push({ code: 'INVALID_GEOMETRY', message: `${block.kind} contains invalid geometry.`, block: block.kind });
      continue;
    }
    if (block.kind === 'text' && (!Number.isFinite(block.spec.fontSize) || block.spec.fontSize <= 0 || !block.spec.fontFamily.trim())) {
      errors.push({ code: 'INVALID_TYPOGRAPHY', message: `${block.role} has invalid font metrics.`, block: block.role });
    }
    if ((block.kind === 'cta' && block.spec.shape !== 'underline' && block.spec.shape !== 'annotation') || (block.kind === 'badge' && block.text.trim().length > 0)) {
      const ratio = block.kind === 'cta'
        ? contrast(block.spec.fill, block.spec.textFill)
        : contrast(block.fill, block.textFill);
      if (ratio !== undefined && ratio < 4.5) errors.push({ code: 'UNREADABLE_CONTRAST', message: `${block.kind} text contrast is ${ratio.toFixed(2)}:1; 4.5:1 is required.`, block: block.kind });
    }
    if (['text', 'cta', 'logo', 'badge'].includes(block.kind)) {
      const edge = Math.min(block.rect.x, block.rect.y, 1 - block.rect.x - block.rect.width, 1 - block.rect.y - block.rect.height);
      if (edge >= -0.002 && edge < 0.015) warnings.push({ code: 'SAFE_MARGIN', message: `${block.kind} is very close to the canvas edge.`, block: block.kind });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export interface StyleFidelityResult {
  compliant: boolean;
  violations: string[];
}

/**
 * Deterministic check of the FINISHED creative's structural, typographic and
 * palette choices against the member's explicitly selected Style DNA — never
 * an AI "does this look like X" score. Every check reads a structured field
 * Style DNA already declares (`style.texture`, `style.renderer.*`,
 * `style.typography.preferredCategories`, ...) against a structured field the
 * renderer already produced; nothing here is inferred from the image itself
 * or from free text.
 *
 * Most of these axes are already enforced BY CONSTRUCTION once the recipe
 * comes from `styleDnaToRecipe` (design-recipe.ts, Phase 4) — `recipe.texture`
 * can only ever be one of `style.texture`'s own values, for instance. This
 * exists as the one place that proves that end to end, and as the safety net
 * for the two paths that are not construction-guaranteed: typography's
 * full-catalog fallback (font-selector.ts `rankCandidates`, only reached when
 * the style's own categories have no candidate for a required script) and the
 * palette (never deterministically forced — Style DNA deliberately avoids
 * fixed hex swatches, "vary within X, never copy mechanically").
 *
 * Deliberately returns a report rather than throwing: unlike `validateDesign`
 * above (geometry/contrast defects with no acceptable failure mode), most of
 * what this catches is a rare fallback path degrading gracefully, not a
 * broken render — the caller decides what a `compliant: false` report means
 * for that request (log it, surface it, or in the future gate on it).
 */
export function validateStyleFidelity(input: {
  styleDna?: StyleDNA;
  recipe: ReferenceDesignRecipe;
  typography: TypographySelection;
  palette: BrandPalette;
}): StyleFidelityResult {
  const { styleDna: style, recipe, typography, palette } = input;
  if (!style) return { compliant: true, violations: [] };

  const violations: string[] = [];
  const notAllowed = (label: string, value: string, allowed: readonly string[]) => {
    if (!allowed.includes(value)) {
      violations.push(`${label} "${value}" is not one of "${style.name}"'s allowed values (${allowed.join('/')}).`);
    }
  };

  // ── Typography category (headline/body) — hard-filtered at selection
  // (font-selector.ts Phase 1), checked again here as a regression guard. ──
  const headlineCategory = getFontDefinition(typography.headlineFont)?.category;
  if (headlineCategory) notAllowed('headline font category', headlineCategory, style.typography.preferredCategories);
  const bodyCategory = getFontDefinition(typography.bodyFont)?.category;
  if (bodyCategory) notAllowed('body font category', bodyCategory, style.typography.preferredCategories);

  // ── Accent font allowed/not allowed ──
  if (typography.accentFont && !style.typography.accentAllowed) {
    violations.push(`an accent font ("${typography.accentFont}") was selected, but "${style.name}" does not allow a decorative/handwritten accent.`);
  }

  // ── Renderer structure: typography family, texture, layout behaviour, and
  // every other hard renderer constraint Style DNA already represents ──
  notAllowed('renderer typography family', recipe.typographyFamily, style.renderer.typographyFamily);
  notAllowed('texture', recipe.texture, style.texture);
  notAllowed('layout behaviour', recipe.layoutBehaviour, style.layout.layoutBehaviour);
  notAllowed('footer style', recipe.footerStyle, style.renderer.footer);
  notAllowed('border style', recipe.borderStyle, style.renderer.border);
  notAllowed('shape language', recipe.shapeLanguage, style.renderer.shapeLanguage);
  notAllowed('image treatment', recipe.imageTreatment, style.renderer.imageTreatment);
  notAllowed('spacing', recipe.spacingBehaviour, style.renderer.spacing);
  notAllowed('logo treatment', recipe.logoTreatment, style.renderer.logoTreatment);
  if (recipe.compositionArchetype && style.renderer.compositionArchetypes) {
    notAllowed('composition archetype', recipe.compositionArchetype, style.renderer.compositionArchetypes);
  }

  // ── Palette (deterministic comparison where possible) ──
  violations.push(...paletteComplianceViolations([palette.ink, palette.paper, palette.accent], style, 'the final rendered palette'));

  return { compliant: violations.length === 0, violations };
}

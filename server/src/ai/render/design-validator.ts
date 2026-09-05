import { validateLayoutPlan, type ContentInput, type LayoutPlan, type Rect } from './layout-plan';

export type DesignValidationCode = 'INVALID_CANVAS' | 'INVALID_GEOMETRY' | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'EMPTY_TEXT' | 'PLACEHOLDER_TEXT' | 'MISSING_CONTENT' | 'SAFE_MARGIN' | 'INVALID_TYPOGRAPHY' | 'UNREADABLE_CONTRAST';
export interface DesignValidationIssue { code: DesignValidationCode; message: string; block?: string }
export interface DesignValidationResult { valid: boolean; errors: DesignValidationIssue[]; warnings: DesignValidationIssue[] }

function codeFor(message: string): DesignValidationCode {
  if (message.includes('out of canvas')) return 'OUT_OF_BOUNDS';
  if (message.includes('overlaps')) return 'OVERLAP';
  if (message.includes('empty line')) return 'EMPTY_TEXT';
  if (message.includes('placeholder')) return 'PLACEHOLDER_TEXT';
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
  for (const block of plan.blocks) {
    if (!('rect' in block)) continue;
    if (!validRect(block.rect)) {
      errors.push({ code: 'INVALID_GEOMETRY', message: `${block.kind} contains invalid geometry.`, block: block.kind });
      continue;
    }
    if (block.kind === 'text' && (!Number.isFinite(block.spec.fontSize) || block.spec.fontSize <= 0 || !block.spec.fontFamily.trim())) {
      errors.push({ code: 'INVALID_TYPOGRAPHY', message: `${block.role} has invalid font metrics.`, block: block.role });
    }
    if ((block.kind === 'cta' && block.spec.shape !== 'underline') || block.kind === 'badge') {
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

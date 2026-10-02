import { detectScripts } from '../typography/language';
import { FONT_CATALOG, getFontDefinition } from '../typography/font-catalog';
import { fontFileRelPath } from '../typography/font-manifest';
import { EDITABLE_TEXT_FIELDS, type EditableTextField } from './text-fields';
import type { DesignerPlan } from './designer-composition';

/**
 * Member-chosen typography for a line of a finished creative.
 *
 * Every property is optional and means "override what the layout engine chose".
 * Absent properties stay automatic, which is also what lets a later wording
 * edit keep the style the member picked without the member re-picking it.
 */
export interface RoleTextStyle {
  fontFamily?: string;
  /** A weight the chosen family actually has a font file for. */
  fontWeight?: number;
  /**
   * Multiplier on the size the layout engine fits for this wording: 1 is the
   * automatic size. The engine may apply less than asked when more would collide
   * with other text, the logo or the canvas edge; the applied value is what is stored.
   */
  sizeScale?: number;
  /** Lowercase #rrggbb. */
  color?: string;
}

/** Styles keyed by copy ROLE, the form the composer and the saved render context use. */
export type TextStylesByRole = Partial<Record<string, RoleTextStyle>>;

/** What the composer actually typeset for one line: the source of truth for "what is it now". */
export interface TypesetLine {
  fontFamily: string;
  fontWeight: number;
  fontScale: number;
  color: string;
}

/**
 * The solved layout of a finished creative, saved so an edit can re-render the
 * SAME layout and re-fit only the lines the member touched. Without it, any edit
 * re-ran the layout search from scratch and every line could move.
 */
export interface PersistedLayout {
  plan: DesignerPlan;
  /** Copy node id -> copy role. */
  roles: Record<string, string>;
  /** Copy node id -> the wording it was typeset with. */
  copy: Record<string, string>;
  /** Copy node id -> the font scale the layout engine chose, the 100% that `sizeScale` is measured against. */
  baseScales: Record<string, number>;
}

/** The saved layout no longer matches the creative's copy (a line was added or removed): re-solve instead. */
export class LayoutMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutMismatchError';
  }
}

export const SIZE_SCALE_MIN = 0.6;
export const SIZE_SCALE_MAX = 1.8;

/** A refusal the member can act on. Mapped to a 422 by the service. */
export class TextStyleError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'TextStyleError';
  }
}

const STYLE_KEYS: ReadonlyArray<keyof RoleTextStyle> = ['fontFamily', 'fontWeight', 'sizeScale', 'color'];

/** Validates the request body's `styles`, keyed by editable field. */
export function parseTextStyles(raw: unknown): Partial<Record<EditableTextField, RoleTextStyle>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TextStyleError('Say which text to restyle.');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) throw new TextStyleError('Say which text to restyle.');

  const out: Partial<Record<EditableTextField, RoleTextStyle>> = {};
  for (const [field, value] of entries) {
    if (!EDITABLE_TEXT_FIELDS.includes(field as EditableTextField)) {
      throw new TextStyleError(`"${field}" is not a line that can be restyled.`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TextStyleError('A style must be an object.');

    const input = value as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (!STYLE_KEYS.includes(key as keyof RoleTextStyle)) throw new TextStyleError(`"${key}" is not a style that can be changed.`);
    }

    const style: RoleTextStyle = {};
    if (input.fontFamily !== undefined) {
      if (typeof input.fontFamily !== 'string' || !getFontDefinition(input.fontFamily)) {
        throw new TextStyleError('That font is not available.');
      }
      style.fontFamily = getFontDefinition(input.fontFamily)!.family;
    }
    if (input.fontWeight !== undefined) {
      const weight = input.fontWeight;
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) {
        throw new TextStyleError('Font weight must be 100, 200 ... or 900.');
      }
      style.fontWeight = weight;
    }
    if (input.sizeScale !== undefined) {
      const scale = input.sizeScale;
      if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < SIZE_SCALE_MIN || scale > SIZE_SCALE_MAX) {
        throw new TextStyleError(`Size must be between ${Math.round(SIZE_SCALE_MIN * 100)}% and ${Math.round(SIZE_SCALE_MAX * 100)}%.`);
      }
      style.sizeScale = Math.round(scale * 100) / 100;
    }
    if (input.color !== undefined) {
      if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) {
        throw new TextStyleError('Colour must be a hex value like #1a1a1a.');
      }
      style.color = input.color.toLowerCase();
    }
    if (Object.keys(style).length === 0) throw new TextStyleError('Choose a font, weight, size or colour to change.');
    out[field as EditableTextField] = style;
  }
  return out;
}

/** The families that can render every script in `text`. Latin copy accepts all of them. */
export function fontsSupportingText(text: string): string[] {
  const scripts = detectScripts(text);
  return FONT_CATALOG.filter((f) => scripts.every((s) => f.languageSupport.includes(s))).map((f) => f.family);
}

/** Refuses a family that cannot draw the wording, which would typeset empty boxes. */
export function assertFontSupportsText(family: string, text: string): void {
  if (!fontsSupportingText(text).includes(family)) {
    throw new TextStyleError(`${family} cannot display this wording. Pick a font that supports its language.`);
  }
}

/** Where the server serves a font's files from (see app.ts), so the editor can preview a font with the file the render uses. */
export const FONT_FILES_URL_PREFIX = '/api/fonts';

export interface FontPickerOption {
  family: string;
  category: string;
  /** Weights that have real font files. */
  weights: number[];
  /** Root-relative URL of each weight's file, keyed by weight. */
  files: Record<number, string>;
}

/** The fonts the picker offers: family, category, the weights that have real files, and where to load them for preview. */
export function fontPickerOptions(): FontPickerOption[] {
  return FONT_CATALOG.map((f) => ({
    family: f.family,
    category: f.category,
    weights: f.weights,
    files: Object.fromEntries(f.weights.map((w) => [w, `${FONT_FILES_URL_PREFIX}/${fontFileRelPath(f.family, w, 'normal')}`])),
  }));
}

import type { CreativeDirection } from '../types';
import type { GraphicDesignConcept } from '../brand/creative-brief';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { isStructuredArtifact, validateAndBuildRenderableCopy } from '../intent/copy-sanitizer';
import { evaluateIntentFidelity } from '../intent/claim-match';
import { resolveEffectiveCopyPlan } from './designer-composition';
import {
  EDITABLE_TEXT_FIELDS,
  FIELD_ROLE,
  MAX_EDITED_TEXT_LENGTH,
  type EditableTextField,
} from './text-fields';
import { fontsSupportingText, type TextStylesByRole, type TypesetLine } from './type-style';

/**
 * Member-authored text edits on a finished creative.
 *
 * An edit replaces the wording of a line the creative ALREADY shows. It never
 * adds a line, removes one or changes which roles the idea asked for: those are
 * creative-direction decisions, and they belong to the idea rather than to a
 * text box. Everything here is pure so the rules can be tested without a
 * database, a model or a renderer.
 */

export type { EditableTextField };
export { EDITABLE_TEXT_FIELDS, MAX_EDITED_TEXT_LENGTH };

/** The typography this line has now, for the editor's controls. */
export interface EditableLineStyle {
  fontFamily?: string;
  fontWeight?: number;
  /** 1 is the size the layout engine fitted for this wording. */
  sizeScale: number;
  color?: string;
}

export interface EditableTextLine {
  field: EditableTextField;
  role: string;
  /** The wording as it is typeset on the creative right now. */
  text: string;
  maxLength: number;
  style: EditableLineStyle;
  /** The font families that can display this wording (script support), for the picker. */
  fonts: string[];
}

/** What the composer typeset and what the member overrode, as saved on the creative. */
export interface SavedTypesetting {
  typeset?: Record<string, TypesetLine>;
  textStyles?: TextStylesByRole;
}

export type TextEdits = Partial<Record<EditableTextField, string>>;

/** A refusal the member can act on. Mapped to a 422 by the service. */
export class CopyEditError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'CopyEditError';
  }
}

const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '');

function sourceValue(direction: CreativeDirection, field: EditableTextField): string {
  switch (field) {
    case 'headline': return direction.headline ?? '';
    case 'supportingLine': return direction.supportingLine ?? '';
    case 'cta': return direction.cta ?? '';
    case 'offerText': return direction.marketingCreative?.offerText ?? '';
    case 'eventBadge': return direction.marketingCreative?.eventBadge ?? '';
    case 'brandMessage': return direction.marketingCreative?.brandMessage ?? '';
  }
}

/** The lines the renderer would typeset for this direction: the single source of truth for "what is on the image". */
function renderedLines(direction: CreativeDirection, concept: GraphicDesignConcept, requiredClaims: string[]) {
  const copyPlan = resolveEffectiveCopyPlan(direction, concept);
  const raw = collectCampaignCopy(direction, concept.elementsToOmit, copyPlan, requiredClaims);
  return validateAndBuildRenderableCopy(raw, requiredClaims, copyPlan.maxTextElements || 3);
}

/**
 * The lines on this creative a member may reword. A line is only offered when
 * its source field is unambiguous: the rendered text has to match one editable
 * field for its role, otherwise editing it could change a different line.
 */
export function listEditableText(
  direction: CreativeDirection,
  concept: GraphicDesignConcept,
  requiredClaims: string[] = [],
  saved: SavedTypesetting = {},
): EditableTextLine[] {
  const lines = renderedLines(direction, concept, requiredClaims);
  const found: EditableTextLine[] = [];
  for (const field of EDITABLE_TEXT_FIELDS) {
    const source = normalise(sourceValue(direction, field));
    if (!source) continue;
    const line = lines.find((l) => l.role === FIELD_ROLE[field] && normalise(l.text) === source);
    if (!line) continue;
    const typeset = saved.typeset?.[line.role];
    const override = saved.textStyles?.[line.role];
    found.push({
      field,
      role: line.role,
      text: line.text,
      maxLength: MAX_EDITED_TEXT_LENGTH[field],
      style: {
        fontFamily: override?.fontFamily ?? typeset?.fontFamily,
        fontWeight: override?.fontWeight ?? typeset?.fontWeight,
        sizeScale: override?.sizeScale ?? 1,
        color: override?.color ?? typeset?.color,
      },
      fonts: fontsSupportingText(line.text),
    });
  }
  return found;
}

/** Validates the request body's `edits`. Returns trimmed, single-spaced wording per field. */
export function parseTextEdits(raw: unknown): TextEdits {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CopyEditError('Say which text to change.');
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) throw new CopyEditError('Say which text to change.');

  const edits: TextEdits = {};
  for (const [key, value] of entries) {
    if (!EDITABLE_TEXT_FIELDS.includes(key as EditableTextField)) {
      throw new CopyEditError(`"${key}" is not a line that can be edited.`);
    }
    const field = key as EditableTextField;
    if (typeof value !== 'string') throw new CopyEditError('Text edits must be text.');
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) throw new CopyEditError('A line cannot be left empty. Type some wording, or keep the original.');
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(cleaned)) throw new CopyEditError('That text has characters that cannot be typeset.');
    if (cleaned.length > MAX_EDITED_TEXT_LENGTH[field]) {
      throw new CopyEditError(`That line can be at most ${MAX_EDITED_TEXT_LENGTH[field]} characters.`);
    }
    if (isStructuredArtifact(cleaned)) throw new CopyEditError('That text cannot be typeset. Try plain wording.');
    edits[field] = cleaned;
  }
  return edits;
}

/**
 * A copy of `direction` with the edited wording in place. Throws a
 * {@link CopyEditError} when the edit targets a line that is not on the
 * creative, would drop a fact the creative is required to state, or would not
 * survive the same sanitising the renderer applies.
 */
export function applyTextEdits(
  direction: CreativeDirection,
  concept: GraphicDesignConcept,
  edits: TextEdits,
  requiredClaims: string[] = [],
): CreativeDirection {
  const editable = new Set(listEditableText(direction, concept, requiredClaims).map((l) => l.field));
  for (const field of Object.keys(edits) as EditableTextField[]) {
    if (!editable.has(field)) throw new CopyEditError('That text is not on this creative, so it cannot be edited.');
  }

  const next: CreativeDirection = structuredClone(direction);
  const marketing = () => (next.marketingCreative ??= {} as NonNullable<CreativeDirection['marketingCreative']>);
  if (edits.headline !== undefined) next.headline = edits.headline;
  if (edits.supportingLine !== undefined) next.supportingLine = edits.supportingLine;
  if (edits.cta !== undefined) next.cta = edits.cta;
  if (edits.offerText !== undefined) marketing().offerText = edits.offerText;
  if (edits.eventBadge !== undefined) marketing().eventBadge = edits.eventBadge;
  if (edits.brandMessage !== undefined) marketing().brandMessage = edits.brandMessage;

  const after = renderedLines(next, concept, requiredClaims);

  // The renderer drops duplicates and sanitises: an edit that vanishes in
  // either step would be applied silently to nothing.
  for (const [field, text] of Object.entries(edits) as [EditableTextField, string][]) {
    const survives = after.some((l) => l.role === FIELD_ROLE[field] && normalise(l.text) === normalise(text));
    if (!survives) {
      throw new CopyEditError('That wording cannot be placed on the creative. It may repeat another line. Try different wording.');
    }
  }

  const missing = evaluateIntentFidelity(requiredClaims, after.map((l) => l.text).join(' ')).missingRequirements;
  if (missing.length) {
    throw new CopyEditError(`That wording drops ${missing.join(', ')}, which this creative has to state. Keep it in one of the lines.`);
  }

  return next;
}

/**
 * The lines of a finished creative a member may restyle or reword, and how
 * each maps onto the copy roles the renderer typesets.
 *
 * Its own module so wording rules (copy-edit.ts), style rules (type-style.ts)
 * and the composer (designer-composition.ts) can share the vocabulary without
 * importing one another.
 */

export type EditableTextField =
  | 'headline'
  | 'supportingLine'
  | 'offerText'
  | 'eventBadge'
  | 'brandMessage'
  | 'cta';

/** Longest wording each line accepts: the point past which typesetting stops being credible. */
export const MAX_EDITED_TEXT_LENGTH: Record<EditableTextField, number> = {
  headline: 120,
  supportingLine: 160,
  offerText: 80,
  eventBadge: 60,
  brandMessage: 160,
  cta: 40,
};

export const EDITABLE_TEXT_FIELDS = Object.keys(MAX_EDITED_TEXT_LENGTH) as EditableTextField[];

/** Which copy role each editable field feeds, mirroring `collectCampaignCopy`. */
export const FIELD_ROLE: Record<EditableTextField, string> = {
  headline: 'HEADLINE',
  supportingLine: 'SUPPORT',
  offerText: 'OFFER',
  eventBadge: 'EVENT_BADGE',
  brandMessage: 'BRAND_MESSAGE',
  cta: 'CTA',
};

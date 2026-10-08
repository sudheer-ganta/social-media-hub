import type { DesignCriticEvaluation } from '../generators/design-critic.generator';
import { classifyCriticFailure, type CriticFailureClass } from './critic-recovery';
import { needsReadingSpace, type CollisionReading } from './reading-space';

/**
 * What to do when every attempt has been rejected.
 *
 * The critic rejects for two different kinds of reason, and they are not equally
 * serious. A defect is something a member would see as broken: type that cannot be
 * read or sits on the subject, a logo that is missing or clipped, copy that is
 * malformed or drops a fact they asked for. An idea-level rejection is the critic's
 * judgement that the piece is competent but generic: no single idea, a layout that
 * could belong to any campaign, a template look.
 *
 * Today both end the same way, with an error and the member's credits refunded
 * after a few minutes and several image generations. With this enabled, an attempt
 * with no defects is delivered when the only objection left is idea-level. An
 * attempt with a defect is never delivered.
 *
 * Off unless CREATIVE_ACCEPT_LEGIBLE_BEST=true, because it lowers the bar on
 * originality in exchange for delivering something, and that is a product choice.
 * The same switch turns on the reading-space repair (see reading-space.ts), which is
 * what gives an attempt that collided with its subject a legible form to deliver.
 */

export function legibleBestEnabled(): boolean {
  return process.env.CREATIVE_ACCEPT_LEGIBLE_BEST === 'true';
}

/** Rejections a member would call broken. Any one of these disqualifies an attempt. */
const DEFECTS: ReadonlySet<CriticFailureClass> = new Set<CriticFailureClass>([
  'COPY_INTEGRITY_FAILURE',
  'COPY_VALIDITY_FAILURE',
  'OCCLUSION_FAILURE',
  'LEGIBILITY_FAILURE',
  'LOGO_LEGIBILITY_FAILURE',
  'BRAND_FAILURE',
]);

export interface RejectedAttempt<T> {
  result: T;
  critic: DesignCriticEvaluation;
  reading: CollisionReading;
}

/** Whether an attempt is free of defects, whatever else the critic thought of it. */
export function isLegible<T>(attempt: RejectedAttempt<T>): boolean {
  if (needsReadingSpace(attempt.reading)) return false;
  if (attempt.critic.textOccludesSubject === true || attempt.critic.logoClear === false) return false;
  return classifyCriticFailure(attempt.critic).failures.every((failure) => !DEFECTS.has(failure));
}

/**
 * The attempt to deliver: of those with no defects, the one the critic objected to
 * least, then the one whose type sits furthest from the subject. Undefined when
 * every attempt has a defect.
 */
export function pickLegibleBest<T>(attempts: RejectedAttempt<T>[]): RejectedAttempt<T> | undefined {
  return attempts
    .filter(isLegible)
    .sort((a, b) =>
      (a.critic.problems?.length ?? 0) - (b.critic.problems?.length ?? 0)
      || a.reading.overlap - b.reading.overlap)[0];
}

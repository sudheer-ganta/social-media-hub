/**
 * The scheduling API's error vocabulary.
 *
 * A code as well as a message, which the publish API does not have. The
 * difference is who reads it: a publish failure is shown to a member and
 * nothing more, while a schedule failure is something the composer has to
 * *act* on — put the error on the date field for SCHEDULE_TIME_IN_PAST, send
 * the member to Integrations for ACCOUNT_NOT_CONNECTED, refresh the list for
 * SCHEDULE_ALREADY_PUBLISHED. Matching on English prose is how that breaks.
 *
 * Every message here is written for a member. Nothing a provider said ever
 * reaches one — the publish service translates before this layer sees it.
 */
export type ScheduleErrorCode =
  | 'SCHEDULE_TIME_IN_PAST'
  | 'SCHEDULE_TIME_INVALID'
  | 'TIMEZONE_INVALID'
  | 'NO_DESTINATIONS'
  | 'ACCOUNT_NOT_CONNECTED'
  | 'PROVIDER_NOT_SUPPORTED'
  | 'INVALID_MEDIA'
  | 'INVALID_CONTENT'
  | 'SCHEDULE_NOT_FOUND'
  | 'SCHEDULE_ALREADY_PROCESSING'
  | 'SCHEDULE_ALREADY_PUBLISHED'
  | 'SCHEDULE_CANCELLED';

const STATUS_BY_CODE: Record<ScheduleErrorCode, number> = {
  SCHEDULE_TIME_IN_PAST: 400,
  SCHEDULE_TIME_INVALID: 400,
  TIMEZONE_INVALID: 400,
  NO_DESTINATIONS: 400,
  ACCOUNT_NOT_CONNECTED: 400,
  PROVIDER_NOT_SUPPORTED: 400,
  INVALID_MEDIA: 400,
  INVALID_CONTENT: 400,
  // 404 rather than 403 for a post that exists but belongs to someone else —
  // a 403 confirms the id is real, which is the same leak the publish service
  // avoids. Ownership failures and missing rows are indistinguishable by
  // design.
  SCHEDULE_NOT_FOUND: 404,
  SCHEDULE_ALREADY_PROCESSING: 409,
  SCHEDULE_ALREADY_PUBLISHED: 409,
  SCHEDULE_CANCELLED: 409,
};

export class ScheduleError extends Error {
  readonly status: number;

  constructor(
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleError';
    this.status = STATUS_BY_CODE[code];
  }
}

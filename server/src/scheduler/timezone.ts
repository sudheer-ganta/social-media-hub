/**
 * Wall clock → instant, and back.
 *
 * The browser sends a *local* time and the zone it means it in:
 *
 *   scheduledAt: "2026-08-20T09:30:00"   timezone: "Asia/Kolkata"
 *
 * Those two together name exactly one instant. Neither alone does — and the
 * one thing this module exists to prevent is the backend guessing. `new
 * Date("2026-08-20T09:30:00")` on Render resolves in Render's zone (UTC), which
 * silently publishes a Kolkata member's 9:30am post at 3:00pm their time.
 *
 * No dependency. `Intl.DateTimeFormat` with a `timeZone` already knows every
 * IANA zone and every DST rule in the tzdata the runtime ships, which is the
 * same data a date library would be wrapping. Node has had full ICU built in
 * since v13.
 */

/** A local time that could not be resolved in the zone it was given. */
export class TimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimezoneError';
  }
}

/** `YYYY-MM-DDTHH:mm` with optional seconds. What the composer sends. */
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Whether the runtime recognises an IANA zone name.
 *
 * Checked rather than trusted: the zone arrives from the browser, and an
 * unknown one must be a validation error at schedule time — not an exception
 * thrown by the worker hours later, with the post already committed.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The UTC offset of a zone *at a given instant*, in milliseconds.
 *
 * Formats the instant in the target zone, reads the resulting wall clock back
 * as if it were UTC, and subtracts. The difference is the offset that applied
 * at that instant — which is what makes this DST-correct: the same zone answers
 * +05:30 all year for Kolkata, and -04:00 or -05:00 for New York depending on
 * where the instant falls.
 */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const field = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  // `hour12: false` renders midnight as hour 24 in some ICU versions.
  const hour = field('hour') % 24;

  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    hour,
    field('minute'),
    field('second'),
  );

  // Millisecond precision is lost by formatToParts; add it back from the
  // instant so an offset is never rounded to the second.
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * Resolves a local wall-clock time in a zone to the UTC instant it names.
 *
 * The offset depends on the instant and the instant depends on the offset, so
 * this iterates: guess the instant by treating the wall clock as UTC, read the
 * offset that applies there, correct, and re-read. Two passes settle every real
 * case, including a time that sits on one side of a DST boundary and whose
 * first guess lands on the other.
 *
 * **Gaps.** 2:30am on a spring-forward morning does not exist. The correction
 * pass would settle on 1:30am — an hour *early* — so a wall clock that does not
 * round-trip keeps the uncorrected first pass instead, which lands on 3:30am.
 * Shifting forward is both what every mainstream date library does and the only
 * safe direction: publishing an hour late once a year is recoverable, and
 * publishing an hour before a member expected is not. It is never rejected;
 * refusing to schedule over a clock change would be worse than either.
 *
 * **Overlaps.** 1:30am on a fall-back morning happens twice. This returns the
 * first (still-DST) occurrence, matching every mainstream date library.
 */
export function zonedTimeToUtc(localIso: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new TimezoneError(`Unknown timezone: ${timeZone}`);
  }

  const match = LOCAL_ISO.exec(localIso.trim());
  if (!match) {
    throw new TimezoneError(
      `Expected a local date and time like 2026-08-20T09:30, got: ${localIso}`,
    );
  }

  const [, year, month, day, hour, minute, second] = match;
  const wallClockAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );

  if (Number.isNaN(wallClockAsUtc)) {
    throw new TimezoneError(`Not a real date and time: ${localIso}`);
  }

  // Pass one: assume the offset that applies at the naive instant.
  const first = new Date(wallClockAsUtc - offsetAt(new Date(wallClockAsUtc), timeZone));
  // Pass two: re-read the offset *at that instant* and correct. This is the
  // pass that gets a time near a DST boundary right.
  const corrected = new Date(wallClockAsUtc - offsetAt(first, timeZone));

  // A wall clock inside a spring-forward gap does not exist, so no instant
  // reads back as it. The corrected pass lands an hour early there; the
  // uncorrected one lands an hour late, which is the direction to fail in.
  const requested = localIso.trim().replace(' ', 'T').slice(0, 16);
  return utcToZonedLocalIso(corrected, timeZone) === requested ? corrected : first;
}

/**
 * The wall clock an instant reads as in a zone, as `YYYY-MM-DDTHH:mm`.
 *
 * The inverse of {@link zonedTimeToUtc}, for handing a stored schedule back to
 * an editor. Round-trips exactly outside a DST gap, where by definition no
 * wall-clock string maps back to the instant it came from.
 */
export function utcToZonedLocalIso(instant: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new TimezoneError(`Unknown timezone: ${timeZone}`);
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);

  const field = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  const hour = String(Number(field('hour')) % 24).padStart(2, '0');

  return `${field('year')}-${field('month')}-${field('day')}T${hour}:${field('minute')}`;
}

import { PublishError } from '../publish/services/publish.service';

/**
 * Which failures are worth trying again, and how long to wait.
 *
 * Both decisions are pure functions of what the publish service already throws,
 * which is the point: `publish.service.ts` has spent four sprints deciding what
 * every provider failure *means* for a member, and re-deriving that here from
 * raw HTTP statuses would be a second, drifting opinion. A {@link PublishError}
 * carries a status chosen for exactly this kind of judgement.
 */

/**
 * How many claims one destination gets before it is left FAILED.
 *
 * Three, not ten. Every attempt costs a token decrypt, a media download and a
 * request to someone's API; a network that has refused three times over roughly
 * eleven minutes is not going to accept the fourth, and a member who scheduled
 * a post for 9am would rather see a failure at 9:11 than at 4pm.
 */
export const MAX_ATTEMPTS = 3;

/** Waits before attempt 2 and attempt 3. Exponential, and deliberately short. */
const BACKOFF_MS = [60_000, 600_000];

/**
 * A publish that failed for a reason that might not be true a minute from now.
 *
 *   • **502** — the publish service's answer for "the network couldn't be
 *     reached", which covers a provider 5xx, a DNS blip and a timeout.
 *   • **429** — rate limited. The whole reason retries exist: a member who
 *     scheduled four posts for 9:00 must not lose three of them.
 *   • **500** — something went wrong on our side before or during the call.
 *   • **409** — another worker holds the claim. Not a failure at all; the
 *     caller treats it as "come back later", never as an attempt.
 *
 * Everything else is permanent *by default*, and that default is the safe one:
 * a caption the network rejected, a revoked account, a scope that was never
 * granted, media in a format nobody accepts. Retrying those republishes the
 * same rejection three times and buries the real message under two more.
 */
export function isRetryable(error: unknown): boolean {
  const status = error instanceof PublishError ? error.status : 500;
  return status === 429 || status === 500 || status === 502 || status === 409;
}

/**
 * When attempt `attempts` should be followed by another, or null when it should
 * not be.
 *
 * `attempts` is the count *including* the one that just failed, so the first
 * failure asks for index 0 — one minute. Ten minutes after that. Then nothing.
 */
export function nextAttemptAt(
  attempts: number,
  now: Date = new Date(),
): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  return new Date(now.getTime() + delay);
}

/**
 * The message stored against a failed destination.
 *
 * A {@link PublishError}'s message is already written for a member and already
 * stripped of anything the provider said — that translation is
 * `publish.service.ts`' whole second rule. Anything else is an unexpected
 * error whose message can quote a request, a URL or a connection string, and
 * this column is read straight into the UI. So: the translated message, or a
 * generic one. Never `error.message` from an unknown throw.
 */
export function toStoredMessage(error: unknown): string {
  if (error instanceof PublishError) return error.message;
  return 'Something went wrong while publishing. Your post was not published.';
}

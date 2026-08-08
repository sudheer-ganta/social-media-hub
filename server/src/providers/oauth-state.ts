import crypto from 'crypto';

/**
 * Pending OAuth `state` values, shared by every provider.
 *
 * This is the CSRF defence for every OAuth flow in the app, and it is the only
 * carrier of *which FlowPost user* is connecting — a network's redirect back to
 * us tells us nothing about our own session. That makes it security-sensitive
 * enough to have exactly one implementation: a second copy is a second place to
 * get single-use, expiry or entropy wrong.
 *
 * Each provider takes its own store, so a state minted for Instagram can never
 * satisfy a LinkedIn callback.
 *
 * Still in-memory: a restart or a second instance drops in-flight connects,
 * which the member recovers from by pressing Connect again. Moving this to a
 * signed cookie or Redis is a change to this file with no caller changes.
 */

export interface PendingOAuthState {
  /** Wall-clock ms at which the entry stops being accepted. */
  expiresAt: number;
  /**
   * The FlowPost user who started this connect, resolved from their Supabase
   * session before we ever left the app.
   */
  userId: string;
}

/** Ten minutes. Long enough for a consent screen, short enough to bound replay. */
export const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStateStore {
  /**
   * Mints a 32-byte CSPRNG value, base64url so it survives a query string
   * untouched, and binds it to a user for {@link ttlMs}.
   */
  create(userId: string): string;
  /**
   * Looks up an incoming state and deletes it in the same step.
   *
   * Single-use by construction: consuming on lookup is what stops a replayed
   * callback URL from writing the account a second time, and it satisfies the
   * "delete state after successful validation" rule without a second call the
   * error paths could skip. Returns null for unknown, expired or already-used
   * values — the caller cannot tell those apart, and neither should an attacker.
   */
  consume(state: string): PendingOAuthState | null;
}

export function createOAuthStateStore(
  ttlMs: number = DEFAULT_OAUTH_STATE_TTL_MS,
): OAuthStateStore {
  const pending = new Map<string, PendingOAuthState>();

  /** Drops entries past their TTL. Cheap enough to run on every mint. */
  function evictExpired(now: number): void {
    for (const [state, entry] of pending) {
      if (entry.expiresAt <= now) pending.delete(state);
    }
  }

  return {
    create(userId: string): string {
      const now = Date.now();
      evictExpired(now);

      const state = crypto.randomBytes(32).toString('base64url');
      pending.set(state, { expiresAt: now + ttlMs, userId });
      return state;
    },

    consume(state: string): PendingOAuthState | null {
      const entry = pending.get(state);
      if (!entry) return null;

      pending.delete(state);

      return entry.expiresAt <= Date.now() ? null : entry;
    },
  };
}

/**
 * Express types a query value as string | string[] | ParsedQs. A repeated
 * `?code=a&code=b` is not something a legitimate redirect does, so anything
 * that is not a plain string is discarded rather than coerced.
 */
export function firstQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

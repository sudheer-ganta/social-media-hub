import crypto from 'crypto';
import type { FacebookPage } from './types';

/**
 * Facebook connects in two acts, and this holds the interval between them.
 *
 * Every other provider FlowPost integrates finishes in the OAuth callback: the
 * network tells us which account this is, and we store it. Facebook cannot —
 * `/me/accounts` returns *n* Pages and only the member knows which one this
 * context is for. So the callback ends with a question rather than a
 * connection, and this store is what carries the answer's context across the
 * gap.
 *
 * ─── Why this is not the OAuth state store ───────────────────────────────────
 *
 * They look similar and they are guarding different things. An OAuth state is a
 * nonce handed to a *third party* and validated on an unauthenticated redirect;
 * a pending selection is an id handed to our own authenticated SPA and redeemed
 * on an authenticated request. Folding them together would mean either
 * weakening the state store's contract or storing a live access token inside
 * the value we hand to facebook.com. Neither is worth the shared file.
 *
 * ─── What is in here, and for how long ───────────────────────────────────────
 *
 * A **long-lived user access token**, in plaintext, in process memory. That is
 * the uncomfortable part and it is why the TTL is short (5 minutes, versus the
 * OAuth state's 10) and why {@link consume} deletes on read. It never reaches
 * the database in this form and it never reaches the browser at all — the
 * browser sees only `toPageChoices()` output.
 *
 * Still in-memory, same as the OAuth state store: a restart or a second
 * instance drops in-flight selections, which the member recovers from by
 * pressing Connect again. Moving this to Redis is a change to this file with no
 * caller changes.
 */

export interface PendingPageSelection {
  /** Wall-clock ms at which the entry stops being accepted. */
  expiresAt: number;
  /**
   * The FlowPost user this selection belongs to, carried over from the
   * server-minted OAuth state. The select endpoint requires an authenticated
   * session *and* checks it against this — holding the selection id is not
   * enough, so a leaked id is not a usable credential.
   */
  userId: string;
  /**
   * The publishing context the connection will join, decided at connect time
   * and ownership-checked before the state was ever minted. Read from here and
   * never from the select request, which is what stops a member from starting a
   * Personal connect and finishing it into a Brand.
   */
  contextType: string;
  brandId: string | null;
  /**
   * The long-lived user token. Kept because a Page token cannot be re-minted
   * without it — it is stored on the connection at the end of the flow. Never
   * logged, never returned to the browser.
   */
  userAccessToken: string;
  /** When that user token expires, for the record. */
  userTokenExpiresAt: Date | null;
  /** Permissions the member granted, comma-delimited. */
  scope: string | null;
  /** The Pages this member may publish to, each with its own Page token. */
  pages: FacebookPage[];
}

export interface PendingSelectionStore {
  /** Mints a 32-byte CSPRNG id and binds it to a pending selection. */
  create(entry: Omit<PendingPageSelection, 'expiresAt'>): string;
  /**
   * Reads an entry **without** consuming it, for the picker's initial render.
   *
   * Non-destructive on purpose: the browser has to be able to list the Pages
   * and then post a choice, and a read that consumed would make the second call
   * impossible. The entry is still bound to a user and still expires.
   */
  peek(id: string, userId: string): PendingPageSelection | null;
  /**
   * Reads and deletes in the same step.
   *
   * Single-use by construction, which is what stops a replayed select request
   * from writing the connection a second time. Returns null for unknown,
   * expired, already-used or wrong-user ids — the caller cannot tell those
   * apart, and neither should anyone else.
   */
  consume(id: string, userId: string): PendingPageSelection | null;
}

export function createPendingSelectionStore(
  ttlMs: number,
): PendingSelectionStore {
  const pending = new Map<string, PendingPageSelection>();

  /** Drops entries past their TTL. Cheap enough to run on every mint. */
  function evictExpired(now: number): void {
    for (const [id, entry] of pending) {
      if (entry.expiresAt <= now) pending.delete(id);
    }
  }

  function read(id: string, userId: string): PendingPageSelection | null {
    const entry = pending.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      pending.delete(id);
      return null;
    }
    // The session and the selection must agree about whose connection this is.
    if (entry.userId !== userId) return null;
    return entry;
  }

  return {
    create(entry): string {
      const now = Date.now();
      evictExpired(now);

      const id = crypto.randomBytes(32).toString('base64url');
      pending.set(id, { ...entry, expiresAt: now + ttlMs });
      return id;
    },

    peek(id, userId) {
      return read(id, userId);
    },

    consume(id, userId) {
      const entry = read(id, userId);
      if (entry) pending.delete(id);
      return entry;
    },
  };
}

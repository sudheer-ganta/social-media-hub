import crypto from 'crypto';

/**
 * PKCE (RFC 7636), the S256 method.
 *
 * Pure and dependency-free so it can be asserted on directly. Nothing here logs
 * anything — a logged `code_verifier` is a logged credential.
 *
 * ─── What PKCE is defending against here ────────────────────────────────────
 *
 * The authorization code arrives back on a URL. Anything that can observe that
 * URL — a browser extension, a shared log, a malicious app registered on the
 * same custom scheme — can try to redeem it. PKCE makes the code useless on its
 * own: redemption also requires the `code_verifier`, which never leaves this
 * backend in a form anyone else can read (it rides in the HMAC-signed HttpOnly
 * state cookie, and is sent only on the direct server-to-server token call).
 *
 * `S256`, never `plain`. The `plain` method puts the verifier itself in the
 * authorization URL, which defeats the entire mechanism, and X rejects it.
 */

/**
 * RFC 7636 allows 43–128 characters. 32 random bytes base64url-encode to 43,
 * which is the minimum length and already 256 bits of entropy — more bytes buy
 * a longer string, not a stronger secret.
 */
const VERIFIER_BYTES = 32;

/**
 * A cryptographically secure `code_verifier`.
 *
 * `randomBytes` rather than `Math.random`: this value is the only thing
 * standing between a captured authorization code and a usable token.
 * base64url output is already in the RFC's unreserved character set, so it
 * needs no further escaping in a form body.
 */
export function createCodeVerifier(): string {
  return crypto.randomBytes(VERIFIER_BYTES).toString('base64url');
}

/**
 * The `code_challenge` for a verifier: base64url(SHA-256(verifier)).
 *
 * The verifier is hashed as **ASCII**, per the RFC — it is base64url text, not
 * the bytes it decodes to, and hashing the decoded bytes produces a challenge X
 * will reject at exchange time with a generic `invalid_grant`.
 */
export function toCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Both halves at once, which is how `connect()` always wants them. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = createCodeVerifier();
  return { verifier, challenge: toCodeChallenge(verifier) };
}

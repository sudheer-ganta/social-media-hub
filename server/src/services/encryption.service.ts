import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Symmetric encryption for OAuth tokens at rest.
 *
 * AES-256-GCM rather than plain CBC: GCM authenticates the ciphertext, so a
 * token tampered with in the database fails to decrypt instead of silently
 * yielding garbage that we'd then send to LinkedIn.
 *
 * Ciphertext format — a single string, so it drops straight into a TEXT column:
 *
 *   v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 *
 * The `v1` prefix is what makes a future algorithm change survivable: decrypt()
 * can branch on it and still read rows written by the old scheme.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const AUTH_TAG_BYTES = 16;

/**
 * Decoded once at first use rather than at import time, so a misconfigured key
 * surfaces as a clear error from the code path that needs it instead of
 * crashing the process before the server can even report why.
 */
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. OAuth tokens cannot be encrypted. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  // Accept either base64 (44 chars) or hex (64 chars); both are common ways to
  // paste 32 bytes into an env file.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes for AES-256, ` +
        `got ${key.length}. Generate a valid key with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  cachedKey = key;
  return key;
}

/** Encrypts a plaintext token. Returns the versioned ciphertext string. */
export function encrypt(text: string): string {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('encrypt() requires a non-empty string');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Reverses {@link encrypt}. Throws when the ciphertext is malformed, was
 * written under a different key, or has been tampered with — never returns a
 * partially-decrypted value.
 */
export function decrypt(cipherText: string): string {
  if (typeof cipherText !== 'string' || cipherText.length === 0) {
    throw new Error('decrypt() requires a non-empty string');
  }

  const parts = cipherText.split('.');
  if (parts.length !== 4) {
    throw new Error('Malformed ciphertext: expected v1.<iv>.<tag>.<data>');
  }

  const [version, ivB64, authTagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version "${version}"`);
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Malformed ciphertext: bad IV or auth tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // GCM's own integrity check failed. Almost always a rotated
    // TOKEN_ENCRYPTION_KEY; the fix is for the user to reconnect the account.
    throw new Error(
      'Failed to decrypt token: wrong TOKEN_ENCRYPTION_KEY or corrupted data.',
    );
  }
}

/** Convenience for optional columns — null in, null out. */
export function encryptNullable(text: string | null | undefined): string | null {
  return text ? encrypt(text) : null;
}

/** Convenience for optional columns — null in, null out. */
export function decryptNullable(
  cipherText: string | null | undefined,
): string | null {
  return cipherText ? decrypt(cipherText) : null;
}

export const encryptionService = {
  encrypt,
  decrypt,
  encryptNullable,
  decryptNullable,
};

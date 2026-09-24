import { createHash, randomBytes } from 'node:crypto';

/** A high-entropy per-terminal token, returned once at redeem time. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored at rest. SHA-256 is enough for a 256-bit token. */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

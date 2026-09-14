import { createHash } from 'node:crypto';

/**
 * Debounce key = SHA-256(terminal_id + client IP + User-Agent).
 * NUL separators prevent ambiguous concatenation between fields.
 */
export function debounceKey(terminalId, clientIp, userAgent) {
  return createHash('sha256')
    .update(`${terminalId}\u0000${clientIp ?? ''}\u0000${userAgent ?? ''}`)
    .digest('hex');
}

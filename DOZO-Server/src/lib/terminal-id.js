const TERMINAL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** True when a caller-supplied terminal_id is URL-safe and 8-64 chars. */
export function isValidTerminalId(value) {
  return typeof value === 'string' && TERMINAL_ID_RE.test(value);
}

/**
 * Derive a stable terminal_id from a device serial when the client does not
 * supply one: uppercase, strip everything outside [A-Z0-9], truncate to 32,
 * and zero-pad to a minimum length of 8.
 */
export function deriveTerminalId(deviceSerial) {
  const normalized = String(deviceSerial).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const truncated = normalized.slice(0, 32);
  return truncated.length >= 8 ? truncated : truncated.padEnd(8, '0');
}

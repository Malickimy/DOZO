/**
 * Tiny in-memory TTL set used to collapse repeated scans.
 *
 * `seen(key)` returns true when the key was seen within the TTL window
 * (caller should NOT insert a scan), false on the first sighting (caller
 * should insert). The window is refreshed only when the key is absent or
 * expired, so a burst of requests within the window yields one scan.
 */
export function createDebounce({ ttlMs = 120_000, maxEntries = 50_000, now = Date.now } = {}) {
  const entries = new Map();

  function prune(timestamp) {
    for (const [key, expiresAt] of entries) {
      if (expiresAt <= timestamp) entries.delete(key);
    }
  }

  return {
    seen(key) {
      const timestamp = now();
      const expiresAt = entries.get(key);
      if (expiresAt !== undefined && expiresAt > timestamp) {
        return true;
      }
      if (entries.size >= maxEntries) prune(timestamp);
      entries.set(key, timestamp + ttlMs);
      return false;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

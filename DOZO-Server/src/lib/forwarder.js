/**
 * Drain a scan spool to the dashboard's `/scans` ingest.
 *
 * Each entry POSTs once; successes are dropped from the spool and failures stay
 * for the next drain (at-least-once delivery, deduped dashboard-side by
 * `event_id`). Drains are serialized so concurrent redirects cannot race.
 */
export function createForwarder({
  spool,
  ingestUrl,
  secret,
  logger = console,
  fetchImpl = globalThis.fetch,
} = {}) {
  let draining = false;

  async function drain() {
    if (draining || !spool || !fetchImpl) return;
    draining = true;
    try {
      const entries = spool.readAll();
      if (!entries.length) return;

      const remaining = [];
      for (const entry of entries) {
        try {
          const response = await fetchImpl(`${String(ingestUrl).replace(/\/+$/, '')}/scans`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-connector-secret': secret ?? '',
            },
            body: JSON.stringify(entry),
          });
          if (!response.ok) {
            throw new Error(`ingest responded ${response.status}`);
          }
        } catch (error) {
          remaining.push(entry);
          logger?.warn?.(
            { event_id: entry.event_id, err: error?.message },
            'scan forward failed; kept in spool',
          );
        }
      }

      if (remaining.length !== entries.length) {
        spool.replace(remaining);
      }
    } finally {
      draining = false;
    }
  }

  return { drain };
}

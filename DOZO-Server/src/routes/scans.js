import { makeConnectorSecretHook } from '../middleware/connector-secret.js';

/**
 * POST /scans - connector scan ingest (Release Board R2).
 *
 * Authenticated with `X-Connector-Secret`. Idempotent on `event_id`: a repeat is
 * a `202 duplicate` with no new row. Unknown terminals are logged and dropped,
 * never a `404`, so the connector can forward without special-casing them.
 */
export function registerScanRoutes(app) {
  const { db, config } = app;

  const terminalExists = db.prepare('SELECT 1 FROM terminals WHERE terminal_id = ?');
  const insertScan = db.prepare(
    `INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(event_id) DO NOTHING`,
  );

  app.post(
    '/scans',
    { preHandler: makeConnectorSecretHook(config) },
    async (request, reply) => {
      const body = request.body ?? {};
      const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
      const terminalId = typeof body.terminal_id === 'string' ? body.terminal_id.trim() : '';
      const merchantId = typeof body.merchant_id === 'string' ? body.merchant_id.trim() : '';
      const scannedAt = typeof body.scanned_at === 'string' ? body.scanned_at.trim() : '';
      const userAgent = typeof body.user_agent === 'string' ? body.user_agent : null;

      if (
        !eventId ||
        !terminalId ||
        !merchantId ||
        !scannedAt ||
        Number.isNaN(new Date(scannedAt).getTime())
      ) {
        return reply.code(400).send({ error: 'malformed' });
      }

      if (!terminalExists.get(terminalId)) {
        request.log.warn(
          { terminal_id: terminalId, event_id: eventId },
          'dropping scan for unknown terminal',
        );
        return reply.code(202).send({ status: 'accepted' });
      }

      const result = insertScan.run(terminalId, scannedAt, userAgent, eventId);
      return reply.code(202).send({ status: result.changes ? 'accepted' : 'duplicate' });
    },
  );
}

import { makeConnectorSecretHook } from '../middleware/connector-secret.js';

// Fastify rejects an unparseable/empty JSON body before the handler runs, with
// its own `FST_ERR_CTP_*_JSON_BODY` shape. The contract documents `400
// {error:'malformed'}` for `POST /scans`, so map those parser errors back.
const MALFORMED_JSON_CODES = new Set([
  'FST_ERR_CTP_INVALID_JSON_BODY',
  'FST_ERR_CTP_EMPTY_JSON_BODY',
]);

/**
 * POST /scans - connector scan ingest (Release Board R2).
 *
 * Authenticated with `X-Connector-Secret`. Idempotent on `event_id`: a repeat is
 * a `202 duplicate` with no new row. Unknown terminals are logged and dropped,
 * never a `404`, so the connector can forward without special-casing them.
 *
 * Inactive terminals are dropped the same way (G04): `GET /r/:terminal_id`
 * refuses them, so an ingest for one is a straggler that must not write a row.
 * Keeping the `202` preserves the connector contract and stops the forwarder
 * from retrying a deactivated terminal forever.
 */
export function registerScanRoutes(app) {
  const { db, config } = app;

  const getTerminal = db.prepare('SELECT active FROM terminals WHERE terminal_id = ?');
  const insertScan = db.prepare(
    `INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(event_id) DO NOTHING`,
  );

  app.register(async (scoped) => {
    scoped.setErrorHandler((error, request, reply) => {
      if (MALFORMED_JSON_CODES.has(error.code)) {
        return reply.code(400).send({ error: 'malformed' });
      }
      return reply.send(error);
    });

    scoped.post(
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

        const terminal = getTerminal.get(terminalId);
        if (!terminal || !terminal.active) {
          request.log.warn(
            { terminal_id: terminalId, event_id: eventId, reason: terminal ? 'inactive' : 'unknown' },
            'dropping scan for unknown or inactive terminal',
          );
          return reply.code(202).send({ status: 'accepted' });
        }

        const result = insertScan.run(terminalId, scannedAt, userAgent, eventId);
        return reply.code(202).send({ status: result.changes ? 'accepted' : 'duplicate' });
      },
    );
  });
}

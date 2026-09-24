import { makeConnectorSecretHook } from '../middleware/connector-secret.js';

/**
 * GET /api/connector/config
 *
 * The connector's last-known config: every terminal with everything it needs to
 * resolve `/r/:terminal_id` without touching the dashboard's database. Owned by
 * the dashboard entrypoint and authenticated with `X-Connector-Secret` (R4).
 */
export function registerConnectorConfigRoute(app) {
  const { db, config, now } = app;

  const listTerminals = db.prepare(
    `SELECT t.terminal_id, t.merchant_id, m.google_place_id, t.label, t.active
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      ORDER BY t.terminal_id`,
  );

  app.get(
    '/api/connector/config',
    { preHandler: makeConnectorSecretHook(config) },
    async () => ({
      generated_at: now().toISOString(),
      redirect_base_url: config.redirectDomain,
      terminals: listTerminals.all().map((row) => ({
        terminal_id: row.terminal_id,
        merchant_id: row.merchant_id,
        google_place_id: row.google_place_id,
        label: row.label,
        active: Boolean(row.active),
      })),
    }),
  );
}

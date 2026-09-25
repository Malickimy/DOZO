import { isValidTerminalId } from '../lib/terminal-id.js';
import { configPayload } from './terminal-config.js';

/**
 * Adopt-an-existing-register API used when a terminal is swapped.
 *
 *   GET  /api/merchants/:merchant_id/registers
 *   POST /api/terminals/adopt
 */
export function registerRegisterRoutes(app) {
  const { db, config, now } = app;

  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  // A register is first-class: it can exist unoccupied (terminal_id null), and
  // last_seen is derived from whichever terminal is currently bound.
  const listRegisters = db.prepare(
    `SELECT r.label, r.terminal_id, r.active, t.last_seen
       FROM registers r
       LEFT JOIN terminals t ON t.terminal_id = r.terminal_id
      WHERE r.merchant_id = ?
      ORDER BY r.label, r.terminal_id`,
  );
  const getTerminal = db.prepare(
    `SELECT t.terminal_id, t.merchant_id, t.label, t.active,
            t.display_enabled, t.display_timeout_seconds, m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      WHERE t.terminal_id = ?`,
  );
  const upsertTerminal = db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)
     ON CONFLICT(terminal_id) DO UPDATE SET
       merchant_id = excluded.merchant_id,
       label       = excluded.label,
       active      = 1`,
  );

  app.get('/api/merchants/:merchant_id/registers', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }
    return listRegisters.all(merchantId).map((row) => ({
      label: row.label,
      terminal_id: row.terminal_id,
      active: Boolean(row.active),
      last_seen: row.last_seen,
    }));
  });

  app.post('/api/terminals/adopt', async (request, reply) => {
    const body = request.body ?? {};
    const terminalId = typeof body.terminal_id === 'string' ? body.terminal_id.trim() : '';
    const merchantId = typeof body.merchant_id === 'string' ? body.merchant_id.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';

    if (!isValidTerminalId(terminalId)) {
      return reply.code(400).send({ error: 'invalid_terminal_id' });
    }
    if (!merchantId) {
      return reply.code(400).send({ error: 'invalid_merchant_id' });
    }
    if (!label) {
      return reply.code(400).send({ error: 'invalid_label' });
    }
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const normalizedId = terminalId.toUpperCase();
    upsertTerminal.run(normalizedId, merchantId, label, now().toISOString());
    return configPayload(getTerminal.get(normalizedId), config);
  });
}

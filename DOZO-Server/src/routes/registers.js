/**
 * Register listing for the dashboard.
 *
 *   GET /api/merchants/:merchant_id/registers
 *
 * Registers are first-class (R7): a register can exist unoccupied
 * (`terminal_id` null) and `last_seen` is derived from the bound terminal. The
 * legacy `POST /api/terminals/adopt` behavior was retired with model-A pairing.
 */
import { assertTerminalAccess } from '../middleware/terminal-auth.js';
import { staticReviewUrl } from './terminal-config.js';

export function registerRegisterRoutes(app) {
  const { db, config } = app;

  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  const listRegisters = db.prepare(
    `SELECT r.label, r.terminal_id, t.active AS terminal_active, t.last_seen,
            m.google_place_id
       FROM registers r
       LEFT JOIN terminals t ON t.terminal_id = r.terminal_id
       JOIN merchants m ON m.merchant_id = r.merchant_id
      WHERE r.merchant_id = ?
      ORDER BY r.label, r.terminal_id`,
  );

  app.get('/api/merchants/:merchant_id/registers', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!assertTerminalAccess(request, reply, { merchantId })) return;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }
    return listRegisters.all(merchantId).map((row) => ({
      label: row.label,
      terminal_id: row.terminal_id,
      active: Boolean(row.terminal_active),
      last_seen: row.last_seen,
      static_review_url: row.terminal_id
        ? staticReviewUrl(config, row.google_place_id)
        : null,
    }));
  });
}

/**
 * Merchant read/update API for the dashboard.
 *
 *   GET /api/merchants
 *   GET /api/merchants/:merchant_id/terminals
 *   GET /api/merchants/:merchant_id/summary
 *   GET /api/merchants/:merchant_id/scans
 *   PUT /api/merchants/:merchant_id/google-place-id
 */
const DEFAULT_SCAN_LIMIT = 100;
const MAX_SCAN_LIMIT = 1000;

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SCAN_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_SCAN_LIMIT);
}

export function registerMerchantRoutes(app) {
  const { db } = app;

  const listMerchants = db.prepare(
    `SELECT merchant_id, google_place_id, created_at
       FROM merchants
      ORDER BY merchant_id`,
  );
  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  const listTerminals = db.prepare(
    `SELECT t.terminal_id, t.label, t.active, t.last_seen,
            COUNT(s.id) AS scan_count,
            MAX(s.scanned_at) AS last_scan_at
       FROM terminals t
       LEFT JOIN scans s ON s.terminal_id = t.terminal_id
      WHERE t.merchant_id = ?
      GROUP BY t.terminal_id
      ORDER BY t.terminal_id`,
  );
  const listSummary = db.prepare(
    `SELECT t.terminal_id, t.label, COUNT(s.id) AS scan_count
       FROM terminals t
       LEFT JOIN scans s ON s.terminal_id = t.terminal_id
      WHERE t.merchant_id = ?
      GROUP BY t.terminal_id
      ORDER BY t.terminal_id`,
  );
  const countScans = db.prepare(
    `SELECT COUNT(*) AS total
       FROM scans s
       JOIN terminals t ON t.terminal_id = s.terminal_id
      WHERE t.merchant_id = ?`,
  );
  const updatePlaceId = db.prepare(
    'UPDATE merchants SET google_place_id = ? WHERE merchant_id = ?',
  );

  app.get('/api/merchants', async () => listMerchants.all());

  app.get('/api/merchants/:merchant_id/terminals', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }
    const terminals = listTerminals.all(merchantId).map((row) => ({
      terminal_id: row.terminal_id,
      label: row.label,
      active: Boolean(row.active),
      last_seen: row.last_seen,
      scan_count: row.scan_count,
      last_scan_at: row.last_scan_at,
    }));
    return terminals;
  });

  app.get('/api/merchants/:merchant_id/summary', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }
    const terminals = listSummary.all(merchantId).map((row) => ({
      terminal_id: row.terminal_id,
      label: row.label,
      scan_count: row.scan_count,
    }));
    return {
      merchant_id: merchantId,
      total_scans: countScans.get(merchantId).total,
      terminal_count: terminals.length,
      scans_by_terminal: terminals,
    };
  });

  app.get('/api/merchants/:merchant_id/scans', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const query = request.query ?? {};
    const conditions = ['t.merchant_id = ?'];
    const params = [merchantId];

    if (typeof query.terminal_id === 'string' && query.terminal_id.trim()) {
      conditions.push('s.terminal_id = ?');
      params.push(query.terminal_id.trim());
    }
    if (typeof query.since === 'string' && query.since.trim()) {
      conditions.push('s.scanned_at >= ?');
      params.push(query.since.trim());
    }
    if (typeof query.until === 'string' && query.until.trim()) {
      conditions.push('s.scanned_at <= ?');
      params.push(query.until.trim());
    }
    params.push(parseLimit(query.limit));

    const scans = db
      .prepare(
        `SELECT s.id, s.terminal_id, s.scanned_at, s.user_agent
           FROM scans s
           JOIN terminals t ON t.terminal_id = s.terminal_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY s.scanned_at DESC, s.id DESC
          LIMIT ?`,
      )
      .all(...params);
    return scans;
  });

  app.put('/api/merchants/:merchant_id/google-place-id', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const body = request.body ?? {};
    const placeId = typeof body.google_place_id === 'string' ? body.google_place_id.trim() : '';
    if (!placeId) {
      return reply.code(400).send({ error: 'invalid_google_place_id' });
    }

    updatePlaceId.run(placeId, merchantId);
    return { merchant_id: merchantId, google_place_id: placeId };
  });
}

/**
 * Merchant read/update API for the dashboard.
 *
 *   GET /api/merchants
 *   GET /api/merchants/:merchant_id/terminals
 *   GET /api/merchants/:merchant_id/summary
 *   GET /api/merchants/:merchant_id/scans
 *   PUT /api/merchants/:merchant_id/google-place-id
 */
import { staticReviewUrl } from './terminal-config.js';

const DEFAULT_SCAN_LIMIT = 100;
const MAX_SCAN_LIMIT = 1000;
const DEFAULT_SERIES_BUCKET = 'day';

// `scanned_at` is stored as an ISO UTC timestamp; the series buckets it by the
// merchant-local (Europe/Warsaw) calendar day.
const WARSAW_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function warsawDay(isoTimestamp) {
  const parts = WARSAW_DAY_FORMAT.formatToParts(new Date(isoTimestamp));
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SCAN_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_SCAN_LIMIT);
}

/**
 * Optional `?since`/`?until` predicates over `scans.scanned_at`, shared by the
 * summary, scans and series routes. Returns only the window clauses; callers
 * supply the merchant predicate themselves so the same window can be applied
 * to an `ON` clause (summary) or a `WHERE` clause (scans/series).
 */
function scanWindow(query) {
  const conditions = [];
  const params = [];
  if (typeof query.since === 'string' && query.since.trim()) {
    conditions.push('s.scanned_at >= ?');
    params.push(query.since.trim());
  }
  if (typeof query.until === 'string' && query.until.trim()) {
    conditions.push('s.scanned_at <= ?');
    params.push(query.until.trim());
  }
  return { conditions, params };
}

export function registerMerchantRoutes(app) {
  const { db, config } = app;

  const listMerchants = db.prepare(
    `SELECT merchant_id, google_place_id, created_at
       FROM merchants
      ORDER BY merchant_id`,
  );
  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  const listTerminals = db.prepare(
    `SELECT t.terminal_id, t.label, t.active, t.last_seen,
            COUNT(s.id) AS scan_count,
            MAX(s.scanned_at) AS last_scan_at,
            m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
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
      static_review_url: staticReviewUrl(config, row.google_place_id),
    }));
    return terminals;
  });

  app.get('/api/merchants/:merchant_id/summary', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const query = request.query ?? {};
    const { conditions: windowConditions, params: windowParams } = scanWindow(query);

    let rows;
    let total;
    if (windowConditions.length === 0) {
      // Fast path: no window requested, so the pre-prepared statements (and
      // therefore the response) are byte-identical to the pre-window behavior.
      rows = listSummary.all(merchantId);
      total = countScans.get(merchantId).total;
    } else {
      // The window predicates live in the LEFT JOIN's ON clause so terminals
      // with no scans inside the window still appear with scan_count 0.
      const onClause = windowConditions.map((condition) => `AND ${condition}`).join(' ');
      rows = db
        .prepare(
          `SELECT t.terminal_id, t.label, COUNT(s.id) AS scan_count
             FROM terminals t
             LEFT JOIN scans s ON s.terminal_id = t.terminal_id ${onClause}
            WHERE t.merchant_id = ?
            GROUP BY t.terminal_id
            ORDER BY t.terminal_id`,
        )
        .all(...windowParams, merchantId);

      const whereClause = windowConditions.map((condition) => `AND ${condition}`).join(' ');
      total = db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM scans s
             JOIN terminals t ON t.terminal_id = s.terminal_id
            WHERE t.merchant_id = ? ${whereClause}`,
        )
        .get(merchantId, ...windowParams).total;
    }

    const terminals = rows.map((row) => ({
      terminal_id: row.terminal_id,
      label: row.label,
      scan_count: row.scan_count,
    }));
    return {
      merchant_id: merchantId,
      total_scans: total,
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

  app.get('/api/merchants/:merchant_id/scans/series', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const query = request.query ?? {};
    const bucket =
      typeof query.bucket === 'string' && query.bucket.trim()
        ? query.bucket.trim().toLowerCase()
        : DEFAULT_SERIES_BUCKET;
    if (bucket !== DEFAULT_SERIES_BUCKET) {
      return reply.code(400).send({ error: 'invalid_bucket' });
    }

    const { conditions, params } = scanWindow(query);
    const where = ['t.merchant_id = ?', ...conditions].join(' AND ');
    const rows = db
      .prepare(
        `SELECT s.scanned_at
           FROM scans s
           JOIN terminals t ON t.terminal_id = s.terminal_id
          WHERE ${where}
          ORDER BY s.scanned_at ASC`,
      )
      .all(merchantId, ...params);

    const counts = new Map();
    for (const row of rows) {
      const day = warsawDay(row.scanned_at);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, count]) => ({ day, count }));
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

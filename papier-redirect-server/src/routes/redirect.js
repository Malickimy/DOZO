import { debounceKey } from '../lib/hash.js';

/**
 * GET /r/:terminal_id
 *
 * Public route hit by the customer's phone after scanning the QR. Resolves
 * terminal -> merchant -> google_place_id, records at most one scan per
 * (terminal, IP, User-Agent) per debounce window, then 302-redirects to the
 * Google review form.
 *
 * Unknown or inactive terminals return 404 with a small JSON body and do NOT
 * write a scan row.
 */
export function registerRedirectRoute(app) {
  const { db, config, debouncer, now } = app;

  const findTerminal = db.prepare(
    `SELECT t.terminal_id, t.active, m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      WHERE t.terminal_id = ?`,
  );
  const insertScan = db.prepare(
    `INSERT INTO scans (terminal_id, scanned_at, user_agent) VALUES (?, ?, ?)`,
  );

  app.get('/r/:terminal_id', async (request, reply) => {
    const { terminal_id: terminalId } = request.params;

    const terminal = findTerminal.get(terminalId);
    if (!terminal) {
      return reply.code(404).send({ error: 'unknown_terminal', terminal_id: terminalId });
    }
    if (!terminal.active) {
      return reply.code(404).send({ error: 'inactive_terminal', terminal_id: terminalId });
    }

    const userAgent = request.headers['user-agent'] ?? '';
    const key = debounceKey(terminalId, request.ip, userAgent);
    if (!debouncer.seen(key)) {
      insertScan.run(terminalId, now().toISOString(), userAgent);
    }

    const location = `${config.googleReviewBase}?placeid=${encodeURIComponent(
      terminal.google_place_id,
    )}`;
    return reply.code(302).header('location', location).send();
  });
}

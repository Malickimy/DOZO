/**
 * Heartbeat / liveness API.
 *
 * POST /api/heartbeat           -> update terminals.last_seen
 * GET  /api/terminals/offline   -> terminals with no ping for 2 x 12h windows
 */
export function registerHeartbeatRoutes(app) {
  const { db, config, now } = app;

  const getTerminal = db.prepare('SELECT terminal_id FROM terminals WHERE terminal_id = ?');
  const touch = db.prepare('UPDATE terminals SET last_seen = ? WHERE terminal_id = ?');
  const stale = db.prepare(
    `SELECT terminal_id, merchant_id, label, active, last_seen
       FROM terminals
      WHERE last_seen IS NULL OR last_seen <= ?
      ORDER BY last_seen IS NULL DESC, last_seen ASC`,
  );

  // Two consecutive missed 12h pings == offline.
  const OFFLINE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  app.post('/api/heartbeat', async (request, reply) => {
    const body = request.body ?? {};
    const terminalId = typeof body.terminal_id === 'string' ? body.terminal_id.trim() : '';
    if (!terminalId) {
      return reply.code(400).send({ error: 'invalid_terminal_id' });
    }
    if (!getTerminal.get(terminalId)) {
      return reply.code(404).send({ error: 'unknown_terminal', terminal_id: terminalId });
    }

    const lastSeen = now().toISOString();
    touch.run(lastSeen, terminalId);
    return reply.code(200).send({ ok: true, terminal_id: terminalId, last_seen: lastSeen });
  });

  app.get('/api/terminals/offline', async () => {
    const cutoff = new Date(now().getTime() - OFFLINE_THRESHOLD_MS).toISOString();
    const terminals = stale.all(cutoff);
    return { threshold_seconds: OFFLINE_THRESHOLD_MS / 1000, cutoff, terminals };
  });
}

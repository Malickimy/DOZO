/**
 * Per-terminal configuration and lifecycle.
 *
 *   GET   /api/terminals/:terminal_id/config   read the config
 *   PUT   /api/terminals/:terminal_id/config   display fields only (R3)
 *   PATCH /api/terminals/:terminal_id          lifecycle: active + label (R3)
 */
import { assertTerminalAccess } from '../middleware/terminal-auth.js';

const MIN_DISPLAY_TIMEOUT_SECONDS = 5;
const MAX_DISPLAY_TIMEOUT_SECONDS = 30;

export function staticReviewUrl(config, googlePlaceId) {
  return `${config.googleReviewBase}?placeid=${encodeURIComponent(googlePlaceId)}`;
}

export function configPayload(row, config) {
  return {
    terminal_id: row.terminal_id,
    merchant_id: row.merchant_id,
    google_place_id: row.google_place_id,
    label: row.label,
    active: Boolean(row.active),
    display_enabled: Boolean(row.display_enabled),
    display_timeout_seconds: row.display_timeout_seconds,
    redirect_base_url: config.redirectDomain,
    static_review_url: staticReviewUrl(config, row.google_place_id),
  };
}

export function registerTerminalConfigRoutes(app) {
  const { db, config } = app;

  const getTerminal = db.prepare(
    `SELECT t.terminal_id, t.merchant_id, t.label, t.active,
            t.display_enabled, t.display_timeout_seconds, m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      WHERE t.terminal_id = ?`,
  );
  const updateConfig = db.prepare(
    `UPDATE terminals
        SET display_enabled = ?, display_timeout_seconds = ?
      WHERE terminal_id = ?`,
  );
  const updateLifecycle = db.prepare(
    `UPDATE terminals
        SET active = ?, label = ?
      WHERE terminal_id = ?`,
  );

  app.get('/api/terminals/:terminal_id/config', async (request, reply) => {
    const terminalId = request.params.terminal_id;
    if (!assertTerminalAccess(request, reply, { terminalId })) return;
    const terminal = getTerminal.get(terminalId);
    if (!terminal) {
      return reply.code(404).send({ error: 'unknown_terminal', terminal_id: terminalId });
    }
    return configPayload(terminal, config);
  });

  app.put('/api/terminals/:terminal_id/config', async (request, reply) => {
    const terminalId = request.params.terminal_id;
    if (!assertTerminalAccess(request, reply, { terminalId })) return;
    const terminal = getTerminal.get(terminalId);
    if (!terminal) {
      return reply.code(404).send({ error: 'unknown_terminal', terminal_id: terminalId });
    }

    const body = request.body ?? {};
    let displayEnabled = Boolean(terminal.display_enabled);
    let timeoutSeconds = terminal.display_timeout_seconds;

    if (body.display_enabled !== undefined) {
      if (typeof body.display_enabled !== 'boolean') {
        return reply.code(400).send({ error: 'invalid_display_enabled' });
      }
      displayEnabled = body.display_enabled;
    }

    if (body.display_timeout_seconds !== undefined) {
      if (
        typeof body.display_timeout_seconds !== 'number' ||
        !Number.isFinite(body.display_timeout_seconds)
      ) {
        return reply.code(400).send({ error: 'invalid_display_timeout_seconds' });
      }
      timeoutSeconds = Math.min(
        Math.max(Math.round(body.display_timeout_seconds), MIN_DISPLAY_TIMEOUT_SECONDS),
        MAX_DISPLAY_TIMEOUT_SECONDS,
      );
    }

    updateConfig.run(displayEnabled ? 1 : 0, timeoutSeconds, terminalId);
    return configPayload(getTerminal.get(terminalId), config);
  });

  app.patch('/api/terminals/:terminal_id', async (request, reply) => {
    const terminalId = request.params.terminal_id;
    if (!assertTerminalAccess(request, reply, { terminalId })) return;
    const terminal = getTerminal.get(terminalId);
    if (!terminal) {
      return reply.code(404).send({ error: 'unknown_terminal', terminal_id: terminalId });
    }

    const body = request.body ?? {};
    let active = terminal.active;
    let label = terminal.label;

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return reply.code(400).send({ error: 'invalid_active' });
      }
      active = body.active ? 1 : 0;
    }
    if (body.label !== undefined) {
      if (typeof body.label !== 'string' || !body.label.trim()) {
        return reply.code(400).send({ error: 'invalid_label' });
      }
      label = body.label.trim();
    }

    updateLifecycle.run(active, label, terminalId);
    return configPayload(getTerminal.get(terminalId), config);
  });
}

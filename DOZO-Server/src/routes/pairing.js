import { randomInt } from 'node:crypto';
import { deriveTerminalId, isValidTerminalId } from '../lib/terminal-id.js';

// Unambiguous uppercase alphabet: no I, O, 0, 1.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const MAX_CODE_ATTEMPTS = 12;

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function storeConfig(config, terminal) {
  return {
    terminal_id: terminal.terminal_id,
    merchant_id: terminal.merchant_id,
    google_place_id: terminal.google_place_id,
    label: terminal.label,
    redirect_url: `${config.redirectDomain}/r/${terminal.terminal_id}`,
  };
}

/**
 * Pairing API:
 *   POST /api/terminals/register          -> create 8-char code (5 min TTL)
 *   POST /api/terminals/claim             -> claim a code, provision terminal
 *   GET  /api/terminals/pair-status/:code -> 202 pending | 200 claimed | 410 expired
 */
export function registerPairingRoutes(app) {
  const { db, config, now } = app;

  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  const insertCode = db.prepare(
    `INSERT INTO pairing_codes
       (code, device_serial, merchant_id, terminal_id, created_at, expires_at, claimed_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  );
  const findCode = db.prepare(
    `SELECT c.*, m.google_place_id
       FROM pairing_codes c
       JOIN merchants m ON m.merchant_id = c.merchant_id
      WHERE c.code = ?`,
  );
  const getTerminal = db.prepare(
    `SELECT t.*, m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      WHERE t.terminal_id = ?`,
  );
  const upsertTerminal = db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)
     ON CONFLICT(terminal_id) DO UPDATE SET
       merchant_id = excluded.merchant_id,
       label       = excluded.label`,
  );
  const markClaimed = db.prepare('UPDATE pairing_codes SET claimed_at = ? WHERE code = ?');

  function codeExists(code) {
    return db.prepare('SELECT 1 FROM pairing_codes WHERE code = ?').get(code) !== undefined;
  }

  app.post('/api/terminals/register', async (request, reply) => {
    const body = request.body ?? {};
    const deviceSerial = typeof body.device_serial === 'string' ? body.device_serial.trim() : '';
    const merchantId = typeof body.merchant_id === 'string' ? body.merchant_id.trim() : '';

    if (!deviceSerial || deviceSerial.length > 128) {
      return reply.code(400).send({ error: 'invalid_device_serial' });
    }
    if (!merchantId) {
      return reply.code(400).send({ error: 'invalid_merchant_id' });
    }
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    let terminalId;
    if (body.terminal_id !== undefined) {
      if (!isValidTerminalId(body.terminal_id)) {
        return reply.code(400).send({ error: 'invalid_terminal_id' });
      }
      terminalId = String(body.terminal_id).toUpperCase();
    } else {
      terminalId = deriveTerminalId(deviceSerial);
    }

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + config.pairingTtlMs);

    let code;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateCode();
      if (!codeExists(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return reply.code(503).send({ error: 'code_generation_failed' });
    }

    insertCode.run(
      code,
      deviceSerial,
      merchantId,
      terminalId,
      createdAt.toISOString(),
      expiresAt.toISOString(),
    );

    return reply.code(201).send({
      code,
      terminal_id: terminalId,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: Math.round(config.pairingTtlMs / 1000),
    });
  });

  app.post('/api/terminals/claim', async (request, reply) => {
    const body = request.body ?? {};
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!code) {
      return reply.code(400).send({ error: 'invalid_code' });
    }

    const record = findCode.get(code);
    if (!record) {
      return reply.code(404).send({ error: 'unknown_code' });
    }

    if (!record.claimed_at && new Date(record.expires_at).getTime() <= now().getTime()) {
      return reply.code(410).send({ error: 'expired_code', code });
    }

    if (!record.claimed_at) {
      const claimedAt = now().toISOString();
      upsertTerminal.run(
        record.terminal_id,
        record.merchant_id,
        body.label ?? null,
        claimedAt,
      );
      markClaimed.run(claimedAt, code);
    }

    const terminal = getTerminal.get(record.terminal_id);
    return reply.code(200).send({
      status: 'claimed',
      api_token: config.apiToken,
      store: storeConfig(config, terminal),
    });
  });

  app.get('/api/terminals/pair-status/:code', async (request, reply) => {
    const code = String(request.params.code ?? '').trim().toUpperCase();
    const record = findCode.get(code);
    if (!record) {
      return reply.code(404).send({ status: 'unknown', code });
    }

    if (!record.claimed_at && new Date(record.expires_at).getTime() <= now().getTime()) {
      return reply.code(410).send({ status: 'expired', code });
    }

    if (!record.claimed_at) {
      return reply.code(202).send({
        status: 'pending',
        code,
        expires_at: record.expires_at,
      });
    }

    const terminal = getTerminal.get(record.terminal_id);
    return reply.code(200).send({
      status: 'claimed',
      api_token: config.apiToken,
      store: storeConfig(config, terminal),
    });
  });
}

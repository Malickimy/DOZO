import { deriveTerminalId, isValidTerminalId } from '../lib/terminal-id.js';
import { generateCode, MAX_CODE_ATTEMPTS, storeConfig } from '../lib/setup-code.js';

/**
 * Model-B pairing API (Release Board R1).
 *
 *   POST /api/merchants/:merchant_id/registers/:label/setup-code
 *   POST /api/terminals/redeem
 *
 * A setup code is single-use and bound to `(merchant_id, label)`. Redeeming it
 * activates the terminal on that register and deactivates whichever terminal
 * held the register before (device swap). Kept separate from the legacy model-A
 * flow in pairing.js so those routes stay untouched until feat/model-b-retire.
 */
export function registerModelBRoutes(app) {
  const { db, config, now } = app;

  const getMerchant = db.prepare('SELECT merchant_id FROM merchants WHERE merchant_id = ?');
  const insertSetupCode = db.prepare(
    `INSERT INTO setup_codes (code, merchant_id, label, created_at, expires_at, redeemed_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  );
  const findSetupCode = db.prepare('SELECT * FROM setup_codes WHERE code = ?');
  const setupCodeExists = db.prepare('SELECT 1 FROM setup_codes WHERE code = ?');
  const markRedeemed = db.prepare('UPDATE setup_codes SET redeemed_at = ? WHERE code = ?');
  // R7: a register can exist unoccupied. `setup-code` finds-or-creates it and
  // `redeem` binds the terminal, deactivating whichever terminal held it before.
  const ensureRegister = db.prepare(
    `INSERT OR IGNORE INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, NULL, 1, ?)`,
  );
  const getRegister = db.prepare(
    'SELECT register_id, terminal_id FROM registers WHERE merchant_id = ? AND label = ?',
  );
  const bindRegister = db.prepare(
    'UPDATE registers SET terminal_id = ?, active = 1 WHERE register_id = ?',
  );
  const deactivateTerminal = db.prepare('UPDATE terminals SET active = 0 WHERE terminal_id = ?');
  const deactivateRegister = db.prepare(
    `UPDATE terminals
        SET active = 0
      WHERE merchant_id = ?
        AND label = ?
        AND terminal_id <> ?`,
  );
  const upsertTerminal = db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)
     ON CONFLICT(terminal_id) DO UPDATE SET
       merchant_id = excluded.merchant_id,
       label       = excluded.label,
       active      = 1`,
  );
  const getTerminal = db.prepare(
    `SELECT t.*, m.google_place_id
       FROM terminals t
       JOIN merchants m ON m.merchant_id = t.merchant_id
      WHERE t.terminal_id = ?`,
  );

  function generateUniqueCode() {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const candidate = generateCode();
      if (!setupCodeExists.get(candidate)) return candidate;
    }
    return null;
  }

  app.post('/api/merchants/:merchant_id/registers/:label/setup-code', async (request, reply) => {
    const merchantId = request.params.merchant_id;
    const label = typeof request.params.label === 'string' ? request.params.label.trim() : '';

    if (!label) {
      return reply.code(400).send({ error: 'invalid_label' });
    }
    if (!getMerchant.get(merchantId)) {
      return reply.code(404).send({ error: 'unknown_merchant', merchant_id: merchantId });
    }

    const code = generateUniqueCode();
    if (!code) {
      return reply.code(503).send({ error: 'code_generation_failed' });
    }

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + config.pairingTtlMs);
    ensureRegister.run(merchantId, label, createdAt.toISOString());
    insertSetupCode.run(
      code,
      merchantId,
      label,
      createdAt.toISOString(),
      expiresAt.toISOString(),
    );

    return reply.code(201).send({
      code,
      merchant_id: merchantId,
      label,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: Math.round(config.pairingTtlMs / 1000),
    });
  });

  app.post('/api/terminals/redeem', async (request, reply) => {
    const body = request.body ?? {};
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!code) {
      return reply.code(400).send({ error: 'invalid_code' });
    }

    const record = findSetupCode.get(code);
    if (!record) {
      return reply.code(404).send({ error: 'unknown_code' });
    }
    if (record.redeemed_at) {
      return reply.code(410).send({ error: 'redeemed_code', code });
    }
    if (new Date(record.expires_at).getTime() <= now().getTime()) {
      return reply.code(410).send({ error: 'expired_code', code });
    }

    let terminalId;
    if (body.terminal_id !== undefined) {
      if (!isValidTerminalId(body.terminal_id)) {
        return reply.code(400).send({ error: 'invalid_terminal_id' });
      }
      terminalId = String(body.terminal_id).toUpperCase();
    } else {
      const deviceSerial =
        typeof body.device_serial === 'string' ? body.device_serial.trim() : '';
      if (!deviceSerial || deviceSerial.length > 128) {
        return reply.code(400).send({ error: 'invalid_device_serial' });
      }
      terminalId = deriveTerminalId(deviceSerial);
    }

    const redeemedAt = now().toISOString();
    db.transaction(() => {
      ensureRegister.run(record.merchant_id, record.label, redeemedAt);
      const register = getRegister.get(record.merchant_id, record.label);
      if (register.terminal_id && register.terminal_id !== terminalId) {
        deactivateTerminal.run(register.terminal_id);
      }
      deactivateRegister.run(record.merchant_id, record.label, terminalId);
      upsertTerminal.run(terminalId, record.merchant_id, record.label, redeemedAt);
      bindRegister.run(terminalId, register.register_id);
      markRedeemed.run(redeemedAt, code);
    })();

    const terminal = getTerminal.get(terminalId);
    return reply.code(200).send({
      status: 'redeemed',
      api_token: config.apiToken,
      store: storeConfig(config, terminal),
    });
  });
}

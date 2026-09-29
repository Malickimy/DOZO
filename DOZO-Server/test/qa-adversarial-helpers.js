/**
 * Shared setup for the independent QA/adversarial specs (`qa-*.test.js`).
 *
 * Deliberately separate from the feature authors' `helpers.js` so these specs
 * state their own fixtures and cannot pass by accident through a helper that the
 * implementation later changes. Read-only over `src/**`.
 */
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders } from './helpers.js';

export const START = '2026-01-01T00:00:00.000Z';

export function insertMerchant(db, merchantId, placeId, createdAt = START) {
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run(merchantId, placeId, createdAt);
}

export function insertTerminal(
  db,
  { terminalId, merchantId, label, active = 1, createdAt = START },
) {
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  ).run(terminalId, merchantId, label, active, createdAt);
}

export function insertRegister(
  db,
  { merchantId, label, terminalId = null, active = 1, createdAt = START },
) {
  db.prepare(
    `INSERT INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(merchantId, label, terminalId, active, createdAt);
}

export function insertScan(
  db,
  { terminalId, scannedAt, userAgent = 'QA-Adversarial', eventId = null },
) {
  db.prepare(
    'INSERT INTO scans (terminal_id, scanned_at, user_agent, event_id) VALUES (?, ?, ?, ?)',
  ).run(terminalId, scannedAt, userAgent, eventId);
}

export async function issueSetupCode(app, { merchantId, label }) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/merchants/${merchantId}/registers/${encodeURIComponent(label)}/setup-code`,
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 201, `setup-code for ${merchantId}/${label}`);
  return res.json().code;
}

export async function redeemTerminal(app, { merchantId, label, terminalId }) {
  const code = await issueSetupCode(app, { merchantId, label });
  const res = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload: { code, terminal_id: terminalId },
  });
  assert.equal(res.statusCode, 200, `redeem ${terminalId} into ${merchantId}/${label}`);
  return res.json();
}

export { makeTestContext, authHeaders };

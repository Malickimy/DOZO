/**
 * Hardening I: revocation on deactivate. Setting a terminal inactive — operator
 * PATCH `{active:false}` or the device-swap deactivation during redeem — clears
 * `api_token_hash` in the same transaction. The old token then 401s on
 * heartbeat/config/registers; a fresh redeem restores access with a new token.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders } from './helpers.js';

const START = '2026-01-01T00:00:00.000Z';

async function redeemTerminal(app, { merchantId = 'M1', label, terminalId }) {
  const issued = await app.inject({
    method: 'POST',
    url: `/api/merchants/${merchantId}/registers/${encodeURIComponent(label)}/setup-code`,
    headers: authHeaders(),
  });
  assert.equal(issued.statusCode, 201, issued.body);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload: { code: issued.json().code, terminal_id: terminalId },
  });
  assert.equal(redeemed.statusCode, 200, redeemed.body);
  return redeemed.json().api_token;
}

function tokenHash(db, terminalId) {
  return db.prepare('SELECT api_token_hash FROM terminals WHERE terminal_id = ?').get(terminalId)
    .api_token_hash;
}

/** Every terminal-token surface a revoked token must fail with 401. */
async function assertRevoked(app, token, terminalId) {
  const heartbeat = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(token),
    payload: { terminal_id: terminalId },
  });
  assert.equal(heartbeat.statusCode, 401, 'heartbeat');
  assert.deepEqual(heartbeat.json(), { error: 'unauthorized' });

  const config = await app.inject({
    method: 'GET',
    url: `/api/terminals/${terminalId}/config`,
    headers: authHeaders(token),
  });
  assert.equal(config.statusCode, 401, 'config');
  assert.deepEqual(config.json(), { error: 'unauthorized' });

  const registers = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/registers',
    headers: authHeaders(token),
  });
  assert.equal(registers.statusCode, 401, 'registers');
  assert.deepEqual(registers.json(), { error: 'unauthorized' });
}

async function heartbeatStatus(app, token, terminalId) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(token),
    payload: { terminal_id: terminalId },
  });
  return res.statusCode;
}

test('operator PATCH {active:false} revokes the token hash and 401s the old token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  assert.equal(await heartbeatStatus(app, token, 'TOKENA01'), 200, 'the fresh token works');

  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/terminals/TOKENA01',
    headers: authHeaders(),
    payload: { active: false },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().active, false);
  assert.equal(tokenHash(db, 'TOKENA01'), null, 'deactivation clears the token hash');

  await assertRevoked(app, token, 'TOKENA01');
});

test('device-swap redeem (same merchant+label) revokes the prior terminal token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const tokenA = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  const tokenB = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENB01' });

  assert.equal(tokenHash(db, 'TOKENA01'), null, 'the swapped-out terminal loses its hash');
  await assertRevoked(app, tokenA, 'TOKENA01');

  assert.equal(await heartbeatStatus(app, tokenB, 'TOKENB01'), 200, 'the replacement works');
});

test('redeem deactivates a register-bound terminal via deactivateTerminal and revokes it', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const tokenA = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  // Point a differently-labeled register at TOKENA01 so redeem hits the
  // `deactivateTerminal` path (register.terminal_id differs from the new id)
  // rather than the merchant+label bulk deactivation.
  db.prepare('UPDATE terminals SET label = ? WHERE terminal_id = ?').run('Old lane', 'TOKENA01');
  db.prepare(
    `INSERT INTO registers (merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run('M1', 'Lane 2', 'TOKENA01', START);

  await redeemTerminal(app, { label: 'Lane 2', terminalId: 'TOKENB01' });

  assert.equal(tokenHash(db, 'TOKENA01'), null, 'the bound terminal is revoked');
  await assertRevoked(app, tokenA, 'TOKENA01');
});

test('re-redeem restores access with a new token and retires the old one', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const first = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  await app.inject({
    method: 'PATCH',
    url: '/api/terminals/TOKENA01',
    headers: authHeaders(),
    payload: { active: false },
  });
  assert.equal(await heartbeatStatus(app, first, 'TOKENA01'), 401);

  const second = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });
  assert.notEqual(second, first);
  assert.equal(await heartbeatStatus(app, second, 'TOKENA01'), 200, 'the re-redeemed token works');
  assert.equal(await heartbeatStatus(app, first, 'TOKENA01'), 401, 'the revoked token stays dead');

  const row = db.prepare('SELECT active FROM terminals WHERE terminal_id = ?').get('TOKENA01');
  assert.equal(row.active, 1, 're-redeem reactivates the terminal');
});

test('reactivating via PATCH does not resurrect the revoked token (redeem-only issuance)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  await app.inject({
    method: 'PATCH',
    url: '/api/terminals/TOKENA01',
    headers: authHeaders(),
    payload: { active: false },
  });
  const reactivate = await app.inject({
    method: 'PATCH',
    url: '/api/terminals/TOKENA01',
    headers: authHeaders(),
    payload: { active: true },
  });
  assert.equal(reactivate.statusCode, 200);
  assert.equal(reactivate.json().active, true);
  assert.equal(tokenHash(db, 'TOKENA01'), null, 'reactivation does not re-issue a token');
  assert.equal(await heartbeatStatus(app, token, 'TOKENA01'), 401, 'the old token stays revoked');
});

test('an inactive terminal cannot heartbeat even with a stale hash (active filter)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const token = await redeemTerminal(app, { label: 'Till 1', terminalId: 'TOKENA01' });

  // Simulate a legacy row where the hash survived deactivation: the auth lookup
  // and heartbeat fetch both filter on `active = 1`.
  db.prepare('UPDATE terminals SET active = 0 WHERE terminal_id = ?').run('TOKENA01');
  assert.notEqual(tokenHash(db, 'TOKENA01'), null, 'the hash is still present');

  assert.equal(await heartbeatStatus(app, token, 'TOKENA01'), 401);
});

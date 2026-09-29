/**
 * Independent adversarial coverage for G02: re-redeeming a setup code for an
 * already-bound terminal at a different merchant must unbind the previous
 * merchant's register, with no stale/duplicate/orphan bindings and no
 * collateral damage to unrelated registers.
 *
 * Distinct from the author's single G02 case: this spec seeds deliberately
 * duplicate stale bindings, checks the whole `registers` table for orphans and
 * a stable row count, verifies the operator read view, and confirms the
 * terminal is not deactivated by the move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTestContext,
  authHeaders,
  redeemTerminal,
  insertMerchant,
  insertRegister,
} from './qa-adversarial-helpers.js';

function bindingsFor(db, terminalId) {
  return db
    .prepare('SELECT merchant_id, label FROM registers WHERE terminal_id = ? ORDER BY merchant_id, label')
    .all(terminalId);
}

function orphanCount(db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM registers r
         LEFT JOIN terminals t ON t.terminal_id = r.terminal_id
        WHERE r.terminal_id IS NOT NULL AND t.terminal_id IS NULL`,
    )
    .get().c;
}

function registerRow(db, merchantId, label) {
  return db
    .prepare('SELECT terminal_id FROM registers WHERE merchant_id = ? AND label = ?')
    .get(merchantId, label);
}

test('G02: a cross-merchant re-redeem clears every stale binding and creates no orphan', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertMerchant(db, 'M2', 'ChIJ_M2');

  // First owner: bind TOKENA01 to M1 / Till 1.
  await redeemTerminal(app, { merchantId: 'M1', label: 'Till 1', terminalId: 'TOKENA01' });

  // A second, stale M1 register that also points at the same terminal. The fix
  // must clear this one too, not just the one it knows about by label.
  insertRegister(db, { merchantId: 'M1', label: 'Stale dup', terminalId: 'TOKENA01' });

  // An unrelated M1 register bound to a different terminal must survive.
  insertRegister(db, { merchantId: 'M1', label: 'Other till', terminalId: 'TERM0001' });

  // A pre-existing unoccupied M2 target register.
  insertRegister(db, { merchantId: 'M2', label: 'M2 lane', terminalId: null });

  const rowsBefore = db.prepare('SELECT COUNT(*) AS c FROM registers').get().c;

  const redeemed = await redeemTerminal(app, {
    merchantId: 'M2',
    label: 'M2 lane',
    terminalId: 'TOKENA01',
  });
  assert.equal(redeemed.store.merchant_id, 'M2');

  assert.deepEqual(
    bindingsFor(db, 'TOKENA01'),
    [{ merchant_id: 'M2', label: 'M2 lane' }],
    'exactly one binding remains and it is the new merchant register',
  );

  assert.equal(registerRow(db, 'M1', 'Till 1').terminal_id, null, 'old primary register is unbound');
  assert.equal(registerRow(db, 'M1', 'Stale dup').terminal_id, null, 'stale duplicate is unbound');
  assert.equal(
    registerRow(db, 'M1', 'Other till').terminal_id,
    'TERM0001',
    'an unrelated terminal binding is untouched',
  );
  assert.equal(registerRow(db, 'M2', 'M2 lane').terminal_id, 'TOKENA01');

  const rowsAfter = db.prepare('SELECT COUNT(*) AS c FROM registers').get().c;
  assert.equal(rowsAfter, rowsBefore, 'no duplicate/orphan register rows were created');
  assert.equal(orphanCount(db), 0, 'no register points at a missing terminal');

  const terminal = db
    .prepare('SELECT merchant_id, label, active FROM terminals WHERE terminal_id = ?')
    .get('TOKENA01');
  assert.deepEqual(terminal, { merchant_id: 'M2', label: 'M2 lane', active: 1 });

  // The old merchant must stop serving the re-pointed terminal's review URL.
  const m1Registers = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/registers',
    headers: authHeaders(),
  });
  assert.equal(m1Registers.statusCode, 200);
  for (const label of ['Till 1', 'Stale dup']) {
    const row = m1Registers.json().find((entry) => entry.label === label);
    assert.equal(row.terminal_id, null, `${label} has no terminal`);
    assert.equal(row.static_review_url, null, `${label} serves no review URL`);
  }

  const m2Registers = await app.inject({
    method: 'GET',
    url: '/api/merchants/M2/registers',
    headers: authHeaders(),
  });
  const target = m2Registers.json().find((entry) => entry.label === 'M2 lane');
  assert.equal(target.terminal_id, 'TOKENA01');
  assert.match(target.static_review_url, /ChIJ_M2/);
});

test('G02: a same-merchant re-redeem moves the binding instead of duplicating it', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  await redeemTerminal(app, { merchantId: 'M1', label: 'Lane A', terminalId: 'TOKENB01' });
  await redeemTerminal(app, { merchantId: 'M1', label: 'Lane B', terminalId: 'TOKENB01' });

  assert.equal(registerRow(db, 'M1', 'Lane A').terminal_id, null, 'the old register is released');
  assert.equal(registerRow(db, 'M1', 'Lane B').terminal_id, 'TOKENB01');
  assert.deepEqual(bindingsFor(db, 'TOKENB01'), [{ merchant_id: 'M1', label: 'Lane B' }]);
  assert.equal(orphanCount(db), 0);

  const terminal = db
    .prepare('SELECT merchant_id, label, active FROM terminals WHERE terminal_id = ?')
    .get('TOKENB01');
  assert.deepEqual(terminal, { merchant_id: 'M1', label: 'Lane B', active: 1 });
});

test('G02: the re-redeem rotates the token but leaves the terminal active', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertMerchant(db, 'M2', 'ChIJ_M2');

  const first = await redeemTerminal(app, {
    merchantId: 'M1',
    label: 'Till 1',
    terminalId: 'TOKENA01',
  });
  const second = await redeemTerminal(app, {
    merchantId: 'M2',
    label: 'M2 lane',
    terminalId: 'TOKENA01',
  });
  assert.notEqual(first.api_token, second.api_token, 'the redeem rotates the token');

  const oldToken = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(first.api_token),
    payload: { terminal_id: 'TOKENA01' },
  });
  assert.equal(oldToken.statusCode, 401, 'the pre-move token is revoked');

  const newToken = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(second.api_token),
    payload: { terminal_id: 'TOKENA01' },
  });
  assert.equal(newToken.statusCode, 200, 'the post-move token works');

  assert.equal(
    db.prepare('SELECT active FROM terminals WHERE terminal_id = ?').get('TOKENA01').active,
    1,
    'the moved terminal is not deactivated',
  );
});

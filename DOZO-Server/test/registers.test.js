import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTestContext,
  authHeaders,
  insertRegister,
  TEST_TERMINAL_ID,
} from './helpers.js';

function insertTerminal(
  db,
  { terminalId, merchantId = 'M1', label, active = 1, lastSeen = null },
) {
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`,
  ).run(terminalId, merchantId, label, active, lastSeen);
}

test('GET /api/merchants/:id/registers lists every register, occupied or not', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  insertTerminal(db, { terminalId: 'TERM0002', label: 'No register' });
  insertTerminal(db, {
    terminalId: 'TERM0004',
    label: 'Back counter',
    active: 0,
    lastSeen: '2026-01-01T05:00:00.000Z',
  });
  insertRegister(db, { label: 'Back counter', terminalId: 'TERM0004', active: 0 });
  insertRegister(db, { label: 'Front counter', terminalId: TEST_TERMINAL_ID, active: 1 });
  insertRegister(db, { label: 'Spare till' });
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M2', 'ChIJ_OTHER', '2026-01-01T00:00:00.000Z');
  insertTerminal(db, { terminalId: 'TERM0005', merchantId: 'M2', label: 'Other till' });
  insertRegister(db, { merchantId: 'M2', label: 'Other till', terminalId: 'TERM0005' });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/M1/registers',
    headers: authHeaders(),
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [
    {
      label: 'Back counter',
      terminal_id: 'TERM0004',
      active: false,
      last_seen: '2026-01-01T05:00:00.000Z',
    },
    {
      label: 'Front counter',
      terminal_id: TEST_TERMINAL_ID,
      active: true,
      last_seen: null,
    },
    {
      label: 'Spare till',
      terminal_id: null,
      active: true,
      last_seen: null,
    },
  ]);
});

test('GET /api/merchants/:id/registers 404s for unknown merchant', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/NOPE/registers',
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'unknown_merchant');
});

test('migration v5 creates registers with a unique (merchant_id, label)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  assert.ok(db.pragma('user_version', { simple: true }) >= 5);
  insertRegister(db, { label: 'Duplicate' });
  assert.throws(() => insertRegister(db, { label: 'Duplicate' }));
});

test('register routes require the API token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const list = await app.inject({ method: 'GET', url: '/api/merchants/M1/registers' });
  assert.equal(list.statusCode, 401);
});

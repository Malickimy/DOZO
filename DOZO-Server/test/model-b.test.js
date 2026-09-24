import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TOKEN, TEST_PLACE_ID } from './helpers.js';
import { hashToken } from '../src/lib/token.js';

const START = '2026-01-01T00:00:00.000Z';

function setupCodeUrl(merchantId, label) {
  return `/api/merchants/${merchantId}/registers/${encodeURIComponent(label)}/setup-code`;
}

async function issueSetupCode(app, { merchantId = 'M1', label = 'Front counter' } = {}) {
  return app.inject({
    method: 'POST',
    url: setupCodeUrl(merchantId, label),
    headers: authHeaders(),
  });
}

async function redeem(app, payload) {
  return app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: authHeaders(),
    payload,
  });
}

test('setup-code issues an 8-char code bound to merchant + label with ~5 min TTL', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await issueSetupCode(app);
  assert.equal(res.statusCode, 201);

  const body = res.json();
  assert.match(body.code, /^[A-Z0-9]{8}$/);
  assert.equal(body.merchant_id, 'M1');
  assert.equal(body.label, 'Front counter');
  assert.equal(body.expires_in_seconds, 300);
  assert.equal(new Date(body.expires_at).getTime() - new Date(START).getTime(), 300_000);

  const row = db
    .prepare('SELECT merchant_id, label, redeemed_at FROM setup_codes WHERE code = ?')
    .get(body.code);
  assert.equal(row.merchant_id, 'M1');
  assert.equal(row.label, 'Front counter');
  assert.equal(row.redeemed_at, null);
});

test('setup-code rejects a blank label with 400 invalid_label', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: setupCodeUrl('M1', '   '),
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_label');
});

test('setup-code 404s for an unknown merchant', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await issueSetupCode(app, { merchantId: 'NOPE' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'unknown_merchant');
});

test('redeem binds the derived terminal to the register and returns token + store', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const res = await redeem(app, { code, device_serial: 'DX8000-SN-000123' });
  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.equal(body.status, 'redeemed');
  assert.equal(typeof body.api_token, 'string');
  assert.ok(body.api_token.length >= 40, 'onboard returns a high-entropy token');
  assert.notEqual(body.api_token, TEST_TOKEN, 'no longer the shared env token');
  assert.equal(
    db.prepare('SELECT api_token_hash FROM terminals WHERE terminal_id = ?').get('DX8000SN000123')
      .api_token_hash,
    hashToken(body.api_token),
    'only the hash is stored at rest',
  );
  assert.equal(body.store.merchant_id, 'M1');
  assert.equal(body.store.label, 'Front counter');
  assert.equal(body.store.google_place_id, TEST_PLACE_ID);
  assert.equal(body.store.redirect_url, 'http://localhost:3000/r/DX8000SN000123');
  assert.equal(
    body.store.static_review_url,
    `https://search.google.com/local/writereview?placeid=${TEST_PLACE_ID}`,
  );

  const terminal = db
    .prepare('SELECT merchant_id, label, active FROM terminals WHERE terminal_id = ?')
    .get('DX8000SN000123');
  assert.equal(terminal.merchant_id, 'M1');
  assert.equal(terminal.label, 'Front counter');
  assert.equal(terminal.active, 1);

  const consumed = db
    .prepare('SELECT redeemed_at FROM setup_codes WHERE code = ?')
    .get(code);
  assert.equal(consumed.redeemed_at, START);
});

test('redeem deactivates the prior active terminal on that register (device swap)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const res = await redeem(app, { code, device_serial: 'NEWDEVICE01' });
  assert.equal(res.statusCode, 200);

  const prior = db
    .prepare('SELECT active FROM terminals WHERE terminal_id = ?')
    .get('TERM0001');
  assert.equal(prior.active, 0, 'the previous terminal on the register is deactivated');

  const replacement = db
    .prepare('SELECT label, active FROM terminals WHERE terminal_id = ?')
    .get('NEWDEVICE01');
  assert.equal(replacement.label, 'Front counter');
  assert.equal(replacement.active, 1);

  const register = db
    .prepare('SELECT terminal_id, active FROM registers WHERE merchant_id = ? AND label = ?')
    .get('M1', 'Front counter');
  assert.equal(register.terminal_id, 'NEWDEVICE01', 'the register now points at the replacement');
  assert.equal(register.active, 1);
});

test('setup-code creates an unoccupied register when none exists', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await issueSetupCode(app, { label: 'Lane 9' });
  assert.equal(res.statusCode, 201);

  const register = db
    .prepare('SELECT merchant_id, label, terminal_id, active FROM registers WHERE merchant_id = ? AND label = ?')
    .get('M1', 'Lane 9');
  assert.equal(register.terminal_id, null, 'the register exists unoccupied before redemption');
  assert.equal(register.active, 1);
});

test('setup-code reuses an existing register instead of creating a duplicate', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  await issueSetupCode(app, { label: 'Lane 9' });
  await issueSetupCode(app, { label: 'Lane 9' });

  const count = db
    .prepare('SELECT COUNT(*) AS total FROM registers WHERE merchant_id = ? AND label = ?')
    .get('M1', 'Lane 9');
  assert.equal(count.total, 1);
});

test('redeem accepts an explicit terminal_id (uppercased)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app, { label: 'Lane 2' });
  const { code } = issued.json();

  const res = await redeem(app, { code, terminal_id: 'myterm99' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().store.terminal_id, 'MYTERM99');

  const row = db.prepare('SELECT label FROM terminals WHERE terminal_id = ?').get('MYTERM99');
  assert.equal(row.label, 'Lane 2');
});

test('redeem rejects a re-used code (single-use)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const first = await redeem(app, { code, device_serial: 'DX8000-SN-1' });
  assert.equal(first.statusCode, 200);

  const second = await redeem(app, { code, device_serial: 'DX8000-SN-2' });
  assert.equal(second.statusCode, 410);
  assert.equal(second.json().error, 'redeemed_code');

  const secondTerminal = db
    .prepare('SELECT 1 FROM terminals WHERE terminal_id = ?')
    .get('DX8000SN2');
  assert.equal(secondTerminal, undefined);
});

test('redeem returns 410 for an expired setup code', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  clock.advanceMs(301_000);

  const res = await redeem(app, { code, device_serial: 'DX8000-SN-1' });
  assert.equal(res.statusCode, 410);
  assert.equal(res.json().error, 'expired_code');
});

test('redeem returns 404 for an unknown code', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await redeem(app, { code: 'ZZZZZZZZ', device_serial: 'DX8000-SN-1' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'unknown_code');
});

test('redeem rejects an empty code with 400 invalid_code', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await redeem(app, { device_serial: 'DX8000-SN-1' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_code');
});

test('redeem without terminal_id or device_serial is 400 invalid_device_serial', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const res = await redeem(app, { code });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_device_serial');
});

test('model-B routes require the API token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const setup = await app.inject({
    method: 'POST',
    url: setupCodeUrl('M1', 'Front counter'),
  });
  assert.equal(setup.statusCode, 401);

  const redeemRes = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    payload: { code: 'ZZZZZZZZ', device_serial: 'DX8000-SN-1' },
  });
  assert.equal(redeemRes.statusCode, 401);
});

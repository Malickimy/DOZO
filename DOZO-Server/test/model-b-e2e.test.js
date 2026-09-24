import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_PLACE_ID, TEST_TOKEN } from './helpers.js';

const EXPECTED_LOCATION = `https://search.google.com/local/writereview?placeid=${TEST_PLACE_ID}`;

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

function terminalRow(db, terminalId) {
  return db
    .prepare('SELECT terminal_id, label, active FROM terminals WHERE terminal_id = ?')
    .get(terminalId);
}

function scanCount(db, terminalId) {
  return db
    .prepare('SELECT COUNT(*) AS c FROM scans WHERE terminal_id = ?')
    .get(terminalId).c;
}

// The model-b unit tests assert swap state in the DB; this proves the swap
// through the public redirect surface the customer actually hits.
test('device swap: prior terminal 404s inactive and the replacement redirects', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const res = await redeem(app, { code, device_serial: 'REPLACEMENT-1' });
  assert.equal(res.statusCode, 200);

  const prior = terminalRow(db, 'TERM0001');
  assert.equal(prior.active, 0, 'the register prior terminal is deactivated');

  const inactive = await app.inject({ method: 'GET', url: '/r/TERM0001' });
  assert.equal(inactive.statusCode, 404);
  assert.equal(inactive.json().error, 'inactive_terminal');
  assert.equal(scanCount(db, 'TERM0001'), 0, 'no scan is written for the retired terminal');

  const headers = { 'user-agent': 'Mozilla/5.0 (Swap Test)' };
  const first = await app.inject({ method: 'GET', url: '/r/REPLACEMENT1', headers });
  assert.equal(first.statusCode, 302);
  assert.equal(first.headers.location, EXPECTED_LOCATION);
  assert.equal(scanCount(db, 'REPLACEMENT1'), 1);

  const debounced = await app.inject({ method: 'GET', url: '/r/REPLACEMENT1', headers });
  assert.equal(debounced.statusCode, 302);
  assert.equal(scanCount(db, 'REPLACEMENT1'), 1, 'duplicate within 120s is debounced');

  clock.advanceMs(121_000);
  const afterWindow = await app.inject({ method: 'GET', url: '/r/REPLACEMENT1', headers });
  assert.equal(afterWindow.statusCode, 302);
  assert.equal(scanCount(db, 'REPLACEMENT1'), 2, 'a fresh window records another scan');
});

test('a re-used setup code is 410 and leaves the register and code untouched', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const first = await redeem(app, { code, device_serial: 'SWAPKEEP-1' });
  assert.equal(first.statusCode, 200);

  const before = terminalRow(db, 'SWAPKEEP1');
  const redeemedAt = db
    .prepare('SELECT redeemed_at FROM setup_codes WHERE code = ?')
    .get(code).redeemed_at;

  const second = await redeem(app, { code, device_serial: 'SWAPKEEP-2' });
  assert.equal(second.statusCode, 410);
  assert.equal(second.json().error, 'redeemed_code');

  assert.equal(terminalRow(db, 'SWAPKEEP2'), undefined, 'no terminal is created on reuse');
  assert.deepEqual(terminalRow(db, 'SWAPKEEP1'), before, 'the redeemed terminal is unchanged');
  assert.equal(
    db.prepare('SELECT redeemed_at FROM setup_codes WHERE code = ?').get(code).redeemed_at,
    redeemedAt,
    'redeemed_at is not rewritten',
  );
});

test('setup-code trims the label and redeem accepts a padded lowercase code', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app, { label: '  Lane 3  ' });
  assert.equal(issued.statusCode, 201);
  const { code, label } = issued.json();
  assert.equal(label, 'Lane 3', 'the stored/returned label is trimmed');
  assert.equal(
    db.prepare('SELECT label FROM setup_codes WHERE code = ?').get(code).label,
    'Lane 3',
  );

  const res = await redeem(app, { code: `  ${code.toLowerCase()}  `, device_serial: 'TRIM-DEV-1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().store.label, 'Lane 3');
  assert.equal(res.json().api_token, TEST_TOKEN);
  assert.equal(res.json().store.terminal_id, 'TRIMDEV1');
});

test('redeem rejects an invalid terminal_id and an oversized device_serial', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const issued = await issueSetupCode(app);
  const { code } = issued.json();

  const badId = await redeem(app, { code, terminal_id: 'ab' });
  assert.equal(badId.statusCode, 400);
  assert.equal(badId.json().error, 'invalid_terminal_id');

  const badSerial = await redeem(app, { code, device_serial: 'A'.repeat(129) });
  assert.equal(badSerial.statusCode, 400);
  assert.equal(badSerial.json().error, 'invalid_device_serial');

  assert.equal(
    db.prepare('SELECT redeemed_at FROM setup_codes WHERE code = ?').get(code).redeemed_at,
    null,
    'a rejected redeem does not consume the code',
  );
});

test('redeem rejects a wrong API token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: { 'x-api-token': `${TEST_TOKEN}-wrong` },
    payload: { code: 'ZZZZZZZZ', device_serial: 'DX8000-SN-1' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'unauthorized');
});

test('setup-code TTL boundary: redeemable just before expiry, 410 at expiry', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const first = await issueSetupCode(app);
  const second = await issueSetupCode(app);
  const ttlMs = first.json().expires_in_seconds * 1000;

  clock.advanceMs(ttlMs - 1);
  const justBefore = await redeem(app, { code: first.json().code, device_serial: 'BOUNDARY-1' });
  assert.equal(justBefore.statusCode, 200);

  clock.advanceMs(1);
  const atExpiry = await redeem(app, { code: second.json().code, device_serial: 'BOUNDARY-2' });
  assert.equal(atExpiry.statusCode, 410);
  assert.equal(atExpiry.json().error, 'expired_code');
});

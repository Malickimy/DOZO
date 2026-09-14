import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TOKEN, TEST_PLACE_ID } from './helpers.js';

const REGISTER_BODY = { device_serial: 'DX8000-SN-000123', merchant_id: 'M1' };

test('/api/* rejects a missing or wrong token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const noToken = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    payload: REGISTER_BODY,
  });
  assert.equal(noToken.statusCode, 401);

  const wrongToken = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders('wrong'),
    payload: REGISTER_BODY,
  });
  assert.equal(wrongToken.statusCode, 401);
});

test('register creates an 8-char uppercase code with ~5 minute expiry', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders(),
    payload: REGISTER_BODY,
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.match(body.code, /^[A-Z0-9]{8}$/);
  assert.equal(body.expires_in_seconds, 300);
  assert.equal(body.terminal_id, 'DX8000SN000123');
  assert.equal(
    new Date(body.expires_at).getTime() - new Date('2026-01-01T00:00:00.000Z').getTime(),
    300_000,
  );
});

test('register rejects an unknown merchant', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders(),
    payload: { device_serial: 'SN-1', merchant_id: 'DOES-NOT-EXIST' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, 'unknown_merchant');
});

test('pair-status is 202 pending before claim', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const registered = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders(),
    payload: REGISTER_BODY,
  });
  const { code } = registered.json();

  const status = await app.inject({
    method: 'GET',
    url: `/api/terminals/pair-status/${code}`,
    headers: authHeaders(),
  });

  assert.equal(status.statusCode, 202);
  assert.equal(status.json().status, 'pending');
});

test('claim provisions the terminal and pair-status returns token + store config', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const registered = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders(),
    payload: REGISTER_BODY,
  });
  const { code } = registered.json();

  const claimed = await app.inject({
    method: 'POST',
    url: '/api/terminals/claim',
    headers: authHeaders(),
    payload: { code, label: 'Till 1' },
  });
  assert.equal(claimed.statusCode, 200);
  assert.equal(claimed.json().status, 'claimed');
  assert.equal(claimed.json().api_token, TEST_TOKEN);
  assert.equal(claimed.json().store.google_place_id, TEST_PLACE_ID);
  assert.equal(claimed.json().store.label, 'Till 1');
  assert.equal(claimed.json().store.redirect_url, `http://localhost:3000/r/${claimed.json().store.terminal_id}`);

  const status = await app.inject({
    method: 'GET',
    url: `/api/terminals/pair-status/${code}`,
    headers: authHeaders(),
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().status, 'claimed');
  assert.equal(status.json().store.terminal_id, 'DX8000SN000123');
});

test('expired pairing code returns 410 on pair-status and claim', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const registered = await app.inject({
    method: 'POST',
    url: '/api/terminals/register',
    headers: authHeaders(),
    payload: REGISTER_BODY,
  });
  const { code } = registered.json();

  clock.advanceMs(301_000);

  const status = await app.inject({
    method: 'GET',
    url: `/api/terminals/pair-status/${code}`,
    headers: authHeaders(),
  });
  assert.equal(status.statusCode, 410);
  assert.equal(status.json().status, 'expired');

  const claimed = await app.inject({
    method: 'POST',
    url: '/api/terminals/claim',
    headers: authHeaders(),
    payload: { code },
  });
  assert.equal(claimed.statusCode, 410);
});

test('pair-status for an unknown code returns 404', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/terminals/pair-status/ZZZZZZZZ',
    headers: authHeaders(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().status, 'unknown');
});

test('heartbeat updates last_seen and offline list reports stale terminals', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const beat = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(),
    payload: { terminal_id: 'TERM0001' },
  });
  assert.equal(beat.statusCode, 200);
  assert.equal(beat.json().ok, true);

  const lastSeen = db.prepare('SELECT last_seen FROM terminals WHERE terminal_id = ?').get('TERM0001');
  assert.equal(lastSeen.last_seen, '2026-01-01T00:00:00.000Z');

  clock.advanceMs(24 * 60 * 60 * 1000 + 1);
  const offline = await app.inject({
    method: 'GET',
    url: '/api/terminals/offline',
    headers: authHeaders(),
  });
  assert.equal(offline.statusCode, 200);
  assert.equal(offline.json().terminals.length, 1);
  assert.equal(offline.json().terminals[0].terminal_id, 'TERM0001');
});

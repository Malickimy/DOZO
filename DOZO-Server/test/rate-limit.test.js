/**
 * Hardening I: per-client-IP rate limits on `GET /r/:terminal_id` (30/min) and
 * every `/api/*` route (60/min). `/health` stays exempt and a `429` must never
 * write a scan row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TERMINAL_ID } from './helpers.js';

function scanCount(db) {
  return db.prepare('SELECT COUNT(*) AS c FROM scans WHERE terminal_id = ?').get(TEST_TERMINAL_ID)
    .c;
}

async function redirect(app, userAgent) {
  return app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': userAgent },
  });
}

test('redirect: the 31st request/min from one IP is 429 and writes no scan row', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (let i = 0; i < 30; i += 1) {
    const res = await redirect(app, `Phone-${i}`);
    assert.equal(res.statusCode, 302, `request ${i + 1} within the limit`);
  }
  assert.equal(scanCount(db), 30, 'each allowed scan wrote one row');

  const limited = await redirect(app, 'Phone-31');
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: 'rate_limited' });
  assert.notEqual(limited.statusCode, 401, 'a 429 is a backoff, never an auth failure');
  assert.equal(scanCount(db), 30, 'the rate-limited request wrote no scan row');
});

test('api: the 61st /api/* request/min from one IP is 429 and /health is exempt', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (let i = 0; i < 60; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: '/api/merchants',
      headers: authHeaders(),
    });
    assert.equal(res.statusCode, 200, `api request ${i + 1} within the limit`);
  }

  const limited = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: authHeaders(),
  });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: 'rate_limited' });

  // The external uptime monitor pokes /health continuously: it must never 429.
  for (let i = 0; i < 70; i += 1) {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200, `/health must not be rate limited (hit ${i + 1})`);
  }
});

test('the window resets after RATE_LIMIT_WINDOW_SECONDS', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  for (let i = 0; i < 30; i += 1) {
    await redirect(app, `Phone-${i}`);
  }
  assert.equal((await redirect(app, 'Phone-31')).statusCode, 429);

  clock.advanceMs(61_000);
  const afterWindow = await redirect(app, 'Phone-after');
  assert.equal(afterWindow.statusCode, 302, 'a fresh window admits requests again');
});

test('limits are configurable via the RATE_LIMIT_* env knobs', async (t) => {
  const { app, db } = makeTestContext({ env: { RATE_LIMIT_REDIRECT_PER_MIN: '2' } });
  t.after(() => {
    app.close();
    db.close();
  });

  assert.equal((await redirect(app, 'A')).statusCode, 302);
  assert.equal((await redirect(app, 'B')).statusCode, 302);
  const third = await redirect(app, 'C');
  assert.equal(third.statusCode, 429);
  assert.deepEqual(third.json(), { error: 'rate_limited' });
});

test('TRUST_PROXY=false keys on the socket address and ignores X-Forwarded-For', async (t) => {
  const { app, db } = makeTestContext({ env: { TRUST_PROXY: 'false' } });
  t.after(() => {
    app.close();
    db.close();
  });

  for (let i = 0; i < 30; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: `/r/${TEST_TERMINAL_ID}`,
      headers: { 'user-agent': `Spoofed-${i}`, 'x-forwarded-for': '1.1.1.1' },
    });
    assert.equal(res.statusCode, 302);
  }

  const otherClient = await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'Spoofed-other', 'x-forwarded-for': '2.2.2.2' },
  });
  assert.equal(otherClient.statusCode, 429, 'XFF is ignored without TRUST_PROXY');
});

test('TRUST_PROXY=true honours X-Forwarded-For for the limit key', async (t) => {
  const { app, db } = makeTestContext({ env: { TRUST_PROXY: 'true' } });
  t.after(() => {
    app.close();
    db.close();
  });

  for (let i = 0; i < 30; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: `/r/${TEST_TERMINAL_ID}`,
      headers: { 'user-agent': `Behind-${i}`, 'x-forwarded-for': '1.1.1.1' },
    });
    assert.equal(res.statusCode, 302);
  }

  const otherClient = await app.inject({
    method: 'GET',
    url: `/r/${TEST_TERMINAL_ID}`,
    headers: { 'user-agent': 'Behind-other', 'x-forwarded-for': '2.2.2.2' },
  });
  assert.equal(otherClient.statusCode, 302, 'a different forwarded client has its own bucket');
});

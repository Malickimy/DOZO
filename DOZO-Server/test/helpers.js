import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';

export const TEST_TOKEN = 'test-token';
export const TEST_PLACE_ID = 'ChIJ_TEST_PLACE_ID';
export const TEST_TERMINAL_ID = 'TERM0001';

/**
 * Fresh in-memory DB + app per test. `clock` is mutable so tests can advance
 * time to exercise debounce windows and pairing-code expiry.
 */
export function makeTestContext({ env = {}, startTime = '2026-01-01T00:00:00.000Z' } = {}) {
  const db = openDatabase(':memory:');
  const config = loadConfig({
    API_TOKEN: TEST_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    GOOGLE_REVIEW_BASE: 'https://search.google.com/local/writereview',
    ...env,
  });

  const state = { ms: new Date(startTime).getTime() };
  const clock = {
    now: () => new Date(state.ms),
    advanceMs: (delta) => {
      state.ms += delta;
    },
  };

  const app = buildApp({ db, config, now: clock.now });

  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, startTime);
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', startTime);

  return { app, db, config, clock };
}

export function authHeaders(token = TEST_TOKEN) {
  return { 'x-api-token': token };
}

export function insertRegister(
  db,
  {
    registerId = null,
    merchantId = 'M1',
    label,
    terminalId = null,
    active = 1,
    createdAt = '2026-01-01T00:00:00.000Z',
  } = {},
) {
  db.prepare(
    `INSERT INTO registers (register_id, merchant_id, label, terminal_id, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(registerId, merchantId, label, terminalId, active, createdAt);
}

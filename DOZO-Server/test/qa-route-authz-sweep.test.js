/**
 * Completeness sweep for SERVER-AUTHZ-HARDENING.
 *
 * Enumerates every route Fastify actually registers (parsed from
 * `app.printRoutes({ commonPrefix: false })`), asserts the enumeration matches a
 * hand-classified table, then drives each route with (a) an M1 terminal token
 * against M2 data, (b) the same token against its own data, and (c) the operator
 * token -- so a newly added or mis-scoped route fails this suite instead of
 * being discovered one incident at a time.
 *
 * Deliberate exceptions pinned here, not fixed:
 *   P2: a terminal token may PUT its OWN merchant's google_place_id.
 *   P3: `/scans` parses the body before the connector secret is checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import {
  makeTestContext,
  authHeaders,
  redeemTerminal,
  insertMerchant,
  insertTerminal,
  insertRegister,
  insertScan,
} from './qa-adversarial-helpers.js';

const CONNECTOR_SECRET = 'qa-sweep-connector-secret';
const OPERATOR = authHeaders();
const FOREIGN_TERMINAL = 'M2TERM01';
const OWN_TERMINAL = 'TOKENA01';

// Every route `buildApp` registers, with how to exercise it against M2.
// `classification` is the authoritative access level for a per-terminal token.
const ROUTES = [
  {
    method: 'GET',
    path: '/health',
    classification: 'unauthenticated',
    note: 'public liveness; leaks nothing',
    anonymous: { url: '/health', expect: 200 },
  },
  {
    method: 'GET',
    path: '/r/:terminal_id',
    classification: 'unauthenticated',
    note: 'public QR redirect; writes a scan for the named terminal',
    anonymous: { url: '/r/TERM0001', expect: 302 },
  },
  {
    method: 'POST',
    path: '/scans',
    classification: 'connector-secret',
    note: 'connector ingest; X-Connector-Secret, not the operator/terminal token',
    connector: {
      url: '/scans',
      payload: {
        event_id: 'sweep-evt-1',
        terminal_id: 'TERM0001',
        merchant_id: 'M1',
        scanned_at: '2026-01-02T10:00:00.000Z',
      },
      expect: 202,
    },
    anonymous: { url: '/scans', payload: {}, expect: 401 },
  },
  {
    method: 'GET',
    path: '/api/connector/config',
    classification: 'connector-secret',
    note: 'fleet config for the connector; secret, not operator token',
    connector: { url: '/api/connector/config', expect: 200 },
    foreign: { url: '/api/connector/config', expect: 401 },
  },
  {
    method: 'GET',
    path: '/api/terminals/offline',
    classification: 'operator-only',
    note: 'P1: cross-merchant fleet list is operator-only',
    foreign: { url: '/api/terminals/offline', expect: 401 },
    operator: { url: '/api/terminals/offline', expect: 200 },
  },
  {
    method: 'GET',
    path: '/api/merchants',
    classification: 'operator-only',
    note: 'G01: merchant directory is operator-only',
    foreign: { url: '/api/merchants', expect: 401 },
    operator: { url: '/api/merchants', expect: 200 },
  },
  {
    method: 'GET',
    path: '/api/merchants/:merchant_id/registers',
    classification: 'terminal-scoped',
    note: 'scoped to the token merchant',
    foreign: { url: '/api/merchants/M2/registers', expect: 401 },
    own: { url: '/api/merchants/M1/registers', expect: 200 },
    operator: { url: '/api/merchants/M2/registers', expect: 200 },
  },
  {
    method: 'POST',
    path: '/api/merchants/:merchant_id/registers/:label/setup-code',
    classification: 'operator-only',
    note: 'P0: operator-only for own and foreign merchants',
    foreign: {
      url: '/api/merchants/M2/registers/pwned/setup-code',
      expect: 401,
    },
    operator: { url: '/api/merchants/M2/registers/op-label/setup-code', expect: 201 },
  },
  {
    method: 'GET',
    path: '/api/merchants/:merchant_id/terminals',
    classification: 'terminal-scoped',
    note: 'scoped to the token merchant',
    foreign: { url: '/api/merchants/M2/terminals', expect: 401 },
    own: { url: '/api/merchants/M1/terminals', expect: 200 },
    operator: { url: '/api/merchants/M2/terminals', expect: 200 },
  },
  {
    method: 'GET',
    path: '/api/merchants/:merchant_id/summary',
    classification: 'terminal-scoped',
    note: 'scoped to the token merchant',
    foreign: { url: '/api/merchants/M2/summary', expect: 401 },
    own: { url: '/api/merchants/M1/summary', expect: 200 },
    operator: { url: '/api/merchants/M2/summary', expect: 200 },
  },
  {
    method: 'GET',
    path: '/api/merchants/:merchant_id/scans',
    classification: 'terminal-scoped',
    note: 'scoped to the token merchant',
    foreign: { url: '/api/merchants/M2/scans', expect: 401 },
    own: { url: '/api/merchants/M1/scans', expect: 200 },
    operator: { url: '/api/merchants/M2/scans', expect: 200 },
  },
  {
    method: 'GET',
    path: '/api/merchants/:merchant_id/scans/series',
    classification: 'terminal-scoped',
    note: 'scoped to the token merchant',
    foreign: { url: '/api/merchants/M2/scans/series', expect: 401 },
    own: { url: '/api/merchants/M1/scans/series', expect: 200 },
    operator: { url: '/api/merchants/M2/scans/series', expect: 200 },
  },
  {
    method: 'PUT',
    path: '/api/merchants/:merchant_id/google-place-id',
    classification: 'terminal-scoped',
    note: 'P2: foreign is 401, but the token may rewrite its OWN merchant place id',
    foreign: {
      url: '/api/merchants/M2/google-place-id',
      payload: { google_place_id: 'ChIJ_HIJACK' },
      expect: 401,
    },
    own: {
      url: '/api/merchants/M1/google-place-id',
      payload: { google_place_id: 'ChIJ_SWEEP_OWN' },
      expect: 200,
    },
    operator: {
      url: '/api/merchants/M2/google-place-id',
      payload: { google_place_id: 'ChIJ_M2_OP' },
      expect: 200,
    },
  },
  {
    method: 'POST',
    path: '/api/terminals/redeem',
    classification: 'operator-only',
    note: 'P0: operator-only; a terminal token cannot consume any setup code',
    foreign: {
      url: '/api/terminals/redeem',
      payload: { code: 'ZZZZZZZZ', terminal_id: 'EVIL0001' },
      expect: 401,
    },
    operator: {
      url: '/api/terminals/redeem',
      payload: { code: 'ZZZZZZZZ', terminal_id: 'EVIL0001' },
      expect: 404,
    },
  },
  {
    method: 'GET',
    path: '/api/terminals/:terminal_id/config',
    classification: 'terminal-scoped',
    note: 'scoped to the token terminal',
    foreign: { url: `/api/terminals/${FOREIGN_TERMINAL}/config`, expect: 401 },
    own: { url: `/api/terminals/${OWN_TERMINAL}/config`, expect: 200 },
    operator: { url: `/api/terminals/${FOREIGN_TERMINAL}/config`, expect: 200 },
  },
  {
    method: 'PUT',
    path: '/api/terminals/:terminal_id/config',
    classification: 'terminal-scoped',
    note: 'scoped to the token terminal',
    foreign: {
      url: `/api/terminals/${FOREIGN_TERMINAL}/config`,
      payload: { display_enabled: false },
      expect: 401,
    },
    own: {
      url: `/api/terminals/${OWN_TERMINAL}/config`,
      payload: { display_enabled: true },
      expect: 200,
    },
    operator: {
      url: `/api/terminals/${FOREIGN_TERMINAL}/config`,
      payload: { display_enabled: true },
      expect: 200,
    },
  },
  {
    method: 'PATCH',
    path: '/api/terminals/:terminal_id',
    classification: 'terminal-scoped',
    note: 'scoped to the token terminal',
    foreign: {
      url: `/api/terminals/${FOREIGN_TERMINAL}`,
      payload: { active: false, label: 'pwned' },
      expect: 401,
    },
    own: { url: `/api/terminals/${OWN_TERMINAL}`, payload: { active: true }, expect: 200 },
    operator: { url: `/api/terminals/${FOREIGN_TERMINAL}`, payload: { active: true }, expect: 200 },
  },
  {
    method: 'POST',
    path: '/api/heartbeat',
    classification: 'terminal-scoped',
    note: 'scoped to the body terminal_id',
    foreign: {
      url: '/api/heartbeat',
      payload: { terminal_id: FOREIGN_TERMINAL },
      expect: 401,
    },
    own: { url: '/api/heartbeat', payload: { terminal_id: OWN_TERMINAL }, expect: 200 },
    operator: { url: '/api/heartbeat', payload: { terminal_id: FOREIGN_TERMINAL }, expect: 200 },
  },
];

/** Enumerate the routes Fastify actually registered (method + full path). */
function listRoutes(app) {
  const routes = [];
  const stack = [];
  for (const raw of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const line = raw.match(/^((?:[│ ] {3})*)(?:├── |└── )(.*)$/);
    if (!line) continue;
    const depth = line[1].length / 4;
    const parsed = line[2].match(/^(.*?)\s+\(([^)]*)\)\s*$/);
    if (!parsed) continue;
    const segment = parsed[1].trim();
    if (segment === '*') continue; // the CORS auto-OPTIONS wildcard
    const parent = depth > 0 ? stack[depth - 1] : '';
    const full = segment.startsWith('/') ? `${parent}${segment}` : `${parent}/${segment}`;
    stack[depth] = full;
    stack.length = depth + 1;
    for (const method of parsed[2].split(',').map((value) => value.trim())) {
      if (!method || method === 'HEAD') continue; // Fastify mirrors GET as HEAD
      routes.push(`${method} ${full}`);
    }
  }
  return routes.sort();
}

async function inject(app, method, probe, headers) {
  return app.inject({
    method,
    url: probe.url,
    headers,
    payload: probe.payload,
  });
}

function snapshotM2(db) {
  return {
    merchant: db
      .prepare('SELECT merchant_id, google_place_id FROM merchants WHERE merchant_id = ?')
      .get('M2'),
    terminals: db
      .prepare(
        'SELECT terminal_id, merchant_id, label, active, last_seen, display_enabled, display_timeout_seconds FROM terminals WHERE merchant_id = ? ORDER BY terminal_id',
      )
      .all('M2'),
    registers: db
      .prepare('SELECT label, terminal_id, active FROM registers WHERE merchant_id = ? ORDER BY label')
      .all('M2'),
    setupCodes: db
      .prepare('SELECT code, merchant_id, label FROM setup_codes WHERE merchant_id = ? ORDER BY code')
      .all('M2'),
    scans: db
      .prepare(
        `SELECT s.id, s.event_id, s.terminal_id FROM scans s
           JOIN terminals t ON t.terminal_id = s.terminal_id
          WHERE t.merchant_id = ? ORDER BY s.id`,
      )
      .all('M2'),
  };
}

async function seed() {
  const ctx = makeTestContext({ env: { DASHBOARD_CONNECTOR_SECRET: CONNECTOR_SECRET } });
  const { db } = ctx;
  insertMerchant(db, 'M2', 'ChIJ_M2');
  insertTerminal(db, { terminalId: FOREIGN_TERMINAL, merchantId: 'M2', label: 'M2 front' });
  insertRegister(db, { merchantId: 'M2', label: 'M2 lane', terminalId: FOREIGN_TERMINAL });
  insertScan(db, { terminalId: FOREIGN_TERMINAL, scannedAt: '2026-01-01T11:00:00.000Z', eventId: 'm2-sweep-1' });
  const redeemed = await redeemTerminal(ctx.app, {
    merchantId: 'M1',
    label: 'Till 1',
    terminalId: OWN_TERMINAL,
  });
  return { ...ctx, terminalToken: redeemed.api_token };
}

function closeCtx(t, ctx) {
  t.after(() => {
    ctx.app.close();
    ctx.db.close();
  });
}

test('sweep: the registered route table is fully classified (no unclassified routes)', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);

  const parsed = listRoutes(ctx.app);
  const classified = ROUTES.map((route) => `${route.method} ${route.path}`).sort();

  assert.deepEqual(
    parsed,
    classified,
    'every registered route must appear exactly once in the sweep table',
  );
  assert.ok(
    ROUTES.every((route) => route.classification),
    'every route carries a classification',
  );
});

test('sweep: an M1 terminal token is 401 on every foreign (M2) route and mutates nothing', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db, terminalToken } = ctx;
  const before = snapshotM2(db);
  const headers = authHeaders(terminalToken);

  const foreign = ROUTES.filter((route) => route.foreign);
  assert.ok(foreign.length >= 10, 'the sweep exercises the whole foreign surface');

  for (const route of foreign) {
    const res = await inject(app, route.method, route.foreign, headers);
    assert.equal(res.statusCode, route.foreign.expect, `${route.method} ${route.path}`);
    if (route.foreign.expect === 401) {
      assert.deepEqual(res.json(), { error: 'unauthorized' }, `${route.method} ${route.path}`);
    }
  }

  assert.deepEqual(snapshotM2(db), before, 'no M2 data changed after the rejected foreign calls');
});

test('sweep: an M1 terminal token still reaches its own data where scoped', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);

  for (const route of ROUTES.filter((entry) => entry.own)) {
    const res = await inject(app, route.method, route.own, headers);
    assert.equal(res.statusCode, route.own.expect, `${route.method} ${route.path}`);
  }
});

test('sweep: the operator token is never 401 and keeps full access', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app } = ctx;

  for (const route of ROUTES.filter((entry) => entry.operator)) {
    const res = await inject(app, route.method, route.operator, OPERATOR);
    assert.notEqual(res.statusCode, 401, `${route.method} ${route.path} must not 401 the operator`);
    assert.equal(res.statusCode, route.operator.expect, `${route.method} ${route.path}`);
  }
});

test('sweep: public and connector-secret routes behave as classified', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, terminalToken } = ctx;

  for (const route of ROUTES.filter((entry) => entry.anonymous)) {
    const res = await inject(app, route.method, route.anonymous, {});
    assert.equal(res.statusCode, route.anonymous.expect, `anonymous ${route.method} ${route.path}`);
  }

  for (const route of ROUTES.filter((entry) => entry.connector)) {
    const res = await inject(app, route.method, route.connector, {
      'content-type': 'application/json',
      'x-connector-secret': CONNECTOR_SECRET,
    });
    assert.equal(res.statusCode, route.connector.expect, `connector ${route.method} ${route.path}`);
  }

  // A terminal token alone never satisfies the connector secret.
  const connectorAsTerminal = await app.inject({
    method: 'GET',
    url: '/api/connector/config',
    headers: authHeaders(terminalToken),
  });
  assert.equal(connectorAsTerminal.statusCode, 401);
});

test('P0/P1: terminal token is 401 on setup-code (own+foreign), redeem and offline', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, terminalToken } = ctx;
  const headers = authHeaders(terminalToken);

  for (const merchantId of ['M1', 'M2']) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/merchants/${merchantId}/registers/sweep/setup-code`,
      headers,
    });
    assert.equal(res.statusCode, 401, `${merchantId} setup-code`);
    assert.deepEqual(res.json(), { error: 'unauthorized' });
  }

  const redeem = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers,
    payload: { code: 'ZZZZZZZZ', terminal_id: 'EVIL0001' },
  });
  assert.equal(redeem.statusCode, 401);
  assert.deepEqual(redeem.json(), { error: 'unauthorized' });

  const offline = await app.inject({ method: 'GET', url: '/api/terminals/offline', headers });
  assert.equal(offline.statusCode, 401);
  assert.deepEqual(offline.json(), { error: 'unauthorized' });

  // Operator end-to-end still works: mint a code and redeem it.
  const issued = await app.inject({
    method: 'POST',
    url: '/api/merchants/M1/registers/e2e/setup-code',
    headers: OPERATOR,
  });
  assert.equal(issued.statusCode, 201);
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/terminals/redeem',
    headers: OPERATOR,
    payload: { code: issued.json().code, terminal_id: 'OPE2E001' },
  });
  assert.equal(redeemed.statusCode, 200);
  assert.equal(redeemed.json().store.merchant_id, 'M1');
});

test('P2/P3 (deliberate exceptions) are pinned', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app, db, terminalToken } = ctx;

  // P2: own-merchant google_place_id write still permitted for a terminal token.
  const ownWrite = await app.inject({
    method: 'PUT',
    url: '/api/merchants/M1/google-place-id',
    headers: authHeaders(terminalToken),
    payload: { google_place_id: 'ChIJ_P2_PINNED' },
  });
  assert.equal(ownWrite.statusCode, 200);
  assert.equal(
    db.prepare('SELECT google_place_id FROM merchants WHERE merchant_id = ?').get('M1').google_place_id,
    'ChIJ_P2_PINNED',
  );

  // P3: malformed body is parsed before the connector secret is checked.
  const malformedNoSecret = await app.inject({
    method: 'POST',
    url: '/scans',
    headers: { 'content-type': 'application/json' },
    payload: '{ nope',
  });
  assert.equal(malformedNoSecret.statusCode, 400, 'P3: not 401');
  assert.deepEqual(malformedNoSecret.json(), { error: 'malformed' });
});

test('sweep: no /api route is left UNAUTHENTICATED', async (t) => {
  const ctx = await seed();
  closeCtx(t, ctx);
  const { app } = ctx;

  const unauthenticatedApi = ROUTES.filter(
    (route) => route.path.startsWith('/api/') && route.classification === 'unauthenticated',
  );
  assert.deepEqual(unauthenticatedApi, [], 'every /api route is operator-only, scoped, or secret-guarded');

  // And the global hook rejects an unknown token on every /api route.
  for (const route of ROUTES.filter((entry) => entry.path.startsWith('/api/'))) {
    const url = (route.foreign ?? route.operator ?? route.connector ?? { url: route.path }).url;
    const res = await app.inject({
      method: route.method,
      url,
      headers: authHeaders('not-a-real-token'),
      payload: route.foreign?.payload ?? route.operator?.payload,
    });
    assert.equal(res.statusCode, 401, `${route.method} ${route.path} rejects an unknown token`);
  }
});

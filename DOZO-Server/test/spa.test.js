/**
 * Independent QA for issue #89 — "Server: extract shared SPA serving helper".
 *
 * `src/lib/spa.js` is the single serving path for both the legacy split
 * entrypoint (`src/dashboard.js`) and the canonical unified runtime
 * (`src/server.js`). This spec pins the behaviour from the issue's acceptance
 * criteria rather than trusting the implementation summary:
 *
 *   AC1  the SPA root, hashed assets and client deep links are served by BOTH
 *        runtimes.
 *   AC2  `/api/*`, `/r/*`, `/health` and `/scans` are never rewritten to the
 *        HTML shell (query strings included).
 *   AC3  a missing dist keeps a headless API that boots without crashing in
 *        BOTH runtimes.
 *   AC4  the panel/homepage split and legacy `/merchants/:id` redirect hold.
 *
 * Everything is asserted through `app.inject()` on the real factory with a
 * temp dist fixture, so no production code is touched and no process is spawned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerSpa } from '../src/lib/spa.js';
import { createDashboard } from '../src/dashboard.js';
import { createServer } from '../src/server.js';
import { openDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import {
  authHeaders,
  TEST_TOKEN,
  TEST_PLACE_ID,
  TEST_TERMINAL_ID,
} from './helpers.js';

const HOMEPAGE = '<!doctype html><div data-view="home">HOME-SHELL</div>';
const PANEL = '<!doctype html><div id="root">PANEL-SHELL</div>';
const ASSET_JS = "window.__asset = 'ASSET-JS';";

/** Markers that must never leak into an API/redirect/excluded response. */
const SHELL_MARKERS = [/HOME-SHELL/, /PANEL-SHELL/, /ASSET-JS/];

function makeDist() {
  const dist = mkdtempSync(join(tmpdir(), 'dozo-spa-dist-'));
  writeFileSync(join(dist, 'index.html'), HOMEPAGE);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), ASSET_JS);
  mkdirSync(join(dist, 'panel'));
  writeFileSync(join(dist, 'panel', 'index.html'), PANEL);
  return dist;
}

function makeDb() {
  const db = openDatabase(':memory:');
  db.prepare(
    'INSERT INTO merchants (merchant_id, google_place_id, created_at) VALUES (?, ?, ?)',
  ).run('M1', TEST_PLACE_ID, '2026-01-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO terminals (terminal_id, merchant_id, label, active, last_seen, created_at)
     VALUES (?, ?, ?, 1, NULL, ?)`,
  ).run(TEST_TERMINAL_ID, 'M1', 'Front counter', '2026-01-01T00:00:00.000Z');
  return db;
}

function baseConfig(overrides = {}) {
  return loadConfig({
    API_TOKEN: TEST_TOKEN,
    REDIRECT_DOMAIN: 'http://localhost:3000',
    GOOGLE_REVIEW_BASE: 'https://search.google.com/local/writereview',
    ...overrides,
  });
}

/** Assert a response is not (and does not embed) an SPA HTML shell. */
function assertNotShell(res, label) {
  for (const marker of SHELL_MARKERS) {
    assert.doesNotMatch(res.body, marker, `${label} must not return the SPA shell`);
  }
}

/** The four excluded surfaces plus their query-string variants. */
const EXCLUDED = [
  { url: '/api/does-not-exist', auth: true, status: 404, error: 'not_found' },
  // `/r/` is a registered redirect route on the unified runtime (404
  // unknown_terminal) and an unmatched path on the dashboard surface (404
  // not_found) — either way it must be JSON, never the shell.
  { url: '/r/does-not-exist', auth: false, status: 404, jsonError: true },
  { url: '/health', auth: false, status: 200 },
  { url: '/scans', auth: false, status: 404, error: 'not_found' },
  { url: '/scans?x=1', auth: false, status: 404, error: 'not_found' },
  { url: '/health?x=1', auth: false, status: 200 },
];

async function assertExclusions(app) {
  for (const { url, auth, status, error, jsonError } of EXCLUDED) {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: auth ? authHeaders() : undefined,
    });
    assert.equal(res.statusCode, status, `${url} keeps its non-SPA status`);
    assertNotShell(res, url);
    if (error) {
      assert.deepEqual(res.json(), { error }, `${url} keeps its JSON error body`);
    }
    if (jsonError) {
      assert.equal(
        typeof res.json().error,
        'string',
        `${url} keeps a JSON error body, not the shell`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// AC1/AC2/AC4 — legacy split entrypoint (`createDashboard`)
// ---------------------------------------------------------------------------

test('#89 createDashboard serves root, assets and deep links; excludes API/redirect paths', async (t) => {
  const dist = makeDist();
  const db = makeDb();
  const app = await createDashboard({
    db,
    config: baseConfig({ DASHBOARD_DIST_PATH: dist }),
    logger: false,
  });
  t.after(() => {
    app.close();
    db.close();
    rmSync(dist, { recursive: true, force: true });
  });

  // AC1: root serves the marketing homepage shell.
  const root = await app.inject({ method: 'GET', url: '/' });
  assert.equal(root.statusCode, 200);
  assert.match(root.body, /HOME-SHELL/, 'root serves index.html');

  // AC1: a deep client link with no file on disk falls back to index.html.
  const deepLink = await app.inject({ method: 'GET', url: '/registers' });
  assert.equal(deepLink.statusCode, 200);
  assert.match(deepLink.body, /HOME-SHELL/, 'unknown GET path falls back to the shell');

  // AC1: a hashed static asset is served as itself, not rewritten to HTML.
  const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
  assert.equal(asset.statusCode, 200);
  assert.match(asset.body, /ASSET-JS/, 'static asset served verbatim');
  assert.doesNotMatch(asset.body, /HOME-SHELL/, 'asset is not the HTML shell');

  // AC4: panel shell + legacy deep-link redirect.
  const panelRoot = await app.inject({ method: 'GET', url: '/panel/' });
  assert.equal(panelRoot.statusCode, 200);
  assert.match(panelRoot.body, /PANEL-SHELL/, 'panel shell served at /panel/');

  const panelDeep = await app.inject({ method: 'GET', url: '/panel/merchants/M1' });
  assert.equal(panelDeep.statusCode, 200);
  assert.match(panelDeep.body, /PANEL-SHELL/, 'panel deep link falls back to the panel shell');

  const legacyMerchant = await app.inject({ method: 'GET', url: '/merchants/M1' });
  assert.equal(legacyMerchant.statusCode, 302);
  assert.equal(legacyMerchant.headers.location, '/panel/', '/merchants/:id redirects to /panel/');

  const legacyIndex = await app.inject({ method: 'GET', url: '/merchants' });
  assert.equal(legacyIndex.statusCode, 302);
  assert.equal(legacyIndex.headers.location, '/panel/', '/merchants redirects to /panel/');

  // AC2: the four excluded surfaces (and query variants) never see the shell.
  await assertExclusions(app);

  // AC2 (non-GET): unmatched non-GET paths return JSON, never the shell.
  const post = await app.inject({ method: 'POST', url: '/totally-unknown' });
  assert.equal(post.statusCode, 404);
  assert.deepEqual(post.json(), { error: 'not_found' });
  assertNotShell(post, 'POST /totally-unknown');
});

// ---------------------------------------------------------------------------
// AC1/AC2/AC4 — unified runtime (`createServer`)
// ---------------------------------------------------------------------------

test('#89 createServer (unified) serves root, assets and deep links; excludes API/redirect paths', async (t) => {
  const dist = makeDist();
  const db = makeDb();
  const app = await createServer({
    db,
    config: baseConfig({ DASHBOARD_DIST_PATH: dist }),
    logger: false,
  });
  t.after(() => {
    app.close();
    db.close();
    rmSync(dist, { recursive: true, force: true });
  });

  const root = await app.inject({ method: 'GET', url: '/' });
  assert.equal(root.statusCode, 200);
  assert.match(root.body, /HOME-SHELL/, 'unified runtime serves index.html at /');

  const deepLink = await app.inject({ method: 'GET', url: '/registers' });
  assert.equal(deepLink.statusCode, 200);
  assert.match(deepLink.body, /HOME-SHELL/, 'unified runtime deep link falls back to the shell');

  const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
  assert.equal(asset.statusCode, 200);
  assert.match(asset.body, /ASSET-JS/, 'unified runtime serves the static asset');

  const panelDeep = await app.inject({ method: 'GET', url: '/panel/merchants/M1' });
  assert.equal(panelDeep.statusCode, 200);
  assert.match(panelDeep.body, /PANEL-SHELL/, 'unified runtime panel deep link uses the pane shell');

  const legacyMerchant = await app.inject({ method: 'GET', url: '/merchants/M1' });
  assert.equal(legacyMerchant.statusCode, 302);
  assert.equal(legacyMerchant.headers.location, '/panel/');

  await assertExclusions(app);
});

// ---------------------------------------------------------------------------
// AC3 — missing dist keeps a headless API (both runtimes)
// ---------------------------------------------------------------------------

for (const [name, factory] of [
  ['createDashboard', (args) => createDashboard(args)],
  ['createServer', (args) => createServer(args)],
]) {
  test(`#89 ${name} boots headless when the dist is missing and the API still works`, async (t) => {
    const db = makeDb();
    const missing = join(tmpdir(), `dozo-spa-missing-${process.pid}-${Date.now()}`);
    const app = await factory({
      db,
      config: baseConfig({ DASHBOARD_DIST_PATH: missing }),
      logger: false,
    });
    t.after(() => {
      app.close();
      db.close();
    });

    // The factory booted and mounted the API.
    const merchants = await app.inject({
      method: 'GET',
      url: '/api/merchants',
      headers: authHeaders(),
    });
    assert.equal(merchants.statusCode, 200, 'API works with no dist');
    assert.equal(merchants.json().length, 1);

    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);

    // Headless: no not-found handler is installed, so root is a plain 404 and
    // the API surface is not an SPA.
    const root = await app.inject({ method: 'GET', url: '/' });
    assert.equal(root.statusCode, 404, 'no shell is served without a dist');
    assertNotShell(root, 'headless /');

    // AC2 still holds without a dist.
    const scans = await app.inject({ method: 'GET', url: '/scans' });
    assert.equal(scans.statusCode, 404);
    assertNotShell(scans, 'headless /scans');

    // Closing must not throw.
    await app.close();
  });
}

// ---------------------------------------------------------------------------
// Direct unit check of the helper's return contract.
// ---------------------------------------------------------------------------

test('#89 registerSpa returns true with a dist and false without one', async (t) => {
  const dist = makeDist();
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  const withDist = Fastify({ logger: false });
  const registered = registerSpa(withDist, { dashboardDistPath: dist });
  assert.equal(registered, true, 'helper registers the SPA when the dist exists');
  await withDist.ready();
  await withDist.close();

  const missing = join(tmpdir(), `dozo-spa-none-${process.pid}-${Date.now()}`);
  const headless = Fastify({ logger: false });
  const skipped = registerSpa(headless, { dashboardDistPath: missing });
  assert.equal(skipped, false, 'helper is a no-op when the dist is absent');
  await headless.ready();
  await headless.close();
});

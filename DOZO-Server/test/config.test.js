/**
 * src/config.js — defaults, parsing and the fail-open API_TOKEN default (G09).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, DEFAULTS } from '../src/config.js';

test('loadConfig applies every default when the env is empty (G09)', () => {
  const config = loadConfig({});

  assert.equal(config.port, 3000);
  assert.equal(config.dbPath, DEFAULTS.DB_PATH);
  assert.equal(config.redirectDomain, 'http://localhost:3000');
  assert.equal(config.googleReviewBase, 'https://search.google.com/local/writereview');
  assert.equal(config.apiToken, DEFAULTS.API_TOKEN);
  assert.equal(config.debounceMs, 120_000);
  assert.equal(config.pairingTtlMs, 300_000);
  assert.equal(config.trustProxy, false);
  assert.equal(config.seedDemo, false);
  assert.deepEqual(config.dashboardOrigin, ['*']);
  assert.equal(config.connectorSecret, '');
  assert.equal(config.dashboardDistPath, '../DOZO-Dashboard/dist');
  assert.equal(config.dashboardIngestUrl, 'http://localhost:3000');
  assert.equal(config.connectorSpoolPath, './data/scan-spool.jsonl');
});

test('loadConfig parses overrides and strips trailing slashes (G09)', () => {
  const config = loadConfig({
    PORT: '4444',
    DB_PATH: '/tmp/dozo.db',
    REDIRECT_DOMAIN: 'https://dozo.example/',
    GOOGLE_REVIEW_BASE: 'https://g.example/base/',
    API_TOKEN: 'real-secret',
    DEBOUNCE_SECONDS: '5',
    PAIRING_TTL_SECONDS: '60',
    TRUST_PROXY: '1',
    SEED_DEMO: 'true',
    DASHBOARD_ORIGIN: 'https://a.example, https://b.example ',
    DASHBOARD_CONNECTOR_SECRET: 'conn-secret',
    DASHBOARD_INGEST_URL: 'http://dash.example/',
    CONNECTOR_SPOOL_PATH: '/tmp/spool.jsonl',
  });

  assert.equal(config.port, 4444);
  assert.equal(config.dbPath, '/tmp/dozo.db');
  assert.equal(config.redirectDomain, 'https://dozo.example');
  assert.equal(config.googleReviewBase, 'https://g.example/base');
  assert.equal(config.apiToken, 'real-secret');
  assert.equal(config.debounceMs, 5_000);
  assert.equal(config.pairingTtlMs, 60_000);
  assert.equal(config.trustProxy, true);
  assert.equal(config.seedDemo, true);
  assert.deepEqual(config.dashboardOrigin, ['https://a.example', 'https://b.example']);
  assert.equal(config.connectorSecret, 'conn-secret');
  assert.equal(config.dashboardIngestUrl, 'http://dash.example');
  assert.equal(config.connectorSpoolPath, '/tmp/spool.jsonl');
});

test('an unset API_TOKEN falls back to the shared placeholder (G09)', () => {
  // This documents the fail-open default: a deployment that forgets API_TOKEN
  // still accepts the well-known placeholder. The regression test pins the
  // current behavior; hardening it would be a separate (contract-visible) change.
  assert.equal(DEFAULTS.API_TOKEN, 'dev-placeholder-token');
  assert.equal(loadConfig({}).apiToken, 'dev-placeholder-token');

  // An explicit empty string is *not* overridden by the default, so it closes
  // the operator token instead of silently re-opening it.
  assert.equal(loadConfig({ API_TOKEN: '' }).apiToken, '');
});

const DEFAULTS = {
  PORT: '3000',
  DB_PATH: './data/dozo.db',
  REDIRECT_DOMAIN: 'http://localhost:3000',
  GOOGLE_REVIEW_BASE: 'https://search.google.com/local/writereview',
  API_TOKEN: 'dev-placeholder-token',
  DEBOUNCE_SECONDS: '120',
  PAIRING_TTL_SECONDS: '300',
  TRUST_PROXY: 'false',
  SEED_DEMO: 'false',
  DASHBOARD_ORIGIN: '*',
  DASHBOARD_CONNECTOR_SECRET: '',
  DASHBOARD_DIST_PATH: '../DOZO-Dashboard/dist',
  DASHBOARD_INGEST_URL: 'http://localhost:3000',
  CONNECTOR_SPOOL_PATH: './data/scan-spool.jsonl',
};

function asBool(value) {
  return value === true || value === 'true' || value === '1';
}

/**
 * Load runtime configuration from an env-like object.
 * Explicit overrides (e.g. in tests) take precedence over process.env.
 */
export function loadConfig(env = process.env) {
  const raw = { ...DEFAULTS, ...env };
  return {
    port: Number.parseInt(raw.PORT, 10),
    dbPath: raw.DB_PATH,
    redirectDomain: String(raw.REDIRECT_DOMAIN).replace(/\/+$/, ''),
    googleReviewBase: String(raw.GOOGLE_REVIEW_BASE).replace(/\/+$/, ''),
    apiToken: raw.API_TOKEN,
    debounceMs: Number.parseInt(raw.DEBOUNCE_SECONDS, 10) * 1000,
    pairingTtlMs: Number.parseInt(raw.PAIRING_TTL_SECONDS, 10) * 1000,
    trustProxy: asBool(raw.TRUST_PROXY),
    seedDemo: asBool(raw.SEED_DEMO),
    dashboardOrigin: String(raw.DASHBOARD_ORIGIN)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    connectorSecret: raw.DASHBOARD_CONNECTOR_SECRET ? String(raw.DASHBOARD_CONNECTOR_SECRET) : '',
    dashboardDistPath: String(raw.DASHBOARD_DIST_PATH || '../DOZO-Dashboard/dist'),
    dashboardIngestUrl: String(raw.DASHBOARD_INGEST_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    ),
    connectorSpoolPath: String(raw.CONNECTOR_SPOOL_PATH || './data/scan-spool.jsonl'),
  };
}

export { DEFAULTS };

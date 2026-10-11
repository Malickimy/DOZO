import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildDashboardApp } from './app.js';
import { registerSpa } from './lib/spa.js';

/**
 * Dashboard entrypoint (Release Board R4).
 *
 * Owns the database and every `/api/*` route, plus `GET /api/connector/config`
 * (connector-secret guarded) and the built SPA. When `DOZO-Dashboard/dist`
 * exists it is served with an SPA fallback; otherwise the API runs headless.
 */
export async function createDashboard({ db, config, logger = true } = {}) {
  const app = buildDashboardApp({ db, config, logger });
  registerSpa(app, config);
  return app;
}

function openDbPath(config) {
  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }
  return config.dbPath;
}

async function start() {
  const config = loadConfig();
  const db = openDatabase(openDbPath(config));
  if (config.seedDemo) {
    seedDemo(db);
  }

  const app = await createDashboard({ db, config, logger: true });

  async function shutdown(signal) {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
    } finally {
      db.close();
      process.exit(0);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}

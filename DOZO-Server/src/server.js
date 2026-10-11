import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildApp } from './app.js';
import { registerSpa } from './lib/spa.js';

/**
 * Canonical unified production entrypoint (Release Board R4).
 *
 * Mounts the combined surface on one Fastify instance backed by exactly one
 * SQLite connection: the public connector routes (`GET /health`,
 * `GET /r/:terminal_id`) plus every protected `/api/*` route. `src/connector.js`
 * and `src/dashboard.js` remain the legacy split entrypoints during transition.
 *
 * The factory is import-safe: it binds no port and reads no env or database at
 * module scope, so importing this module (or a test) never opens a listener.
 */
export async function createServer({ config = loadConfig(), db, logger = true } = {}) {
  const database = db ?? openDatabase(openDbPath(config));
  if (config.seedDemo) {
    seedDemo(database);
  }
  const app = buildApp({ db: database, config, logger });
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

  const app = await createServer({ db, config, logger: true });

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

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildConnectorApp } from './app.js';

/**
 * Connector entrypoint (Release Board R4).
 *
 * The public face of DOZO: `GET /health` and `GET /r/:terminal_id`. It keeps a
 * file-backed scan spool (wired in R2) and, for now, still resolves terminals
 * from the shared database. The dashboard entrypoint owns every `/api/*` route.
 */
export async function createConnector({ config = loadConfig(), db } = {}) {
  const database = db ?? openDatabase(openDbPath(config));
  return buildConnectorApp({ db: database, config, logger: true });
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

  const app = buildConnectorApp({ db, config, logger: true });

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

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildConnectorApp } from './app.js';
import { createSpool } from './lib/spool.js';
import { createForwarder } from './lib/forwarder.js';

/**
 * Connector entrypoint (Release Board R4/R2).
 *
 * The public face of DOZO: `GET /health` and `GET /r/:terminal_id`. Accepted
 * scans are dual-written to the local database and a file-backed spool that is
 * forwarded to the dashboard's `/scans` ingest. The dashboard entrypoint owns
 * every `/api/*` route.
 */
export async function createConnector({ config = loadConfig(), db, logger = true } = {}) {
  const database = db ?? openDatabase(openDbPath(config));
  const app = buildConnectorApp({ db: database, config, logger });
  attachSpool(app, config);
  return app;
}

function attachSpool(app, config) {
  if (!config.connectorSpoolPath) return;
  const spool = createSpool({ filePath: config.connectorSpoolPath });
  const forwarder = createForwarder({
    spool,
    ingestUrl: config.dashboardIngestUrl,
    secret: config.connectorSecret,
    logger: app.log,
  });
  app.decorate('spool', spool);
  app.decorate('forwarder', forwarder);
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

  const app = await createConnector({ db, config, logger: true });

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
    await app.forwarder?.drain();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}

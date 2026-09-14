import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildApp } from './app.js';

const config = loadConfig();

if (config.dbPath !== ':memory:') {
  mkdirSync(dirname(config.dbPath), { recursive: true });
}

const db = openDatabase(config.dbPath);
if (config.seedDemo) {
  seedDemo(db);
}

const app = buildApp({ db, config, logger: true });

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

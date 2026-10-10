import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { openDatabase, seedDemo } from './db.js';
import { buildDashboardApp } from './app.js';

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

function registerSpa(app, config) {
  const spaRoot = resolve(process.cwd(), config.dashboardDistPath ?? '../DOZO-Dashboard/dist');
  if (!existsSync(spaRoot)) return false;

  // The redesign split the build into a marketing homepage (index.html) and the
  // React panel SPA (panel/index.html) served under /panel/. Only fall back to
  // the panel shell when that entrypoint was actually built.
  const hasPanel = existsSync(join(spaRoot, 'panel', 'index.html'));

  app.register(fastifyStatic, { root: spaRoot, prefix: '/', wildcard: false });

  // Legacy deep links (`/merchants`, `/merchants/:id`) predate the /panel/
  // split. The panel is hash-routed, so send them to its root.
  const redirectToPanel = (_request, reply) => reply.redirect('/panel/');
  app.get('/merchants', redirectToPanel);
  app.get('/merchants/:merchant_id', redirectToPanel);

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.method !== 'GET') {
      return reply.code(404).send({ error: 'not_found' });
    }
    const url = request.url;
    if (url.startsWith('/api/') || url.startsWith('/r/') || url === '/health') {
      return reply.code(404).send({ error: 'not_found' });
    }
    // Any deep path under /panel/ (e.g. /panel/merchants/:id) loads the panel
    // shell; everything else is the marketing homepage.
    if (hasPanel && (url === '/panel' || url.startsWith('/panel/'))) {
      return reply.sendFile('panel/index.html');
    }
    return reply.sendFile('index.html');
  });
  return true;
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

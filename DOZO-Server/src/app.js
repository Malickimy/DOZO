import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDebounce } from './lib/debounce.js';
import { makeAuthHook } from './middleware/auth.js';
import { registerRedirectRoute } from './routes/redirect.js';
import { registerModelBRoutes } from './routes/model-b.js';
import { registerHeartbeatRoutes } from './routes/heartbeat.js';
import { registerMerchantRoutes } from './routes/merchants.js';
import { registerTerminalConfigRoutes } from './routes/terminal-config.js';
import { registerRegisterRoutes } from './routes/registers.js';
import { registerConnectorConfigRoute } from './routes/connector-config.js';
import { registerScanRoutes } from './routes/scans.js';

/**
 * Shared shell for both entrypoints: Fastify instance, CORS, the decorators
 * (`db`, `config`, `now`, `debouncer`) and the public `GET /health`. Keeping
 * this separate from the route groups lets `connector.js` and `dashboard.js`
 * mount different subsets while tests keep injecting an in-memory DB and clock
 * through `buildApp`.
 */
export function createAppShell({
  db,
  config,
  now = () => new Date(),
  debouncer,
  logger = false,
} = {}) {
  const app = Fastify({
    logger,
    trustProxy: Boolean(config?.trustProxy),
  });

  const effectiveDebouncer =
    debouncer ?? createDebounce({ ttlMs: config.debounceMs, now: () => now().getTime() });

  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('now', now);
  app.decorate('debouncer', effectiveDebouncer);

  const origins = config?.dashboardOrigin?.length ? config.dashboardOrigin : ['*'];
  app.register(cors, {
    origin: origins.includes('*') ? '*' : origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['X-Api-Token', 'X-Connector-Secret', 'Content-Type'],
  });

  app.addHook('onRequest', makeAuthHook(config));

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

/** Public connector surface: `GET /health` (shell) + `GET /r/:terminal_id`. */
export function registerConnectorRoutes(app) {
  registerRedirectRoute(app);
}

/**
 * Dashboard surface: every `/api/*` route, including `/api/connector/config`
 * (which is authenticated with `X-Connector-Secret` rather than the operator
 * token).
 */
export function registerDashboardRoutes(app) {
  registerModelBRoutes(app);
  registerHeartbeatRoutes(app);
  registerMerchantRoutes(app);
  registerTerminalConfigRoutes(app);
  registerRegisterRoutes(app);
  registerConnectorConfigRoute(app);
  registerScanRoutes(app);
}

/** Connector-only app (used by `src/connector.js`). */
export function buildConnectorApp(options) {
  const app = createAppShell(options);
  registerConnectorRoutes(app);
  return app;
}

/** Dashboard-only app (used by `src/dashboard.js`). */
export function buildDashboardApp(options) {
  const app = createAppShell(options);
  registerDashboardRoutes(app);
  return app;
}

/**
 * Combined app: both route groups on one instance. Kept as the default builder
 * for tests and the legacy `src/server.js` single-process deployment.
 */
export function buildApp(options) {
  const app = createAppShell(options);
  registerConnectorRoutes(app);
  registerDashboardRoutes(app);
  return app;
}

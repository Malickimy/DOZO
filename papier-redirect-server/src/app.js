import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDebounce } from './lib/debounce.js';
import { makeAuthHook } from './middleware/auth.js';
import { registerRedirectRoute } from './routes/redirect.js';
import { registerPairingRoutes } from './routes/pairing.js';
import { registerHeartbeatRoutes } from './routes/heartbeat.js';
import { registerMerchantRoutes } from './routes/merchants.js';
import { registerTerminalConfigRoutes } from './routes/terminal-config.js';
import { registerRegisterRoutes } from './routes/registers.js';

/**
 * Build a Fastify instance around an existing database handle. Keeping this
 * separate from server.js lets tests inject an in-memory DB and a fake clock.
 */
export function buildApp({ db, config, now = () => new Date(), debouncer, logger = false } = {}) {
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
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['X-Api-Token', 'Content-Type'],
  });

  app.addHook('onRequest', makeAuthHook(config));

  app.get('/health', async () => ({ status: 'ok' }));

  registerRedirectRoute(app);
  registerPairingRoutes(app);
  registerHeartbeatRoutes(app);
  registerMerchantRoutes(app);
  registerTerminalConfigRoutes(app);
  registerRegisterRoutes(app);

  return app;
}

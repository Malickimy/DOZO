import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';

/**
 * Shared static-asset + history-fallback SPA serving (Release Board R4).
 *
 * Both the legacy split dashboard entrypoint (`src/dashboard.js`) and the
 * canonical unified runtime (`src/server.js`) mount the same built SPA, so the
 * serving rules live here instead of being duplicated. When the built dist is
 * absent the API runs headless: nothing is registered and `false` is returned.
 *
 * @param {import('fastify').FastifyInstance} app Fastify instance to register on.
 * @param {{ dashboardDistPath?: string }} config Resolved server config.
 * @returns {boolean} `true` when the SPA was registered, `false` when headless.
 */
export function registerSpa(app, config) {
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
    const path = request.url.split('?')[0];
    if (
      path.startsWith('/api/') ||
      path.startsWith('/r/') ||
      path === '/health' ||
      path === '/scans'
    ) {
      return reply.code(404).send({ error: 'not_found' });
    }
    // Any deep path under /panel/ (e.g. /panel/merchants/:id) loads the panel
    // shell; everything else is the marketing homepage.
    if (hasPanel && (path === '/panel' || path.startsWith('/panel/'))) {
      return reply.sendFile('panel/index.html');
    }
    return reply.sendFile('index.html');
  });
  return true;
}

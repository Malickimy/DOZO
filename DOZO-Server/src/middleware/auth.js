import { timingSafeEqual } from 'node:crypto';

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function extractToken(request) {
  const header = request.headers['authorization'];
  const bearer =
    typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : undefined;
  return request.headers['x-api-token'] || bearer;
}

/**
 * Guard every `/api/*` route with a shared token. The redirect route (`/r/:id`)
 * and `/health` stay public by design.
 *
 * Accepts `X-Api-Token: <token>` or `Authorization: Bearer <token>`.
 * NOTE: the token is currently the single placeholder from env (API_TOKEN).
 * Per-terminal tokens are a documented follow-up.
 *
 * `/api/connector/*` is owned by the connector-secret guard instead: the
 * connector (not an operator) calls it, so it authenticates with
 * `X-Connector-Secret` at the route level.
 */
export function makeAuthHook(config) {
  return async function authHook(request, reply) {
    if (!request.url.startsWith('/api/')) return;
    if (request.url.startsWith('/api/connector/')) return;
    if (request.method === 'OPTIONS') return;
    const token = extractToken(request);
    if (!token || !constantTimeEqual(token, config.apiToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

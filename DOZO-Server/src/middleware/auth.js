import { timingSafeEqual } from 'node:crypto';
import { hashToken } from '../lib/token.js';

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
 * Guard every `/api/*` route.
 *
 * Two credential kinds are accepted:
 *   - the operator `API_TOKEN` (shared) for dashboard routes; and
 *   - a per-terminal token issued at redeem (R6), which is matched by hash and
 *     recorded on `request.terminalAuth` so terminal-scoped routes can reject
 *     cross-terminal access.
 *
 * `/api/connector/*` stays with the connector-secret guard instead.
 */
export function makeAuthHook(config, db) {
  const findByHash = db?.prepare(
    'SELECT terminal_id, merchant_id FROM terminals WHERE api_token_hash = ?',
  );

  return async function authHook(request, reply) {
    if (!request.url.startsWith('/api/')) return;
    if (request.url.startsWith('/api/connector/')) return;
    if (request.method === 'OPTIONS') return;

    const token = extractToken(request);
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    if (constantTimeEqual(token, config.apiToken)) {
      return;
    }

    const terminal = findByHash?.get(hashToken(token));
    if (terminal) {
      request.terminalAuth = {
        terminalId: terminal.terminal_id,
        merchantId: terminal.merchant_id,
      };
      return;
    }

    return reply.code(401).send({ error: 'unauthorized' });
  };
}

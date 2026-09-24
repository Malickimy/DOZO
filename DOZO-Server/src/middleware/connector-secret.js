import { constantTimeEqual } from './auth.js';

/**
 * Guard the connector-facing `/api/connector/*` surface with a shared secret.
 *
 * The connector (a separate process/container) authenticates as itself with
 * `X-Connector-Secret`, not with the operator `X-Api-Token`. An unset or empty
 * configured secret denies every request so a misconfigured deploy fails closed.
 */
export function makeConnectorSecretHook(config) {
  return async function connectorSecretHook(request, reply) {
    const secret = request.headers['x-connector-secret'];
    if (
      !config?.connectorSecret ||
      typeof secret !== 'string' ||
      !constantTimeEqual(secret, config.connectorSecret)
    ) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

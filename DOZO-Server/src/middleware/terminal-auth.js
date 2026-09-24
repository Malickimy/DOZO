/**
 * R6: an operator (shared env token) reaches every route; a per-terminal token
 * only reaches the terminal's own heartbeat/config/register data. Returns false
 * (and replies 401) on a cross-terminal mismatch.
 */
export function assertTerminalAccess(request, reply, { terminalId, merchantId } = {}) {
  const auth = request.terminalAuth;
  if (!auth) return true;

  if (terminalId && auth.terminalId !== terminalId) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  if (merchantId && auth.merchantId !== merchantId) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

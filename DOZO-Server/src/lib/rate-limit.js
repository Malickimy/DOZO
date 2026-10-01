/**
 * In-process fixed-window rate limiter (Hardening I).
 *
 * The contract bounds `GET /r/:terminal_id` to 30 requests/min and every
 * `/api/*` route to 60 requests/min, keyed on `request.ip`. This is a small
 * dependency-free implementation rather than `@fastify/rate-limit`: the server
 * image compiles `better-sqlite3` from source on a 1 GB VPS, so keeping `npm ci`
 * lean matters, and the observable behavior the contract specifies is narrow
 * (a `429 {"error":"rate_limited"}` per client IP and window).
 *
 * A fixed window (rather than a sliding log) is deliberate: it is O(1) per
 * request and deterministic under the injected test clock. Buckets are swept
 * lazily whenever the wall-clock window advances.
 *
 * `/health` is never limited because an external uptime monitor polls it.
 */
export function createRateLimitHook(config = {}, now = () => new Date()) {
  const windowMs = Number.isFinite(config.rateLimitWindowMs) ? config.rateLimitWindowMs : 60_000;
  const redirectLimit = Number.isFinite(config.rateLimitRedirectPerMin)
    ? config.rateLimitRedirectPerMin
    : 30;
  const apiLimit = Number.isFinite(config.rateLimitApiPerMin) ? config.rateLimitApiPerMin : 60;

  const rules = [
    { name: 'redirect', limit: redirectLimit, matches: (path) => path.startsWith('/r/') },
    { name: 'api', limit: apiLimit, matches: (path) => path.startsWith('/api/') },
  ];

  const buckets = new Map();
  let lastSweep = null;

  return async function rateLimitHook(request, reply) {
    // CORS preflight is unauthenticated and must not consume a bucket.
    if (request.method === 'OPTIONS') return;

    const path = request.url.split('?')[0];
    // Liveness is exempt: the external uptime monitor hits it continuously.
    if (path === '/health') return;

    const rule = rules.find((entry) => entry.matches(path));
    if (!rule || rule.limit <= 0) return;

    const ip = request.ip || 'unknown';
    const nowMs = now().getTime();
    const windowStart = Math.floor(nowMs / windowMs) * windowMs;
    const key = `${rule.name}:${ip}`;

    const entry = buckets.get(key);
    let count;
    if (!entry || entry.windowStart !== windowStart) {
      count = 1;
      buckets.set(key, { windowStart, count });
    } else {
      count = entry.count + 1;
      entry.count = count;
    }

    // Drop buckets from earlier windows so the map cannot grow unbounded.
    if (windowStart !== lastSweep) {
      lastSweep = windowStart;
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.windowStart !== windowStart) buckets.delete(bucketKey);
      }
    }

    if (count > rule.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - nowMs) / 1000));
      reply.header('retry-after', String(retryAfterSeconds));
      return reply.code(429).send({ error: 'rate_limited' });
    }
  };
}

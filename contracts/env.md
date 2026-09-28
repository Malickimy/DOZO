# Contract — Environment variables

**Owner:** Shared — Server (`dozo-server-agent`) + root (`contract` agent).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

| Service | Var | Default |
| --- | --- | --- |
| Server | `PORT` | `3000` |
| Server | `DB_PATH` | `./data/dozo.db` (`/data/dozo.db` in Docker) |
| Server | `REDIRECT_DOMAIN` | `http://localhost:3000` |
| Server | `GOOGLE_REVIEW_BASE` | `https://search.google.com/local/writereview` |
| Server | `API_TOKEN` | `dev-placeholder-token` |
| Server | `DEBOUNCE_SECONDS` | `120` |
| Server | `PAIRING_TTL_SECONDS` | `300` |
| Server | `TRUST_PROXY` | `false` |
| Server | `SEED_DEMO` | `false` |
| Server | `DASHBOARD_ORIGIN` | `*` |
| Connector | `DASHBOARD_INGEST_URL` | `http://localhost:3000` (dashboard backend base; posts to `{url}/scans`, reads `{url}/api/connector/config`) |
| Connector | `DASHBOARD_CONNECTOR_SECRET` | — (sent as `X-Connector-Secret`) |
| Dashboard | `DASHBOARD_CONNECTOR_SECRET` | — (validates `X-Connector-Secret`) |
| Dashboard | `VITE_API_BASE_URL` | unset; the SPA uses `window.location.origin` (dev override) |

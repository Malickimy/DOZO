# Contract — Environment variables

**Owner:** Shared — Server (`dozo-server-agent`) + root (`contract` agent).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

| Service | Var | Default |
| --- | --- | --- |
| Server | `PORT` | `3000` |
| Server | `DB_PATH` | `./data/dozo.db` (`/data/dozo.db` in Docker) — **per container/service; see below** |
| Server | `REDIRECT_DOMAIN` | `http://localhost:3000` |
| Server | `GOOGLE_REVIEW_BASE` | `https://search.google.com/local/writereview` |
| Server | `API_TOKEN` | `dev-placeholder-token` |
| Server | `DEBOUNCE_SECONDS` | `120` |
| Server | `PAIRING_TTL_SECONDS` | `300` |
| Server | `TRUST_PROXY` | `false` |
| Server | `SEED_DEMO` | `false` |
| Server | `DASHBOARD_ORIGIN` | `*` |
| Server | `CONNECTOR_PORT` | `3001` (connector HTTP listen port used by `npm run start:all`) |
| Connector | `DASHBOARD_INGEST_URL` | `http://localhost:3000` (dashboard backend base; posts to `{url}/scans`, reads `{url}/api/connector/config`) |
| Connector | `DASHBOARD_CONNECTOR_SECRET` | — (sent as `X-Connector-Secret`) |
| Connector | `CONNECTOR_SPOOL_PATH` | `./data/scan-spool.jsonl` (file-backed scan spool) |
| Dashboard | `DASHBOARD_CONNECTOR_SECRET` | — (validates `X-Connector-Secret`) |
| Dashboard | `DASHBOARD_DIST_PATH` | `../DOZO-Dashboard/dist` (`/app/public` in the image; built SPA directory served by the dashboard entrypoint) |
| Dashboard | `VITE_API_BASE_URL` | unset; the SPA uses `window.location.origin` (dev override) |

`DB_PATH` is **per container / per service**: each of the two containers per client
gets its own SQLite file. Never point two containers at the same `DB_PATH`.

## Container runtime

- **One image, two containers per client.** The same Node 22 image
  (`node:22-bookworm-slim`) runs two entrypoints, each as its own container:
  `src/dashboard.js` (API + SPA) and `src/connector.js` (public `/health` + `/r/:terminal_id`).
- **No Vite at runtime.** The SPA `dist` is built in CI and copied into the image; the
  dashboard entrypoint serves it from `DASHBOARD_DIST_PATH` (`/app/public` in the image).
- **Per-client isolation.** Each client has its own pair of containers and its own
  `DB_PATH`; the SQLite files stay distinct and are never shared across containers.
  Connector scans spool to `CONNECTOR_SPOOL_PATH` and forward to the dashboard at
  `DASHBOARD_INGEST_URL`.

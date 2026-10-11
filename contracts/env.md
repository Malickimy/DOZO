# Contract — Environment variables

**Owner:** root (`contract` agent) — shared; Server (`dozo-server-agent`) is the primary consumer.
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

| Service | Var | Default |
| --- | --- | --- |
| Server | `PORT` | `3000` |
| Server | `DB_PATH` | `./data/dozo.db` (`/data/dozo.db` in Docker) — **the single datastore for the shared runtime; see below** |
| Server | `REDIRECT_DOMAIN` | `http://localhost:3000` |
| Server | `GOOGLE_REVIEW_BASE` | `https://search.google.com/local/writereview` |
| Server | `API_TOKEN` | `dev-placeholder-token` |
| Server | `DEBOUNCE_SECONDS` | `120` |
| Server | `PAIRING_TTL_SECONDS` | `300` |
| Server | `TRUST_PROXY` | `false` |
| Server | `SEED_DEMO` | `false` |
| Server | `DASHBOARD_ORIGIN` | `*` |
| Server | `CONNECTOR_PORT` | `3001` — **legacy/transitional:** connector HTTP listen port used only by the split `npm run start:all`; the unified entrypoint does not read it |
| Connector | `DASHBOARD_INGEST_URL` | `http://localhost:3000` — **legacy/transitional:** the split connector posted to `{url}/scans` and read `{url}/api/connector/config`; not used by the unified entrypoint |
| Connector | `DASHBOARD_CONNECTOR_SECRET` | — (sent as `X-Connector-Secret`) |
| Connector | `CONNECTOR_SPOOL_PATH` | `./data/scan-spool.jsonl` — **legacy/transitional:** file-backed scan spool used only by the split connector |
| Dashboard | `DASHBOARD_CONNECTOR_SECRET` | — (validates `X-Connector-Secret`) |
| Dashboard | `DASHBOARD_DIST_PATH` | `../DOZO-Dashboard/dist` (`/app/public` in the image; built SPA directory served by the shared runtime) |
| Dashboard | `VITE_API_BASE_URL` | unset; the SPA uses `window.location.origin` (dev override) |

`DB_PATH` is the client's **single datastore**: one SQLite file for the one shared backend
process. Expand/contract — the legacy split (one SQLite file per container, never shared
across containers) is transitional and retires with the Server runtime-refactor issues.

## Container runtime

- **One shared runtime per client.** The canonical unified entrypoint `src/server.js` runs a
  single Fastify instance holding exactly one SQLite connection, serving the combined
  connector + dashboard surface: the public connector routes (`GET /health`,
  `GET /r/:terminal_id`) plus every protected `/api/*` route and the SPA.
- **Single datastore.** Each client has one `DB_PATH` SQLite file, opened only by the
  shared runtime. The former per-container databases are transitional until the runtime
  refactor lands.
- **No Vite at runtime.** The SPA `dist` is built in CI and copied into the image; the
  shared runtime serves it from `DASHBOARD_DIST_PATH` (`/app/public` in the image).
- **Transitional split (expand/contract).** The legacy two-entrypoint / two-container
  topology still runs until its approved Server capability issues land: `src/connector.js`
  (public `/health` + `/r/:terminal_id`) and `src/dashboard.js` (dashboard API + SPA) each
  ran as its own container with its own `DB_PATH`, and connector scans spooled to
  `CONNECTOR_SPOOL_PATH` and forwarded to the dashboard at `DASHBOARD_INGEST_URL`.
  Forwarding and the scan spool leave the production path as `src/server.js` lands;
  `CONNECTOR_PORT`, `DASHBOARD_INGEST_URL`, and `CONNECTOR_SPOOL_PATH` are transitional
  until then.

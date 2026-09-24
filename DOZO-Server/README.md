# DOZO Server

Two Fastify entrypoints for the **DOZO** Android app on Ingenico AXIUM DX8000
terminals, sharing one package and one SQLite database:

- **connector** (`src/connector.js`) — the public face: `GET /health` and
  `GET /r/:terminal_id`. Accepted scans are dual-written to the database and a
  file-backed spool that is forwarded to the dashboard's `/scans` ingest.
- **dashboard** (`src/dashboard.js`) — owns the database, every `/api/*` route,
  `GET /api/connector/config`, and the built SPA.

After an approved sale the app shows a QR code. The QR **never** encodes the raw
Google review URL. It encodes a DOZO URL:

```
{REDIRECT_DOMAIN}/r/{terminal_id}
```

When a customer scans it, the connector resolves the terminal to its merchant's
Google Place ID, records at most one scan per device per debounce window, and
`302`-redirects to the Google review form. Because Google does not expose which
review came from which scan, **scan volume is the metric**.

This repository is standalone; the Android app is not required to run it.

## Stack

- Node.js 22+ (ESM)
- Fastify 5 with `@fastify/cors` and `@fastify/static`
- SQLite via `better-sqlite3` (migrations run on startup)
- Docker / docker-compose (two services, one image)

## Quick start

```bash
npm install
SEED_DEMO=true npm start        # combined connector + dashboard on :3000
# or run the pieces separately:
SEED_DEMO=true npm run start:dashboard   # API + SPA on :3000
SEED_DEMO=true npm run start:connector   # redirect surface (defaults to :3000)
```

Then:

```bash
curl -i http://localhost:3000/r/DEMOTERM01
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Combined connector + dashboard (single process, legacy/local) |
| `npm run dev` | Combined with `node --watch` |
| `npm run start:connector` | Connector entrypoint |
| `npm run start:dashboard` | Dashboard entrypoint (API + SPA) |
| `npm run dev:connector` / `dev:dashboard` | Entrypoints with `node --watch` |
| `npm test` | Run the `node:test` suite |
| `npm run seed` | Insert demo merchant/terminal into `DB_PATH` |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DB_PATH` | `./data/dozo.db` | SQLite file (`:memory:` supported) |
| `REDIRECT_DOMAIN` | `http://localhost:3000` | Public base used to build `redirect_url` |
| `GOOGLE_REVIEW_BASE` | `https://search.google.com/local/writereview` | Google endpoint (no query string) |
| `API_TOKEN` | `dev-placeholder-token` | Shared operator token guarding `/api/*` |
| `DEBOUNCE_SECONDS` | `120` | Scan debounce window |
| `PAIRING_TTL_SECONDS` | `300` | Setup-code lifetime (5 min) |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for client IP |
| `SEED_DEMO` | `false` | Seed a demo merchant + terminal on boot |
| `DASHBOARD_ORIGIN` | `*` | Comma-separated browser origins allowed by CORS (`*` for the PoC) |
| `DASHBOARD_CONNECTOR_SECRET` | — | Shared secret validating `X-Connector-Secret` on `/api/connector/config` and `POST /scans` |
| `DASHBOARD_INGEST_URL` | `http://localhost:3000` | Dashboard base the connector forwards spooled scans to |
| `CONNECTOR_SPOOL_PATH` | `./data/scan-spool.jsonl` | Connector's file-backed scan spool |
| `DASHBOARD_DIST_PATH` | `../DOZO-Dashboard/dist` | Built SPA directory served by the dashboard entrypoint |

## Endpoints

### Public (connector)

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | `200 {status:"ok"}` |
| `GET` | `/r/:terminal_id` | `302` to Google review form; logs one scan per debounce window |

`GET /r/:terminal_id` outcomes:

- Known + active terminal → insert a local scan (unless debounced), append it to
  the spool for forwarding, then `302` `Location: {GOOGLE_REVIEW_BASE}?placeid={google_place_id}`
- Unknown terminal → `404 {"error":"unknown_terminal"}` (no scan row)
- Inactive terminal → `404 {"error":"inactive_terminal"}` (no scan row)

### Operator API (`/api/*`)

Send `X-Api-Token: <API_TOKEN>` or `Authorization: Bearer <API_TOKEN>`.
Heartbeat, config and register routes also accept a **per-terminal token** issued
at redeem; that token only reaches its own terminal (and merchant for
registers), otherwise `401`.

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/merchants/:merchant_id/registers/:label/setup-code` | Issue a 5-min setup code for a register (finds-or-creates it) → `201 {code, merchant_id, label, expires_at, expires_in_seconds}` |
| `POST` | `/api/terminals/redeem` | Body `{code, device_serial?, terminal_id?}` → `200 {status:"redeemed", api_token, store}`; binds the terminal to the register, deactivates the prior one |
| `POST` | `/api/heartbeat` | Body `{terminal_id}` → updates `terminals.last_seen` |
| `GET` | `/api/terminals/offline` | Terminals with no ping for 24h (2 × 12h missed) |
| `GET` | `/api/merchants` | `[{merchant_id, google_place_id, created_at}]` |
| `GET` | `/api/merchants/:merchant_id/terminals` | `[{terminal_id, label, active, last_seen, scan_count, last_scan_at}]` (404 unknown merchant) |
| `GET` | `/api/merchants/:merchant_id/registers` | `[{label, terminal_id, active, last_seen}]` — every register, `terminal_id` null when unoccupied |
| `GET` | `/api/merchants/:merchant_id/summary` | `{merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` |
| `GET` | `/api/merchants/:merchant_id/scans` | Query `terminal_id`, `since`, `until`, `limit` (default 100, max 1000) → `[{id, terminal_id, scanned_at, user_agent}]` |
| `GET` | `/api/merchants/:merchant_id/scans/series` | Query `since`, `until`, `bucket=day` → `[{day, count}]` grouped by Europe/Warsaw day |
| `PUT` | `/api/merchants/:merchant_id/google-place-id` | Body `{google_place_id}` → `{merchant_id, google_place_id}` (rejects blank) |
| `GET` | `/api/terminals/:terminal_id/config` | Full `config` shape (404 unknown terminal) |
| `PUT` | `/api/terminals/:terminal_id/config` | Body `{display_enabled?, display_timeout_seconds?}` (timeout clamped to 5..30) → `config` |
| `PATCH` | `/api/terminals/:terminal_id` | Body `{active?, label?}` → `config` (400 invalid, 404 unknown terminal) |

### Connector API (`X-Connector-Secret`)

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/connector/config` | `{generated_at, redirect_base_url, terminals:[{terminal_id, merchant_id, google_place_id, label, active}]}` (`401` on bad secret) |
| `POST` | `/scans` | Body `{event_id, terminal_id, merchant_id, scanned_at, user_agent}` → `202 {status:"accepted"}` or `202 {status:"duplicate"}`; `400 malformed`, `401 unauthorized`; an unknown terminal is logged and dropped (never `404`) |

Shape aliases:

```
config  = {terminal_id, merchant_id, google_place_id, label, active,
           display_enabled, display_timeout_seconds, redirect_base_url,
           static_review_url}
store   = {terminal_id, merchant_id, google_place_id, label, redirect_url,
           static_review_url}
```

`redirect_base_url` is the redirect domain (no `/r/:id`); `store.redirect_url` is
the full `{domain}/r/{terminal_id}`. `static_review_url` is
`{GOOGLE_REVIEW_BASE}?placeid={google_place_id}` built at setup time.

### CORS

`/api/*` sends `Access-Control-Allow-Origin`. Allowed origins come from
`DASHBOARD_ORIGIN` (comma-separated, default `*`); `X-Api-Token`,
`X-Connector-Secret` and `Content-Type` headers and `GET`/`POST`/`PUT`/`PATCH`/
`OPTIONS` methods are allowed. `OPTIONS` preflight requests are answered without
a token.

## Tokens

- **Operator:** the shared `API_TOKEN` guards dashboard routes and can act on any
  terminal.
- **Per-terminal (R6):** `POST /api/terminals/redeem` returns a high-entropy
  `api_token` stored only as a SHA-256 hash. The terminal sends it as
  `X-Api-Token`; heartbeat/config must match the token's own terminal and
  register reads its merchant, or the call is `401`. A `401` clears the app's
  token and prompts re-pairing.
- **Connector:** the connector (a separate process/container) authenticates as
  itself with `X-Connector-Secret` on `GET /api/connector/config` and
  `POST /scans`.

## Redirect, debounce and forwarding

1. Resolve `terminal_id` → `terminals` → `merchants.google_place_id`.
2. Unknown or inactive → `404`, no scan written.
3. Compute `key = SHA-256(terminal_id + client IP + User-Agent)`.
4. If `key` was seen within `DEBOUNCE_SECONDS` (default 120s), redirect **without**
   inserting a scan.
5. Otherwise insert `scans(terminal_id, scanned_at, user_agent, event_id)`,
   append `{event_id, terminal_id, merchant_id, scanned_at, user_agent}` to the
   spool, and redirect.

The connector drains the spool to `{DASHBOARD_INGEST_URL}/scans`; ingest is
idempotent on `event_id`, so dual-writing the same scan locally and remotely
never duplicates it. The debounce cache is in-memory (per process).

## Database schema

Migrations are applied on startup via `PRAGMA user_version` (v1–v6).

```
merchants(merchant_id PK, google_place_id, created_at)
terminals(terminal_id PK, merchant_id FK, label, active, last_seen, created_at,
          display_enabled DEFAULT 1, display_timeout_seconds DEFAULT 15,
          api_token_hash UNIQUE)
scans(id AUTOINCREMENT, terminal_id FK, scanned_at, user_agent, event_id UNIQUE)
pairing_codes(code PK, device_serial, merchant_id FK, terminal_id, created_at, expires_at, claimed_at)
setup_codes(code PK, merchant_id FK, label, created_at, expires_at, redeemed_at)
registers(register_id PK, merchant_id FK, label, terminal_id FK NULL, active DEFAULT 1, created_at)
```

`pairing_codes` is a leftover from the retired model-A flow and is no longer
read. `registers` is unique on `(merchant_id, label)` and `terminal_id` is null
until redemption. Timestamps are stored as UTC ISO-8601 strings
(`2026-01-01T00:00:00.000Z`); the series endpoint buckets them by the
Europe/Warsaw calendar day.

## Docker

```bash
# Build context is the monorepo root (the image compiles DOZO-Dashboard/).
docker build -f DOZO-Server/Dockerfile -t dozo-server .
docker compose -f DOZO-Server/docker-compose.yml up --build
```

`docker-compose.yml` runs **two services from one image**: `dashboard` on
`:3000` (API + SPA) and `connector` on `:3001` (redirect surface). Both read
`.env`; the SQLite file lives at `/data/dozo.db` on the shared `dozo-data`
volume.

## Deployment

### Prerequisites on the VPS

- Docker Engine + Compose plugin (`docker compose version`) and `rsync`.
- SSH access as `ubuntu@130.162.185.144` (or your own `SERVER_HOST`).
- Inbound TCP `3000` open (dashboard); open `3001` too if the connector must be
  reachable directly.

### Configuration

```bash
cp DOZO-Server/.env.production.example DOZO-Server/.env
$EDITOR DOZO-Server/.env   # set REDIRECT_DOMAIN, API_TOKEN and DASHBOARD_CONNECTOR_SECRET
```

### Deploy (from a workstation)

```bash
./DOZO-Server/scripts/deploy.sh   # rsync repo root + docker compose up -d --build
./DOZO-Server/scripts/smoke.sh    # BASE_URL defaults to the public host
```

`deploy.sh` syncs the repo root (excluding `DOZO-App`, `node_modules`, `dist`
and `data`), so the dashboard image can build the SPA. It never uses
`rsync --delete`, preserving remote data and `.env`. Do **not** run a full
rebuild on the 1 GB VPS; use the copy-and-commit method in
[`../MANUAL.md`](../MANUAL.md).

### Seeding a demo merchant + terminal

- On boot: `SEED_DEMO=true`.
- One-off: `docker compose exec dashboard node scripts/seed.js`.
- Bare Node: `SEED_DEMO=true npm start` or `npm run seed`.

This inserts merchant `demo-merchant` and terminal `DEMOTERM01`. A model-B
round-trip works:

```bash
curl -s -X POST \
  http://localhost:3000/api/merchants/demo-merchant/registers/till-1/setup-code \
  -H 'X-Api-Token: dev-placeholder-token'
# then redeem the returned code on the terminal, or:
curl -s -X POST http://localhost:3000/api/terminals/redeem \
  -H 'X-Api-Token: dev-placeholder-token' -H 'Content-Type: application/json' \
  -d '{"code":"<CODE>","device_serial":"DX8000-SN-000123"}'
```

`scripts/smoke.sh` runs exactly this setup-code + redeem round-trip.

### Production hardening

- **Use HTTPS.** Terminate TLS with a reverse proxy (Caddy/nginx) or the cloud
  load balancer and set `REDIRECT_DOMAIN=https://...`. Only set
  `TRUST_PROXY=true` behind a trusted proxy (it feeds client-IP debounce keys).
- **Change `API_TOKEN`** from the placeholder to a long random secret.
- **Set `DASHBOARD_CONNECTOR_SECRET`** to a long random secret shared by the
  connector and dashboard.

## Tests

```bash
npm test
```

Covers: `302` + `Location`, scan insert, debounce suppression/expiry, unknown and
inactive terminals, auth rejection, per-terminal token issuance/rotation and
cross-terminal rejection, heartbeat/offline, setup-code + redeem (register
binding, device swap, TTL, single-use), merchant listing/summary/scans/series,
terminal display config (defaults, clamping, validation), lifecycle `PATCH`,
register listing (unoccupied registers), connector entrypoint isolation,
`/api/connector/config` and `POST /scans` (secret, idempotency, malformed,
unknown terminal), spool dual-write and forwarding, and CORS.

## Decisions & open questions

### Decisions

- **Two entrypoints, one database.** The connector keeps the public redirect
  surface and a spool; the dashboard owns `/api/*` and the DB. The combined
  `src/server.js` remains for local/single-process use.
- **Unknown/inactive terminals → `404`** on the redirect, with no scan row.
- **`terminal_id` format.** URL-safe `[A-Za-z0-9_-]{8,64}` (stored uppercase). If
  redeem omits it, it is derived from `device_serial` (uppercase, non-alphanumerics
  stripped, truncated to 32, zero-padded to ≥8).
- **Debounce key includes User-Agent**, so two phones sharing an IP still count as
  two scans, while one phone refreshing counts once.
- **Registers are first-class (R7).** A register can be unoccupied; setup-code
  finds-or-creates it and redeem binds the terminal.
- **Per-terminal tokens (R6)** are hashed at rest and rotated on every redeem.
- **Scan ingest is idempotent** on `event_id`; the connector spools and retries.

### Open questions

1. **Retention/GDPR.** `scans.user_agent` is personal data. Define a retention
   window and a purge job.
2. **Debounce scope under horizontal scaling.** The in-memory cache is per
   replica; move to Redis/SQLite if multiple connectors run.
3. **Inactive-terminal UX.** Decide between `404`, a branded page, or a redirect
   to a fallback Google review URL.
4. **`pairing_codes` cleanup.** The table is unused after the model-A retire and
   can be dropped in a later migration.

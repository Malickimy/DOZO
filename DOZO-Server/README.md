# Papier Redirect Server

Standalone redirect + pairing server for the **Papier** Android app on Ingenico
AXIUM DX8000 terminals.

After an approved sale the app shows a QR code. The QR **never** encodes the raw
Google review URL. It encodes a Papier URL:

```
{REDIRECT_DOMAIN}/r/{terminal_id}
```

When a customer scans it, this server resolves the terminal to its merchant's
Google Place ID, records at most one scan per device per debounce window, and
`302`-redirects to the Google review form. Because Google does not expose which
review came from which scan, **scan volume is the metric**.

This repository is completely standalone; the Android app is not required to
run it.

## Stack

- Node.js 20+ (ESM)
- Fastify 5
- SQLite via `better-sqlite3` (migrations run on startup)
- Docker / docker-compose

## Quick start

```bash
npm install
SEED_DEMO=true npm start        # inserts demo merchant + terminal DEMOTERM01
# or
npm run dev                     # node --watch
```

Then:

```bash
curl -i http://localhost:3000/r/DEMOTERM01
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with `node --watch` |
| `npm start` | Start the server |
| `npm test` | Run the `node:test` suite |
| `npm run seed` | Insert demo merchant/terminal into `DB_PATH` |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DB_PATH` | `./data/papier.db` | SQLite file (`:memory:` supported) |
| `REDIRECT_DOMAIN` | `http://localhost:3000` | Public base used to build `redirect_url` |
| `GOOGLE_REVIEW_BASE` | `https://search.google.com/local/writereview` | Google endpoint (no query string) |
| `API_TOKEN` | `dev-placeholder-token` | Shared token guarding `/api/*` |
| `DEBOUNCE_SECONDS` | `120` | Scan debounce window |
| `PAIRING_TTL_SECONDS` | `300` | Pairing-code lifetime (5 min) |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for client IP |
| `SEED_DEMO` | `false` | Seed a demo merchant + terminal on boot |
| `DASHBOARD_ORIGIN` | `*` | Comma-separated browser origins allowed by CORS (`*` for the PoC) |

## Endpoints

### Public

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | `200 {status:"ok"}` |
| `GET` | `/r/:terminal_id` | `302` to Google review form; logs one scan per debounce window |

`GET /r/:terminal_id` outcomes:

- Known + active terminal → insert scan (unless debounced) → `302` `Location: {GOOGLE_REVIEW_BASE}?placeid={google_place_id}`
- Unknown terminal → `404 {"error":"unknown_terminal"}` (no scan row)
- Inactive terminal → `404 {"error":"inactive_terminal"}` (no scan row)

### Authenticated (`/api/*`)

Send `X-Api-Token: <API_TOKEN>` or `Authorization: Bearer <API_TOKEN>`.

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/terminals/register` | Body `{device_serial, merchant_id, terminal_id?, label?}` → `201 {code, terminal_id, expires_at, expires_in_seconds}` |
| `POST` | `/api/terminals/claim` | Body `{code, label?}` → `200 {status:"claimed", api_token, store}` |
| `GET` | `/api/terminals/pair-status/:code` | `202` pending / `200` claimed (+ token & store) / `404` unknown / `410` expired |
| `POST` | `/api/heartbeat` | Body `{terminal_id}` → updates `terminals.last_seen` |
| `GET` | `/api/terminals/offline` | Terminals with no ping for 24h (2 × 12h missed) |
| `GET` | `/api/merchants` | `[{merchant_id, google_place_id, created_at}]` |
| `GET` | `/api/merchants/:merchant_id/terminals` | `[{terminal_id, label, active, last_seen, scan_count, last_scan_at}]` (404 unknown merchant) |
| `GET` | `/api/merchants/:merchant_id/registers` | `[{label, terminal_id, active, last_seen}]` for terminals with a non-blank label (404 unknown merchant) |
| `GET` | `/api/merchants/:merchant_id/summary` | `{merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` |
| `GET` | `/api/merchants/:merchant_id/scans` | Query `terminal_id`, `since`, `until`, `limit` (default 100, max 1000) → `[{id, terminal_id, scanned_at, user_agent}]` |
| `PUT` | `/api/merchants/:merchant_id/google-place-id` | Body `{google_place_id}` → `{merchant_id, google_place_id}` (rejects blank) |
| `GET` | `/api/terminals/:terminal_id/config` | `{terminal_id, merchant_id, google_place_id, label, active, display_enabled, display_timeout_seconds, redirect_base_url}` (404 unknown terminal) |
| `PUT` | `/api/terminals/:terminal_id/config` | Body `{display_enabled?, display_timeout_seconds?}` (timeout clamped to 5..30) → same shape as GET |
| `POST` | `/api/terminals/adopt` | Body `{terminal_id, merchant_id, label}` → upserts the terminal with `active=1` and returns the config shape (400 invalid, 404 unknown merchant, idempotent) |

### CORS

`/api/*` sends `Access-Control-Allow-Origin` so a browser dashboard can call it.
Allowed origins come from `DASHBOARD_ORIGIN` (comma-separated, default `*`);
`X-Api-Token`/`Content-Type` headers and `GET`/`POST`/`PUT`/`OPTIONS` methods are
allowed. `OPTIONS` preflight requests are answered without a token.

`store` config returned on claim/pair-status:

```json
{
  "terminal_id": "DX8000SN000123",
  "merchant_id": "M1",
  "google_place_id": "ChIJ...",
  "label": "Till 1",
  "redirect_url": "http://localhost:3000/r/DX8000SN000123"
}
```

## Redirect & debounce behavior

1. Resolve `terminal_id` → `terminals` → `merchants.google_place_id`.
2. Unknown or inactive → `404`, no scan written.
3. Compute `key = SHA-256(terminal_id + client IP + User-Agent)`.
4. If `key` was seen within `DEBOUNCE_SECONDS` (default 120s), redirect **without**
   inserting a scan.
5. Otherwise insert `scans(terminal_id, scanned_at, user_agent)` and redirect.

The cache is in-memory (per process). With multiple replicas the debounce is
best-effort per replica; see open questions.

## Database schema

Migrations are applied on startup via `PRAGMA user_version`.

```
merchants(merchant_id PK, google_place_id, created_at)
terminals(terminal_id PK, merchant_id FK, label, active, last_seen, created_at,
          display_enabled DEFAULT 1, display_timeout_seconds DEFAULT 15)
scans(id AUTOINCREMENT, terminal_id FK, scanned_at, user_agent)
pairing_codes(code PK, device_serial, merchant_id FK, terminal_id, created_at, expires_at, claimed_at)
```

`pairing_codes` is an implementation detail added to satisfy the pairing API.
Timestamps are stored as UTC ISO-8601 strings (`2026-01-01T00:00:00.000Z`).

## Docker

```bash
docker build -t papier-redirect-server .
docker run --rm -p 3000:3000 \
  -e API_TOKEN=change-me \
  -e SEED_DEMO=true \
  -v papier-data:/data \
  papier-redirect-server
```

Or:

```bash
docker compose up --build
```

The SQLite file lives at `/data/papier.db` in the image (mount a volume).
`docker-compose.yml` reads `.env` via `env_file` (copy `.env.production.example`)
and overrides `DB_PATH` to `/data/papier.db` so the DB lands on the
`papier-data` named volume.

## Deployment

### Prerequisites on the VPS

- Docker Engine + Compose plugin (`docker compose version`) and `rsync`.
- SSH access as `ubuntu@130.162.185.144` (or your own `SERVER_HOST`).
- Inbound TCP `3000` open:
  - cloud firewall / security group: add a TCP `3000` ingress rule (this host
    is an Oracle Cloud address, so add it to the VCN Security List / NSG);
  - host firewall, if enabled: `sudo ufw allow 3000/tcp`.

### Configuration

```bash
cp .env.production.example .env
$EDITOR .env        # set REDIRECT_DOMAIN and a strong API_TOKEN
```

### First deploy (from a workstation)

```bash
./scripts/deploy.sh          # rsync + docker compose up -d --build + ps
./scripts/smoke.sh           # BASE_URL defaults to the public host
```

`deploy.sh` creates `~/papier-redirect-server` on the host, uploads the project
(excluding `node_modules`, `data`, `.git` and `.env`), then builds and starts the
container. It never uses `rsync --delete`, so remote `data/` and `.env` are
preserved; a missing remote `.env` is created from `.env.production.example`
(edit its `API_TOKEN`). Use `--dry-run` to print the rsync/ssh commands without
executing them.

By hand on the VPS instead:

```bash
git clone <repo> ~/papier-redirect-server && cd ~/papier-redirect-server
cp .env.production.example .env && $EDITOR .env
docker compose up -d --build
docker compose ps
```

### Updating

Re-run `./scripts/deploy.sh`; it rebuilds the image and restarts the container.

### Logs

```bash
ssh ubuntu@130.162.185.144
cd ~/papier-redirect-server
docker compose logs -f --tail=200
docker compose ps
```

### Seeding a demo merchant + terminal (end-to-end pairing test)

There is no "create merchant" API; merchants are seeded directly into SQLite.

- On boot: set `SEED_DEMO=true` in `.env`, then `docker compose up -d --build`.
- One-off against a running container:
  `docker compose exec papier-redirect node scripts/seed.js`
- Bare Node: `SEED_DEMO=true npm start` or `npm run seed`

This inserts merchant `demo-merchant` (public sample Place ID) and terminal
`DEMOTERM01`. Then a pairing round-trip works:

```bash
curl -s -X POST http://130.162.185.144:3000/api/terminals/register \
  -H 'X-Api-Token: dev-placeholder-token' -H 'Content-Type: application/json' \
  -d '{"device_serial":"DX8000-SN-000123","merchant_id":"demo-merchant"}'
```

`scripts/smoke.sh` performs exactly this register + pair-status round-trip and is
the fastest end-to-end check.

### Production hardening

- **Use HTTPS.** Terminate TLS with a reverse proxy (Caddy/nginx) or the cloud
  load balancer and set `REDIRECT_DOMAIN=https://...` so QR codes and
  `redirect_url` are correct. Only set `TRUST_PROXY=true` behind a trusted proxy
  (it feeds client-IP debounce keys).
- **Change `API_TOKEN`** from the placeholder to a long random secret; the
  placeholder grants full access to `/api/*`.

## Tests

```bash
npm test
```

Covers: `302` + `Location`, scan insert, debounce suppression within 120s,
debounce window expiry, unknown/inactive terminals, pairing-code creation /
expiry / claim, pair-status transitions, auth rejection, heartbeat/offline,
merchant listing/summary/scans, terminal display config (defaults, clamping,
validation), register listing and terminal adoption (create, idempotent
reassignment, validation), and CORS preflight/origin handling.

## Decisions & open questions

### Decisions

- **Unknown/inactive terminals → `404`.** Chosen over redirecting to a generic
  page so misconfigured terminals are observable and no scan is attributed.
  A future option is a branded "terminal not activated" page.
- **`terminal_id` format.** URL-safe `[A-Za-z0-9_-]{8,64}` (stored uppercase).
  If `register` omits `terminal_id`, it is derived from `device_serial`
  (uppercase, non-alphanumerics stripped, truncated to 32, zero-padded to ≥8).
  Example: `DX8000-SN-000123` → `DX8000SN000123`.
- **Shared env token** guards all `/api/*`. Pairing responses return the same
  `API_TOKEN` as the terminal's `api_token` (placeholder).
- **Debounce key includes User-Agent**, so two phones sharing an IP still count
  as two scans, while one phone refreshing counts once.
- **In-memory debounce cache**, pruned opportunistically; capped at 50k entries.
- **`pairing_codes` table** stores pending registrations; a terminal row is only
  created at claim time.
- **`claim` is idempotent**: re-claiming an already-claimed code returns the same
  store config instead of erroring.

### Open questions

1. **Terminal ID source for Android.** Recommended: app sends an explicit
   `terminal_id` (e.g. 16 uppercase hex chars derived from a stable device id or
   serial) to avoid collisions and surprises. Confirm the app can read a stable
   device identifier without extra permissions.
2. **Who claims a pairing code?** Currently an authenticated operator/back-office
   calls `POST /api/terminals/claim`. If the merchant claims via a web UI, that
   UI is out of scope here. Confirm the intended actor.
3. **Per-terminal API tokens.** All terminals currently share the env token.
   Should each terminal get its own token (stored in `terminals`) so one can be
   revoked?
4. **Debounce scope under horizontal scaling.** In-memory cache is per replica.
   Move to Redis/SQLite if multiple instances run behind a load balancer.
5. **Retention/GDPR.** `scans.user_agent` and client IP (used transiently for the
   debounce key, not stored) are personal data. Define a retention window and a
   purge job.
6. **`REDIRECT_DOMAIN` behind TLS.** Set it to the public HTTPS origin in
   production so QR codes and `redirect_url` are correct.
7. **Inactive-terminal UX.** Decide between `404`, a branded page, or a redirect
   to a fallback Google review URL.

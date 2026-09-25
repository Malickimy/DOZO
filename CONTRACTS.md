# DOZO — Cross-Repo Contracts (source of truth)

Frozen interfaces shared by the Android app, redirect server, and merchant dashboard.
Treat this file as **read-only**. To change a contract: update this file first, then update
every consumer, and flag the other workstream owners.

_Last synced from code on 2026-09-25. The workspace is a single monorepo (three projects under one git repo, remote `git@github.com:Malickimy/DOZO.git`; the main checkout is `/Users/malicky/l/DOZO`, and git worktrees mirror the same layout)._

_Release Board R1–R7 are all implemented on the server side. R2–R7 landed together in PR #36, an atomic server PR that collapsed the planned expand/contract steps. App and Dashboard consumers are still catching up (see §3 and §8)._

---

## 1. Projects & ownership (current paths)

| Workstream | Path | Owns |
| --- | --- | --- |
| App | `DOZO-App/` | `app/**`, `mockpay/**`, `scripts/dozo_*`, `scripts/mockpay_deploy`, `scripts/check_apk_size` |
| Server | `DOZO-Server/` | entire directory |
| Dashboard | `DOZO-Dashboard/` | `src/**`, `e2e/**`, SPA build config (frontend only) |
| Contract & docs | `.` (repo root) | `CONTRACTS.md`, `CONTEXT.md`, `MANUAL.md`, `README.md`, `Makefile`, `.github/workflows/` |
| Docs | Papier Obsidian vault (`obsidian` CLI, vault name `Papier`) | vault notes |

> Repo root: the monorepo checkout (main `/Users/malicky/l/DOZO`; worktrees such as `/Users/malicky/l/workspace-server` mirror the same layout). Paths in this file are repo-relative so they hold in any worktree. If a path moves again, update this table, the app `scripts/*` `PROJECT_DIR` defaults, `~/.config/opencode/opencode.json` (`ANDROID_PROJECT_DIR`), and the `android-build` skill.

> **R4 (server shipped 2026-09-25).** The Node backend lives in `DOZO-Server/` as one package with two entrypoints: `src/connector.js` (public) and `src/dashboard.js` (dashboard API + SPA). `DOZO-Dashboard/` stays a frontend and gains no Fastify or better-sqlite3 dependency.

---

## 2. Environments

- **VPS:** `ubuntu@130.162.185.144`, port `3000`, API token `dev-placeholder-token` (placeholder).
- **Emulator:** serial `emulator-5554`, AVD `Ingenico_AXIUM_DX8000` (API 29, 780×1280 @ 240 dpi).
- **Toolchain:** JDK 17; Android `compileSdk 37` / `minSdk 29` / `targetSdk 29`; Node.js 22+.
- **Local server default:** `http://localhost:3000`; **emulator → host:** `http://10.0.2.2:3000`.

---

## 3. HTTP API

Base URL `{api_base_url}` (app default `http://130.162.185.144:3000`).
All `/api/*` require header `X-Api-Token: <token>` (or `Authorization: Bearer <token>`).
`OPTIONS` preflight is unauthenticated. CORS origins from `DASHBOARD_ORIGIN` (default `*`);
allowed headers `X-Api-Token`, `X-Connector-Secret`, `Content-Type`; methods `GET, POST, PUT, PATCH, OPTIONS`.

> **R4 topology (server shipped 2026-09-25).** From Release Board R4 the redirect server becomes a connector that keeps only `GET /health` and `GET /r/:terminal_id`. The dashboard entrypoint, in the same package, owns every `/api/*` path, the database, and `GET /api/connector/config`. Paths do not change for consumers: the app's `api_base_url` points at the dashboard backend and its `redirect_base_url` points at the connector. The connector authenticates with `X-Connector-Secret` on `POST /scans` and `GET /api/connector/config`; the operator `X-Api-Token` covers the rest of `/api/*`.

### Public

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| GET | `/health` | — | `200 {"status":"ok"}` |
| GET | `/r/:terminal_id` | — | `302` `Location: {GOOGLE_REVIEW_BASE}?placeid={google_place_id}` |

`/r/:terminal_id` logs a scan unless debounced (`SHA-256(terminal_id + client IP + User-Agent)`, 120 s window). Unknown terminal → `404 {"error":"unknown_terminal","terminal_id"}`; inactive terminal → `404 {"error":"inactive_terminal","terminal_id"}`; **no** scan row in either case.

### Authenticated

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/terminals/redeem` | `{code, device_serial, terminal_id?}` | `200 {status:"redeemed", api_token, store}` | `400 invalid_code`, `400 invalid_terminal_id`, `400 invalid_device_serial`, `404 unknown_code`, `410 expired_code`, `410 redeemed_code` |
| POST | `/api/heartbeat` | `{terminal_id}` | `200 {ok, terminal_id, last_seen}` | `400`, `404 unknown_terminal` |
| GET | `/api/terminals/offline` | — | `200 {threshold_seconds, cutoff, terminals:[{terminal_id, merchant_id, label, active, last_seen}]}` | — |
| GET | `/api/terminals/:terminal_id/config` | — | `200 <config>` | `404 unknown_terminal` |
| PUT | `/api/terminals/:terminal_id/config` | `{display_enabled?, display_timeout_seconds?}` | `200 <config>` | `404` |
| PATCH | `/api/terminals/:terminal_id` | `{active?, label?}` | `200 <config>` | `400`, `404 unknown_terminal` |
| GET | `/api/merchants` | — | `200 [{merchant_id, google_place_id, created_at}]` | — |
| GET | `/api/merchants/:id/terminals` | — | `200 [{terminal_id, label, active, last_seen, scan_count, last_scan_at, static_review_url}]` | `404` |
| GET | `/api/merchants/:id/summary` | query `?since=&until=` (optional) | `200 {merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` | `404` |
| GET | `/api/merchants/:id/scans` | query `?terminal_id=&since=&until=&limit=` (default 100, max 1000) | `200 [{id, terminal_id, scanned_at, user_agent}]` | `404` |
| GET | `/api/merchants/:id/scans/series` | query `?since=&until=&bucket=day` | `200 [{day, count}]` | `404` |
| GET | `/api/merchants/:id/registers` | — | `200 [{label, terminal_id, active, last_seen, static_review_url}]` (`terminal_id` and `static_review_url` null when unoccupied; `active` derived from the bound terminal) | `404` |
| POST | `/api/merchants/:id/registers/:label/setup-code` | — | `201 {code, merchant_id, label, expires_at, expires_in_seconds}` | `400 invalid_label`, `404 unknown_merchant`, `503 code_generation_failed` |
| PUT | `/api/merchants/:id/google-place-id` | `{google_place_id}` | `200 {merchant_id, google_place_id}` | `400`, `404` |
| GET | `/api/connector/config` | — | `200 {generated_at, redirect_base_url, terminals:[{terminal_id, merchant_id, google_place_id, label, active}]}` | `401` |
| POST | `/scans` | `{event_id, terminal_id, merchant_id, scanned_at, user_agent}` | `202 {status:"accepted"}` or `202 {status:"duplicate"}` | `400 malformed`, `401 unauthorized` |

The four legacy pairing endpoints (`register`, `pair-status/:code`, `claim`, `adopt`) were removed on the server in `feat/model-b-retire` (commit `eeac451`). The Android app still ships an `AdoptScreen` that calls the removed `adopt` route; removing it is App R1 close-out work.

Notes:

- **R1 (server shipped 2026-09-24; retire shipped 2026-09-25).** `POST /api/merchants/:id/registers/:label/setup-code` and `POST /api/terminals/redeem` are the model-B pairing flow. The legacy `register`, `pair-status`, `claim`, and `adopt` routes were removed in `eeac451`; the app-side `adopt` removal is pending. Redeeming a code for an occupied register deactivates the prior terminal.
- **R2 (server shipped 2026-09-25).** `POST /scans` is the connector ingest on the dashboard entrypoint. It authenticates with `X-Connector-Secret`, is idempotent on `event_id`, returns `202` for both a new and a duplicate event, and never returns `404` (an unknown terminal is logged and dropped). The dashboard ingest and its own DB are still pending.
- **R3 (server shipped 2026-09-25).** `PATCH /api/terminals/:id` owns `active` and `label`; `PUT /api/terminals/:id/config` keeps `display_enabled` and `display_timeout_seconds`. `config`, `store`, and the two dashboard list rows (§8) carry `static_review_url`, computed on read. Dashboard and app consumers pending.
- **R4 (server shipped 2026-09-25).** One backend package, two entrypoints, two containers per client. The connector keeps `/health`, `/r/:id`, the file-backed spool, and a last-known config cache; the dashboard entrypoint owns the DB and all `/api/*`. App defaults and the dashboard SPA are pending.
- **R5 (server shipped 2026-09-25).** The series endpoint groups `scanned_at` by the Europe/Warsaw day and returns `[{day, count}]`; `scanned_at` stays an ISO UTC timestamp. The dashboard renders `day` verbatim and renders other timestamps in browser-local time.
- **R6 (server shipped 2026-09-25).** `api_token` is per-terminal: issued at `redeem`, hashed at rest (`terminals.api_token_hash`, migration v6), and validated on heartbeat / config / registers; a mismatch returns `401` and the app re-pairs. The operator token is unchanged. App-side re-pair pending.
- **R7 (server shipped 2026-09-25).** A `registers` table lets a register exist unoccupied (`terminal_id` null). `GET /registers` returns every register, `setup-code` finds or creates it, and `redeem` binds the terminal and deactivates the prior one. `registers.label` is the label source of truth; `registers.active` is derived from the bound terminal.
- **Labels (R3/R7, decided 2026-09-25).** `registers.label` is the source of truth. `PATCH /api/terminals/:id` with a `label` syncs the bound register row and the terminal cache in one transaction; a collision with another register for the same merchant returns `400 label_in_use`, and a terminal with no register row gains one.

Shape aliases:

```
config  = {terminal_id, merchant_id, google_place_id, label, active,
           display_enabled, display_timeout_seconds, redirect_base_url,
           static_review_url}
store   = {terminal_id, merchant_id, google_place_id, label, redirect_url,
           static_review_url}
```

`redirect_base_url` is the redirect domain (no `/r/:id`); `store.redirect_url` is the full `{domain}/r/{terminal_id}`. `static_review_url` is `{GOOGLE_REVIEW_BASE}?placeid={google_place_id}`, computed on read from the current `google_place_id` (it tracks a `PUT /api/merchants/:id/google-place-id` change; "static" means a direct Google URL, not a frozen one). It appears on `config`, `store`, `GET /api/merchants/:id/terminals`, and `GET /api/merchants/:id/registers`. The connector derives it from its own cached `google_place_id` and does not receive it in `/api/connector/config`.

---

## 4. Database schema (SQLite, `PRAGMA user_version` migrations v1–v6)

```
merchants(merchant_id PK, google_place_id NOT NULL, created_at NOT NULL)
terminals(terminal_id PK, merchant_id FK, label, active INT DEFAULT 1, last_seen,
          created_at NOT NULL, display_enabled INT DEFAULT 1, display_timeout_seconds INT DEFAULT 15,
          api_token_hash TEXT UNIQUE NULL)
scans(id INTEGER PK AUTOINCREMENT, terminal_id FK, scanned_at, user_agent, event_id TEXT UNIQUE)
pairing_codes(code PK, device_serial, merchant_id FK, terminal_id,
              created_at, expires_at, claimed_at)
setup_codes(code PK, merchant_id FK, label, created_at, expires_at, redeemed_at)
registers(register_id PK, merchant_id FK, label, terminal_id FK NULL,
          active INT DEFAULT 1, created_at)
```

Seed (`SEED_DEMO=true` / `npm run seed`): merchant `demo-merchant` (Place ID `ChIJN1t_tDeuEmsRUsoyG83frY4`), terminal `DEMOTERM01`.

> **R4 (server shipped 2026-09-25).** The dashboard entrypoint owns these tables per client. The connector keeps only a file-backed scan spool (R2/R4) and no longer owns the `scans` table as the source of truth, though it dual-writes until ingest is proven.
>
> **Migrations (server shipped 2026-09-25).** v3 adds `setup_codes`; v4 adds `scans.event_id` (unique, the dedupe key); v5 adds `registers`; v6 adds `terminals.api_token_hash` (unique). `terminals.terminal_id` stays the device key; `registers.terminal_id` is null until redemption.

---

## 5. Android intent contract

- **Activity:** `com.example.dozo/.MainActivity`, `exported=true`, `launchMode=singleTop`, portrait, `configChanges` locked. Handoff uses `startActivityForResult`; relaunch arrives via `onNewIntent`.
- **Actions:** `com.fiserv.intent.action.TRANSACTION_COMPLETE` / `TRANSACTION_CANCELED` / `TRANSACTION_REFUSED`; `com.ingenico.dx8000.action.TRANSACTION_APPROVED` / `TRANSACTION_CANCELED` / `TRANSACTION_REFUSED`.
- **Extras:** `status` (`APPROVED`/`CANCELED`/`REFUSED`, case-insensitive), `merchant_id`, `terminal_id`, `transaction_id`, `amount_cents` (int), `review_url`, `reason`.
- **Status precedence:** `status` wins; without it, only the known approved actions count; a blank `status` falls back to the action. An unknown `status` → silent exit; an absent/unknown action without an approved status falls back to `Idle` (the launcher/config path).
- **QR payload rule:** `terminal_id` non-blank → `{redirect_base_url}/r/{terminal_id}`; else `review_url`; else `DEFAULT_REVIEW_URL`. The raw Google URL is never encoded.
- **Result codes:** `1` approved (`RESULT_APPROVED`). Non-approval and silent exits use `RESULT_CANCELED` (0), the Android default. Every exit calls `setResult(code)` then `finish()`.
- **Approved-only UI:** only an approved transaction shows the QR screen. Canceled / refused / unknown intents render no UI and exit silently in both debug and release.
- **Activation gate:** applies only to transaction handoffs; an approved transaction always returns `1` even when the QR is suppressed by `activated=false` or `display_enabled=false`. Manual/launcher launches always show the UI so a merchant can configure/pair.

---

## 6. Android prefs contract (`dozo_prefs`, SharedPreferences)

| Key | Type | Default | Range/notes |
| --- | --- | --- | --- |
| `api_base_url` | string | `http://130.162.185.144:3000` | server API base |
| `redirect_base_url` | string | `http://130.162.185.144:3000` | QR redirect base |
| `api_token` | string | `dev-placeholder-token` | `X-Api-Token` |
| `merchant_id` | string | `demo-merchant` | set by dashboard later |
| `terminal_id` | string | derived from `ANDROID_ID` | `[A-Za-z0-9_-]{8,64}` uppercase |
| `display_timeout_seconds` | int | `15` | clamped 5–30 |
| `display_enabled` | bool | `true` | show QR |
| `activated` | bool | `true` | accept handoffs |
| `pin` | string | `0000` | settings PIN |
| `pairing_code` | string | — | last code, for config re-sync |

> **R4 (server shipped 2026-09-25; app defaults pending).** The keys and types do not change. `api_base_url` points at the dashboard backend and `redirect_base_url` at the connector; this is a deployment/default change, recorded in App Sprint 4.
>
> **R6 (server shipped 2026-09-25; app pending).** `api_token` holds the per-terminal token returned by `redeem` instead of the shared env token. A `401` clears it and prompts re-pair.

---

## 7. Background jobs (app)

- `HeartbeatWorker`: periodic **12 h** → `POST /api/heartbeat {terminal_id}`.
- `ConfigSyncWorker`: periodic **24 h** → `GET /api/terminals/{terminal_id}/config`; applies `display_enabled`, `display_timeout_seconds`, `redirect_base_url`.
- Manual: Settings → **Sync now** / **Send heartbeat now**.
- Both skip silently when `terminal_id` or token is absent. Server marks a terminal offline after 2 missed 12 h pings (24 h).

> **R4 (server shipped 2026-09-25).** Both calls resolve to the dashboard backend through `api_base_url`; no path change.

---

## 8. Dashboard contract

- SPA base URL precedence: saved `localStorage`, then `VITE_API_BASE_URL` (build/dev override), then `window.location.origin`. Token entered on the login screen.
- `localStorage` keys: `dozo.dashboard.apiBaseUrl`, `dozo.dashboard.apiToken`.
- The dashboard entrypoint serves `GET /health` on the SPA's own origin, so "Test connection" targets its own origin.
- Consumes: `/health`, `/api/merchants`, `/api/merchants/:id/terminals|summary|scans|registers`, `PUT /api/merchants/:id/google-place-id`, `POST /api/merchants/:id/registers/:label/setup-code`, `/api/terminals/offline`.
- **R3/R5 (server shipped 2026-09-25; dashboard pending):** the dashboard also calls `PATCH /api/terminals/:id` and `GET /api/merchants/:id/scans/series`, and displays `static_review_url` per row. Series `day` strings render verbatim (Europe/Warsaw); other timestamps render browser-local.
- **R1 (shipped):** the dashboard consumes `registers` + `setup-code`; `adopt` is removed.

> **R4 (server shipped 2026-09-25).** The dashboard entrypoint serves the SPA and the API on the same origin, so the SPA defaults `apiBaseUrl` to `window.location.origin`; the token stays.

---

## 9. Build & release

- App: `compileSdk 37`, `minSdk 29`, `targetSdk 29`, Java 17, `buildConfig=true`; release `isMinifyEnabled`/`isShrinkResources`; lint disables `ExpiredTargetSdkVersion`. Size budget **5 MB** via `scripts/check_apk_size` (release currently ~2.20 MB, unsigned).

---

## 10. Environment variables

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

---

## 11. Change process

1. Propose the change here first.
2. Update the owning repo(s).
3. Update every consumer (server → app/dashboard → docs).
4. Bump this file's "Last synced" line and flag the other owners.

# DOZO — Cross-Repo Contracts (source of truth)

Frozen interfaces shared by the Android app, redirect server, and merchant dashboard.
Treat this file as **read-only**. To change a contract: update this file first, then update
every consumer, and flag the other workstream owners.

_Last synced from code on 2026-09-17. The workspace is a single monorepo at `/Users/malicky/l/DOZO` (three projects under one git repo, remote `git@github.com:Malickimy/DOZO.git`)._

---

## 1. Projects & ownership (current paths)

| Workstream | Path | Owns |
| --- | --- | --- |
| App | `/Users/malicky/l/DOZO/DOZO-App` | `app/**`, `mockpay/**`, `scripts/dx8000_*`, `scripts/mockpay_deploy`, `scripts/check_apk_size` |
| Server | `/Users/malicky/l/DOZO/DOZO-Server` | entire directory |
| Dashboard | `/Users/malicky/l/DOZO/DOZO-Dashboard` | entire directory |
| Contract & docs | `/Users/malicky/l/DOZO` (repo root) | `CONTRACTS.md`, `MANUAL.md`, `README.md`, `Makefile`, `.github/workflows/` |
| Docs | Papier Obsidian vault (`obsidian` CLI, vault name `Papier`) | vault notes |

> Repo root: `/Users/malicky/l/DOZO` (monorepo; the git repo lives here). If any path moves again, update this table, the app `scripts/*` `PROJECT_DIR` defaults, `~/.config/opencode/opencode.json` (`ANDROID_PROJECT_DIR`), and the `android-build` skill.

---

## 2. Environments

- **VPS:** `ubuntu@130.162.185.144`, port `3000`, API token `dev-placeholder-token` (placeholder).
- **Emulator:** serial `emulator-5554`, AVD `Ingenico_AXIUM_DX8000` (API 29, 780×1280 @ 240 dpi).
- **Toolchain:** JDK 17; Android `compileSdk 37` / `minSdk 29` / `targetSdk 29`; Node.js 20+.
- **Local server default:** `http://localhost:3000`; **emulator → host:** `http://10.0.2.2:3000`.

---

## 3. HTTP API

Base URL `{api_base_url}` (app default `http://130.162.185.144:3000`).
All `/api/*` require header `X-Api-Token: <token>` (or `Authorization: Bearer <token>`).
`OPTIONS` preflight is unauthenticated. CORS origins from `DASHBOARD_ORIGIN` (default `*`);
allowed headers `X-Api-Token`, `Content-Type`; methods `GET, POST, PUT, OPTIONS`.

### Public

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| GET | `/health` | — | `200 {"status":"ok"}` |
| GET | `/r/:terminal_id` | — | `302` `Location: {GOOGLE_REVIEW_BASE}?placeid={google_place_id}` |

`/r/:terminal_id` logs a scan unless debounced (`SHA-256(terminal_id + client IP + User-Agent)`, 120 s window). Unknown/inactive terminal → `404 {"error":"unknown_terminal"}` and **no** scan row.

### Authenticated

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/terminals/register` | `{device_serial, merchant_id, terminal_id?}` | `201 {code, terminal_id, expires_at, expires_in_seconds}` | `400`, `404 unknown_merchant` |
| GET | `/api/terminals/pair-status/:code` | — | `202 {status:"pending", code, expires_at}` / `200 {status:"claimed", api_token, store}` | `404 {status:"unknown"}`, `410 {status:"expired"}` |
| POST | `/api/terminals/claim` | `{code, label?}` | `200 {status:"claimed", api_token, store}` | `400 invalid_code`, `404 unknown_code`, `410 expired_code` |
| POST | `/api/terminals/adopt` | `{terminal_id, merchant_id, label}` | `200 <config>` | `400`, `404 unknown_merchant` |
| POST | `/api/heartbeat` | `{terminal_id}` | `200 {ok, terminal_id, last_seen}` | `400`, `404 unknown_terminal` |
| GET | `/api/terminals/offline` | — | `200 {threshold_seconds, cutoff, terminals:[{terminal_id, merchant_id, label, active, last_seen}]}` | — |
| GET | `/api/terminals/:terminal_id/config` | — | `200 <config>` | `404 unknown_terminal` |
| PUT | `/api/terminals/:terminal_id/config` | `{display_enabled?, display_timeout_seconds?}` | `200 <config>` | `404` |
| GET | `/api/merchants` | — | `200 [{merchant_id, google_place_id, created_at}]` | — |
| GET | `/api/merchants/:id/terminals` | — | `200 [{terminal_id, label, active, last_seen, scan_count, last_scan_at}]` | `404` |
| GET | `/api/merchants/:id/summary` | — | `200 {merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` | `404` |
| GET | `/api/merchants/:id/scans` | query `?terminal_id=&since=&until=&limit=` (default 100, max 1000) | `200 [{id, terminal_id, scanned_at, user_agent}]` | `404` |
| GET | `/api/merchants/:id/registers` | — | `200 [{label, terminal_id, active, last_seen}]` | `404` |
| PUT | `/api/merchants/:id/google-place-id` | `{google_place_id}` | `200 {merchant_id, google_place_id}` | `400`, `404` |

Shape aliases:

```
config  = {terminal_id, merchant_id, google_place_id, label, active,
           display_enabled, display_timeout_seconds, redirect_base_url}
store   = {terminal_id, merchant_id, google_place_id, label, redirect_url}
```

`redirect_base_url` is the redirect domain (no `/r/:id`); `store.redirect_url` is the full `{domain}/r/{terminal_id}`.

---

## 4. Database schema (SQLite, `PRAGMA user_version` migrations v1–v2)

```
merchants(merchant_id PK, google_place_id NOT NULL, created_at NOT NULL)
terminals(terminal_id PK, merchant_id FK, label, active INT DEFAULT 1, last_seen,
          created_at NOT NULL, display_enabled INT DEFAULT 1, display_timeout_seconds INT DEFAULT 15)
scans(id INTEGER PK AUTOINCREMENT, terminal_id FK, scanned_at, user_agent)
pairing_codes(code PK, device_serial, merchant_id FK, terminal_id,
              created_at, expires_at, claimed_at)
```

Seed (`SEED_DEMO=true` / `npm run seed`): merchant `demo-merchant` (Place ID `ChIJN1t_tDeuEmsRUsoyG83frY4`), terminal `DEMOTERM01`.

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

---

## 7. Background jobs (app)

- `HeartbeatWorker`: periodic **12 h** → `POST /api/heartbeat {terminal_id}`.
- `ConfigSyncWorker`: periodic **24 h** → `GET /api/terminals/{terminal_id}/config`; applies `display_enabled`, `display_timeout_seconds`, `redirect_base_url`.
- Manual: Settings → **Sync now** / **Send heartbeat now**.
- Both skip silently when `terminal_id` or token is absent. Server marks a terminal offline after 2 missed 12 h pings (24 h).

---

## 8. Dashboard contract

- Env `VITE_API_BASE_URL` (default `http://130.162.185.144:3000`); token entered on the login screen.
- `localStorage` keys: `dozo.dashboard.apiBaseUrl`, `dozo.dashboard.apiToken`.
- Consumes: `/health`, `/api/merchants`, `/merchants/:id/terminals|summary|scans`, `PUT /merchants/:id/google-place-id`, `POST /api/terminals/claim`, `/api/terminals/offline`.
- **Gap:** `registers` and `adopt` endpoints exist on the server but are not yet consumed by the dashboard.

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
| Dashboard | `VITE_API_BASE_URL` | `http://130.162.185.144:3000` |

---

## 11. Change process

1. Propose the change here first.
2. Update the owning repo(s).
3. Update every consumer (server → app/dashboard → docs).
4. Bump this file's "Last synced" line and flag the other owners.

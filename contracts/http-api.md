# Contract — HTTP API

**Owner:** Server (`dozo-server-agent`). Consumed by App and Dashboard.
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

Frozen HTTP interface shared by the Android app, redirect server, and merchant dashboard.
Treat as read-only outside the owning workstream. To change it: update this file on the
owning branch, then update every consumer, then bump the index "Last synced" line.

---

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
| GET | `/api/terminals/:terminal_id/config` | — | `200 <config>` (an `active:false` terminal still returns `200`; no `inactive_terminal` here) | `401 unauthorized`, `404 unknown_terminal` |
| PUT | `/api/terminals/:terminal_id/config` | `{display_enabled?, display_timeout_seconds?}` | `200 <config>` | `400 invalid_display_enabled`, `400 invalid_display_timeout_seconds`, `401 unauthorized`, `404 unknown_terminal` |
| PATCH | `/api/terminals/:terminal_id` | `{active?, label?}` | `200 <config>` | `400 invalid_active`, `400 invalid_label`, `400 label_in_use`, `401 unauthorized`, `404 unknown_terminal` |
| GET | `/api/merchants` | — | `200 [{merchant_id, google_place_id, created_at}]` | — |
| GET | `/api/merchants/:id/terminals` | — | `200 [{terminal_id, label, active, last_seen, scan_count, last_scan_at, static_review_url}]` | `404` |
| GET | `/api/merchants/:id/summary` | query `?since=&until=` (optional) | `200 {merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` | `404` |
| GET | `/api/merchants/:id/scans` | query `?terminal_id=&since=&until=&limit=` (default 100, max 1000) | `200 [{id, event_id, terminal_id, scanned_at, user_agent}]` | `404` |
| GET | `/api/merchants/:id/scans/series` | query `?since=&until=&bucket=day` | `200 [{day, count}]` | `404` |
| GET | `/api/merchants/:id/registers` | — | `200 [{label, terminal_id, active, last_seen, static_review_url}]` (`terminal_id` and `static_review_url` null when unoccupied; `active` derived from the bound terminal) | `404` |
| POST | `/api/merchants/:id/registers/:label/setup-code` | — | `201 {code, merchant_id, label, expires_at, expires_in_seconds}` | `400 invalid_label`, `404 unknown_merchant`, `503 code_generation_failed` |
| PUT | `/api/merchants/:id/google-place-id` | `{google_place_id}` | `200 {merchant_id, google_place_id}` | `400`, `404` |
| GET | `/api/connector/config` | — | `200 {generated_at, redirect_base_url, terminals:[{terminal_id, merchant_id, google_place_id, label, active}]}` | `401` |
| POST | `/scans` | `{event_id, terminal_id, merchant_id, scanned_at, user_agent}` | `202 {status:"accepted"}` or `202 {status:"duplicate"}` | `400 malformed`, `401 unauthorized` |

The four legacy pairing endpoints (`register`, `pair-status/:code`, `claim`, `adopt`) were removed on the server in `feat/model-b-retire` (commit `eeac451`). The app-side `AdoptScreen` was retired in PR #62, so no consumer calls the removed `adopt` route.

Notes:

- **R1 (server shipped 2026-09-24; retire shipped 2026-09-25).** `POST /api/merchants/:id/registers/:label/setup-code` and `POST /api/terminals/redeem` are the model-B pairing flow. The legacy `register`, `pair-status`, `claim`, and `adopt` routes were removed in `eeac451`; the app-side `adopt` removal landed in PR #62. Redeeming a code for an occupied register deactivates the prior terminal.
- **R2 (server shipped 2026-09-25).** `POST /scans` is the connector ingest on the dashboard entrypoint. It authenticates with `X-Connector-Secret`, is idempotent on `event_id`, returns `202` for both a new and a duplicate event, and never returns `404` (an unknown terminal is logged and dropped). The dashboard ingest and its own DB are still pending.
- **R3 (server shipped 2026-09-25).** `PATCH /api/terminals/:terminal_id` owns `active` and `label`; `PUT /api/terminals/:terminal_id/config` keeps `display_enabled` and `display_timeout_seconds`. `config`, `store`, and the two dashboard list rows (`dashboard.md`) carry `static_review_url`, computed on read. The app `static_review_url` consumer landed in PR #62; the dashboard consumer remains pending.
- **R4 (server shipped 2026-09-25).** One backend package, two entrypoints, two containers per client. The connector keeps `/health`, `/r/:terminal_id`, the file-backed spool, and a last-known config cache; the dashboard entrypoint owns the DB and all `/api/*`. App defaults landed in PR #62; the dashboard SPA remains pending.
- **R5 (server shipped 2026-09-25).** The series endpoint groups `scanned_at` by the Europe/Warsaw day and returns `[{day, count}]`; `scanned_at` stays an ISO UTC timestamp. The dashboard renders `day` verbatim and renders other timestamps in browser-local time.
- **R6 (server shipped 2026-09-25).** `api_token` is per-terminal: issued at `redeem`, hashed at rest (`terminals.api_token_hash`, migration v6), and validated on heartbeat / config / registers; a mismatch returns `401` and the app re-pairs. The operator token is unchanged. The app-side re-pair landed in PR #62.
- **R7 (server shipped 2026-09-25).** A `registers` table lets a register exist unoccupied (`terminal_id` null). `GET /registers` returns every register, `setup-code` finds or creates it, and `redeem` binds the terminal and deactivates the prior one. `registers.label` is the label source of truth; `registers.active` is derived from the bound terminal.
- **Labels (R3/R7, decided 2026-09-25).** `registers.label` is the source of truth. `PATCH /api/terminals/:terminal_id` with a `label` syncs the bound register row and the terminal cache in one transaction; a collision with another register for the same merchant returns `400 label_in_use`, and a terminal with no register row gains one.

Shape aliases:

```
config  = {terminal_id, merchant_id, google_place_id, label, active,
           display_enabled, display_timeout_seconds, redirect_base_url,
           static_review_url}
store   = {terminal_id, merchant_id, google_place_id, label, redirect_url,
           static_review_url}
```

`redirect_base_url` is the redirect domain (no `/r/:terminal_id`); `store.redirect_url` is the full `{domain}/r/{terminal_id}`. `static_review_url` is `{GOOGLE_REVIEW_BASE}?placeid={google_place_id}`, computed on read from the current `google_place_id` (it tracks a `PUT /api/merchants/:id/google-place-id` change; "static" means a direct Google URL, not a frozen one). It appears on `config`, `store`, `GET /api/merchants/:id/terminals`, and `GET /api/merchants/:id/registers`. The connector derives it from its own cached `google_place_id` and does not receive it in `/api/connector/config`.

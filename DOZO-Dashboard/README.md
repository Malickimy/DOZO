# DOZO Merchant Dashboard

Web dashboard for **DOZO** — a QR review-prompt product for Ingenico AXIUM
DX8000 terminals.

Terminals are paired to a merchant, and every QR scan is logged by the
[redirect server](../DOZO-Server). This dashboard is where a merchant
links their terminals to a Google Place ID and watches **scan volume per
terminal**.

> **Reviews cannot be attributed.** Google does not tell us which scan produced
> which review, so scan volume (not review count) is the metric this dashboard
> reports.

## Stack

- Vite + React + TypeScript
- Plain CSS (no UI kit), `fetch` for HTTP
- Vitest + React Testing Library

## Getting started

```bash
npm install
cp .env.example .env        # optional — defaults are baked in
npm run dev                 # http://localhost:5173
```

Open the app, enter the API base URL and token, click **Test connection**, then
**Continue**.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Run oxlint |

## Environment variables

Vite exposes variables prefixed with `VITE_`. Both settings can also be changed
at runtime on the login/settings screen; the runtime value is stored in
`localStorage` and takes precedence over the build-time default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://130.162.185.144:3000` | Base URL for the DOZO API |

The API token is **not** a build-time variable — it is entered in the UI and
persisted in `localStorage` under `dozo.dashboard.apiToken`. The base URL is
persisted under `dozo.dashboard.apiBaseUrl`.

## API contract

Every `/api/*` request sends the header:

```
X-Api-Token: <token>
```

`GET /health` is public (no token).

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/health` | `{status:"ok"}` |
| `GET` | `/api/merchants` | `[{merchant_id, google_place_id, created_at}]` |
| `GET` | `/api/merchants/:merchant_id/terminals` | `[{terminal_id, label, active, last_seen, scan_count, last_scan_at}]` |
| `GET` | `/api/merchants/:merchant_id/summary` | `{merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` |
| `GET` | `/api/merchants/:merchant_id/scans?terminal_id=&since=&until=&limit=` | `[{id, terminal_id, scanned_at, user_agent}]` |
| `PUT` | `/api/merchants/:merchant_id/google-place-id` | body `{google_place_id}` → `{merchant_id, google_place_id}` |
| `POST` | `/api/terminals/claim` | body `{code, label}` → `{status:"claimed", api_token, store:{terminal_id, merchant_id, google_place_id, label, redirect_url}}` |
| `GET` | `/api/terminals/offline` | `{threshold_seconds, cutoff, terminals:[...]}` |

Some endpoints are implemented in parallel. If one returns **`404`**, the UI
shows a clear “not available yet” state instead of crashing.

## Screens

- **Login / settings** — API base URL + token, “Test connection” (calls
  `/health`), reachable later from the top bar.
- **Merchant picker** — from `GET /api/merchants`. If the list endpoint is not
  available, you can type a merchant ID manually.
- **Summary cards** — total scans and terminal count.
- **Terminals table** — label, terminal ID, active, last seen, scan count, last
  scan.
- **Pairing** — enter the 8-character code + optional label, call
  `POST /api/terminals/claim`, show the returned store config.
- **Google Place ID** — assign the selected merchant’s Place ID.
- **Scans** — per-terminal bar visualization (plain `div`s) plus a scan table
  with a terminal filter.
- **Offline terminals** — terminals that have not sent a heartbeat within the
  server’s threshold.

Loading, empty, error, and “not available yet” states are handled throughout.
On day one the expected empty state is: terminals listed, zero scans.

## Tests

```bash
npm test
```

- `src/test/api.test.ts` — API client with a mocked `fetch`: token header,
  query-string building, URL encoding, JSON body, `404` → not-available, network
  failure → `ApiError` status `0`.
- `src/test/LoginSettings.test.tsx` — connection test renders success and
  submit requires a token and persists trimmed settings.

## Assumptions & gaps

- There is no “create merchant” API; merchants are seeded server-side, so the
  merchant picker may be empty and the manual merchant-ID fallback is used.
- `active` is treated as truthy for `true` or `1` (SQLite stores booleans as
  integers).
- The scan list is capped at `limit=100`; there is no pagination UI yet.
- `since`/`until` are supported by the API client but not exposed in the UI.
- The per-terminal bars use `scan_count` from the terminals endpoint, while the
  table uses the scans endpoint, so they can differ if the debounce window
  suppresses a scan.
- Timestamps are displayed in the browser’s local timezone.
- Auth is a single shared token; there is no per-user login or role model.

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

The site has two pages:

- `/` — the DooZo homepage (`index.html`, static). **Zaloguj się** and
  **Zobacz panel** link to the dashboard.
- `/panel/` — the dashboard (`panel/index.html`, React).

Open `/panel/`, enter the API base URL and token, click **Test connection**,
then **Continue**.

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

The dashboard is **same-origin by default**: with nothing configured, the API
base URL is the SPA's own origin (`window.location.origin`). In a deployment
where the redirect server also serves the built SPA, no configuration is
needed. During `npm run dev` the Vite server proxies `/api` and `/health` to
`http://localhost:3000` (`VITE_API_PROXY_TARGET`), so the same default works on
the dev port too. Precedence: saved `localStorage`, then `VITE_API_BASE_URL`,
then the SPA origin.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | the SPA's own origin | Build/dev override for the DOZO API base URL |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Dev-only proxy target used by `npm run dev` |

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
| `GET` | `/api/merchants/:merchant_id/terminals` | `[{terminal_id, label, active, last_seen, scan_count, last_scan_at, static_review_url}]` |
| `GET` | `/api/merchants/:merchant_id/scans?terminal_id=&since=&until=&limit=` | `[{id, terminal_id, scanned_at, user_agent}]` |
| `GET` | `/api/merchants/:merchant_id/scans/series?since=&until=&bucket=day` | `[{day, count}]` (Europe/Warsaw days; empty days omitted) |
| `GET` | `/api/merchants/:merchant_id/registers` | `[{label, terminal_id, active, last_seen, static_review_url}]` |
| `POST` | `/api/merchants/:merchant_id/registers/:label/setup-code` | `{code, merchant_id, label, expires_at, expires_in_seconds}` |
| `PUT` | `/api/merchants/:merchant_id/google-place-id` | body `{google_place_id}` → `{merchant_id, google_place_id}` |
| `GET` / `PUT` | `/api/terminals/:terminal_id/config` | config; `PUT` body `{display_enabled?, display_timeout_seconds?}` |
| `PATCH` | `/api/terminals/:terminal_id` | body `{active?, label?}` → config |
| `GET` | `/api/terminals/offline` | `{threshold_seconds, cutoff, terminals:[...]}` (all merchants; filtered client-side) |

Some endpoints are implemented in parallel. If one returns **`404`**, the UI
shows a clear “not available yet” state instead of crashing.

## Screens

The UI is Polish by default with a PL/EN switch (stored under `doozo-lang`,
shared with the homepage). Sections follow the DooZo panel design:

- **Sign-in layer** — without a saved token `/panel/` shows sign-in, sign-up
  (company, NIP with checksum, email, password, terms) and password reset
  (`#logowanie`, `#rejestracja`, `#reset-hasla`). They validate client-side but
  send nothing: account auth awaits `/api/auth/*` on the server. “Use an
  operator token” (`#operator`) is the working path: API base URL + token,
  “Test connection” (calls `/health`). “Sign out” clears only the token.
- **Merchant picker** — from `GET /api/merchants`. If the list endpoint is not
  available, you can type a merchant ID manually.
- **Overview** — 14/30-day range, scan KPI with change vs the previous period
  and a daily chart (`/scans/series`), recent scans, per-terminal bars and the
  scan log with a terminal filter.
- **Terminals** — pairing wizard (name → `setup-code` → countdown → polls
  `/registers` until a terminal redeems it), terminals table with scans today,
  review link, “Manage” drawer (`PATCH` / config) and two-step “Disconnect”
  (`active: false`), registers with re-issue, offline terminals.
- **After-payment screen** — QR on/off and display time applied to every active
  terminal (`PUT /config`), live preview, and the Google Place ID form.
- **Contacts, Guide, Subscription** — the guide is static content; contacts,
  billing and the views / sign-ups / −10% KPIs are designed but show an
  “Awaiting API” state until the server exposes those endpoints.

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

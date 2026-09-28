# Contract — Dashboard

**Owner:** Dashboard (`dozo-dashboard-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

- SPA base URL precedence: saved `localStorage`, then `VITE_API_BASE_URL` (build/dev override), then `window.location.origin`. Token entered on the login screen.
- `localStorage` keys: `dozo.dashboard.apiBaseUrl`, `dozo.dashboard.apiToken`.
- The dashboard entrypoint serves `GET /health` on the SPA's own origin, so "Test connection" targets its own origin.
- Consumes: `/health`, `/api/merchants`, `/api/merchants/:id/terminals|summary|scans|registers`, `PUT /api/merchants/:id/google-place-id`, `POST /api/merchants/:id/registers/:label/setup-code`, `/api/terminals/offline`.
- **R3/R5 (server shipped 2026-09-25; dashboard pending):** the dashboard also calls `PATCH /api/terminals/:terminal_id` and `GET /api/merchants/:id/scans/series`, and displays `static_review_url` per row. Series `day` strings render verbatim (Europe/Warsaw); other timestamps render browser-local.
- **R1 (shipped):** the dashboard consumes `registers` + `setup-code`; `adopt` is removed.

> **R4 (server shipped 2026-09-25).** The dashboard entrypoint serves the SPA and the API on the same origin, so the SPA defaults `apiBaseUrl` to `window.location.origin`; the token stays.

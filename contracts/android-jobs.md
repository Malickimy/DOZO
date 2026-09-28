# Contract — Android background jobs

**Owner:** App (`dozo-app-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

- `HeartbeatWorker`: periodic **12 h** → `POST /api/heartbeat {terminal_id}`.
- `ConfigSyncWorker`: periodic **24 h** → `GET /api/terminals/{terminal_id}/config`; applies `display_enabled`, `display_timeout_seconds`, `redirect_base_url`.
- Manual: Settings → **Sync now** / **Send heartbeat now**.
- Both skip silently when `terminal_id` or token is absent. Server marks a terminal offline after 2 missed 12 h pings (24 h).

> **R4 (server shipped 2026-09-25).** Both calls resolve to the dashboard backend through `api_base_url`; no path change.

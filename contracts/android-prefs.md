# Contract — Android prefs

**Owner:** App (`dozo-app-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

`dozo_prefs` (`SharedPreferences`).

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

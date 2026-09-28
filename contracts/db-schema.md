# Contract — Database schema

**Owner:** Server (`dozo-server-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

SQLite, `PRAGMA user_version` migrations v1–v6.

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

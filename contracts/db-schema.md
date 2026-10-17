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

> **R4 (server shipped 2026-09-25; unified runtime per R11).** The shared runtime owns these tables in the client's single datastore: the canonical `src/server.js` entrypoint opens exactly one SQLite connection (`DB_PATH`) per client and serves the combined connector + dashboard surface. The legacy `src/connector.js` split opens its own `DB_PATH` database, dual-writes redirect scans, and keeps a file-backed scan spool; that path is transitional. Each client has its own `DB_PATH` file — never share one datastore between clients.
>
> **Migrations (server shipped 2026-09-25).** v3 adds `setup_codes`; v4 adds `scans.event_id` (unique, the dedupe key); v5 adds `registers`; v6 adds `terminals.api_token_hash` (unique). `terminals.terminal_id` stays the device key; `registers.terminal_id` is null until redemption.

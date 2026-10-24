# Contract — Database schema

**Owner:** Server (`dozo-server-agent`).
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

SQLite, `PRAGMA user_version` migrations v1–v6 (applied) and v7–v12 (planned).

```
# v1–v6 applied
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

# v7–v12 planned; not yet applied
accounts(account_id PK, email NOT NULL UNIQUE, display_name NULL,
         locale NOT NULL DEFAULT 'pl', password_hash NOT NULL,
         password_changed_at NOT NULL, mfa_enrolled INT NOT NULL DEFAULT 0,
         is_operator INT NOT NULL DEFAULT 0, status NOT NULL DEFAULT 'active',
         failed_login_count INT NOT NULL DEFAULT 0, locked_until NULL,
         created_at NOT NULL, updated_at NOT NULL)
sessions(session_id PK, account_id FK NOT NULL, token_hash NOT NULL UNIQUE,
         csrf_hash NULL, auth_level NOT NULL DEFAULT 'password',
         mfa_failed_count INT NOT NULL DEFAULT 0,
         created_at NOT NULL, last_seen_at NOT NULL, idle_expires_at NOT NULL,
         absolute_expires_at NOT NULL, revoked_at NULL, ip NULL, user_agent NULL)
merchant_members(merchant_id FK, account_id FK, role NOT NULL, created_at NOT NULL,
                 invited_by_account_id FK NULL, PK(merchant_id, account_id))
invites(invite_id PK, merchant_id FK NOT NULL, email NOT NULL, role NOT NULL,
        token_hash NOT NULL UNIQUE, invited_by_account_id FK NULL,
        created_at NOT NULL, expires_at NOT NULL, accepted_at NULL,
        accepted_account_id FK NULL, revoked_at NULL)
password_resets(reset_id PK, account_id FK NOT NULL, token_hash NOT NULL UNIQUE,
                created_at NOT NULL, expires_at NOT NULL, used_at NULL,
                requested_ip NULL)
mfa_totp(account_id PK FK, secret_ciphertext NOT NULL, created_at NOT NULL,
         expires_at NOT NULL, confirmed_at NULL, last_used_step INT NULL)
mfa_recovery_codes(code_id PK, account_id FK NOT NULL, code_hash NOT NULL UNIQUE,
                   created_at NOT NULL, used_at NULL)
account_identities(identity_id PK, account_id FK NOT NULL, provider NOT NULL,
                   provider_subject NOT NULL, email_at_link NOT NULL, linked_at NOT NULL,
                   UNIQUE(provider, provider_subject), UNIQUE(account_id, provider))
identity_link_tokens(link_token_hash PK, account_id FK NOT NULL, provider NOT NULL,
                     provider_subject NOT NULL, email_at_link NOT NULL,
                     created_at NOT NULL, expires_at NOT NULL, used_at NULL)
audit_events(audit_id PK, merchant_id FK NULL, actor_type NOT NULL,
             actor_account_id FK NULL, action NOT NULL, target_type NOT NULL,
             target_id NULL, metadata_json NULL, ip NULL, user_agent NULL,
             request_id NULL, created_at NOT NULL)
```

Seed (`SEED_DEMO=true` / `npm run seed`): merchant `demo-merchant` (Place ID `ChIJN1t_tDeuEmsRUsoyG83frY4`), terminal `DEMOTERM01`.

`accounts.email` and `invites.email` are stored normalized lowercase; `accounts.email` is
unique. `invited_by_account_id` is null when the legacy operator token performed the action.
`merchant_members.role` is `owner|read_only`; `accounts.status` is `active|disabled`;
`sessions.auth_level` is `password|mfa|pending_mfa`; `audit_events.actor_type` is
`account|operator|legacy_token` and `audit_events.target_type` is
`account|merchant|invite|terminal|register` (each row pairs it with `target_id`). A
`pending_mfa` row holds the login `challenge_token` (never a cookie), tracks failed verifies in
`sessions.mfa_failed_count`, and becomes a `mfa` row on verify. Token, challenge, and reset
values are stored hashed; `mfa_totp.secret_ciphertext` is encrypted at rest. Indexes:
`sessions(account_id)`, `sessions(idle_expires_at)`, `merchant_members(account_id)`,
`invites(token_hash)`, `invites(expires_at)`, `password_resets(account_id)`,
`mfa_recovery_codes(account_id)`, `identity_link_tokens(account_id)`,
`identity_link_tokens(expires_at)`, `audit_events(merchant_id, created_at)`,
`audit_events(actor_account_id, created_at)`, `audit_events(action, created_at)`. `invites`
also has a partial unique `(merchant_id, email)` where `accepted_at IS NULL AND revoked_at IS
NULL`, so one live invite exists per email per merchant; creating a new invite first marks any
expired one for that email as revoked, so an expiry cannot block a re-invite.

> **Migrations (planned, additive only).** Each group lands in its own migration owned by its
> consumer issue: v7 `accounts` + `sessions` (#111), v8 `merchant_members` (#112),
> v9 `invites` + `password_resets` (#113), v10 `mfa_totp` + `mfa_recovery_codes` (#114),
> v11 `account_identities` + `identity_link_tokens` (#116), v12 `audit_events` (#117). No
> migration drops or rewrites a v1–v6 table; new columns on existing tables are additive only.
> The planned block is a contract shape, not a claim that a deployed database already has it.

> **R4 (server shipped 2026-09-25; unified runtime per R11).** The shared runtime owns these tables in the client's single datastore: the canonical `src/server.js` entrypoint opens exactly one SQLite connection (`DB_PATH`) per client and serves the combined connector + dashboard surface. The legacy `src/connector.js` split opens its own `DB_PATH` database, dual-writes redirect scans, and keeps a file-backed scan spool; that path is transitional. Each client has its own `DB_PATH` file — never share one datastore between clients.
>
> **Migrations (server shipped 2026-09-25).** v3 adds `setup_codes`; v4 adds `scans.event_id` (unique, the dedupe key); v5 adds `registers`; v6 adds `terminals.api_token_hash` (unique). `terminals.terminal_id` stays the device key; `registers.terminal_id` is null until redemption.

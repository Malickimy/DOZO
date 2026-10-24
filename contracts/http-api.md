# Contract — HTTP API

**Owner:** Server (`dozo-server-agent`). Consumed by App and Dashboard.
**Index:** [`../CONTRACTS.md`](../CONTRACTS.md).

Frozen HTTP interface shared by the Android app, redirect server, and merchant dashboard.
Treat as read-only outside the owning workstream. To change it: update this file on the
owning branch, then update every consumer, then bump the index "Last synced" line.

---

Base URL `{api_base_url}` (app default `http://130.162.185.144:3000`). Each route accepts a
specific credential (see **Credential model**). A missing, unknown, revoked, or expired
credential returns `401 {"error":"unauthorized"}`; an authenticated caller that may not touch
the resource — cross-tenant or insufficient role — returns `403 {"error":"forbidden"}`.
On `401` the app discards its stored terminal token and re-pairs via
`POST /api/terminals/redeem`; `403` and `429` are not auth failures and must never trigger a
re-pair. `OPTIONS` preflight is unauthenticated. CORS origins come from `DASHBOARD_ORIGIN`
(default `*`); credentialed browser requests require an exact origin allowlist and `*` is
token-mode only (see **Sessions, cookies, and CSRF**).

> **R4 topology (server shipped 2026-09-25; unified runtime per R11).** The canonical `src/server.js` entrypoint runs one Fastify instance with exactly one SQLite connection (`DB_PATH`) per client, serving the combined connector + dashboard surface on one origin: `GET /health`, `GET /r/:terminal_id`, every `/api/*` route, `POST /scans`, and the built SPA via `registerSpa`. Consumers use one base URL for both directions: the app's `api_base_url` and `redirect_base_url` point at that shared origin. `/api/connector/*` bypasses the operator/per-terminal token and is guarded by `X-Connector-Secret` (so `X-Connector-Secret` covers `POST /scans` and `GET /api/connector/config`); the operator `X-Api-Token` — and, from R12, an account session on browser routes — covers the rest of `/api/*`. The earlier split — `src/connector.js` and `src/dashboard.js` as separate entrypoints/containers with per-container databases — is transitional; see [`env.md`](env.md).

### Credential model

Four credentials. The first one present on the request decides it; a header credential that
is present but invalid is `401` and never falls back to a cookie.

| Credential | Carrier | Valid on |
| --- | --- | --- |
| Connector secret | `X-Connector-Secret` | `POST /scans`, `GET /api/connector/config` |
| Legacy operator token | `X-Api-Token` or `Authorization: Bearer`, matching `API_TOKEN` | the operator surface; transitional (expand/contract) |
| Per-terminal token | `X-Api-Token` or `Authorization: Bearer`, hashed at redeem | `POST /api/heartbeat`, `GET /api/terminals/:terminal_id/config` only |
| Account session | `dozo_session` cookie | browser routes, scoped by merchant membership |

Precedence and route classes:

- Connector routes accept only `X-Connector-Secret`.
- On every other `/api/*` route a token header wins over a session cookie. A cookie is
  considered only when neither token header is present; a supplied-but-invalid header is
  `401`, not a cookie fallback.
- The legacy operator token keeps full operator access during expand/contract. Retiring it
  needs a later contract revision after every consumer uses an account session.
- The per-terminal token is terminal-only. It no longer reaches merchant reads or writes
  (including `PUT /api/merchants/:id/google-place-id`, the old P2 exception), `/api/auth/*`,
  `/api/connector/*`, or membership, invite, and audit routes. A known, active terminal token
  on any other route is `403`; only an unknown or revoked token is `401`. The one exception
  is `POST /api/terminals/redeem`, which keeps returning `401 unauthorized` for a terminal
  token (unchanged; see Provisioning). Connector routes keep their own `401` for a missing or
  wrong `X-Connector-Secret`.
- An account session is never accepted on the two terminal routes the app calls,
  `POST /api/heartbeat` and `GET /api/terminals/:terminal_id/config`, so an expired session
  cannot trigger the app's `401` re-pair path. The app sends no cookies and only
  `X-Api-Token`. The dashboard-only terminal-management routes (`PATCH` and `PUT config`) do
  accept a session because the app never calls them.

| Route class | Routes | Accepted credentials |
| --- | --- | --- |
| Public | `GET /health`, `GET /r/:terminal_id` | none |
| Connector | `POST /scans`, `GET /api/connector/config` | `X-Connector-Secret` |
| Account | `/api/auth/*` (tables below) | per endpoint; pre-session endpoints are unauthenticated and rate-limited |
| Terminal | `POST /api/heartbeat`, `GET /api/terminals/:terminal_id/config` | terminal token or legacy operator token; never a cookie |
| Terminal management | `PATCH /api/terminals/:terminal_id`, `PUT /api/terminals/:terminal_id/config` | legacy operator token, operator account, owner session |
| Merchant read | `GET /api/merchants`, `GET /api/merchants/:id/{terminals,summary,scans,scans/series,registers}`, `GET /api/terminals/offline` | legacy operator token, operator account, owner/read_only session |
| Merchant administration | `PUT /api/merchants/:id/google-place-id`, `POST /api/merchants/:id/registers/:label/setup-code`, membership/invite/audit routes | legacy operator token, operator account, owner session |
| Provisioning | `POST /api/terminals/redeem` | legacy operator token only (requirement unchanged); a terminal token is `401 unauthorized` (unchanged) |

The terminal allowlist comes from the app's real call sites: the stored token is only *valid*
on `POST /api/heartbeat` and `GET /api/terminals/:terminal_id/config`, and `MainActivity.kt`
re-pairs only on `401`. `DozoApi.kt` sets `X-Api-Token` on every request, so the token also
travels with `POST /api/terminals/redeem` and `GET /health`; those routes ignore or reject it
as documented (redeem is operator-only, `/health` is public). No app code calls the merchant
routes or `google-place-id`, so removing P2 and the read routes needs no app follow-up. The
minimal transition is one #115 release: keep exactly these two valid terminal-token routes,
drop every other terminal-token grant, and update the authz sweep and its own-scope
expectations. No app release is needed.

Bootstrap dependency (pre-existing): an unpaired App holds no terminal token and sends the
legacy/placeholder operator credential (`dev-placeholder-token`) on redeem. Rotating
`API_TOKEN` therefore breaks redeem for an unpaired App until it is provisioned with the new
credential first; this revision does not change that.

### Public

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| GET | `/health` | — | `200 {"status":"ok"}` |
| GET | `/r/:terminal_id` | — | `302` `Location: {GOOGLE_REVIEW_BASE}?placeid={google_place_id}` |

`/r/:terminal_id` logs a scan unless debounced (`SHA-256(terminal_id + client IP + User-Agent)`, 120 s window). Unknown terminal → `404 {"error":"unknown_terminal","terminal_id"}`; inactive terminal → `404 {"error":"inactive_terminal","terminal_id"}`; **no** scan row in either case.

**Rate limits (contract; server implementation pending).** `GET /r/:terminal_id` allows 30 requests per minute per client IP and every `/api/*` route allows 60 requests per minute per client IP, except the `/api/auth/*` routes that have dedicated limits below. The limit keys on `request.ip`: `TRUST_PROXY` decides whether `X-Forwarded-For` is honoured (`true` behind a trusted proxy, `false` uses the socket address). Exceeding a limit returns `429 {"error":"rate_limited"}` and writes no scan row. A `429` is a transient backoff only: the client retries after the window and must not re-pair or discard its token, and `429` is never a `401`.

### Authenticated

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/terminals/redeem` | `{code, device_serial, terminal_id?}` | `200 {status:"redeemed", api_token, store}` | `400 invalid_code`, `400 invalid_terminal_id`, `400 invalid_device_serial`, `401 unauthorized`, `404 unknown_code`, `410 expired_code`, `410 redeemed_code` |
| POST | `/api/heartbeat` | `{terminal_id}` | `200 {ok, terminal_id, last_seen}` | `400`, `404 unknown_terminal` |
| GET | `/api/terminals/offline` | — | `200 {threshold_seconds, cutoff, terminals:[{terminal_id, merchant_id, label, active, last_seen}]}` | `401 unauthorized` |
| GET | `/api/terminals/:terminal_id/config` | — | `200 <config>` (an `active:false` terminal still returns `200`; no `inactive_terminal` here) | `401 unauthorized`, `404 unknown_terminal` |
| PUT | `/api/terminals/:terminal_id/config` | `{display_enabled?, display_timeout_seconds?}` | `200 <config>` | `400 invalid_display_enabled`, `400 invalid_display_timeout_seconds`, `401 unauthorized`, `404 unknown_terminal` |
| PATCH | `/api/terminals/:terminal_id` | `{active?, label?}` | `200 <config>` | `400 invalid_active`, `400 invalid_label`, `400 label_in_use`, `401 unauthorized`, `404 unknown_terminal` |
| GET | `/api/merchants` | — | `200 [{merchant_id, google_place_id, created_at, role?}]` (a member session sees only its memberships and gets `role`; an operator account or legacy token sees every merchant without `role`) | `401 unauthorized` |
| GET | `/api/merchants/:id/terminals` | — | `200 [{terminal_id, label, active, last_seen, scan_count, last_scan_at, static_review_url, display_enabled, display_timeout_seconds}]` | `404` |
| GET | `/api/merchants/:id/summary` | query `?since=&until=` (optional) | `200 {merchant_id, total_scans, terminal_count, scans_by_terminal:[{terminal_id, label, scan_count}]}` | `404` |
| GET | `/api/merchants/:id/scans` | query `?terminal_id=&since=&until=&limit=` (default 100, max 1000) | `200 [{id, event_id, terminal_id, scanned_at, user_agent}]` | `404` |
| GET | `/api/merchants/:id/scans/series` | query `?since=&until=&bucket=day` | `200 [{day, count}]` | `404` |
| GET | `/api/merchants/:id/registers` | — | `200 [{label, terminal_id, active, last_seen, static_review_url}]` (`terminal_id` and `static_review_url` null when unoccupied; `active` derived from the bound terminal) | `404` |
| POST | `/api/merchants/:id/registers/:label/setup-code` | — | `201 {code, merchant_id, label, expires_at, expires_in_seconds}` | `400 invalid_label`, `404 unknown_merchant`, `503 code_generation_failed` |
| PUT | `/api/merchants/:id/google-place-id` | `{google_place_id}` | `200 {merchant_id, google_place_id}` | `400`, `404` |
| GET | `/api/connector/config` | — | `200 {generated_at, redirect_base_url, terminals:[{terminal_id, merchant_id, google_place_id, label, active}]}` | `401` |
| POST | `/scans` | `{event_id, terminal_id, merchant_id, scanned_at, user_agent}` | `202 {status:"accepted"}` or `202 {status:"duplicate"}` | `400 malformed`, `401 unauthorized` |

The four legacy pairing endpoints (`register`, `pair-status/:code`, `claim`, `adopt`) were removed on the server in `feat/model-b-retire` (commit `eeac451`). The app-side `AdoptScreen` was retired in PR #62, so no consumer calls the removed `adopt` route.

Every scoped merchant/terminal row above additionally returns `403 {"error":"forbidden"}` when an authenticated caller is cross-tenant or lacks the role. Apart from the `POST /api/terminals/redeem` terminal-token exception, the `401` entries describe missing, invalid, or expired credentials only; `404` stays for an unknown resource inside an authorized scope.

Notes:

- **R1 (server shipped 2026-09-24; retire shipped 2026-09-25).** `POST /api/merchants/:id/registers/:label/setup-code` and `POST /api/terminals/redeem` are the model-B pairing flow. The legacy `register`, `pair-status`, `claim`, and `adopt` routes were removed in `eeac451`; the app-side `adopt` removal landed in PR #62. Redeeming a code for an occupied register deactivates the prior terminal.
- **R2 (server shipped 2026-09-25).** `POST /scans` is the idempotent connector ingest, served by the shared runtime on the same origin. It authenticates with `X-Connector-Secret`, is idempotent on `event_id`, returns `202` for both a new and a duplicate event, and never returns `404` (an unknown terminal is logged and dropped). The split connector's spool forwarding to `/scans` is a legacy/transitional path.
- **R3 (server shipped 2026-09-25).** `PATCH /api/terminals/:terminal_id` owns `active` and `label`; `PUT /api/terminals/:terminal_id/config` keeps `display_enabled` and `display_timeout_seconds`. `config`, `store`, and the two dashboard list rows (`dashboard.md`) carry `static_review_url`, computed on read. The app `static_review_url` consumer landed in PR #62; the dashboard consumer remains pending.
- **R4 (server shipped 2026-09-25; unified runtime per R11).** One backend package, one shared runtime per client: the canonical `src/server.js` runs one Fastify instance with exactly one SQLite connection (`DB_PATH`), serving the combined connector + dashboard surface — `/health`, `/r/:terminal_id`, every `/api/*` route, `POST /scans`, and the built SPA. The earlier split — `src/connector.js` (public routes, file-backed spool, last-known config cache) and `src/dashboard.js` (dashboard API, SPA, its own database) — is transitional. App defaults landed in PR #62; the SPA is served by the shared runtime.
- **R5 (server shipped 2026-09-25).** The series endpoint groups `scanned_at` by the Europe/Warsaw day and returns `[{day, count}]`; `scanned_at` stays an ISO UTC timestamp. The dashboard renders `day` verbatim and renders other timestamps in browser-local time.
- **R6 (server shipped 2026-09-25; terminal-token grant superseded by R12).** `api_token` is per-terminal: issued only at `POST /api/terminals/redeem`, hashed at rest (`terminals.api_token_hash`, migration v6), and validated on heartbeat / config only. The old `registers` grant is removed by #115; R12 keeps exactly `POST /api/heartbeat` and `GET /api/terminals/:terminal_id/config`. A mismatch returns `401` and the app re-pairs. The operator token is unchanged. The app-side re-pair landed in PR #62.
- **R7 (server shipped 2026-09-25).** A `registers` table lets a register exist unoccupied (`terminal_id` null). `GET /registers` returns every register, `setup-code` finds or creates it, and `redeem` binds the terminal and deactivates the prior one. `registers.label` is the label source of truth; `registers.active` is derived from the bound terminal.
- **Hardening (server sprint 7; contract revised 2026-09-30, server implementation pending).** Revocation on deactivate: setting a terminal inactive — operator `PATCH /api/terminals/:terminal_id` with `{"active":false}`, or the device-swap deactivation during `redeem` — clears `terminals.api_token_hash` in the same transaction, so a later heartbeat/config call with the revoked token returns `401 unauthorized` and the app re-pairs. Issuance and rotation happen only at `POST /api/terminals/redeem`; the retired `claim` and `pair-status` routes (`eeac451`) never issue a token.
- **Labels (R3/R7, decided 2026-09-25).** `registers.label` is the source of truth. `PATCH /api/terminals/:terminal_id` with a `label` syncs the bound register row and the terminal cache in one transaction; a collision with another register for the same merchant returns `400 label_in_use`, and a terminal with no register row gains one.

### Sessions, cookies, and CSRF

- **Cookies.** `dozo_session` is an opaque 256-bit random token, stored hashed
  (`sessions.token_hash`), `HttpOnly; SameSite=Lax; Path=/`, host-only (no `Domain`), and
  `Secure` whenever the API origin is HTTPS (`http://localhost` dev is the only exception).
  `dozo_csrf` is a second random value, deliberately readable by the SPA, with the same
  `SameSite`/`Path`/expiry and also `Secure` on HTTPS; `csrf_token` in the API responses
  mirrors this cookie. `SameSite=Lax` assumes the dashboard and API share a site; a
  cross-site dashboard needs `SameSite=None; Secure` and an explicit revision. Cookie
  `Max-Age` matches the absolute session expiry, and both cookies are cleared on logout.
- **Expiry.** Absolute session lifetime is 12 hours; idle lifetime is 30 minutes, extended at
  most once per 5 minutes on an authenticated request so session writes cannot crowd terminal
  traffic. A session past either limit is invalid: `401 unauthorized`. Expired and revoked
  rows are pruned out of band, never on the request path.
- **Rotation.** A fresh session token and CSRF value are issued on login, on MFA elevation,
  and on password change. The previous token is revoked in the same transaction.
- **Revocation.** Logout, password change, password reset, account disable, self-service MFA
  disable, and operator MFA reset revoke the affected sessions immediately. Removing a
  membership stops that session's access to the merchant on the next request but does not
  revoke the session.
- **CSRF.** A cookie-authenticated `POST`, `PUT`, `PATCH`, or `DELETE` must send
  `X-CSRF-Token` equal to the `dozo_csrf` cookie, or return
  `403 {"error":"csrf_invalid"}`. Token-header requests never need CSRF. `logout` is exempt
  and idempotent. The pre-session endpoints (`login`, `password-reset`,
  `password-reset/confirm`, `invites/accept`, `google`, `mfa/verify`) are exempt from the
  header but accept only an `Origin` equal to the API's own origin or an exact
  `DASHBOARD_ORIGIN` entry; a foreign origin is `403 {"error":"origin_invalid"}`.
- **CORS.** Credentialed requests need an exact `DASHBOARD_ORIGIN` allowlist and
  `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and the request origin echoed
  back. `*` is never combined with credentials: it stays valid for token mode only. With
  `DASHBOARD_ORIGIN=*`, a credentialed (`Origin`-bearing, cookie) request is rejected with
  `403 {"error":"origin_invalid"}` and no `Access-Control-Allow-Credentials` header is sent;
  same-origin requests are not CORS requests and need no allowlist entry. Allowed headers add
  `X-CSRF-Token`; methods add `DELETE`.
- **Login is invite-only.** There is no public self-registration endpoint; `POST
  /api/auth/register` does not exist. The first operator account is created out of band by a
  controlled admin bootstrap (a server command or seeded migration), never by a public route.
- **Configuration from #110 (`env.md`).** The API needs `SESSION_ABSOLUTE_TTL_SECONDS`,
  `SESSION_IDLE_TTL_SECONDS`, `SESSION_COOKIE_SECURE`, `INVITE_TTL_SECONDS`,
  `RESET_TTL_SECONDS`, `MFA_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `PUBLIC_BASE_URL` (invite
  and reset links), and `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`;
  `DASHBOARD_ORIGIN` must carry the exact browser origins. Names only — values and defaults
  belong to `env.md`.

### Account authentication

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | `{email, password}` | `200 authenticated` or `200 mfa_required` | `400 invalid_email`, `401 unauthorized`, `429 rate_limited` |
| POST | `/api/auth/mfa/verify` | `{challenge_token, code}` | `200 authenticated` | `400 invalid_code`, `401 unauthorized`, `429 rate_limited` |
| POST | `/api/auth/password-reset` | `{email}` | `202 {status:"accepted"}` (same answer for known and unknown email) | `400 invalid_email`, `429 rate_limited` |
| POST | `/api/auth/password-reset/confirm` | `{token, password}` | `200 {status:"reset"}` | `400 invalid_password`, `404 invalid_token`, `409 token_used`, `410 expired_token`, `422 weak_password` |
| POST | `/api/auth/invites/accept` | `{token, password, display_name?, locale?}` | `201 authenticated` | `400 invalid_password`, `404 unknown_invite`, `409 email_in_use`, `409 invite_already_accepted`, `410 expired_invite`, `422 weak_password` |
| POST | `/api/auth/google` | `{id_token}` | `200 authenticated`, `200 mfa_required`, or `200 link_required` | `400 invalid_id_token`, `404 unknown_account`, `429 rate_limited` |

`POST /api/auth/login` returns `401` identically for an unknown email and a wrong password,
and `mfa_required` sets no session cookie: it carries a single-use `challenge_token`
(5-minute TTL, stored as a `sessions.auth_level='pending_mfa'` row and never sent as a
cookie); `mfa/verify` promotes it to a full session and rotates the token, and five failed
verifies invalidate the challenge. The counter is `sessions.mfa_failed_count` on the
`pending_mfa` row, incremented in the same transaction, so it survives a restart; a successful
verify resets it. `code` accepts a 6-digit TOTP or a single-use recovery code. A verified Google
identity is never linked automatically. `link_required` means the verified Google email
matches an existing account, and linking must be confirmed by an authenticated session.
A disabled account authenticates exactly like a wrong password (`401`). Passwords are 8–128
characters; a missing/non-string value is `400 invalid_password` and a policy failure is
`422 weak_password`. `locale` is `pl` or `en`; anything else is `400 invalid_locale`. Elsewhere
`400` means malformed or missing fields, `404` an unknown resource, `409` a state conflict,
`410` an expired one-time token, and `422` a parsed value that is unacceptable; none of them is
an auth failure, and only `401` triggers re-pair.

### Account session, profile, and MFA

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/logout` | — | `204` (clears cookies; idempotent) | — |
| GET | `/api/auth/session` | — | `200 {mode, account, memberships, csrf_token, session}` | `401 unauthorized` |
| PATCH | `/api/auth/account` | `{display_name?, locale?}` | `200 account` | `400 invalid_display_name`, `400 invalid_locale`, `401 unauthorized` |
| POST | `/api/auth/password` | `{current_password, new_password}` | `204` (revokes other sessions, rotates the current one and sets fresh cookies) | `400 invalid_password`, `401 unauthorized`, `422 weak_password` |
| POST | `/api/auth/mfa/totp/enrol` | `{current_password}` | `201 {secret, otpauth_uri, expires_at}` | `401 unauthorized`, `409 mfa_already_enrolled` |
| POST | `/api/auth/mfa/totp/confirm` | `{code}` | `200 {status:"enabled", recovery_codes}` (rotates the session to `auth_level=mfa`) | `400 invalid_code`, `401 unauthorized`, `409 mfa_not_pending`, `410 expired_enrolment` |
| POST | `/api/auth/mfa/recovery-codes/regenerate` | `{current_password, code}` | `200 {recovery_codes}` (the previous codes stop working) | `400 invalid_code`, `401 unauthorized` |
| POST | `/api/auth/mfa/disable` | `{current_password, code}` | `204` (disables MFA, revokes other sessions, rotates the current one and sets fresh cookies) | `400 invalid_code`, `401 unauthorized`, `409 mfa_not_enrolled` |
| POST | `/api/auth/google/link` | `{link_token}` | `201 {status:"linked", provider, email_at_link}` | `401 unauthorized`, `404 unknown_link_token`, `409 already_linked`, `409 link_token_used`, `410 expired_link_token` |

`GET /api/auth/session` also accepts the legacy operator token: it returns
`mode:"legacy_operator"`, `account:null`, `memberships:[]`, `csrf_token:null`, and
`session:null`; a session returns `mode:"session"` and `memberships` comes from
`merchant_members`. The TOTP secret is shown once at enrolment; `recovery_codes` are ten
single-use codes shown once and never returned again. `POST /api/auth/mfa/disable` accepts
the current password plus a valid TOTP or recovery code, clears `accounts.mfa_enrolled`,
deletes the TOTP secret and recovery codes, revokes every other session, rotates the current
one, and writes `auth.mfa_disabled`. Operator-initiated MFA reset stays an out-of-band support
action with no public route. `POST /api/auth/google/link` requires the session cookie plus
CSRF, which is the explicit link proof; a used link token returns `409 link_token_used` and an
expired one `410 expired_link_token`.

### Merchant membership, invites, and audit

| Method | Path | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/merchants/:id/members` | — | `200 [{account_id, email, display_name, role, created_at}]` | `401 unauthorized`, `403 forbidden`, `404 unknown_merchant` |
| POST | `/api/merchants/:id/members` | `{email, role}` | `201 {account_id, email, role, created_at}` | `400 invalid_role`, `401 unauthorized`, `403 forbidden`, `404 unknown_account`, `404 unknown_merchant`, `409 already_member` |
| PATCH | `/api/merchants/:id/members/:account_id` | `{role}` | `200 {account_id, role}` | `400 invalid_role`, `401 unauthorized`, `403 forbidden`, `404 unknown_member`, `409 last_owner` |
| DELETE | `/api/merchants/:id/members/:account_id` | — | `204` | `401 unauthorized`, `403 forbidden`, `404 unknown_member`, `409 last_owner` |
| GET | `/api/merchants/:id/invites` | — | `200 [{invite_id, email, role, created_at, expires_at, invited_by_account_id}]` (live only: not accepted, not revoked, not expired) | `401 unauthorized`, `403 forbidden`, `404 unknown_merchant` |
| POST | `/api/merchants/:id/invites` | `{email, role}` | `201 {invite_id, email, role, expires_at}` (mail sent) | `400 invalid_email`, `400 invalid_role`, `401 unauthorized`, `403 forbidden`, `409 account_exists` (use `POST /members`), `409 already_member`, `409 invite_exists`, `503 mail_unavailable` |
| DELETE | `/api/merchants/:id/invites/:invite_id` | — | `204` | `401 unauthorized`, `403 forbidden`, `404 unknown_invite`, `409 invite_already_accepted` |
| GET | `/api/merchants/:id/audit` | query `?since=&until=&action=&actor_account_id=&limit=&cursor=` (default 100, max 500) | `200 {events:[audit], next_cursor}` (`next_cursor` null at the end) | `400 invalid_cursor`, `400 invalid_limit`, `401 unauthorized`, `403 forbidden`, `404 unknown_merchant` |

`role` is `owner` or `read_only`; any other value is `400 invalid_role`. A merchant must always
keep at least one `owner`: demoting or removing the last owner returns `409 last_owner`.
`POST /members` adds an existing account; new people arrive through an invite, and a pending
invite is unique per `(merchant_id, email)`. Accepting an invite creates the account and
membership, marks the invite accepted, and starts the session in one transaction. Invite creation returns `503 mail_unavailable`
when the mail transport is not configured, but `POST /api/auth/password-reset` still returns
`202` for every email and only logs the delivery failure, so it cannot be used to enumerate
accounts. A new password-reset request invalidates that account's earlier unused reset tokens.
Default one-time token lifetimes are 7 days for an invite, 60 minutes for a password reset,
10 minutes for a TOTP enrolment, 10 minutes for a Google link token, and 5 minutes for an MFA
challenge.

### Auth rate limits and lockout

These replace the generic 60/minute `/api/*` bucket on the listed routes (the generic limit
still applies elsewhere). `429` is always a transient backoff with `Retry-After`; it is never
an auth failure, never clears a token, and never re-pairs.

| Route | Limit | Key |
| --- | --- | --- |
| `POST /api/auth/login` | 10 per 15 minutes | client IP + normalized email |
| `POST /api/auth/mfa/verify` | 10 per 15 minutes | client IP + challenge |
| `POST /api/auth/password-reset` | 5 per hour per IP (`429`); 3 per hour per email silently suppresses the mail but still returns `202` | IP / email |
| `POST /api/auth/invites/accept` | 10 per hour | client IP |
| `POST /api/auth/password-reset/confirm` | 10 per hour | client IP |
| `POST /api/auth/google` | 10 per minute | client IP |
| `POST /api/auth/password`, MFA enrol/confirm/regenerate/disable, Google link | 10 per hour | session |

Ten consecutive failed logins lock the account for 15 minutes. While locked, a correct
password still returns `429 {"error":"rate_limited"}` with `Retry-After`; the counter resets
on a successful login. An unknown email only consumes the per-IP limit and keeps returning
`401`. A lockout never revokes a session and never touches a terminal token.

### Roles and permissions

`owner` and `read_only` are per-merchant memberships, not global flags. An **operator
account** is a DOZO staff account (`accounts.is_operator=1`) with access to every merchant
for support; its actions are attributed in the audit log and it is provisioned out of band,
never through an invite. The **legacy operator token** is the shared `API_TOKEN` credential
with no account attribution.

| Route family | legacy operator token | operator account | owner | read_only | terminal token |
| --- | --- | --- | --- | --- | --- |
| Public | — | — | — | — | — |
| Connector | — | — | — | — | — |
| Account (`/api/auth/*`) | session info only | own account | own account | own account | — |
| Terminal (`heartbeat`, get config) | full | — (session → `401`) | — | — | own terminal |
| Terminal management | full | full | own merchant, write | — | — |
| Merchant read | all merchants | all merchants | own merchant | own merchant, read | — |
| Merchant write | all merchants | all merchants | own merchant | — | — |
| Membership, invites, audit | all merchants | all merchants | own merchant | — | — |
| `GET /api/terminals/offline` | all merchants | all merchants | own merchant | own merchant, read | — |
| `POST /api/terminals/redeem` | full | — | — | — | — |

`—` means the request is rejected: `401` when the credential class is not accepted on that
route at all (for example any account session, even a valid one, on a terminal route) or when
no credential is present, and `403` for an accepted credential without the role. `read_only` can never
mutate a merchant, mint a setup code, change a Place ID, or manage members and invites.
Session access to merchant data derives only from `merchant_members`; a session never gets a
rise from a URL parameter. For a session caller, `GET /api/terminals/offline` is filtered to
the caller's merchants; operator accounts and the legacy token see the whole fleet. A valid
terminal token used for a different terminal's resource is `403`, not `401`: the credential
is sound, so the app must not clear it or re-pair.

### Audit events

Every audited action writes its `audit_events` row(s) in the same transaction as the change;
a `+` entry below writes one row per listed target. `actor_type` is `account`, `operator`, or
`legacy_token`: the acting member account is `account`, an account with `is_operator=1` is
always recorded as `operator`, and the shared `API_TOKEN` is `legacy_token` with
`actor_account_id` null. `target_type` is one of `account|merchant|invite|terminal|register`
and `target_id` pairs it with that row's id. Merchant-member reads are not audited. An
operator account reading a merchant it is not a member of emits `support.merchant_access`
best-effort after the response, and a failure there never changes the response.

| Action | Target |
| --- | --- |
| `auth.login`, `auth.login_failed`, `auth.logout`, `auth.mfa_challenge_failed` | `account` |
| `auth.mfa_enrolled`, `auth.mfa_recovery_regenerated`, `auth.mfa_disabled`, `auth.google_linked` | `account` |
| `auth.password_changed`, `auth.password_reset_completed` | `account` |
| `auth.invite_accepted` | `account` + `merchant` |
| `membership.added`, `membership.role_changed`, `membership.removed` | `account` + `merchant` |
| `invite.created`, `invite.revoked` | `invite` + `merchant` |
| `merchant.google_place_id_changed` | `merchant` |
| `terminal.setup_code_issued` | `register` |
| `terminal.redeemed` | `terminal` |
| `terminal.updated`, `terminal.config_changed`, `terminal.revoked` | `terminal` |
| `support.merchant_access` | `merchant` |

`metadata` may hold before/after values but never passwords, hashes, session/challenge
tokens, TOTP secrets, or recovery codes. `GET /api/merchants/:id/audit` is newest first and
is visible to `owner` and operator accounts only.

### Revision / consumer impact

**R12 (drafted 2026-10-24; implementation pending #111–#117; not owner-approved).** Adds
accounts, browser sessions, merchant memberships, invitations, password reset, TOTP MFA,
optional Google identity linking, and attributed audit without changing the v1–v6 tables.
Legacy `X-Api-Token` mode remains (expand/contract) and the per-terminal token is narrowed
to `POST /api/heartbeat` and `GET /api/terminals/:terminal_id/config`; a valid but
cross-terminal token becomes `403` (it was `401`), except on `POST /api/terminals/redeem`
where a terminal token keeps its existing `401` until a later revision. Session readers get
terminal display settings from the extended `GET /api/merchants/:id/terminals` row because the
terminal routes stay cookie-free.

Consumer blocking edges: **#110** (`env.md`: session/cookie/mail/encryption settings), **#111**
sessions, **#112** memberships, **#113** invites/reset, **#114** MFA, **#115** authorization
on all routes plus the terminal narrowing, **#116** Google link, **#117** audit, **#118–#122**
Dashboard login/invite/reset/membership/role-nav/MFA/Google, **#123** integrated QA. If #111
lands before #112, `memberships` is `[]` and session merchant access stays closed; the legacy
token covers the gap until v8. The app
needs no change; the legacy operator token must stay until a later App provisioning credential
replaces it for `POST /api/terminals/redeem`. The dashboard moves to credentialed requests
(`credentials:"include"` plus `X-CSRF-Token`), must treat `403` as a role/cross-tenant error
rather than a re-auth prompt, and must replace its register placeholder with invite acceptance,
because there is no public self-registration route.

Consumers **#110–#123 must not implement against this revision until it is owner-approved and
the PR that merges it lands**; the merged PR/commit is the recorded approval. Until then this
section is a draft interface, not an executable dependency.

Owner approval is recorded on the contract-change issue by the PR that merges this revision.
The `CONTRACTS.md` "Last synced" line and R12 ledger entry are root-owned (`contract` agent)
and are not edited here.

Shape aliases:

```
config  = {terminal_id, merchant_id, google_place_id, label, active,
           display_enabled, display_timeout_seconds, redirect_base_url,
           static_review_url}
store   = {terminal_id, merchant_id, google_place_id, label, redirect_url,
           static_review_url}
account       = {account_id, email, display_name, locale, mfa_enrolled, is_operator}
membership    = {merchant_id, role}                 # role = owner | read_only
session       = {absolute_expires_at, idle_expires_at}
authenticated = {status:"authenticated", account, memberships, csrf_token, session}
mfa_required  = {status:"mfa_required", challenge_token, methods, absolute_expires_at}
                # methods = ["totp", "recovery_code"]
link_required = {status:"link_required", link_token, email}
audit         = {audit_id, action, actor:{type, account_id, label}, target:{type, id},
                 metadata, created_at}
```

`session` mirrors `sessions.absolute_expires_at` and `sessions.idle_expires_at`;
`mfa_required.absolute_expires_at` is the pending challenge row's absolute expiry. In
`audit`, `actor.type` and `target.type` serialize `actor_type` and `target_type`, `target.id`
serializes `target_id`, and `actor.label` is derived, not stored: the account email or display
name for `account`/`operator`, and the literal `legacy_token` for `legacy_token`.

`redirect_base_url` is the redirect domain (no `/r/:terminal_id`); `store.redirect_url` is the full `{domain}/r/{terminal_id}`. `static_review_url` is `{GOOGLE_REVIEW_BASE}?placeid={google_place_id}`, computed on read from the current `google_place_id` (it tracks a `PUT /api/merchants/:id/google-place-id` change; "static" means a direct Google URL, not a frozen one). It appears on `config`, `store`, `GET /api/merchants/:id/terminals`, and `GET /api/merchants/:id/registers`. The shared runtime resolves `google_place_id` directly from the client's SQLite datastore on read; `GET /api/connector/config` does not return `static_review_url`.

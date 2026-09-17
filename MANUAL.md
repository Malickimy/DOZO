# DOZO — Hands-On Manual

A practical guide to everything built so far: what each piece does, how to run it, and copy-paste flows to see the whole system work end to end.

---

## 0. The pieces

| Piece | Location | What it is |
| --- | --- | --- |
| Android app | `/Users/malicky/l/DOZO/DOZO-App` | Terminal app (`com.example.dozo`): shows the review QR after an approved sale, returns a result code. |
| Mock payment app | `/Users/malicky/l/DOZO/DOZO-App` (`:mockpay`) | Fake Polcard/Fiserv app to drive the terminal via `startActivityForResult`. |
| Redirect server | `/Users/malicky/l/DOZO/DOZO-Server` | Node/Fastify/SQLite: logs scans, 302s to Google, pairing, config, dashboard API. |
| Merchant dashboard | `/Users/malicky/l/DOZO/DOZO-Dashboard` | Vite + React + TS web portal: pair terminals, set Place ID, view scan counts. |
| VPS | `ubuntu@130.162.185.144:3000` | Deployed redirect server. API token `dev-placeholder-token`. |

Mental model:

```
Payment app ──startActivityForResult──▶ DOZO app ──QR──▶ Customer scans
                                              │                    │
                                              │                    ▼
                                              │            Redirect server  /r/{terminal_id}
                                              │                    │  logs scan + 302
                                              │                    ▼
                                              │            Google review form
                                              ▼
                                     result code 1/2/3 back to payment app

Merchant dashboard ──token auth──▶ Redirect server API ──▶ SQLite (merchants/terminals/scans)
```

---

## 1. Prerequisites

- JDK 17, Android SDK, an AVD named `Ingenico_AXIUM_DX8000` (API 29), serial `emulator-5554`.
- `adb`, and `zbarimg` (for QR verification).
- Node.js 20+ and npm (server + dashboard).
- Env used by the scripts: `ANDROID_HOME`, `ADB`, `SERIAL` (default `emulator-5554`), `PROJECT_DIR`, `SERVER_URL`, `API_TOKEN`.

Boot the emulator:

```bash
dozo_boot                 # headless, idempotent
adb devices -l              # expect emulator-5554
```

---

## 2. Redirect server

### Run locally

```bash
cd /Users/malicky/l/DOZO/DOZO-Server
npm install
SEED_DEMO=true npm start          # http://localhost:3000, seeds demo data
npm test                          # 43 tests
```

Seed on demand (existing DB):

```bash
npm run seed
```

### Deployed

```bash
curl -sS http://130.162.185.144:3000/health
# {"status":"ok"}
```

### Endpoints

Public (no token):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness. |
| GET | `/r/:terminal_id` | Log a scan (120s debounce) and 302 to the merchant's Google review form. |

Authenticated (`X-Api-Token: dev-placeholder-token` or `Authorization: Bearer …`):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/terminals/register` | Start pairing; body `{device_serial, merchant_id, terminal_id?}` → 8-char code. |
| GET | `/api/terminals/pair-status/:code` | 202 pending / 200 claimed (token + store) / 410 expired. |
| POST | `/api/terminals/claim` | Claim a code; body `{code, label?}`. Dashboard stand-in. |
| POST | `/api/heartbeat` | `{terminal_id}` → updates `last_seen`. |
| GET | `/api/terminals/offline` | Terminals with no ping for 24h. |
| GET | `/api/merchants` | List merchants. |
| GET | `/api/merchants/:id/terminals` | Terminals with `scan_count`, `last_seen`, `last_scan_at`. |
| GET | `/api/merchants/:id/summary` | Totals + per-terminal scan counts. |
| GET | `/api/merchants/:id/scans` | Scan log (`?terminal_id=&since=&until=&limit=`, max 1000). |
| PUT | `/api/merchants/:id/google-place-id` | `{google_place_id}`. |
| GET | `/api/merchants/:id/registers` | Existing register labels: `[{label, terminal_id, active, last_seen}]`. |
| POST | `/api/terminals/adopt` | Reassign a new device to a register: `{terminal_id, merchant_id, label}`. |
| GET | `/api/terminals/:id/config` | Config sync payload (timeout, display, redirect base). |
| PUT | `/api/terminals/:id/config` | `{display_enabled?, display_timeout_seconds?}` (clamped 5–30). |

CORS is enabled for the dashboard; `OPTIONS` preflight is unauthenticated.

### Deploy to the VPS

```bash
cd /Users/malicky/l/DOZO/DOZO-Server
./scripts/deploy.sh --dry-run      # preview
./scripts/deploy.sh                # rsync + docker compose up -d --build
```

> **Caveat:** the VPS is ~1 GB RAM. `deploy.sh` re-runs `npm ci`, which compiles `better-sqlite3` from source and thrashes the box (load ~24, SSH stalls). Prefer adding a swapfile, prebuilding/pushing the image, or the copy-and-commit method:

```bash
rsync -az --exclude node_modules --exclude data --exclude .git --exclude .env \
  /Users/malicky/l/DOZO/DOZO-Server/ ubuntu@130.162.185.144:~/dozo-server/
ssh ubuntu@130.162.185.144 '
  cd ~/dozo-server
  docker compose cp src/. dozo-server:/app/src
  docker commit $(docker compose ps -q dozo-server) dozo-server:local
  docker compose up -d --force-recreate'
```

### Smoke test

```bash
cd /Users/malicky/l/DOZO/DOZO-Server
./scripts/smoke.sh                                   # defaults to the VPS
BASE_URL=http://127.0.0.1:3000 ./scripts/smoke.sh     # local
# from the app repo:
scripts/dozo_server_check
```

---

## 3. Android app

### Build & install

```bash
cd /Users/malicky/l/DOZO/DOZO-App
./scripts/dozo_clean_deploy        # clean build + adb install -r
# or
./gradlew :app:assembleDebug && adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

### Screens

| Screen | When | Notes |
| --- | --- | --- |
| Idle | Manual launch / no transaction | "Waiting for transaction…". Long-press the **top-left corner ~1.5s** to open settings. |
| QR display | `status=APPROVED` | Review QR + countdown (5–30s, default 15) + Done. |
| Outcome | canceled/refused | Debug builds show it for 10s; release exits silently. |
| PIN | after long-press | Default PIN `0000`. |
| Settings | after PIN | Server URLs, merchant/terminal ID, token, toggles, timeout, pairing, adopt, sync/heartbeat, change PIN, unpair. |
| Pairing | "Generate pairing code" | Shows 8-char code, polls every 2s up to 5 min. |
| Adopt | "Adopt existing register" | Pick an existing register label and reassign this device. |

### Intent contract

Extras: `status` (`APPROVED`/`CANCELED`/`REFUSED`), `merchant_id`, `terminal_id`, `transaction_id`, `amount_cents` (int), `review_url` (approved fallback), `reason` (canceled/refused).

QR payload rule: `terminal_id` present → `{redirect_base_url}/r/{terminal_id}`; else `review_url`; else a default. The QR never encodes the raw Google URL.

Result codes returned to the caller: **1 approved, 2 canceled, 3 refused** (unactivated/silent exits return 2).

### Trigger & verify a transaction

```bash
# Approved (Fiserv action) with a terminal id -> QR points at the redirect server
scripts/dozo_trigger_intent --approved --terminal DEMOTERM01 --merchant demo-merchant --txn TXN-DEMO --amount 2499

# Verify the on-screen QR decodes to the expected payload
scripts/dozo_verify_qr --expect http://130.162.185.144:3000/r/DEMOTERM01

# Canceled / refused
scripts/dozo_trigger_intent --canceled --txn TXN-C --amount 500 --reason "Canceled by user"
scripts/dozo_trigger_intent --refused  --poc --txn TXN-R --amount 750 --reason "Insufficient funds"
```

`dozo_trigger_intent` also sends `status`/`merchant_id`/`terminal_id`. Note `--url` is only a fallback when no terminal id is sent. Use `--poc`/`--ingenico` for the Ingenico actions.

### Mock payment app (startActivityForResult)

```bash
scripts/mockpay_deploy        # builds + installs :mockpay
adb shell am start -n com.example.dozo.mockpay/.MockPayActivity
```

Tap **Approve / Cancel / Refuse**; DOZO is launched and returns a result code, shown on screen and logged:

```bash
adb logcat -d -s MockPay
# ... resultCode=1 label=approved
```

### Pair a terminal

1. Launch the app manually, long-press top-left (~1.5s), enter PIN `0000`.
2. Settings → **Generate pairing code**. The app calls the server and shows an 8-char code, polling every 2s.
3. Claim it (dashboard stand-in):
   ```bash
   curl -sS -X POST http://130.162.185.144:3000/api/terminals/claim \
     -H "X-Api-Token: dev-placeholder-token" -H "Content-Type: application/json" \
     -d '{"code":"<CODE>","label":"Front register"}'
   ```
4. The app sees `claimed` and persists token, terminal ID, redirect base, `activated=true`.

Check what the app stored:

```bash
adb -s emulator-5554 shell run-as com.example.dozo cat shared_prefs/dozo_prefs.xml
```

### Adopt an existing register

When a bank swaps a DX8000, the new unit has a new ID. In Settings → **Adopt existing register**, pick a label from the server list and tap **Adopt**; the server reassigns the new terminal ID to that register and returns the config, which the app applies.

### Config sync & heartbeat

- Automatic: heartbeat every 12h, config sync every 24h (WorkManager).
- Manual (for testing): Settings → **Sync now** / **Send heartbeat now**.
- Try it: change the server value, then sync.
  ```bash
  curl -sS -X PUT http://130.162.185.144:3000/api/terminals/<TERMINAL_ID>/config \
    -H "X-Api-Token: dev-placeholder-token" -H "Content-Type: application/json" \
    -d '{"display_timeout_seconds":20}'
  ```
  Tap **Sync now** and confirm `display_timeout_seconds` in `dozo_prefs.xml`.

### Configuration keys (`dozo_prefs`)

| Key | Default | Meaning |
| --- | --- | --- |
| `api_base_url` | `http://130.162.185.144:3000` | Server API base. |
| `redirect_base_url` | `http://130.162.185.144:3000` | Base for the QR redirect link. |
| `api_token` | `dev-placeholder-token` | API token. |
| `merchant_id` | `demo-merchant` | Merchant (will come from the dashboard later). |
| `terminal_id` | derived from `ANDROID_ID` | This device's terminal id. |
| `display_timeout_seconds` | `15` (clamped 5–30) | QR countdown. |
| `display_enabled` | `true` | Show the review QR. |
| `activated` | `true` | Accept transaction handoffs. |
| `pin` | `0000` | Settings PIN. |
| `pairing_code` | — | Last pairing code (for config re-sync). |

### Release build & size budget

```bash
scripts/check_apk_size        # builds :app:assembleRelease, enforces APK_SIZE_BUDGET_MB (default 5)
# Size: 2.20 MB  Budget: 5 MB  check_apk_size: OK
```

The release APK is currently unsigned — add a keystore before real distribution.

---

## 4. Merchant dashboard

```bash
cd /Users/malicky/l/DOZO/DOZO-Dashboard
npm install
npm run dev        # http://localhost:5173
npm run build
npm test
```

On the login/settings screen enter:
- API base: `http://130.162.185.144:3000`
- API token: `dev-placeholder-token`

Then: **Test connection** → pick merchant `demo-merchant` → see terminals, scan counts, `last_seen`; claim a pairing code; assign a Google Place ID; browse scans; view offline terminals.

---

## 5. Copy-paste end-to-end demos

**A. Approved sale → QR → scan → Google**

```bash
dozo_boot
scripts/dozo_clean_deploy
adb shell am force-stop com.example.dozo
scripts/dozo_trigger_intent --approved --terminal DEMOTERM01 --txn TXN-E2E --amount 2499
sleep 5
scripts/dozo_verify_qr --expect http://130.162.185.144:3000/r/DEMOTERM01   # PASS
curl -sS -i -A "DemoPhone/1.0" http://130.162.185.144:3000/r/DEMOTERM01 | head -3   # 302 -> Google
```

**B. Mock payment result codes**

```bash
scripts/mockpay_deploy
adb shell am start -n com.example.dozo.mockpay/.MockPayActivity
# tap Approve / Cancel / Refuse, then:
adb logcat -d -s MockPay | tail
```

**C. Pair a fresh terminal** — see §3 "Pair a terminal".

**D. Adopt a register** — see §3 "Adopt an existing register".

**E. Config sync** — see §3 "Config sync & heartbeat".

**F. Dashboard** — start `npm run dev`, open http://localhost:5173, connect, and watch scan counts change as you curl `/r/DEMOTERM01`.

---

## 6. Helper scripts

| Script | What it does |
| --- | --- |
| `dozo_boot` | Boot the AVD headlessly and wait for boot. |
| `dozo_clean_deploy` | Clean-build and install the app. |
| `dozo_trigger_intent` | Fire a synthetic payment-result intent (`--approved/--canceled/--refused`, `--poc`, `--terminal`, `--merchant`, …). |
| `dozo_verify_qr` | Screencap + zbarimg; assert the QR payload. |
| `dozo_logcat_tail` | Recent error-level logcat, package-filtered. |
| `dozo_server_check` | Host-side `/health` (+ optional register) check against the VPS. |
| `mockpay_deploy` | Build and install the mock payment app. |
| `check_apk_size` | Build release and enforce the APK size budget. |
| server `scripts/deploy.sh` | Deploy the server to the VPS. |
| server `scripts/smoke.sh` | Health + register + pair-status smoke test. |
| server `scripts/seed.js` | Seed `demo-merchant` / `DEMOTERM01`. |

---

## 7. Troubleshooting

- **`java.net.SocketException: socket failed: EPERM`** in the app — stale install state. `adb uninstall com.example.dozo` then reinstall; check `dozo_prefs.xml`.
- **`dozo_verify_qr` FAIL, no QR** — capture too early (QR renders ~3s after trigger); canceled/refused never show a QR, so FAIL is expected there.
- **`reason` truncated after the first word** — device-shell quoting; use `dozo_trigger_intent`, or single-quote the whole `adb shell "am start …"` command.
- **Pairing stays "pending"** — it only becomes `claimed` after `POST /api/terminals/claim` (the dashboard does this).
- **Server unreachable** — OCI ingress must allow TCP 3000; host iptables must allow 3000 (`sudo iptables -L INPUT -n`).
- **VPS very slow / SSH stalls** — a full image rebuild is compiling `better-sqlite3`. Don't run `deploy.sh`; use the copy-and-commit method or add swap.
- **`${outcome^^}` bad substitution** — macOS bash 3.2; already fixed in the scripts (uses `tr`).

---

## 8. Policy guardrails (do not break)

- **No review gating** — never route unhappy customers to private support instead of Google. The app shows the QR only on approval; there is no support branch.
- **No incentives** — no coupons/discounts/loyalty points for leaving a review.
- **Attribution limit** — only scans per terminal are provable; reviews are aggregate. The dashboard reports scan volume.

See `Papier Platform/08 Engineering Guardrails.md` in the vault.

---

## 9. Known gaps / next

- Release APK is **unsigned**; add a keystore (and Polcard signing) to distribute.
- Real Polcard **result code** and `startActivityForResult` behavior are unconfirmed (implemented as 1/2/3).
- Server is **HTTP only**; add TLS and drop `usesCleartextTraffic` for production.
- API auth is a single shared token; per-terminal tokens/merchant auth pending.
- Config sync relies on the `GET /config` endpoint; real dashboard auth and roles are still open.

# DOZO — Cross-Repo Contracts (index)

Frozen interfaces shared by the Android app, redirect server, and merchant dashboard.
Each interface lives in its own file under [`contracts/`](contracts/), owned by one
workstream. **To change a contract: edit its file first, then update every consumer, then
bump the "Last synced" line below and flag the other owners.**

Single-file read/write was replaced by one file per workstream so parallel sprints edit
distinct files and merge cleanly. Root (`CONTRACTS.md`, `contracts/env.md`) is owned by
the `contract` agent; every other contract file is owned by its project agent.

_Last synced from code on 2026-10-11. The repo has four project contexts (App, Server, Dashboard, Website) in a single monorepo under one git repo, remote `git@github.com:Malickimy/DOZO.git`; Website is currently only a scaffold with no application toolchain or shared HTTP contract. The main checkout is `/Users/malicky/l/DOZO`, and git worktrees mirror the same layout. The shared runtime env vars (`DASHBOARD_DIST_PATH`, plus the transitional `CONNECTOR_PORT`, `CONNECTOR_SPOOL_PATH`, `DASHBOARD_INGEST_URL`) and the single shared `DB_PATH` datastore are documented in [`contracts/env.md`](contracts/env.md)._

_Release Board R1–R7 are all implemented on the server side. R2–R7 landed together in PR #36, an atomic server PR that collapsed the planned expand/contract steps. The App R3/R4/R6 consumers landed in PR #62 (merged 2026-09-28), and the Dashboard consumer rows were restored in this reconciliation (PR #66); R1–R7 remain server-implemented (see [`contracts/http-api.md`](contracts/http-api.md) and [`contracts/dashboard.md`](contracts/dashboard.md)). Historical `R#` entries in this file are a ledger of past changes, not a readiness gate._

---

## Contract files

| File | Owner | Consumer(s) | Was |
| --- | --- | --- | --- |
| [`contracts/http-api.md`](contracts/http-api.md) | Server | App, Dashboard | §3 |
| [`contracts/db-schema.md`](contracts/db-schema.md) | Server | — | §4 |
| [`contracts/android-intent.md`](contracts/android-intent.md) | App | Payment terminal | §5 |
| [`contracts/android-prefs.md`](contracts/android-prefs.md) | App | — | §6 |
| [`contracts/android-jobs.md`](contracts/android-jobs.md) | App | — | §7 |
| [`contracts/dashboard.md`](contracts/dashboard.md) | Dashboard | — | §8 |
| [`contracts/env.md`](contracts/env.md) | `contract` agent (root) | All | §10 |
| `CONTRACTS.md` (this file) | `contract` agent | All | §1, §2, §9, §11 |

Editing rules:

- A project agent may edit **only** its own `contracts/*.md` files; it must never edit
  another workstream's contract file or this index.
- Shared/cross-workstream edits (`contracts/env.md`, this index) go through the `contract`
  agent. A true contradiction between two workstreams stops and goes to the user.
- All contract changes ship expand/contract (see the Change process section below).

---

## 1. Projects & ownership (current paths)

| Workstream | Path | Owns |
| --- | --- | --- |
| App | `DOZO-App/` | `app/**`, `mockpay/**`, `scripts/dozo_*`, `scripts/mockpay_deploy`, `scripts/check_apk_size`, `contracts/android-*.md` |
| Server | `DOZO-Server/` | entire directory, `contracts/http-api.md`, `contracts/db-schema.md` |
| Dashboard | `DOZO-Dashboard/` | `src/**`, `e2e/**`, SPA build config (frontend only), `contracts/dashboard.md` |
| Website | `DOZO-Website/` | entire directory (independent public marketing-site project; application toolchain TBD; no shared HTTP contract) |
| Contract & docs | `.` (repo root) | `CONTRACTS.md`, `contracts/env.md`, `CONTEXT.md`, `MANUAL.md`, `README.md`, `Makefile`, `.github/workflows/` |
| Docs | repo Markdown (`CONTEXT.md`, `MANUAL.md`, `README.md`, `docs/`, this index) | documentation home; the Papier Obsidian vault is an optional historical archive |

> Repo root: the monorepo checkout (main `/Users/malicky/l/DOZO`; worktrees such as `/Users/malicky/l/workspace-server` mirror the same layout). Paths in this file are repo-relative so they hold in any worktree. If a path moves again, update this table, the app `scripts/*` `PROJECT_DIR` defaults, `~/.config/opencode/opencode.json` (`ANDROID_PROJECT_DIR`), and the `android-build` skill.

> **R4 (server shipped 2026-09-25; unified runtime per R11).** The Node backend lives in `DOZO-Server/` as one package. The approved target topology is a single shared runtime: the canonical `src/server.js` entrypoint runs one Fastify instance with exactly one SQLite connection (`DB_PATH`) per client, serving the combined connector + dashboard surface. The earlier split — two entrypoints `src/connector.js` (public) and `src/dashboard.js` (dashboard API + SPA), one image with two containers per client, per-container SQLite, and connector scan-spool forwarding — is **transitional** and retires through the Server runtime-refactor issues; see the container section in [`contracts/env.md`](contracts/env.md). `DOZO-Dashboard/` stays a frontend and gains no Fastify or better-sqlite3 dependency.

---

## 2. Environments

- **VPS:** `ubuntu@130.162.185.144`, port `3000`, API token `dev-placeholder-token` (placeholder).
- **Emulator:** serial `emulator-5554`, AVD `Ingenico_AXIUM_DX8000` (API 29, 780×1280 @ 240 dpi).
- **Toolchain:** JDK 17; Android `compileSdk 37` / `minSdk 29` / `targetSdk 29`; Node.js 22+.
- **Local server default:** `http://localhost:3000`; **emulator → host:** `http://10.0.2.2:3000`.

---

## 9. Build & release

- App: `compileSdk 37`, `minSdk 29`, `targetSdk 29`, Java 17, `buildConfig=true`; release `isMinifyEnabled`/`isShrinkResources`; lint disables `ExpiredTargetSdkVersion`. Size budget **5 MB** via `scripts/check_apk_size` (release currently ~2.20 MB, unsigned).

---

## 11. Change process

Contract changes are tracked as GitHub work, not as a Release Board gate.

1. Open a **contract-change issue** (label `contract`) naming the owning `contracts/*.md`
   file and the exact interface (endpoint, field, message, or schema element) and its old
   and new shape.
2. The owning agent lands the **owner-approved revision** in the owning `contracts/*.md`
   file and records the approving PR or commit on the issue.
3. Every consumer migrates expand/contract: add the new shape, migrate all consumers, then
   retire the old one, in separate short-lived issues unless the contract owner approves an
   atomic change.
4. Record the approved revision on the contract-change issue and bump the "Last synced" line
   below, flagging the other owners.

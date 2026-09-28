# DOZO — Cross-Repo Contracts (index)

Frozen interfaces shared by the Android app, redirect server, and merchant dashboard.
Each interface lives in its own file under [`contracts/`](contracts/), owned by one
workstream. **To change a contract: edit its file first, then update every consumer, then
bump the "Last synced" line below and flag the other owners.**

Single-file read/write was replaced by one file per workstream so parallel sprints edit
distinct files and merge cleanly. Root (`CONTRACTS.md`, `contracts/env.md`) is owned by
the `contract` agent; every other contract file is owned by its project agent.

_Last synced from code on 2026-09-25. The workspace is a single monorepo (three projects under one git repo, remote `git@github.com:Malickimy/DOZO.git`; the main checkout is `/Users/malicky/l/DOZO`, and git worktrees mirror the same layout)._

_Release Board R1–R7 are all implemented on the server side. R2–R7 landed together in PR #36, an atomic server PR that collapsed the planned expand/contract steps. App and Dashboard consumers are still catching up (see [`contracts/http-api.md`](contracts/http-api.md) and [`contracts/dashboard.md`](contracts/dashboard.md))._

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
| [`contracts/env.md`](contracts/env.md) | Server + `contract` agent | All | §10 |
| `CONTRACTS.md` (this file) | `contract` agent | All | §1, §2, §9, §11 |

Editing rules:

- A project agent may edit **only** its own `contracts/*.md` files; it must never edit
  another workstream's contract file or this index.
- Shared/cross-workstream edits (`contracts/env.md`, this index) go through the `contract`
  agent. A true contradiction between two workstreams stops and goes to the user.
- All contract changes ship expand/contract (see §Change process).

---

## 1. Projects & ownership (current paths)

| Workstream | Path | Owns |
| --- | --- | --- |
| App | `DOZO-App/` | `app/**`, `mockpay/**`, `scripts/dozo_*`, `scripts/mockpay_deploy`, `scripts/check_apk_size`, `contracts/android-*.md` |
| Server | `DOZO-Server/` | entire directory, `contracts/http-api.md`, `contracts/db-schema.md`, `contracts/env.md` |
| Dashboard | `DOZO-Dashboard/` | `src/**`, `e2e/**`, SPA build config (frontend only), `contracts/dashboard.md` |
| Contract & docs | `.` (repo root) | `CONTRACTS.md`, `contracts/env.md`, `CONTEXT.md`, `MANUAL.md`, `README.md`, `Makefile`, `.github/workflows/` |
| Docs | Papier Obsidian vault (`obsidian` CLI, vault name `Papier`) | vault notes |

> Repo root: the monorepo checkout (main `/Users/malicky/l/DOZO`; worktrees such as `/Users/malicky/l/workspace-server` mirror the same layout). Paths in this file are repo-relative so they hold in any worktree. If a path moves again, update this table, the app `scripts/*` `PROJECT_DIR` defaults, `~/.config/opencode/opencode.json` (`ANDROID_PROJECT_DIR`), and the `android-build` skill.

> **R4 (server shipped 2026-09-25).** The Node backend lives in `DOZO-Server/` as one package with two entrypoints: `src/connector.js` (public) and `src/dashboard.js` (dashboard API + SPA). `DOZO-Dashboard/` stays a frontend and gains no Fastify or better-sqlite3 dependency.

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

1. Propose the change in the owning `contracts/*.md` first.
2. Update the owning repo(s).
3. Update every consumer (server → app/dashboard → docs).
4. Bump the "Last synced" line and flag the other owners.

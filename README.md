# DOZO

Monorepo for the Papier review-QR platform: an Android terminal app, the redirect
server it talks to, and the merchant dashboard. A single git repo with three
independently built projects (loose monorepo — each keeps its own toolchain).

## Layout

```
DOZO/
├── papier/                    # Android terminal app (:app) + mock caller (:mockpay)
├── papier-redirect-server/    # Fastify + SQLite server
├── papier-dashboard/          # Vite + React merchant portal
├── CONTRACTS.md               # cross-project interface (source of truth)
├── MANUAL.md                  # hands-on operator manual
├── Makefile                   # root task runner
└── .github/workflows/         # path-filtered CI (app / server / dashboard)
```

The coupling between the three projects is the HTTP API + intent/prefs contract in
[`CONTRACTS.md`](CONTRACTS.md). Change it there first, then update every consumer in
the same commit.

## Build & test

```bash
make verify        # Android build + unit tests, server tests, dashboard build + tests
```

Or per project:

```bash
make app           # ./gradlew :app:assembleDebug
make app-test      # ./gradlew :app:testDebugUnitTest
make server        # npm test in papier-redirect-server
make dashboard     # npm run build in papier-dashboard
make help          # all targets
```

CI runs path-filtered workflows, so a change under `papier/` does not build the
server or dashboard.

## Conventions

- One writer; contract changes go through `CONTRACTS.md` and update all consumers in
  one commit.
- Do **not** run the server `deploy.sh` full rebuild on the 1 GB VPS (it thrashes); use
  the copy-and-commit method in `MANUAL.md`.
- The Obsidian vault is kept outside this repo (`Papier_Vault` symlink and any local
  vault copy are gitignored).

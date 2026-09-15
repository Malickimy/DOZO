# DOZO

Monorepo for the DOZO review-QR platform: an Android terminal app, the redirect
server it talks to, and the merchant dashboard. A single git repo with three
independently built projects (loose monorepo — each keeps its own toolchain).

## Layout

```
DOZO/
├── DOZO-App/            # Android terminal app (:app) + mock caller (:mockpay)
├── DOZO-Server/         # Fastify + SQLite server
├── DOZO-Dashboard/      # Vite + React merchant portal
├── CONTRACTS.md         # cross-project interface (source of truth)
├── MANUAL.md            # hands-on operator manual
├── AGENTS.md            # agent/contributor workflow (commits, PRs, worktrees)
├── Makefile             # root task runner
├── commitlint.config.js # commit scope/format rules
└── .github/workflows/   # path-filtered CI (app / server / dashboard)
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
make test          # Android unit tests + server tests + dashboard tests
make app           # ./gradlew :app:assembleDebug
make app-test      # ./gradlew :app:testDebugUnitTest
make server        # npm test in DOZO-Server
make dashboard     # npm run build in DOZO-Dashboard
make help          # all targets
```

CI runs path-filtered workflows, so a change under `DOZO-App/` does not build the
server or dashboard.

## Conventions

- Agent and contributor workflow lives in [`AGENTS.md`](AGENTS.md).
- Commits use Conventional Commits with a `DOZO-App` / `DOZO-Server` /
  `DOZO-Dashboard` / `root` scope, enforced by commitlint in CI.
- One writer; contract changes go through `CONTRACTS.md` and update all consumers in
  one commit.
- Do **not** run the server `deploy.sh` full rebuild on the 1 GB VPS (it thrashes); use
  the copy-and-commit method in `MANUAL.md`.
- The Obsidian vault is kept outside this repo (`Papier_Vault` symlink and any local
  vault copy are gitignored).

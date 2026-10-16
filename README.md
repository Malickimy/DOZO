# DOZO

Monorepo for the DOZO review-QR platform: an Android terminal app, a Fastify backend, a
merchant/operator dashboard, and a public marketing site. App, Server, and Dashboard keep
independent toolchains. Website has a project context but no selected toolchain yet.

The backend is one unified runtime: `DOZO-Server/src/server.js` runs a single Fastify
instance and one SQLite connection per client, serving `GET /health`, the public
`GET /r/:terminal_id` redirect, every `/api/*` route and the built SPA from one origin
(one port, one database). The earlier two-entrypoint connector/dashboard split is
transitional and retires through the Server runtime-refactor issues.

## Layout

```
DOZO/
├── DOZO-App/            # Android terminal app (:app) + mock caller (:mockpay)
├── DOZO-Server/         # Fastify + SQLite server
├── DOZO-Dashboard/      # Vite + React merchant portal
├── DOZO-Website/        # Independent public site (toolchain TBD)
├── CONTRACTS.md         # cross-project contract index (source of truth)
├── contracts/           # one frozen interface per workstream
├── MANUAL.md            # hands-on operator manual
├── AGENTS.md            # agent/contributor workflow (commits, PRs, workspaces)
├── Makefile             # root task runner
├── commitlint.config.js # commit scope/format rules
├── .opencode/agent/     # delivery coordinator, one-task runner, specialists, QA
├── .github/             # issue/PR templates, label manifest, path-filtered CI
└── scripts/             # build, workspace, and validation helpers
```

The coupling between App, Server, and Dashboard is defined by the HTTP API and Android
contracts under [`contracts/`](contracts/), indexed by [`CONTRACTS.md`](CONTRACTS.md).
Website is a separate public presentation artifact and has no shared API contract. Change
the owning contract first, then update every consumer.

## Build & test

```bash
make verify        # project checks plus delivery configuration validation
```

Or per project:

```bash
make test          # Android unit tests + server tests + dashboard tests
make app           # ./gradlew :app:assembleDebug
make app-test      # ./gradlew :app:testDebugUnitTest
make server        # npm test in DOZO-Server
make server-dev    # start the unified server on :3000 (SEED_DEMO=true)
make smoke         # start the unified server and smoke one origin
make dashboard     # npm run build in DOZO-Dashboard
make help          # all targets
```

CI runs path-filtered project checks. Contract and coordination changes also trigger the
affected consumer checks and delivery-configuration validation.

## Conventions

- Agent and contributor workflow lives in [`AGENTS.md`](AGENTS.md) and
  [`.opencode/docs/delivery-workflow.md`](.opencode/docs/delivery-workflow.md).
- GitHub holds capability plans, executable issues, dependencies, and delivery status.
  Repository Markdown (contracts, `CONTRACTS.md`, architecture decisions, runbooks) is
  authoritative for documentation; the Papier Obsidian vault is an optional historical
  archive.
- Commits use Conventional Commits with a `DOZO-App` / `DOZO-Server` /
  `DOZO-Dashboard` / `DOZO-Website` / `root` scope, enforced by commitlint in CI.
- One writer per contract file; contract changes go through the owning `contracts/*.md`
  and update all consumers.
- Do **not** run the server `deploy.sh` full rebuild on the 1 GB VPS (it thrashes); use
  the copy-and-commit method in `MANUAL.md`.
- The optional Papier Obsidian archive is kept outside this repo (`Papier_Vault` symlink
  and any local vault copy are gitignored); only the `obsidian-1.1` agent may access it.

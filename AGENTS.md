# DOZO — Agent Guide

Instructions for AI agents (and humans) working in this monorepo. Read this before
editing. The cross-project interface is [`CONTRACTS.md`](CONTRACTS.md); treat it as
read-only and change it first when an interface changes.

## Layout

| Path | Project | Toolchain |
| --- | --- | --- |
| `DOZO-App/` | Android terminal app (`:app`) + mock caller (`:mockpay`) | Gradle, JDK 17 |
| `DOZO-Server/` | Fastify + SQLite redirect server | Node 20+ |
| `DOZO-Dashboard/` | Vite + React merchant portal | Node 20+ |
| repo root | `CONTRACTS.md`, `MANUAL.md`, `README.md`, `Makefile`, CI, `.opencode/` | — |

Each project keeps its own build config (loose monorepo). The root `Makefile` shells
out to the right one.

## Planning: the Release Board

Cross-project work is planned in the Obsidian vault, not in this repo. The vault root
note `DOZO/Release Board.md` (vault name `Papier`) is the single source of truth for
every change that touches `CONTRACTS.md`:

- **One row per contract change**, naming the exact endpoint/field and which project
  sprint does what. Nothing starts until the row exists.
- **Expand/contract by default:** add the new thing, migrate every consumer, then remove
  the old thing — each as a separate short-lived PR.
- **Root grilling** is where contradictions between project sprints get decided.
  Per-project grilling cannot invent contract changes.

Read it with the obsidian CLI by vault name (`Papier`) so it works from any worktree.

## Commits

- Use **Conventional Commits**: `type(scope): subject`.
- `scope` is required and must be one of: `DOZO-App` / `dozo-app` / `app`,
  `DOZO-Server` / `dozo-server` / `server`, `DOZO-Dashboard` / `dozo-dashboard` /
  `dashboard`, or `root` (repo-wide/docs/CI changes).
- **Titles are very concise**: imperative mood, no trailing period, max 72 chars.
- **Body is 1–2 sentences** explaining *why*. Omit the body when the change is obvious.
- Validate before committing: `npm run commitlint` (reads the edited message).
  CI (`.github/workflows/commitlint.yml`) rejects non-conforming commits on every PR.

Examples:

```
feat(DOZO-App): add pairing retry with backoff
fix(DOZO-Server): debounce duplicate scans within 3s

Two register taps could create two rows in the scan log.
```

## Merging code: PRs only

- **Never push directly to `main`.** Work on a branch, push it, and open a pull
  request; merge only after review.
- GitHub operations (PRs, CI runs, issues, releases) are handed off to the GitHub
  agent — see below. Do local edits and commits yourself; let the agent publish them.
- One writer per project worktree. If a change touches `CONTRACTS.md`, update the
  contract first, add a Release Board row, and ship it expand/contract (see below).

## Worktrees: one window per project

If several agents run concurrently inside one repository folder they collide on
`.git/index.lock`. Keep **one worktree per project** so each has its own working copy,
its own `opencode.json`, and its own MCP set:

```bash
git worktree add ../workspace-android   -b feat/<change>
git worktree add ../workspace-server    -b feat/<change>
git worktree add ../workspace-dashboard -b feat/<change>
```

Run each opencode window inside its project subfolder — `../workspace-android/DOZO-App`,
`../workspace-server/DOZO-Server`, `../workspace-dashboard/DOZO-Dashboard` — so that
project's `opencode.json` (and its MCPs) applies.

### Branches: short-lived, one per contract change

- **Do not keep long-lived `feature-android` / `feature-server` / `feature-dashboard`
  branches.** Each change gets its own branch, cut from the newest `main`, named after
  the contract change (`feat/model-b-add`, `feat/model-b-app`, …).
- Open a PR, merge, delete the branch, then cut the next one from the updated `main`.
- **Expand/contract** keeps `main` green while the three projects move at different
  times. An `atomic` change (one branch, one PR, all projects together) is the exception,
  only when a change cannot be split into add/migrate/retire steps.

### Integration worktree (optional)

When you need one source tree — a demo freeze, or to catch `CONTRACTS.md` conflicts
early — merge the change's branches in a throwaway worktree:

```bash
git worktree add ../integration -b integration/<change>
# merge the feat/* branches here, test, then:
git worktree remove ../integration
```

A worktree is a full checkout, so it loads its **own** `opencode.json` and `.opencode/`
from the branch it was created on. Two rules follow:

- **Commit config before branching a worktree**, or rebase the branch onto the commit
  that added it. Uncommitted config and skills never appear in a worktree.
- **No hardcoded `/Users/.../DOZO/...` repo paths** in `opencode.json` — they pin MCP
  servers to the main checkout. An MCP server's `cwd` is resolved from the **instance
  directory** (where opencode was launched), *not* the repo root. Rely on the default
  cwd and take checkout-specific paths from env vars (e.g. `DOZO_DB_PATH`). This applies
  to the global `~/.config/opencode/opencode.json` too.

## Testing a cross-project change (before merging)

The three projects talk over HTTP, so you do **not** need to merge to test compatibility.
Run each worktree's artifact as a live piece and wire them over localhost:

- **Server + App:** start the server from the server worktree
  (`SEED_DEMO=true DB_PATH=/tmp/dozo-integ.db npm start` → `localhost:3000`), build and
  install the app from the app worktree, and point the app's base URL at
  `http://10.0.2.2:3000` (`10.0.2.2` is the laptop as seen from the emulator; `localhost`
  does not work there). Trigger a sale, scan the QR, confirm the server logs it.
- **Server + Dashboard:** same server; run the dashboard from its worktree with
  `VITE_API_BASE_URL=http://localhost:3000 npm run dev`, and set the server's
  `DASHBOARD_ORIGIN` to the dev origin.
- **All three:** one window per project, all pointed at `localhost:3000`.

Merge only once each consumer round-trips against the new contract.

## GitHub: hand off to the GitHub agent

- **All GitHub actions are handed off to the GitHub agent** (subagent `githuber`, via
  the GitHub MCP server). Do not drive GitHub by hand.
- This covers: opening/updating/merging PRs, inspecting workflow runs and CI failures,
  re-running checks, filing and triaging issues, releases, and code search.
- The agent is **read-only on the local filesystem**. Do local edits and commits
  yourself; hand it the branch or PR to publish, then review what it reports.
- Requires the GitHub MCP enabled in `opencode.json` (`github`, `github_*`) and a
  `GITHUB_PERSONAL_ACCESS_TOKEN` in the environment.

## QA: hand off to the QA agent

- **Do not hand-roll Playwright specs.** When a feature branch is ready, hand QA off to
  the specialized **QA agent** (`.opencode/agent/qa.md`, subagent `qa`).
- The QA agent is universal across `DOZO-App/`, `DOZO-Server/`, `DOZO-Dashboard/`, and
  root. It writes Playwright coverage for the newly added feature, runs it, and reports
  pass/fail plus gaps.
- Hand off explicitly: state the branch/commit range and the feature to cover. The QA
  agent commits tests as `test(<scope>): ...` on its own branch/PR.
- Per-directory context is exposed as references in `opencode.json`
  (`@dozo-app`, `@dozo-server`, `@dozo-dashboard`, `@root`); the QA agent reads the one
  matching the project under test.
- Native Android UI cannot be driven by Playwright — the QA agent covers the
  server/dashboard surface and flags `androidTest` as the remaining gap.

## MCP servers: enable on demand

MCP servers are **disabled** in the root [`opencode.json`](opencode.json). Each project
enables just what it needs in its own config, so opening that project brings the right
servers up automatically:

| Window | On by default ("needed") | On request ("heavier") |
| --- | --- | --- |
| `DOZO-App/` | `android-mcp-server`, `uiautomator2-mcp-server`, `android-builder-mcp`, `mobile-mcp` | — |
| `DOZO-Server/` | `sqlite` | `ssh` (deploy only) |
| `DOZO-Dashboard/` | `playwright` | `chrome-devtools` |

**MCPs are scoped to the opencode window (instance), not to an agent.** A subagent runs
inside the same window and inherits that window's servers; it cannot reach another
window's MCPs. So run QA in the project window whose tools it needs rather than enabling
everything in one window. The `qa` agent is universal and uses whatever the window has.

- Try built-in tools, the repo skills, and `make` targets first; most tasks need no MCP.
- Keep the "needed" servers on; enable a "heavier" one only for a concrete task, then
  disable it. Idle servers cost context and add startup failures (Docker Desktop down,
  missing tokens).
- Some servers need the environment prepared before they stay up: `android-mcp-server`
  closes the connection unless the DX8000 emulator (`Ingenico_AXIUM_DX8000`) is running,
  and `sqlite` reads its database from `DOZO_DB_PATH` (set it to the checkout's
  `DOZO-Server/data/dozo.db`).

## Verify before opening a PR

```bash
make verify        # Android build + unit tests, server tests, dashboard build + tests
```

Or per project:

```bash
make test          # Android + server + dashboard test suites
make app           # ./gradlew :app:assembleDebug
make app-test      # ./gradlew :app:testDebugUnitTest
make server        # npm test in DOZO-Server
make dashboard     # npm run build in DOZO-Dashboard
make help          # all targets
```

Do **not** run the server `deploy.sh` full rebuild on the 1 GB VPS (it thrashes); use
the copy-and-commit method in [`MANUAL.md`](MANUAL.md).

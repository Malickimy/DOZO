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
- One writer per workstream. If a change touches `CONTRACTS.md`, update the contract
  first and every consumer in the same PR.

## Parallel agents: use Git worktrees

If several agents run concurrently inside one repository folder, they collide. When
two agents stage files, commit, or switch branches at the same moment, Git aborts with
a `.git/index.lock` error. A **worktree** gives each agent its own working copy linked
to the same repository, so they can run and commit independently.

Create one worktree per workstream on its own branch:

```bash
git worktree add ../workspace-android  -b feature-android
git worktree add ../workspace-server   -b feature-server
git worktree add ../workspace-dashboard -b feature-dashboard
```

Run each agent inside its own worktree, in its own subfolder:

- Agent 1 — `../workspace-android/DOZO-App`
- Agent 2 — `../workspace-server/DOZO-Server`
- Agent 3 — `../workspace-dashboard/DOZO-Dashboard`

Each agent edits, runs its test suite, and commits on its branch independently, then
pushes the branch and opens a PR. After the branches are merged into `main`, remove the
temporary worktrees:

```bash
git worktree remove ../workspace-android
git worktree remove ../workspace-server
git worktree remove ../workspace-dashboard
```

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

All MCP servers are **disabled** in [`opencode.json`](opencode.json). Do not enable or
use one unless the task has a concrete action that actually needs it — for example
browser E2E for the dashboard (`playwright`), read-only DB inspection (`sqlite`), or
device UI automation (`mobile-mcp`).

- Try built-in tools, the repo skills, and `make` targets first; most tasks need no MCP.
- When one is required, name the server and the action it performs, then set
  `"enabled": true` for that server and its `tools` glob for the duration of the task.
- Disable it again when the task is done. Idle servers cost context and add startup
  failures (Docker Desktop down, missing tokens).

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

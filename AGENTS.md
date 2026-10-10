# DOZO — Agent Guide

Instructions for AI agents (and humans) working in this monorepo. Read this before
editing. The cross-project interfaces live under [`contracts/`](contracts/) (one file per
workstream, indexed by [`CONTRACTS.md`](CONTRACTS.md)); each project agent owns its own
contract file, and root owns the index + `contracts/env.md`. Change the owning contract
first when an interface changes.

## Layout

| Path | Project | Toolchain |
| --- | --- | --- |
| `DOZO-App/` | Android terminal app (`:app`) + mock caller (`:mockpay`) | Gradle, JDK 17 |
| `DOZO-Server/` | Fastify + SQLite redirect server | Node 22+ |
| `DOZO-Dashboard/` | Vite + React merchant portal | Node 22+ |
| `DOZO-Website/` | Independent public marketing site, scaffold only | Toolchain selected by its first implementation task |
| repo root | `CONTRACTS.md`, `contracts/`, `MANUAL.md`, `README.md`, `Makefile`, CI, `.opencode/` | — |

App, Server, and Dashboard keep independent build configs. Website is a planned separate
build/deployment artifact and has no application toolchain yet. The current backend still
has connector and dashboard entrypoints; the approved MVP direction is one shared backend
process with separate code modules. Implement that runtime change only through its approved
capability issues and contract gates.

## Obsidian vault (Papier)

The `Papier` vault (`~/Documents/Papier/Papier`) is owned by the `obsidian-1.1`
agent. Do not read, edit, or create vault files directly — no `read` / `edit` /
`write` tools and no `obsidian` CLI calls on vault paths. Hand vault work to the
obsidian agent instead. Access is granted to that agent in `opencode.json`;
other agents stay blocked.

## Planning: Obsidian and GitHub

The Papier Obsidian vault is the human-facing roadmap and design home. GitHub issues are
the execution tracker for App, Server, Dashboard, Website, and root tasks. Follow
[`delivery-workflow.md`](.opencode/docs/delivery-workflow.md) for issue readiness, labels,
dependencies, branches, and task handoffs. Link the Obsidian capability brief from the
GitHub parent issue instead of copying changing issue status into the vault.

The vault root note `DOZO/Release Board.md` (vault name `Papier`) remains the required
source of truth for cross-project contract decisions:

- **One row per contract change**, naming the exact endpoint/field and which project
  tasks implement it. Contract-dependent implementation does not start until the row and
  owner-approved contract revision exist.
- **Expand/contract by default:** add the new thing, migrate every consumer, then remove
  the old thing — separate short-lived issues and PRs unless the contract owner approves an
  atomic change.
- **Root grilling** decides contradictions between capability plans. Per-project tasks
  cannot invent shared contract changes.

The Obsidian agent is the only agent allowed to read or update vault notes. GitHub remains
authoritative for ticket and PR state; Obsidian carries capability intent, decisions, and
human progress summaries.

## Commits

- Use **Conventional Commits**: `type(scope): subject`.
- `scope` is required and must be one of: `DOZO-App` / `dozo-app` / `app`,
  `DOZO-Server` / `dozo-server` / `server`, `DOZO-Dashboard` / `dozo-dashboard` /
  `dashboard`, `DOZO-Website` / `dozo-website` / `website`, or `root`
  (repo-wide/docs/CI changes).
- **Titles are concise**: imperative mood, no trailing period, max 72 chars.
- **Body is 1–2 sentences** explaining *why*. Omit the body when the change is obvious.
- Keep each commit body line within commitlint's 100-character limit.
- **Writers make local commits** for their assigned files. The GitHub agent publishes
  already committed branches and manages issues/PRs after the task runner authorizes it.
- Validate before committing: `npm run commitlint` at the repo root, or
  `npm run commitlint --prefix ..` from an App/Server/Dashboard/Website project directory.
  CI (`.github/workflows/commitlint.yml`) rejects non-conforming commits on every PR.
- Stage exact task-owned paths only. Never use `git add -A` or `git add .`.

Examples:

```
feat(DOZO-App): add pairing retry with backoff
fix(DOZO-Server): debounce duplicate scans within 3s
feat(DOZO-Website): add Polish product overview

Two register taps could create two rows in the scan log.
```

## Branches and pull requests

- **Never push directly to `main`.** Work on a task branch, push it, and open a PR; merge
  only after review.
- GitHub operations (issues, PRs, checks, releases, labels) go through `githuber`. Project
  specialists and QA commit their assigned files locally; `githuber` pushes committed
  branches and manages PRs.
- The default unit is **one issue, one task branch, one PR**. A capability has a parent
  issue and project-owned child issues. A cross-project atomic issue is an exception.
- One active writer per task worktree. Implementation and QA run sequentially in that
  worktree.
- A change to `contracts/*.md` requires the Release Board row and owner-approved contract
  first. Project agents own their contract files; `contract` owns `CONTRACTS.md` and
  `contracts/env.md`.

## Worktrees: one task per worktree

Give each active task its own worktree and branch. Two tasks in the same project can run
in parallel only in separate worktrees. Create a clean worktree from current `origin/main`
with:

```bash
scripts/new-task-worktree.sh 123 durable-display-outbox ../workspace-123
```

The helper creates `work/123-durable-display-outbox`. Run OpenCode in the relevant project
directory inside that worktree, such as `../workspace-123/DOZO-App`, so it loads that
project's tools. The Website context is `DOZO-Website/`; its application toolchain is
selected by an approved Website task.

### Short-lived task branches

- Do not keep long-lived project feature branches. Create one `work/<issue>-<slug>` branch
  per GitHub task from the newest `origin/main`.
- Merge a producer task before creating dependent consumer worktrees, unless an approved
  integration worktree is used to test compatible branches together.
- Expand/contract keeps `main` green while workstreams move at different times. An atomic
  cross-project change is allowed only when the change cannot be split safely.

### Integration worktree (optional)

When you need one source tree — a demo freeze, or to catch a `contracts/*.md` conflict
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

The current code uses separate App, Server, and Dashboard projects that talk over HTTP, so
you do **not** need to merge to test compatibility. Run each task worktree's artifact as
a live piece and wire them over localhost:

- **Server + App:** start the server from the server worktree
  (`SEED_DEMO=true DB_PATH=/tmp/dozo-integ.db npm start` → `localhost:3000`), build and
  install the app from the app worktree, and point the app's base URL at
  `http://10.0.2.2:3000` (`10.0.2.2` is the laptop as seen from the emulator; `localhost`
  does not work there). Trigger a sale, scan the QR, confirm the server logs it.
- **Server + Dashboard:** same server; run the dashboard from its worktree with
  `VITE_API_BASE_URL=http://localhost:3000 npm run dev`, and set the server's
  `DASHBOARD_ORIGIN` to the dev origin.
- **All three:** one window per project, all pointed at `localhost:3000`.

Merge only once each consumer round-trips against the new contract. These commands describe
the current runtime; update them when the approved shared-process backend capability lands.

## GitHub: hand off to the GitHub agent

- **All GitHub actions are handed off to the GitHub agent** (subagent `githuber`, via
  the GitHub MCP server). Do not drive GitHub by hand.
- This covers: opening/updating/merging PRs, inspecting workflow runs and CI failures,
  re-running checks, filing and triaging issues, releases, labels, and code search. The
  agent may push an already committed task branch; it does not create local code commits
  unless the user explicitly changes that policy.
- Issue and PR forms plus `.github/labels.yml` provide the tracking vocabulary. A
  maintainer applies the label manifest in GitHub; it does not sync itself.
- Requires the GitHub MCP enabled in `opencode.json` (`github`, `github_*`) and a
  `GITHUB_PERSONAL_ACCESS_TOKEN` in the environment.

## QA: module first, integration second

- Use `qa-app`, `qa-server`, `qa-dashboard`, or `qa-website` for project-owned issues.
  Invoke the selected QA from the matching project window; subagents inherit that window's
  tools.
- QA starts after implementation stops writing in the worktree. It may add and commit
  test-only files on the same task branch, never a second PR. The task runner owns the
  fix/retest loop.
- Use `qa` for integrated acceptance across a capability's project tasks. Native Android
  UI requires instrumentation or device checks; Playwright cannot verify it.
- Hand off explicitly with issue number, branch/PR range, capability outcome, affected
  paths, and acceptance criteria.

## MCP servers: enable on demand

Most MCP servers are disabled in the root [`opencode.json`](opencode.json). The GitHub MCP
is enabled for the GitHub agent; each project enables the additional tools it needs in its
own config, so opening that project brings the right servers up automatically:

| Window | On by default ("needed") | On request ("heavier") |
| --- | --- | --- |
| `DOZO-App/` | `android-mcp-server`, `uiautomator2-mcp-server`, `android-builder-mcp`, `mobile-mcp` | — |
| `DOZO-Server/` | `sqlite` | `ssh` (deploy only) |
| `DOZO-Dashboard/` | `playwright` | `chrome-devtools` |
| `DOZO-Website/` | `playwright` | `chrome-devtools` |

**MCPs are scoped to the opencode window (instance), not to an agent.** A subagent runs
inside the same window and inherits that window's servers; it cannot reach another
window's MCPs. Run each project task and module QA in the project window whose tools it
needs rather than enabling everything in one window.

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
make verify        # Android, server, dashboard, and delivery configuration checks
```

Or per project:

```bash
make test          # Android + server + dashboard test suites
make app           # ./gradlew :app:assembleDebug
make app-test      # ./gradlew :app:testDebugUnitTest
make server        # npm test in DOZO-Server
make dashboard     # npm run build in DOZO-Dashboard
make verify-coordination # OpenCode routing, JSON, and task worktree checks
make help          # all targets
```

Do **not** run the server `deploy.sh` full rebuild on the 1 GB VPS (it thrashes); use
the copy-and-commit method in [`MANUAL.md`](MANUAL.md).

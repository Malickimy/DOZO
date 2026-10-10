---
description: Execute one ready GitHub issue in the current DOZO project worktree.
agent: github-task-runner
---

Execute exactly one task. If `$ARGUMENTS` includes an issue number, inspect only that
issue. Otherwise select one highest-priority unblocked `state:ready` issue for this
project context. Follow the task runner's readiness and worktree checks.

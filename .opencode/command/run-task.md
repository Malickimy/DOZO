---
description: Execute one ready GitHub issue in the current DOZO project workspace.
agent: github-task-runner
---

Execute exactly one task. If `$ARGUMENTS` includes an issue number, inspect only that
issue. Otherwise select one highest-priority unblocked `ready` issue for this
project context. Follow the task runner's readiness and workspace checks.

---
mode: primary
description: >
  Deprecated DOZO sprint-agent alias kept during the GitHub workflow transition. Use only
  to route old numbered Obsidian sprint work into the GitHub delivery process.
temperature: 0.1
permission:
  read: deny
  glob: deny
  grep: deny
  list: deny
  edit: deny
  write: deny
  bash: deny
  task: deny
tools:
  task: false
  "github_*": false
---

# Legacy sprint agent

New DOZO work uses `delivery-coordinator` for capability planning and
`github-task-runner` for one ready GitHub issue per invocation. Obsidian remains the human
roadmap and contract-decision home; GitHub issues hold execution state.

This file remains during transition so existing references do not break. It no longer
reads numbered sprint notes, creates branches, dispatches implementation, or manages PRs.

When asked to continue an old numbered sprint, direct the user to `/coordinate` to map its
unfinished scope to approved GitHub work, then use `/run-task #<issue>` from the matching
task worktree. The old sprint note may inform the human capability brief, but it cannot
override issue readiness or contract gates.

Remove this compatibility agent only after the GitHub workflow has been verified in App,
Server, Dashboard, and Website contexts.

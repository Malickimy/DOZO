#!/usr/bin/env bash
# Start or resume one short-lived task branch inside a persistent project workspace.

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/start-task-branch.sh <issue-number> <slug> [workspace-path]

Create or resume branch work/<issue-number>-<slug> inside a persistent project workspace.
With no workspace path, the current Git worktree is used. The workspace must have no
uncommitted changes; the helper never stashes, resets, or discards work.

Example:
  scripts/start-task-branch.sh 123 durable-display-outbox ../workspace-server
EOF
}

fail() {
	printf 'error: %s\n' "$*" >&2
	exit 2
}

if [ "$#" -eq 1 ] && { [ "$1" = "-h" ] || [ "$1" = "--help" ]; }; then
	usage
	exit 0
fi

[ "$#" -ge 2 ] && [ "$#" -le 3 ] || { usage >&2; exit 2; }

issue_number="$1"
slug="$2"

[[ "$issue_number" =~ ^[1-9][0-9]*$ ]] || fail "issue number must be a positive integer."
[[ "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "slug must use lowercase letters, numbers, and single hyphens."

if [ "$#" -eq 3 ]; then
	workspace_input="${3%/}"
	[ -n "$workspace_input" ] || fail "workspace path cannot be empty."
	[ -d "$workspace_input" ] || fail "workspace path does not exist: $workspace_input"
	workspace="$(cd "$workspace_input" && pwd -P)"
else
	workspace="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this inside a DOZO Git worktree."
	workspace="$(cd "$workspace" && pwd -P)"
fi

git -C "$workspace" rev-parse --show-toplevel >/dev/null 2>&1 || fail "not a Git worktree: $workspace"

if [ -n "$(git -C "$workspace" status --porcelain)" ]; then
	fail "workspace has uncommitted changes; commit or discard them before starting a task."
fi

git -C "$workspace" fetch origin main:refs/remotes/origin/main || fail "could not update origin/main."
git -C "$workspace" rev-parse --verify --quiet origin/main >/dev/null || fail "origin/main is unavailable."

branch="work/$issue_number-$slug"

branch_worktree=""
current_worktree=""
while IFS= read -r line; do
	case "$line" in
		worktree\ *) current_worktree="${line#worktree }" ;;
		branch\ *)
			if [ "${line#branch }" = "refs/heads/$branch" ]; then
				branch_worktree="$current_worktree"
			fi
			;;
	esac
done < <(git -C "$workspace" worktree list --porcelain)

if [ -n "$branch_worktree" ]; then
	branch_worktree_real="$(cd "$branch_worktree" && pwd -P)"
	if [ "$branch_worktree_real" != "$workspace" ]; then
		fail "branch already checked out in another worktree: $branch_worktree"
	fi
fi

if git -C "$workspace" show-ref --verify --quiet "refs/heads/$branch"; then
	git -C "$workspace" switch "$branch"
	behind="$(git -C "$workspace" rev-list --count "$branch..origin/main")"
	if [ "$behind" -gt 0 ]; then
		printf 'note: %s is %s commit(s) behind origin/main; rebase before publishing.\n' "$branch" "$behind"
	fi
	printf 'Resumed branch:  %s\n' "$branch"
else
	remote_branch="$(git -C "$workspace" ls-remote --heads origin "refs/heads/$branch")" || fail "could not check whether the task branch exists remotely."
	[ -z "$remote_branch" ] || fail "remote branch already exists without a local checkout: $branch; fetch and check it out manually."
	git -C "$workspace" switch -c "$branch" origin/main
	printf 'Created branch:  %s\n' "$branch"
fi

printf 'Workspace:       %s\n' "$workspace"
printf 'Open the matching project directory:\n'
for project in DOZO-App DOZO-Server DOZO-Dashboard DOZO-Website; do
	if [ -d "$workspace/$project" ]; then
		printf '  %s/%s\n' "$workspace" "$project"
	fi
done

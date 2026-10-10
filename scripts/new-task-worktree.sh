#!/usr/bin/env bash
# Create one clean task worktree from the latest origin/main.

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/new-task-worktree.sh <issue-number> <slug> <worktree-path>

Create branch work/<issue-number>-<slug> in a new Git worktree based on origin/main.
The worktree path must not exist, and its parent directory must already exist.

Example:
  scripts/new-task-worktree.sh 123 durable-display-outbox ../workspace-123
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

[ "$#" -eq 3 ] || { usage >&2; exit 2; }

issue_number="$1"
slug="$2"
requested_path="${3%/}"

[[ "$issue_number" =~ ^[1-9][0-9]*$ ]] || fail "issue number must be a positive integer."
[[ "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail "slug must use lowercase letters, numbers, and single hyphens."
[ -n "$requested_path" ] || fail "worktree path cannot be empty."

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this inside a DOZO Git worktree."
repo_root="$(cd "$repo_root" && pwd -P)"

case "$requested_path" in
	/*) target_path="$requested_path" ;;
	*) target_path="$repo_root/$requested_path" ;;
esac

target_parent="$(dirname "$target_path")"
target_name="$(basename "$target_path")"
[ -d "$target_parent" ] || fail "worktree parent directory must already exist: $target_parent"
target_parent="$(cd "$target_parent" && pwd -P)"
target_path="$target_parent/$target_name"

case "$target_path" in
	"$repo_root" | "$repo_root"/*) fail "create task worktrees outside the current worktree: $target_path" ;;
esac

while IFS= read -r line; do
	case "$line" in
		worktree\ *)
			existing_worktree="${line#worktree }"
			existing_worktree="$(cd "$existing_worktree" && pwd -P)"
			case "$target_path" in
				"$existing_worktree" | "$existing_worktree"/*)
					fail "create task worktrees outside every existing worktree: $target_path"
					;;
			esac
			;;
	esac
done < <(git -C "$repo_root" worktree list --porcelain)

[ ! -e "$target_path" ] && [ ! -L "$target_path" ] || fail "worktree path already exists: $target_path"

branch="work/$issue_number-$slug"
if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
	fail "local branch already exists: $branch"
fi

git -C "$repo_root" fetch origin main:refs/remotes/origin/main || fail "could not update origin/main."
git -C "$repo_root" rev-parse --verify --quiet origin/main >/dev/null || fail "origin/main is unavailable."
remote_branch="$(git -C "$repo_root" ls-remote --heads origin "refs/heads/$branch")" || fail "could not check whether the task branch already exists remotely."
[ -z "$remote_branch" ] || fail "remote branch already exists: $branch"

git -C "$repo_root" worktree add "$target_path" -b "$branch" origin/main

printf 'Created worktree: %s\n' "$target_path"
printf 'Created branch:   %s\n' "$branch"
printf 'Open the matching project directory in this worktree:\n'
for project in DOZO-App DOZO-Server DOZO-Dashboard DOZO-Website; do
	if [ -d "$target_path/$project" ]; then
		printf '  %s/%s\n' "$target_path" "$project"
	fi
done

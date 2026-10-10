#!/usr/bin/env bash
# Publish only the current committed task branch. Never accepts a branch argument.

set -euo pipefail

[ "$#" -eq 0 ] || {
	printf 'usage: scripts/publish-task-branch.sh\n' >&2
	exit 2
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
	printf 'error: run inside a DOZO task worktree.\n' >&2
	exit 2
}
repo_root="$(cd "$repo_root" && pwd -P)"

fetch_url="$(git -C "$repo_root" remote get-url origin 2>/dev/null)" || {
	printf 'error: origin remote is unavailable.\n' >&2
	exit 2
}
case "$fetch_url" in
	"git@github.com:Malickimy/DOZO.git" | "https://github.com/Malickimy/DOZO.git" | "https://github.com/Malickimy/DOZO")
		;;
	*)
		printf 'error: refusing to publish from an unexpected origin URL.\n' >&2
		exit 2
		;;
esac

push_url="$(git -C "$repo_root" remote get-url --push origin 2>/dev/null)" || {
	printf 'error: origin push URL is unavailable.\n' >&2
	exit 2
}
case "$push_url" in
	"git@github.com:Malickimy/DOZO.git" | "https://github.com/Malickimy/DOZO.git" | "https://github.com/Malickimy/DOZO")
		;;
	*)
		printf 'error: refusing to publish to an unexpected push URL.\n' >&2
		exit 2
		;;
esac

branch="$(git -C "$repo_root" branch --show-current)"
[[ "$branch" =~ ^work/[1-9][0-9]*-[a-z0-9]+(-[a-z0-9]+)*$ ]] || {
	printf 'error: refusing to publish non-task branch: %s\n' "$branch" >&2
	exit 2
}

if [ -n "$(git -C "$repo_root" status --porcelain)" ]; then
	printf 'error: refusing to publish a worktree with uncommitted changes.\n' >&2
	exit 2
fi

git -C "$repo_root" push --set-upstream origin "$branch"

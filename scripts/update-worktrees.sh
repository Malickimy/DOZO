#!/usr/bin/env bash
#
# update-worktrees.sh — bring every linked Git worktree onto the newest origin/main.
#
# Design (matches the DOZO short-lived-branch model):
#   * No worktree needs `main` checked out — the base is always `origin/main`.
#   * Clean worktrees are updated automatically:
#       - branch with no unique commits            -> fast-forward to origin/main
#       - detached with no unique commits          -> re-detach at origin/main
#       - commits already upstream (squash-merged) -> re-detach at origin/main and
#         report the branch as safe to delete
#       - genuinely unique commits                 -> skipped unless --rebase
#   * Dirty worktrees are SKIPPED by default. Pass --stash to snapshot and restore
#     them. The snapshot NEVER touches the shared `refs/stash`: tracked changes use
#     `git stash create` (an orphan stash commit) and untracked files are copied to
#     a temp tar. If a restore conflicts, the snapshot is LEFT IN PLACE for manual
#     recovery and the run STOPS — so no later worktree can pick up the wrong state.
#
# Safety: never pushes, never forces, never runs `reset --hard`, never deletes
# branches or worktrees. Untracked files are only touched with --include-untracked.
#
# POSIX-friendly bash (works on bash 3.2, e.g. stock macOS /bin/bash).

set -euo pipefail

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

DRY_RUN=0
INCLUDE_UNTRACKED=0
USE_STASH=0
USE_REBASE=0

usage() {
	cat <<'EOF'
Usage: scripts/update-worktrees.sh [OPTIONS]

Bring every linked Git worktree onto the newest origin/main.

Options:
  -n, --dry-run            Show what would happen; change nothing.
  -u, --include-untracked  With --stash, also snapshot/restore untracked files.
      --stash              Snapshot dirty worktrees and restore them (never uses
                           the shared refs/stash). Default: skip dirty worktrees.
      --rebase             Rebase worktrees that have unique commits; default: skip.
  -h, --help               Show this help and exit.

Behavior:
  * `git fetch origin --prune` runs once; the base is origin/main.
  * Each worktree:
      - dirty (tracked changes) is skipped unless --stash;
      - no unique commits -> fast-forward (branch) or re-detach (detached);
      - commits already upstream (squash) -> re-detach and report for deletion;
      - unique commits -> skipped unless --rebase.
  * With --stash, tracked changes are captured with `git stash create` (no
    refs/stash write); untracked files (with -u) are copied to a temp tar. On a
    restore conflict the snapshot is kept and the run stops for manual recovery.
  * A failure in one worktree never aborts the rest, except a restore conflict,
    which stops the run on purpose.

Notes:
  * Untracked files are preserved unless --include-untracked is given.
  * This script never pushes, forces, resets --hard, or deletes branches.
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
	-n | --dry-run) DRY_RUN=1 ;;
	-u | --include-untracked) INCLUDE_UNTRACKED=1 ;;
	--stash) USE_STASH=1 ;;
	--rebase) USE_REBASE=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	-*)
		printf 'error: unknown option: %s\n\n' "$1" >&2
		usage >&2
		exit 2
		;;
	*)
		printf 'error: unexpected argument: %s\n\n' "$1" >&2
		usage >&2
		exit 2
		;;
	esac
	shift
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

warn() { printf 'warn: %s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; }
short() { printf '%s' "${1:0:7}"; }

git_in() {
	local dir="$1"
	shift
	git -C "$dir" "$@"
}

# True (0) if every commit in <base>..<rev> is already present in <base>
# (git cherry marks applied patches with '-', unapplied with '+'). Detects
# squash-merges, where the commit SHAs differ but the contents are upstream.
already_upstream() {
	local dir="$1" base="$2" rev="$3" not_applied
	not_applied="$(git -C "$dir" cherry "$base" "$rev" 2>/dev/null | grep -c '^+')" || true
	[ "${not_applied:-0}" -eq 0 ]
}

# Archive untracked files to "$2/untracked.tar" and remove them from the worktree.
snapshot_untracked() {
	local dir="$1" snap="$2" list="$snap/untracked.txt" f
	git -C "$dir" ls-files --others --exclude-standard >"$list" 2>/dev/null || : >"$list"
	[ -s "$list" ] || return 0
	tar -cf "$snap/untracked.tar" -C "$dir" -T "$list" 2>/dev/null || return 1
	while IFS= read -r f; do
		[ -n "$f" ] && rm -f "$dir/$f"
	done <"$list"
	return 0
}

# True (0) if $1 is an ancestor of $2 (equal counts as ancestor).
is_ancestor() {
	git merge-base --is-ancestor "$1" "$2" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Discover worktrees dynamically (never hardcode paths or branches)
# ---------------------------------------------------------------------------
# `git worktree list --porcelain` emits blocks like:
#   worktree /path
#   HEAD <sha>
#   branch refs/heads/<name>      (or: detached)
#
# bash 3.2 has no mapfile, so accumulate parallel arrays with a small state machine.

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	err "not inside a Git work tree; run this from the DOZO repository."
	exit 1
fi

wt_paths=()
wt_branches=()

_cur_path=""
_cur_branch=""
_flush() {
	[ -n "$_cur_path" ] || return 0
	wt_paths+=("$_cur_path")
	wt_branches+=("$_cur_branch")
}

while IFS= read -r line || [ -n "$line" ]; do
	case "$line" in
	worktree\ *)
		_flush
		_cur_path="${line#worktree }"
		_cur_branch=""
		;;
	branch\ *) _cur_branch="${line#branch refs/heads/}" ;;
	detached) _cur_branch="(detached)" ;;
	esac
done < <(git worktree list --porcelain)
_flush

if [ "${#wt_paths[@]}" -eq 0 ]; then
	err "no worktrees found."
	exit 1
fi

# ---------------------------------------------------------------------------
# Fetch once; base is origin/main
# ---------------------------------------------------------------------------

printf 'Fetching from origin...\n'
if ! git fetch origin --prune; then
	err "git fetch origin --prune failed."
	exit 1
fi

if ! git rev-parse --verify --quiet origin/main >/dev/null; then
	err "origin/main does not exist after fetch."
	exit 1
fi

base="$(git rev-parse origin/main)"
ts="$(date +%Y-%m-%dT%H:%M:%S%z)"
printf 'Base: origin/main (%s)\n' "$(short "$base")"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dozo-update-worktrees.XXXXXX")"
STOP=0

# Summary accumulators (parallel arrays).
sum_path=()
sum_branch=()
sum_action=()
sum_old=()
sum_new=()

failures=0

add_summary() {
	sum_path+=("$1")
	sum_branch+=("$2")
	sum_action+=("$3")
	sum_old+=("$4")
	sum_new+=("$5")
}

# ---------------------------------------------------------------------------
# Update each worktree
# ---------------------------------------------------------------------------

idx=0
while [ "$idx" -lt "${#wt_paths[@]}" ]; do
	path="${wt_paths[$idx]}"
	branch="${wt_branches[$idx]}"
	label="${branch:-detached}"
	idx=$((idx + 1))

	printf '\n== %s (%s) ==\n' "$path" "$label"

	if ! old_sha="$(git_in "$path" rev-parse HEAD 2>/dev/null)"; then
		warn "$path: no HEAD; skipping."
		add_summary "$path" "$label" "skipped-no-head" "-" "-"
		continue
	fi

	tracked_dirty=0
	if [ -n "$(git_in "$path" status --porcelain --untracked-files=no)" ]; then
		tracked_dirty=1
	fi

	untracked_present=0
	if [ -n "$(git_in "$path" ls-files --others --exclude-standard 2>/dev/null)" ]; then
		untracked_present=1
	fi

	if [ "$tracked_dirty" -eq 1 ] && [ "$USE_STASH" -eq 0 ]; then
		warn "$path: tracked changes present; skipping (pass --stash to snapshot and restore)."
		add_summary "$path" "$label" "skipped-dirty" "$old_sha" "$old_sha"
		continue
	fi

	unique="$(git_in "$path" rev-list --count "$base..HEAD" 2>/dev/null || echo 0)"

	if [ "$unique" -eq 0 ]; then
		if [ -n "$branch" ]; then mode="ff"; else mode="detach"; fi
	elif already_upstream "$path" "$base" HEAD; then
		mode="merged"
	elif [ "$USE_REBASE" -eq 1 ]; then
		mode="rebase"
	else
		warn "$path: $unique unique commit(s) not on origin/main; skipping (pass --rebase)."
		add_summary "$path" "$label" "skipped-unique" "$old_sha" "$old_sha"
		continue
	fi

	if [ "$unique" -eq 0 ] && [ "$old_sha" = "$base" ]; then
		printf '  already up to date with origin/main.\n'
		add_summary "$path" "$label" "up-to-date" "$old_sha" "$old_sha"
		continue
	fi

	# ---- dry run --------------------------------------------------------
	if [ "$DRY_RUN" -eq 1 ]; then
		case "$mode" in
		ff) printf '  would fast-forward to origin/main (%s).\n' "$(short "$base")" ;;
		detach) printf '  would detach at origin/main (%s).\n' "$(short "$base")" ;;
		merged) printf '  commits already upstream; would detach at origin/main and report for deletion.\n' ;;
		rebase) printf '  has %s unique commit(s); would rebase onto origin/main.\n' "$unique" ;;
		esac
		action="would-$mode"
		[ "$tracked_dirty" -eq 1 ] && action="would-stash+$action"
		add_summary "$path" "$label" "$action" "$old_sha" "-"
		continue
	fi

	# ---- snapshot (mechanism B: never writes refs/stash) ----------------
	snap=""
	stashed=0
	untracked_snapped=0
	STASH_SHA=""

	need_snapshot=0
	if [ "$USE_STASH" -eq 1 ]; then
		if [ "$tracked_dirty" -eq 1 ]; then need_snapshot=1; fi
		if [ "$INCLUDE_UNTRACKED" -eq 1 ] && [ "$untracked_present" -eq 1 ]; then need_snapshot=1; fi
	fi

	if [ "$need_snapshot" -eq 1 ]; then
		snap="$TMP_ROOT/wt$idx"
		mkdir -p "$snap"

		if [ "$tracked_dirty" -eq 1 ]; then
			STASH_SHA="$(git_in "$path" stash create "update-worktrees: $path @ $ts")" || STASH_SHA=""
			if [ -z "$STASH_SHA" ]; then
				err "$path: git stash create produced nothing; skipping this worktree."
				add_summary "$path" "$label" "FAILED" "$old_sha" "$old_sha"
				failures=$((failures + 1))
				continue
			fi
			printf '%s\n' "$STASH_SHA" >"$snap/tracked.sha"
			if ! git_in "$path" restore --source=HEAD --staged --worktree -- . >/dev/null 2>&1; then
				err "$path: could not clean tracked changes; skipping this worktree."
				add_summary "$path" "$label" "FAILED" "$old_sha" "$old_sha"
				failures=$((failures + 1))
				continue
			fi
			stashed=1
		fi

		if [ "$INCLUDE_UNTRACKED" -eq 1 ] && [ "$untracked_present" -eq 1 ]; then
			if snapshot_untracked "$path" "$snap"; then
				untracked_snapped=1
			else
				err "$path: could not archive untracked files; skipping this worktree."
				add_summary "$path" "$label" "FAILED" "$old_sha" "$old_sha"
				failures=$((failures + 1))
				continue
			fi
		fi
	fi

	# ---- update ---------------------------------------------------------
	update_failed=0
	case "$mode" in
	ff)
		if ! git_in "$path" merge --ff-only "$base" >/dev/null 2>&1; then
			err "$path: git merge --ff-only origin/main failed."
			update_failed=1
		fi
		action="fast-forwarded"
		;;
	detach | merged)
		if ! git_in "$path" checkout --detach "$base" >/dev/null 2>&1; then
			err "$path: git checkout --detach origin/main failed."
			update_failed=1
		fi
		if [ "$mode" = "merged" ]; then
			action="merged-detached"
		else
			action="detached-at-main"
		fi
		;;
	rebase)
		if git_in "$path" rebase "$base" >/dev/null 2>&1; then
			action="rebased"
		else
			git_in "$path" rebase --abort >/dev/null 2>&1 || true
			err "$path: git rebase hit conflicts; aborted, worktree restored."
			update_failed=1
			action="rebased"
		fi
		;;
	esac

	# ---- restore snapshot ----------------------------------------------
	restore_failed=0
	if [ "$untracked_snapped" -eq 1 ]; then
		if ! tar -xf "$snap/untracked.tar" -C "$path" 2>/dev/null; then
			err "$path: could not restore untracked files. Snapshot kept at $snap."
			restore_failed=1
		fi
	fi
	if [ "$stashed" -eq 1 ]; then
		if ! git_in "$path" stash apply "$STASH_SHA" >/dev/null 2>&1; then
			err "$path: could not restore tracked snapshot $STASH_SHA."
			err "       Snapshot kept at $snap for manual recovery (git stash apply $STASH_SHA)."
			restore_failed=1
		fi
	fi

	new_sha="$(git_in "$path" rev-parse HEAD 2>/dev/null || printf '%s' "$old_sha")"

	if [ "$update_failed" -eq 1 ] || [ "$restore_failed" -eq 1 ]; then
		# An untracked-only overwrite is a skip, not a failure.
		if [ "$update_failed" -eq 1 ] && [ "$stashed" -eq 0 ] && [ "$restore_failed" -eq 0 ] && [ "$untracked_present" -eq 1 ]; then
			warn "$path: update blocked by untracked files; skipped."
			add_summary "$path" "$label" "skipped-untracked" "$old_sha" "$old_sha"
			continue
		fi
		add_summary "$path" "$label" "FAILED" "$old_sha" "$new_sha"
		failures=$((failures + 1))
		if [ "$restore_failed" -eq 1 ]; then
			STOP=1
			break
		fi
		continue
	fi

	if [ "$stashed" -eq 1 ]; then
		action="stashed+$action"
	fi
	add_summary "$path" "$label" "$action" "$old_sha" "$new_sha"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

printf '\nSummary\n'
printf '=======\n'
printf '%-42s %-20s %-24s %s -> %s\n' "WORKTREE" "BRANCH" "ACTION" "OLD" "NEW"
n=0
while [ "$n" -lt "${#sum_path[@]}" ]; do
	printf '%-42s %-20s %-24s %s -> %s\n' \
		"${sum_path[$n]}" \
		"${sum_branch[$n]}" \
		"${sum_action[$n]}" \
		"$(short "${sum_old[$n]}")" \
		"$(short "${sum_new[$n]}")"
	n=$((n + 1))
done

if [ "$STOP" -eq 1 ]; then
	printf '\nStopped early: a snapshot could not be restored. Recovery snapshots are under:\n  %s\n' "$TMP_ROOT" >&2
	exit 1
fi

rm -rf "$TMP_ROOT"

if [ "$failures" -gt 0 ]; then
	printf '\n%d worktree(s) failed.\n' "$failures" >&2
	exit 1
fi

printf '\nAll worktrees processed successfully.\n'

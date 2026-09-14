#!/usr/bin/env bash
#
# deploy.sh - Deploy the DOZO redirect server to a remote host over SSH.
#
# rsyncs the project (excluding node_modules, data, .git and .env) to
# $REMOTE_DIR on $SERVER_HOST, then runs `docker compose up -d --build` and
# `docker compose ps` there.
#
# Safety: rsync never uses --delete and never touches data/ or a remote .env,
# so remote SQLite data and secrets are preserved. A missing remote .env is
# created from .env.production.example (edit API_TOKEN afterwards).
#
# Environment overrides:
#   SERVER_HOST   ssh target         (default: ubuntu@130.162.185.144)
#   REMOTE_DIR    remote project dir (default: ~/dozo-server)
#   SSH           ssh binary         (default: ssh)
#   RSYNC         rsync binary       (default: rsync)
#   DRY_RUN       "1" to print only  (default: 0)
#
# Usage: deploy.sh [--dry-run] [-h|--help]

set -euo pipefail

SERVER_HOST="${SERVER_HOST:-ubuntu@130.162.185.144}"
REMOTE_DIR="${REMOTE_DIR:-~/dozo-server}"
SSH="${SSH:-ssh}"
RSYNC="${RSYNC:-rsync}"
DRY_RUN="${DRY_RUN:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat <<EOF
Usage: deploy.sh [--dry-run] [-h|--help]

rsync the project to \$SERVER_HOST:\$REMOTE_DIR, then build and (re)start the
container with docker compose.

Environment overrides:
  SERVER_HOST   ssh target         (default: ubuntu@130.162.185.144)
  REMOTE_DIR    remote project dir (default: ~/dozo-server)
  SSH           ssh binary         (default: ssh)
  RSYNC         rsync binary       (default: rsync)
  DRY_RUN       "1" to print only  (default: 0)

Options:
  --dry-run     print the rsync/ssh commands without executing them
  -h, --help    show this help
EOF
}

while (( $# )); do
    case "$1" in
        -h|--help)  usage; exit 0 ;;
        --dry-run)  DRY_RUN=1; shift ;;
        -*)         echo "deploy.sh: unknown option: $1" >&2; usage >&2; exit 2 ;;
        *)          echo "deploy.sh: unexpected argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "ERROR: project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

RSYNC_CMD=(
    "$RSYNC" -az
    --exclude node_modules
    --exclude data
    --exclude .git
    --exclude .env
    "$PROJECT_DIR/"
    "$SERVER_HOST:$REMOTE_DIR/"
)

# Remote steps. $REMOTE_DIR is expanded locally on purpose so a "~" prefix is
# expanded by the remote shell, not by this script.
REMOTE_SCRIPT=$(cat <<REMOTE
set -eu
mkdir -p $REMOTE_DIR
cd $REMOTE_DIR
if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "WARN: created .env from .env.production.example; set a strong API_TOKEN before exposing publicly" >&2
fi
docker compose up -d --build
docker compose ps
REMOTE
)

if (( DRY_RUN )); then
    echo "[dry-run] rsync command:"
    printf '  %s\n' "$(printf '%q ' "${RSYNC_CMD[@]}")"
    echo
    echo "[dry-run] ssh command:"
    printf '  %s %s %s\n' "$SSH" "$SERVER_HOST" "<remote script below>"
    echo
    echo "--- remote script ---"
    printf '%s\n' "$REMOTE_SCRIPT"
    echo "---------------------"
    echo "[dry-run] nothing was executed."
    exit 0
fi

for bin in "$RSYNC" "$SSH"; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo "ERROR: required command not found: $bin" >&2
        exit 1
    fi
done

echo "==> rsync $PROJECT_DIR/ -> $SERVER_HOST:$REMOTE_DIR/"
"${RSYNC_CMD[@]}"

echo "==> ssh $SERVER_HOST (docker compose up -d --build)"
"$SSH" "$SERVER_HOST" "$REMOTE_SCRIPT"

echo "Deploy complete."

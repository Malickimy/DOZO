#!/usr/bin/env bash
#
# backup.sh - Snapshot the DOZO SQLite database, rotate old snapshots, and
#             optionally rsync the snapshot offsite.
#
# Runs the server's own better-sqlite3 (scripts/backup-snapshot.js) so the
# snapshot is a consistent online backup even against a WAL database that a
# live container is writing. Every snapshot is integrity-checked before the
# rotation step, so a corrupt artifact is never kept or shipped.
#
# Restore drill: see MANUAL.md ("Backups & restore").
#
# Environment overrides:
#   DB_PATH                 source database      (default: <project>/data/dozo.db)
#   BACKUP_DIR              snapshot directory   (default: <project>/data/backups)
#   BACKUP_RETENTION_DAYS   delete older than N  (default: 7; 0 disables rotation)
#   BACKUP_PREFIX           filename prefix      (default: dozo)
#   BACKUP_RSYNC_TARGET     optional rsync target (e.g. backup@host:/srv/dozo)
#   RSYNC, NODE             binary overrides
#   DRY_RUN                 "1" to print without executing
#
# Usage: backup.sh [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="${DB_PATH:-$PROJECT_DIR/data/dozo.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/data/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_PREFIX="${BACKUP_PREFIX:-dozo}"
BACKUP_RSYNC_TARGET="${BACKUP_RSYNC_TARGET:-}"
RSYNC="${RSYNC:-rsync}"
NODE="${NODE:-node}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
    cat <<EOF
Usage: backup.sh [-h|--help]

Snapshot \$DB_PATH into \$BACKUP_DIR/${BACKUP_PREFIX}-<UTC-stamp>.db, verify it,
delete snapshots older than \$BACKUP_RETENTION_DAYS days, then rsync it to
\$BACKUP_RSYNC_TARGET when set.

Environment overrides:
  DB_PATH                 source database      (default: <project>/data/dozo.db)
  BACKUP_DIR              snapshot directory   (default: <project>/data/backups)
  BACKUP_RETENTION_DAYS   delete older than N  (default: 7; 0 disables rotation)
  BACKUP_PREFIX           filename prefix      (default: dozo)
  BACKUP_RSYNC_TARGET     optional rsync target (e.g. backup@host:/srv/dozo)
  RSYNC, NODE             binary overrides
  DRY_RUN                 "1" to print without executing
EOF
}

for arg in "$@"; do
    case "$arg" in
        -h|--help) usage; exit 0 ;;
        *) echo "backup.sh: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

if [[ ! -f "$DB_PATH" ]]; then
    echo "ERROR: database not found: $DB_PATH" >&2
    exit 1
fi

if ! command -v "$NODE" >/dev/null 2>&1; then
    echo "ERROR: node not found: $NODE" >&2
    exit 1
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAPSHOT="$BACKUP_DIR/${BACKUP_PREFIX}-${STAMP}.db"

if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] mkdir -p $BACKUP_DIR"
    echo "[dry-run] $NODE $SCRIPT_DIR/backup-snapshot.js --db $DB_PATH --out $SNAPSHOT"
    echo "[dry-run] find $BACKUP_DIR -maxdepth 1 -name '${BACKUP_PREFIX}-*.db' -mtime +$BACKUP_RETENTION_DAYS -delete"
    if [[ -n "$BACKUP_RSYNC_TARGET" ]]; then
        echo "[dry-run] $RSYNC -az $SNAPSHOT $BACKUP_RSYNC_TARGET"
    fi
    exit 0
fi

mkdir -p "$BACKUP_DIR"

echo "==> snapshot $DB_PATH -> $SNAPSHOT"
"$NODE" "$SCRIPT_DIR/backup-snapshot.js" --db "$DB_PATH" --out "$SNAPSHOT"
echo "    verified: integrity_check ok"

# 7-day rotation (age-based). The just-written snapshot has a current mtime and
# is never matched. 0 disables rotation.
if [[ "$BACKUP_RETENTION_DAYS" -gt 0 ]]; then
    echo "==> rotation: removing ${BACKUP_PREFIX}-*.db older than ${BACKUP_RETENTION_DAYS}d"
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}-*.db" \
        -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
fi

# Optional offsite copy. Never --delete: the target keeps its own history.
if [[ -n "$BACKUP_RSYNC_TARGET" ]]; then
    if ! command -v "$RSYNC" >/dev/null 2>&1; then
        echo "ERROR: rsync not found: $RSYNC" >&2
        exit 1
    fi
    echo "==> rsync $SNAPSHOT -> $BACKUP_RSYNC_TARGET"
    "$RSYNC" -az "$SNAPSHOT" "$BACKUP_RSYNC_TARGET"
fi

echo "backup: OK ($SNAPSHOT)"

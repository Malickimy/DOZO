#!/usr/bin/env bash
#
# local-multiterminal.sh - fresh, seeded local server for the 3-emulator test.
#
# Resets the local SQLite DB, starts the server with SEED_DEMO=true, and prints
# the emulator-side steps. Server output goes to data/local-server.log.
#
# Usage:
#   scripts/local-multiterminal.sh start              # reset DB + start seeded server
#   scripts/local-multiterminal.sh stop               # stop the background server
#   scripts/local-multiterminal.sh restart            # stop + start
#   scripts/local-multiterminal.sh status             # health + row counts
#   scripts/local-multiterminal.sh inspect            # dump operational tables
#   scripts/local-multiterminal.sh claim CODE [LABEL] # operator claim (current flow)
#   scripts/local-multiterminal.sh reset              # delete the DB only
#
# Environment overrides: PORT (3000), DB_PATH (./data/dozo.db), API_TOKEN.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
DB_PATH="${DB_PATH:-./data/dozo.db}"
API_TOKEN="${API_TOKEN:-dev-placeholder-token}"
PID_FILE="data/local-server.pid"
LOG_FILE="data/local-server.log"
BASE_URL="http://127.0.0.1:${PORT}"

usage() {
    sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
}

server_pid() {
    [[ -f "$PID_FILE" ]] && cat "$PID_FILE" 2>/dev/null || true
}

is_running() {
    local pid
    pid="$(server_pid)"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

stop_server() {
    local pid
    pid="$(server_pid)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo "stopped server (pid $pid)"
    fi
    rm -f "$PID_FILE"
}

reset_db() {
    rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
    echo "removed local DB: $DB_PATH"
}

wait_for_health() {
    for _ in $(seq 1 50); do
        if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.2
    done
    return 1
}

start_server() {
    stop_server
    reset_db
    mkdir -p "$(dirname "$DB_PATH")"
    SEED_DEMO=true PORT="$PORT" DB_PATH="$DB_PATH" API_TOKEN="$API_TOKEN" \
        nohup node src/server.js >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    if ! wait_for_health; then
        echo "ERROR: server did not become healthy; see $LOG_FILE" >&2
        exit 1
    fi
    cat <<EOF
local server up: $BASE_URL (pid $(server_pid))
seeded: merchant demo-merchant + terminal DEMOTERM01
log:    $LOG_FILE

3-emulator setup — on each emulator, Settings -> Połączenie:
  api_base_url      = http://10.0.2.2:$PORT
  redirect_base_url = http://10.0.2.2:$PORT
  api_token         = $API_TOKEN
  merchant_id       = demo-merchant

Then per terminal: Settings -> Generate pairing code, and claim it from here:
  scripts/local-multiterminal.sh claim <CODE> "Till 1"

Give each emulator its own AVD instance so ANDROID_ID (and terminal_id) differ.
Check progress with: scripts/local-multiterminal.sh status
EOF
}

show_status() {
    curl -fsS "$BASE_URL/health" && echo
    node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true});for(const t of ['merchants','terminals','scans','pairing_codes']){let c=0;try{c=db.prepare('select count(*) c from '+t).get().c}catch(e){}console.log(t.padEnd(14)+String(c))}" "$DB_PATH"
}

inspect_db() {
    node -e "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true});for(const t of ['merchants','terminals','scans','pairing_codes']){try{console.log('== '+t);console.table(db.prepare('select * from '+t).all())}catch(e){console.log('== '+t+' (missing)')}}" "$DB_PATH"
}

claim() {
    local code="${1:-}"
    local label="${2:-}"
    if [[ -z "$code" ]]; then
        echo "usage: $0 claim CODE [LABEL]" >&2
        exit 2
    fi
    curl -fsS -X POST "$BASE_URL/api/terminals/claim" \
        -H "X-Api-Token: $API_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "{\"code\":\"$code\",\"label\":\"$label\"}"
    echo
}

case "${1:-}" in
    start)   start_server ;;
    stop)    stop_server ;;
    restart) stop_server; start_server ;;
    status)  show_status ;;
    inspect) inspect_db ;;
    claim)   shift; claim "$@" ;;
    reset)   stop_server; reset_db ;;
    -h|--help|"") usage ;;
    *) echo "unknown command: $1" >&2; usage >&2; exit 2 ;;
esac

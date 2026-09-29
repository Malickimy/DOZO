#!/usr/bin/env bash
#
# container-smoke.sh - Sprint 2 container gate (Release Board R4).
#
# Boots the per-client Compose stack (dashboard + connector) from
# DOZO-Server/docker-compose.yml, then proves the public round-trip end to end:
#
#   1. `docker compose config` renders TWO services with DISTINCT per-client
#      DB_PATH and no shared named volume (structural gate).
#   2. both containers answer GET /health.
#   3. GET /r/:terminal_id is hit twice from one client; the connector debounces
#      the repeat and forwards a single event.
#   4. GET /api/merchants/:id/scans reports EXACTLY ONE scan for that terminal.
#   5. re-POSTing the same event to the dashboard ingest returns "duplicate" and
#      does not add a row (event_id idempotency).
#   6. the dashboard serves the built SPA index.html, including on a deep link.
#
# Requires Docker + docker compose, curl, and node. CI runs it from
# .github/workflows/container.yml after the SPA is staged at DOZO-Server/public.
# The stack is torn down (and its volumes removed) on exit.
#
# Environment overrides:
#   COMPOSE_FILE            path to the compose file (default DOZO-Server/docker-compose.yml)
#   PROJECT_NAME            compose project name (default dozo-container-smoke)
#   DASHBOARD_URL           dashboard base URL (default http://localhost:3000)
#   CONNECTOR_URL           connector base URL (default http://localhost:3001)
#   MERCHANT_ID             seeded merchant (default demo-merchant)
#   TERMINAL_ID             seeded terminal (default DEMOTERM01)
#   API_TOKEN               operator token written to the smoke .env
#   CONNECTOR_SECRET        connector<->dashboard secret written to the smoke .env
#   HEALTH_TIMEOUT_SECONDS  boot wait (default 90)
#   INGEST_TIMEOUT_SECONDS  forward wait (default 30)
#   CURL                    curl binary (default curl)
#
# Usage: container-smoke.sh [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/DOZO-Server"

COMPOSE_FILE="${COMPOSE_FILE:-$SERVER_DIR/docker-compose.yml}"
PROJECT_NAME="${PROJECT_NAME:-dozo-container-smoke}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
CONNECTOR_URL="${CONNECTOR_URL:-http://localhost:3001}"
MERCHANT_ID="${MERCHANT_ID:-demo-merchant}"
TERMINAL_ID="${TERMINAL_ID:-DEMOTERM01}"
API_TOKEN="${API_TOKEN:-container-smoke-token}"
CONNECTOR_SECRET="${CONNECTOR_SECRET:-container-smoke-connector-secret}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
INGEST_TIMEOUT_SECONDS="${INGEST_TIMEOUT_SECONDS:-30}"
CURL="${CURL:-curl}"
USER_AGENT="dozo-container-smoke/1.0"

usage() {
  cat <<EOF
Usage: container-smoke.sh [-h|--help]

Boot the connector + dashboard from compose and assert the /r/:id round-trip
delivers exactly one deduped scan and that the dashboard serves the SPA.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    *) echo "container-smoke.sh: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

for bin in docker "$CURL" node; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $bin" >&2
    exit 1
  fi
done

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

fail() {
  echo "ERROR: $*" >&2
  echo "--- compose ps ---" >&2
  compose ps >&2 || true
  echo "--- dashboard logs ---" >&2
  compose logs dashboard >&2 || true
  echo "--- connector logs ---" >&2
  compose logs connector >&2 || true
  exit 1
}

# The stack reads its runtime config from DOZO-Server/.env (see the compose
# env_file). Back up any real file and restore it on exit; never leave the
# generated secrets behind.
ENV_FILE="$SERVER_DIR/.env"
ENV_BACKUP=""
if [[ -f "$ENV_FILE" ]]; then
  ENV_BACKUP="$(mktemp)"
  cp "$ENV_FILE" "$ENV_BACKUP"
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  local code=$?
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  if [[ -n "$ENV_BACKUP" ]]; then
    cp "$ENV_BACKUP" "$ENV_FILE"
    rm -f "$ENV_BACKUP"
  else
    rm -f "$ENV_FILE"
  fi
  rm -rf "$TMP_DIR"
  exit "$code"
}
trap cleanup EXIT

umask 077
cat > "$ENV_FILE" <<EOF
SEED_DEMO=true
API_TOKEN=$API_TOKEN
DASHBOARD_CONNECTOR_SECRET=$CONNECTOR_SECRET
DASHBOARD_ORIGIN=*
DEBOUNCE_SECONDS=120
TRUST_PROXY=false
EOF

if [[ ! -f "$SERVER_DIR/public/index.html" ]]; then
  echo "ERROR: $SERVER_DIR/public/index.html is missing." >&2
  echo "Stage the built SPA first (see .github/workflows/container.yml): build DOZO-Dashboard, then copy dist to DOZO-Server/public." >&2
  exit 1
fi

echo "==> structural: docker compose config"
CONFIG_JSON="$TMP_DIR/compose.json"
compose config --format json > "$CONFIG_JSON"
COMPOSE_JSON="$CONFIG_JSON" node --input-type=module <<'NODE' || exit 1
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(process.env.COMPOSE_JSON, 'utf8'));
const services = config.services ?? {};
const names = Object.keys(services).sort();
const problem = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

if (names.join(',') !== 'connector,dashboard') {
  problem(`expected services connector+dashboard, got ${names.join(',') || '(none)'}`);
}

const environmentOf = (service) => {
  const env = service.environment ?? {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((entry) => {
        const index = entry.indexOf('=');
        return index < 0 ? [entry, ''] : [entry.slice(0, index), entry.slice(index + 1)];
      }),
    );
  }
  return env;
};

const dbPaths = ['dashboard', 'connector'].map((name) => String(environmentOf(services[name]).DB_PATH));
if (dbPaths.some((value) => !value || value === 'undefined')) {
  problem(`each service must set DB_PATH, got ${dbPaths.join(', ')}`);
}
if (new Set(dbPaths).size !== 2) {
  problem(`DB_PATH must be distinct per client, got ${dbPaths.join(', ')}`);
}

const volumeSourcesOf = (service) =>
  (service.volumes ?? []).map((volume) =>
    typeof volume === 'string' ? volume.split(':')[0] : volume.source,
  );
const dashboardVolumes = volumeSourcesOf(services.dashboard);
const connectorVolumes = volumeSourcesOf(services.connector);
const shared = dashboardVolumes.filter((name) => connectorVolumes.includes(name));
if (shared.length > 0) {
  problem(`dashboard and connector share volume(s): ${shared.join(', ')}`);
}
console.log(`    ok: DB_PATH ${dbPaths.join(' | ')}; volumes ${dashboardVolumes.join(',')} | ${connectorVolumes.join(',')}`);
NODE

wait_for_url() {
  local url="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  until "$CURL" -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      fail "timed out after ${HEALTH_TIMEOUT_SECONDS}s waiting for $url"
    fi
    sleep 2
  done
}

echo "==> docker compose up -d --build"
compose up -d --build

echo "==> wait for /health"
wait_for_url "$DASHBOARD_URL/health"
wait_for_url "$CONNECTOR_URL/health"
echo "    ok: both containers healthy"

echo "==> GET $CONNECTOR_URL/r/$TERMINAL_ID (x2, same client)"
for hit in 1 2; do
  status="$("$CURL" -sS -o /dev/null -w '%{http_code}' -H "User-Agent: $USER_AGENT" \
    "$CONNECTOR_URL/r/$TERMINAL_ID")"
  echo "    hit $hit -> HTTP $status"
  if [[ "$status" != "302" ]]; then
    fail "expected 302 from /r/$TERMINAL_ID, got $status"
  fi
done

SCANS_URL="$DASHBOARD_URL/api/merchants/$MERCHANT_ID/scans?terminal_id=$TERMINAL_ID"

read_scans() {
  "$CURL" -fsS -H "X-Api-Token: $API_TOKEN" "$SCANS_URL"
}

scan_count() {
  node --input-type=module -e '
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const rows = JSON.parse(raw);
    process.stdout.write(String(Array.isArray(rows) ? rows.length : -1));
  '
}

echo "==> wait for the forwarded scan on $SCANS_URL"
count=0
deadline=$((SECONDS + INGEST_TIMEOUT_SECONDS))
while :; do
  count="$(read_scans | scan_count 2>/dev/null || echo 0)"
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  (( count >= 1 )) && break
  if (( SECONDS >= deadline )); then
    fail "dashboard recorded no forwarded scan within ${INGEST_TIMEOUT_SECONDS}s"
  fi
  sleep 1
done

# Let the forwarder settle, then require EXACTLY one row: the second /r hit must
# have been debounced, not written.
settled="$count"
for _ in 1 2 3; do
  sleep 1
  observed="$(read_scans | scan_count)"
  [[ "$observed" == "$settled" ]] && break
  settled="$observed"
done
if [[ "$settled" != "1" ]]; then
  fail "expected exactly 1 deduped scan, got $settled"
fi
echo "    ok: exactly 1 scan after two /r hits (debounced)"

echo "==> re-ingest the same event_id -> duplicate"
meta="$(read_scans | node --input-type=module -e '
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const first = JSON.parse(raw)[0] ?? {};
  process.stdout.write(`${first.event_id ?? ""}\t${first.scanned_at ?? ""}\t${first.terminal_id ?? ""}`);
')"
IFS=$'\t' read -r EVENT_ID SCANNED_AT SCAN_TERMINAL <<< "$meta"
if [[ -z "$EVENT_ID" || -z "$SCANNED_AT" || -z "$SCAN_TERMINAL" ]]; then
  fail "could not read event_id/scanned_at/terminal_id from the scan row"
fi

DUP_PAYLOAD="$(MERCHANT_ID="$MERCHANT_ID" node --input-type=module -e '
  const [eventId, terminalId, scannedAt] = process.argv.slice(1);
  process.stdout.write(
    JSON.stringify({
      event_id: eventId,
      terminal_id: terminalId,
      merchant_id: process.env.MERCHANT_ID,
      scanned_at: scannedAt,
      user_agent: "dozo-container-smoke/1.0",
    }),
  );
' "$EVENT_ID" "$SCAN_TERMINAL" "$SCANNED_AT")"

DUP_BODY="$TMP_DIR/dup.json"
DUP_STATUS="$("$CURL" -sS -o "$DUP_BODY" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "X-Connector-Secret: $CONNECTOR_SECRET" \
  --data "$DUP_PAYLOAD" "$DASHBOARD_URL/scans")"
if [[ "$DUP_STATUS" != "202" ]]; then
  fail "expected 202 from the duplicate ingest, got $DUP_STATUS: $(cat "$DUP_BODY")"
fi
if ! grep -q '"duplicate"' "$DUP_BODY"; then
  fail "expected {\"status\":\"duplicate\"}, got $(cat "$DUP_BODY")"
fi
after_dup="$(read_scans | scan_count)"
if [[ "$after_dup" != "1" ]]; then
  fail "duplicate ingest changed the scan count to $after_dup"
fi
echo "    ok: same event_id is a duplicate and adds no row"

echo "==> dashboard serves the SPA"
SPA_BODY="$TMP_DIR/index.html"
SPA_STATUS="$("$CURL" -sS -o "$SPA_BODY" -w '%{http_code}' -H 'Accept: text/html' "$DASHBOARD_URL/")"
if [[ "$SPA_STATUS" != "200" ]]; then
  fail "expected 200 for the dashboard root, got $SPA_STATUS"
fi
if ! grep -q 'id="root"' "$SPA_BODY"; then
  fail "dashboard root did not return the SPA shell"
fi

DEEP_BODY="$TMP_DIR/deep.html"
DEEP_STATUS="$("$CURL" -sS -o "$DEEP_BODY" -w '%{http_code}' -H 'Accept: text/html' \
  "$DASHBOARD_URL/merchants/$MERCHANT_ID")"
if [[ "$DEEP_STATUS" != "200" ]] || ! grep -q 'id="root"' "$DEEP_BODY"; then
  fail "SPA deep-link fallback failed (HTTP $DEEP_STATUS)"
fi
echo "    ok: index.html served at / and on a deep link"

echo
echo "CONTAINER SMOKE: OK"

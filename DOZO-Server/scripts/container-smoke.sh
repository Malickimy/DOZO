#!/usr/bin/env bash
#
# container-smoke.sh - one-service container gate (Release Board R4 / issue #90).
#
# Boots the single `server` service from DOZO-Server/docker-compose.yml, then
# proves the one-origin round-trip end to end:
#
#   1. `docker compose config` renders ONE service named `server` on ONE named
#      datastore volume mounted at /data with a single DB_PATH under /data/
#      (structural gate: no connector service, spool, ingest URL or depends_on).
#   2. the single origin answers GET /health.
#   3. GET /r/:terminal_id is hit twice from one client; the debounce records
#      exactly one scan and still serves the 302 redirect.
#   4. GET /api/merchants/:id/scans reports EXACTLY ONE scan for that terminal.
#   5. re-POSTing the same event_id to POST /scans returns "duplicate" and does
#      not add a row (event_id idempotency).
#   6. the same origin serves the marketing homepage at / and the panel SPA
#      shell at /panel/ (id="root"), including on a /panel/ deep link.
#   7. no connector spool file is produced on the datastore volume.
#
# Requires Docker + docker compose, curl, and node. CI runs it from
# .github/workflows/container.yml after the SPA is staged at DOZO-Server/public.
# The stack is torn down (and its volumes removed) on exit.
#
# Environment overrides:
#   COMPOSE_FILE            path to the compose file (default DOZO-Server/docker-compose.yml)
#   PROJECT_NAME            compose project name (default dozo-container-smoke)
#   SERVER_URL              unified base URL (default http://localhost:3000)
#   MERCHANT_ID             seeded merchant (default demo-merchant)
#   TERMINAL_ID             seeded terminal (default DEMOTERM01)
#   API_TOKEN               operator token written to the smoke .env
#   CONNECTOR_SECRET        scan-ingest secret written to the smoke .env
#   HEALTH_TIMEOUT_SECONDS  boot wait (default 90)
#   SCAN_TIMEOUT_SECONDS    scan-visibility wait (default 30)
#   CURL                    curl binary (default curl)
#
# Usage: container-smoke.sh [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/DOZO-Server"

COMPOSE_FILE="${COMPOSE_FILE:-$SERVER_DIR/docker-compose.yml}"
PROJECT_NAME="${PROJECT_NAME:-dozo-container-smoke}"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
MERCHANT_ID="${MERCHANT_ID:-demo-merchant}"
TERMINAL_ID="${TERMINAL_ID:-DEMOTERM01}"
API_TOKEN="${API_TOKEN:-container-smoke-token}"
CONNECTOR_SECRET="${CONNECTOR_SECRET:-container-smoke-connector-secret}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
# Accept the legacy INGEST_TIMEOUT_SECONDS name so existing overrides keep working.
SCAN_TIMEOUT_SECONDS="${SCAN_TIMEOUT_SECONDS:-${INGEST_TIMEOUT_SECONDS:-30}}"
CURL="${CURL:-curl}"
USER_AGENT="dozo-container-smoke/1.0"

usage() {
  cat <<EOF
Usage: container-smoke.sh [-h|--help]

Boot the single `server` service from compose and assert the one-origin
round-trip: /r/:id twice -> exactly one deduped scan on /api/*, POST /scans
idempotency, the SPA, and no connector spool file.
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
  echo "--- server logs ---" >&2
  compose logs server >&2 || true
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

echo "==> structural: docker compose config (one service, one datastore volume)"
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

if (names.join(',') !== 'server') {
  problem(`expected exactly one service named server, got ${names.join(',') || '(none)'}`);
}

const server = services.server;
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

const env = environmentOf(server);
const dbPath = String(env.DB_PATH ?? '');
if (!/^\/data\//.test(dbPath)) {
  problem(`DB_PATH must live on the datastore volume under /data/, got ${dbPath || '(unset)'}`);
}
if ('CONNECTOR_SPOOL_PATH' in env) {
  problem('CONNECTOR_SPOOL_PATH must not be set on the unified service (no spool)');
}
if ('DASHBOARD_INGEST_URL' in env) {
  problem('DASHBOARD_INGEST_URL must not be set on the unified service (no forwarding)');
}
if (server.depends_on && Object.keys(server.depends_on).length > 0) {
  problem(`the single service must not have depends_on, got ${JSON.stringify(server.depends_on)}`);
}

const volumeSourcesOf = (service) =>
  (service.volumes ?? []).map((volume) =>
    typeof volume === 'string' ? volume.split(':')[0] : volume.source,
  );
const volumeTargetsOf = (service) =>
  (service.volumes ?? []).map((volume) =>
    typeof volume === 'string' ? volume.split(':')[1] : volume.target,
  );
const sources = volumeSourcesOf(server);
const targets = volumeTargetsOf(server);
const topVolumes = Object.keys(config.volumes ?? {});
if (
  sources.length !== 1 ||
  topVolumes.length !== 1 ||
  sources[0] !== 'dozo-server-data' ||
  topVolumes[0] !== 'dozo-server-data'
) {
  problem(
    `expected exactly one datastore volume dozo-server-data, got mounts=${sources.join(',') || '(none)'} top=${topVolumes.join(',') || '(none)'}`,
  );
}
if (targets[0] !== '/data') {
  problem(`the datastore volume must mount at /data, got ${targets.join(',') || '(none)'}`);
}

const published = (server.ports ?? []).map((port) =>
  typeof port === 'string' ? port : `${port.published ?? ''}:${port.target ?? ''}`,
);
if (published.some((mapping) => mapping.split(':')[0] === '3001')) {
  problem(`the connector port 3001 must not be published, got ${published.join(', ')}`);
}

const command = Array.isArray(server.command)
  ? server.command.join(' ')
  : String(server.command ?? '');
if (!/src\/server\.js/.test(command)) {
  problem(`the service command must run src/server.js, got ${command || '(none)'}`);
}

console.log(`    ok: service server; DB_PATH ${dbPath}; volume ${sources[0]} -> ${targets[0]}`);
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

echo "==> wait for /health on $SERVER_URL"
wait_for_url "$SERVER_URL/health"
echo "    ok: the single service is healthy on $SERVER_URL"

echo "==> GET $SERVER_URL/r/$TERMINAL_ID (x2, same client)"
for hit in 1 2; do
  status="$("$CURL" -sS -o /dev/null -w '%{http_code}' -H "User-Agent: $USER_AGENT" \
    "$SERVER_URL/r/$TERMINAL_ID")"
  echo "    hit $hit -> HTTP $status"
  if [[ "$status" != "302" ]]; then
    fail "expected 302 from /r/$TERMINAL_ID, got $status"
  fi
done

SCANS_URL="$SERVER_URL/api/merchants/$MERCHANT_ID/scans?terminal_id=$TERMINAL_ID"

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

echo "==> wait for the scan on $SCANS_URL"
count=0
deadline=$((SECONDS + SCAN_TIMEOUT_SECONDS))
while :; do
  count="$(read_scans | scan_count 2>/dev/null || echo 0)"
  [[ "$count" =~ ^[0-9]+$ ]] || count=0
  (( count >= 1 )) && break
  if (( SECONDS >= deadline )); then
    fail "the service recorded no scan within ${SCAN_TIMEOUT_SECONDS}s"
  fi
  sleep 1
done

# Require EXACTLY one row: the second /r hit must have been debounced, not written.
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

echo "==> re-POST the same event_id to POST /scans -> duplicate"
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
  --data "$DUP_PAYLOAD" "$SERVER_URL/scans")"
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

echo "==> the single origin serves the homepage and the panel SPA"
HOME_BODY="$TMP_DIR/home.html"
HOME_STATUS="$("$CURL" -sS -o "$HOME_BODY" -w '%{http_code}' -H 'Accept: text/html' "$SERVER_URL/")"
if [[ "$HOME_STATUS" != "200" ]]; then
  fail "expected 200 for the homepage, got $HOME_STATUS"
fi
if ! grep -q 'data-view="home"' "$HOME_BODY"; then
  fail "the root did not return the marketing homepage"
fi

PANEL_BODY="$TMP_DIR/panel.html"
PANEL_STATUS="$("$CURL" -sS -o "$PANEL_BODY" -w '%{http_code}' -H 'Accept: text/html' "$SERVER_URL/panel/")"
if [[ "$PANEL_STATUS" != "200" ]] || ! grep -q 'id="root"' "$PANEL_BODY"; then
  fail "panel SPA shell not served at /panel/ (HTTP $PANEL_STATUS)"
fi

DEEP_BODY="$TMP_DIR/deep.html"
DEEP_STATUS="$("$CURL" -sS -o "$DEEP_BODY" -w '%{http_code}' -H 'Accept: text/html' \
  "$SERVER_URL/panel/merchants/$MERCHANT_ID")"
if [[ "$DEEP_STATUS" != "200" ]] || ! grep -q 'id="root"' "$DEEP_BODY"; then
  fail "panel SPA deep-link fallback failed (HTTP $DEEP_STATUS)"
fi

LEGACY_STATUS="$("$CURL" -sS -o /dev/null -w '%{http_code}' -H 'Accept: text/html' \
  "$SERVER_URL/merchants/$MERCHANT_ID")"
if [[ "$LEGACY_STATUS" != "302" ]]; then
  fail "legacy /merchants/:id should redirect to /panel/ (HTTP $LEGACY_STATUS)"
fi
echo "    ok: homepage at /, panel shell at /panel/ and /panel/merchants/:id, legacy /merchants/:id redirects"

echo "==> assert no connector spool file is produced"
if ! compose exec -T server test -f /data/dozo.db; then
  fail "expected the unified SQLite datastore at /data/dozo.db"
fi
SPOOL_HITS="$(compose exec -T server sh -c 'find /data -type f \( -name "*spool*" -o -name "*.jsonl" \) 2>/dev/null' || true)"
if [[ -n "$SPOOL_HITS" ]]; then
  fail "unexpected spool file(s) on the datastore volume: $SPOOL_HITS"
fi
echo "    ok: /data/dozo.db exists and no spool file was written"

echo
echo "CONTAINER SMOKE: OK"

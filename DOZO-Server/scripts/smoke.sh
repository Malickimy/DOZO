#!/usr/bin/env bash
#
# smoke.sh - Smoke-test a running DOZO redirect server over HTTP.
#
# Sequence:
#   1. GET  /health
#   2. POST /api/terminals/register   (needs the demo merchant to exist)
#   3. GET  /api/terminals/pair-status/{code}
#
# Prints the HTTP status and body of each call and exits non-zero if any check
# fails. Seed the server first (SEED_DEMO=true on boot, or `npm run seed`) so
# the demo merchant exists.
#
# Environment overrides:
#   BASE_URL       server base URL  (default: http://130.162.185.144:3000)
#   API_TOKEN      shared API token (default: dev-placeholder-token)
#   MERCHANT_ID    seeded merchant  (default: demo-merchant)
#   DEVICE_SERIAL  sample serial    (default: SMOKE-SN-0001)
#   TERMINAL_ID    explicit id      (default: SMOKETERM01)
#   CURL           curl binary      (default: curl)
#
# Usage: smoke.sh [-h|--help]

set -euo pipefail

BASE_URL="${BASE_URL:-http://130.162.185.144:3000}"
API_TOKEN="${API_TOKEN:-dev-placeholder-token}"
MERCHANT_ID="${MERCHANT_ID:-demo-merchant}"
DEVICE_SERIAL="${DEVICE_SERIAL:-SMOKE-SN-0001}"
TERMINAL_ID="${TERMINAL_ID:-SMOKETERM01}"
CURL="${CURL:-curl}"

usage() {
    cat <<EOF
Usage: smoke.sh [-h|--help]

Curl \$BASE_URL/health, register a pairing code, then read its pair-status.
Exits non-zero on the first failing check.

Environment overrides:
  BASE_URL       server base URL  (default: http://130.162.185.144:3000)
  API_TOKEN      shared API token (default: dev-placeholder-token)
  MERCHANT_ID    seeded merchant  (default: demo-merchant)
  DEVICE_SERIAL  sample serial    (default: SMOKE-SN-0001)
  TERMINAL_ID    explicit id      (default: SMOKETERM01)
  CURL           curl binary      (default: curl)
EOF
}

for arg in "$@"; do
    case "$arg" in
        -h|--help) usage; exit 0 ;;
        *) echo "smoke.sh: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

if ! command -v "$CURL" >/dev/null 2>&1; then
    echo "ERROR: curl not found: $CURL" >&2
    exit 1
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# request <METHOD> <PATH> [JSON_BODY] -> prints HTTP status, body to $BODY_FILE
request() {
    local method="$1" path="$2" data="${3:-}" status
    local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method")
    if [[ -n "$API_TOKEN" ]]; then
        args+=(-H "X-Api-Token: $API_TOKEN")
    fi
    if [[ -n "$data" ]]; then
        args+=(-H 'Content-Type: application/json' --data "$data")
    fi
    status="$("$CURL" "${args[@]}" "$BASE_URL$path")" || return 1
    printf '%s' "$status"
}

fail=0

echo "==> GET $BASE_URL/health"
status="$(request GET /health)" || { echo "ERROR: curl failed for /health" >&2; exit 1; }
echo "HTTP $status"
cat "$BODY_FILE"; echo
if [[ "$status" != "200" ]]; then
    fail=1
    echo "ERROR: expected 200 from /health" >&2
fi

register_body="$(printf '{"device_serial":"%s","merchant_id":"%s","terminal_id":"%s"}' \
    "$DEVICE_SERIAL" "$MERCHANT_ID" "$TERMINAL_ID")"

echo
echo "==> POST $BASE_URL/api/terminals/register"
status="$(request POST /api/terminals/register "$register_body")" \
    || { echo "ERROR: curl failed for /api/terminals/register" >&2; exit 1; }
echo "HTTP $status"
cat "$BODY_FILE"; echo
if [[ "$status" != "201" ]]; then
    fail=1
    echo "ERROR: expected 201 from register (is merchant '$MERCHANT_ID' seeded? try SEED_DEMO=true or npm run seed)" >&2
fi

code="$(sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BODY_FILE")"
if [[ -z "$code" ]]; then
    fail=1
    echo "ERROR: could not extract a pairing code from the register response" >&2
else
    echo
    echo "==> GET $BASE_URL/api/terminals/pair-status/$code"
    status="$(request GET "/api/terminals/pair-status/$code")" \
        || { echo "ERROR: curl failed for pair-status" >&2; exit 1; }
    echo "HTTP $status"
    cat "$BODY_FILE"; echo
    if [[ "$status" != "202" && "$status" != "200" ]]; then
        fail=1
        echo "ERROR: expected 202 (pending) or 200 (claimed) from pair-status" >&2
    fi
fi

echo
if (( fail )); then
    echo "SMOKE: FAILED" >&2
    exit 1
fi
echo "SMOKE: OK"

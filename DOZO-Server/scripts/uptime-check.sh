#!/usr/bin/env bash
#
# uptime-check.sh - external liveness probe for GET /health.
#
# The contract keeps /health out of the rate limiter precisely so an external
# uptime monitor can poll it; this is that poller. Point a cron/systemd timer or
# your uptime service's webhook at it and treat a non-zero exit as an alert.
#
# `/health` answers `200 {"status":"ok"}`. A non-2xx, a wrong body, a timeout or
# a connection error all fail the check.
#
# Environment overrides:
#   HEALTH_URL      full health URL     (default: $BASE_URL/health)
#   BASE_URL        server base URL     (default: http://127.0.0.1:3000)
#   RETRIES         attempts            (default: 3)
#   TIMEOUT_SECONDS per-request timeout (default: 5)
#   CURL            curl binary         (default: curl)
#
# Exit codes: 0 healthy, 1 unhealthy, 2 usage error.

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${HEALTH_URL:-${BASE_URL%/}/health}"
RETRIES="${RETRIES:-3}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-5}"
CURL="${CURL:-curl}"

usage() {
    cat <<EOF
Usage: uptime-check.sh [-h|--help]

GET \$HEALTH_URL until it returns 200 {"status":"ok"} or \$RETRIES are exhausted.
Exits 0 when healthy, 1 otherwise.

Environment overrides:
  HEALTH_URL       full health URL     (default: \$BASE_URL/health)
  BASE_URL         server base URL     (default: http://127.0.0.1:3000)
  RETRIES          attempts            (default: 3)
  TIMEOUT_SECONDS  per-request timeout (default: 5)
  CURL             curl binary         (default: curl)
EOF
}

for arg in "$@"; do
    case "$arg" in
        -h|--help) usage; exit 0 ;;
        *) echo "uptime-check.sh: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

if ! command -v "$CURL" >/dev/null 2>&1; then
    echo "ERROR: curl not found: $CURL" >&2
    exit 1
fi

attempt=1
while (( attempt <= RETRIES )); do
    body="$("$CURL" -fsS --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" 2>/dev/null || true)"
    if [[ "$body" == *'"status":"ok"'* ]]; then
        echo "OK: $HEALTH_URL -> $body"
        exit 0
    fi
    echo "attempt $attempt/$RETRIES: $HEALTH_URL not healthy"
    attempt=$((attempt + 1))
    if (( attempt <= RETRIES )); then
        sleep 1
    fi
done

echo "FAIL: $HEALTH_URL did not return status ok" >&2
exit 1

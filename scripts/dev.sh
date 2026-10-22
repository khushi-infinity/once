#!/usr/bin/env bash
# Start ONCE locally: FastAPI (HTTP API + mounted MCP at /mcp) and Next.js.
#
#   ./scripts/dev.sh                 # live AWS mode (needs the AWS profile)
#   APP_MODE=mock ./scripts/dev.sh   # offline mode with seeded demo skills
#
# The MCP server is mounted in the FastAPI process, so /alexa works in both
# modes and shares the same store/session state. A standalone MCP process is
# only needed for the independent `scripts/mcp_smoke.py` check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_MODE="${APP_MODE:-live}"
AWS_PROFILE="${AWS_PROFILE:-once-local}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

echo "ONCE dev · APP_MODE=$APP_MODE · AWS_PROFILE=${AWS_PROFILE:-<default chain>}"
echo "API + MCP: http://localhost:${API_PORT}  (MCP at /mcp)"
echo "Web:       http://localhost:${WEB_PORT}  (Alexa+ experience at /alexa)"
echo

(
  cd "$ROOT/backend"
  APP_MODE="$APP_MODE" AWS_PROFILE="$AWS_PROFILE" \
    uv run uvicorn app.main:app --port "$API_PORT"
) &
pids+=("$!")

(
  cd "$ROOT/frontend"
  BACKEND_URL="http://localhost:${API_PORT}" MCP_URL="http://localhost:${API_PORT}" \
    npm run dev -- --port "$WEB_PORT"
) &
pids+=("$!")

wait

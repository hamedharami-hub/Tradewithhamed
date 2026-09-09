#!/usr/bin/env bash
set -euo pipefail

PORT="${BROWSER_SMOKE_PORT:-3101}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="/tmp/tradewithhamed-browser-smoke-server.log"
DOM_FILE="/tmp/tradewithhamed-browser-smoke-dom.html"

./node_modules/.bin/next dev --webpack -p "$PORT" -H 127.0.0.1 >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl --silent --fail "$BASE_URL/" > /dev/null; then
    break
  fi
  sleep 0.5
done

curl --silent --fail "$BASE_URL/" > /dev/null
chromium --headless --no-sandbox --disable-dev-shm-usage --disable-gpu --dump-dom "$BASE_URL/" > "$DOM_FILE" 2>/tmp/tradewithhamed-browser-smoke-chromium.log

grep -q '<main' "$DOM_FILE"
grep -q 'Hamed Trading Lab' "$DOM_FILE"
echo "Browser smoke test passed: ${BASE_URL}"

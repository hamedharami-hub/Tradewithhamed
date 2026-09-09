#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${WEBGPU_BENCHMARK_PORT:-3105}"
DEBUG_PORT="${WEBGPU_BENCHMARK_DEBUG_PORT:-9225}"
REPORT_DIR="${STAGE6_REPORT_DIR:-$ROOT/data/runs/stage6-webgpu-ctrader}"
RUN_CTRADER="${RUN_CTRADER:-0}"
mkdir -p "$REPORT_DIR"
cd "$ROOT"

fail() { echo "[stage6] BLOCKED: $*" >&2; exit 2; }
command -v chromium >/dev/null 2>&1 || fail "Chromium is required on the GPU host."
node -e "const fs=require('fs'); if(!fs.existsSync('node_modules/@mlc-ai/web-llm')) process.exit(1)" || fail "npm install must be completed first."

if [[ "${REQUIRE_CTRADER:-0}" == "1" ]]; then
  [[ -n "${CTRADER_CLIENT_ID:-}" ]] || fail "CTRADER_CLIENT_ID is missing."
  [[ -n "${CTRADER_ACCESS_TOKEN:-}" ]] || fail "CTRADER_ACCESS_TOKEN is missing."
  [[ -n "${CTRADER_ACCOUNT_ID:-}" ]] || fail "CTRADER_ACCOUNT_ID is missing."
  [[ "${CTRADER_ENVIRONMENT:-demo}" == "demo" ]] || fail "Only CTRADER_ENVIRONMENT=demo is allowed by this script."
fi

GPU_DIAG="$REPORT_DIR/gpu-diagnostics.json"
chromium --headless=new --no-sandbox --disable-dev-shm-usage --enable-unsafe-webgpu --enable-features=Vulkan,UseSkiaRenderer --dump-dom 'data:text/html,<script>document.write(JSON.stringify({webgpu:!!navigator.gpu,userAgent:navigator.userAgent}))</script>' > "$GPU_DIAG" 2>/dev/null || true
if ! grep -q '"webgpu":true' "$GPU_DIAG"; then
  fail "navigator.gpu is false. Run this script on a real GPU host with WebGPU enabled. Diagnostics: $GPU_DIAG"
fi

SERVER_LOG="$REPORT_DIR/next.log"
WEBGPU_RESULT="$REPORT_DIR/webgpu-result.json"
node scripts/prepare-webgpu-gbpusd-candidates.ts \
  data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json \
  public/webgpu-candidates-gbpusd.json > "$REPORT_DIR/candidate-preparation.log" 2>&1

npm run dev -- --port "$PORT" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
MONITOR_PID=""
cleanup() { kill "$MONITOR_PID" "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:${PORT}/webgpu-benchmark" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:${PORT}/webgpu-benchmark" >/dev/null || fail "Next.js benchmark route did not become ready. See $SERVER_LOG"

if [[ "$RUN_CTRADER" == "1" ]]; then
  [[ -n "${CTRADER_CLIENT_ID:-}" && -n "${CTRADER_ACCESS_TOKEN:-}" && -n "${CTRADER_ACCOUNT_ID:-}" ]] || fail "cTrader credentials are required when RUN_CTRADER=1."
  MONITOR_ANALYST_PROVIDER="${MONITOR_ANALYST_PROVIDER:-DETERMINISTIC}" \
  MONITOR_REPORT="$REPORT_DIR/ctrader-paper-events.jsonl" \
  npm run research:monitor:hybrid > "$REPORT_DIR/ctrader-monitor.log" 2>&1 &
  MONITOR_PID=$!
fi

WEBGPU_BENCHMARK_PORT="$PORT" WEBGPU_BENCHMARK_DEBUG_PORT="$DEBUG_PORT" \
  node scripts/browser-webgpu-gbpusd-oos.mjs > "$WEBGPU_RESULT" 2>&1 || {
    cp "$WEBGPU_RESULT" "$REPORT_DIR/webgpu-result-blocked.json" 2>/dev/null || true
    fail "WebLLM browser benchmark did not PASS. See $WEBGPU_RESULT"
  }

printf '{"status":"PASS","brokerWrites":false,"gpuDiagnostics":"%s","webgpuResult":"%s","ctraderMonitor":"%s"}\n' "$GPU_DIAG" "$WEBGPU_RESULT" "$([[ "$RUN_CTRADER" == "1" ]] && echo started || echo disabled)" | tee "$REPORT_DIR/stage6-deployment-result.json"

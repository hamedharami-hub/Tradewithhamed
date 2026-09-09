#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${STAGE7_REPORT_DIR:-$ROOT/data/runs/stage7-gpu-30trades}"
MIN_TRADES="${STAGE7_MIN_TRADES:-30}"
MODES="${STAGE7_MODES:-DETERMINISTIC,ONLINE,HYBRID,WEBLLM}"
mkdir -p "$REPORT_DIR"
cd "$ROOT"
fail(){ echo "[stage7] BLOCKED: $*" >&2; exit 2; }
[[ "$MIN_TRADES" =~ ^[0-9]+$ && "$MIN_TRADES" -ge 30 ]] || fail "STAGE7_MIN_TRADES must be at least 30."
[[ "${CTRADER_ENVIRONMENT:-demo}" == "demo" ]] || fail "Only cTrader Demo is allowed."
[[ -n "${CTRADER_CLIENT_ID:-}" && -n "${CTRADER_ACCESS_TOKEN:-}" && -n "${CTRADER_ACCOUNT_ID:-}" ]] || fail "Set cTrader Demo credentials first."
command -v chromium >/dev/null 2>&1 || fail "Chromium is required on the GPU host."

export REQUIRE_CTRADER=1
export RUN_CTRADER=1
export STAGE6_REPORT_DIR="$REPORT_DIR/stage6"
export MONITOR_SYMBOLS="${MONITOR_SYMBOLS:-GBPUSD}"
export MONITOR_TIMEFRAME="${MONITOR_TIMEFRAME:-5M}"
export MONITOR_ANALYST_PROVIDER="DETERMINISTIC"

bash scripts/deploy-stage6-webgpu-ctrader.sh
[[ -s "$REPORT_DIR/stage6/webgpu-result.json" ]] || fail "Missing real WebLLM browser result."
if ! grep -q '"status"[[:space:]]*:[[:space:]]*"PASS"' "$REPORT_DIR/stage6/webgpu-result.json"; then fail "WebLLM did not PASS on real GPU hardware."; fi

BENCHMARK="$REPORT_DIR/provider-benchmark.json"
if [[ -n "${STAGE7_BENCHMARK_INPUT:-}" ]]; then cp "$STAGE7_BENCHMARK_INPUT" "$BENCHMARK"; else fail "Set STAGE7_BENCHMARK_INPUT to the completed live/paper provider benchmark artifact."; fi

node - "$BENCHMARK" "$MIN_TRADES" "$MODES" <<'NODE'
const fs=require('fs'); const [,,file,minText,modesText]=process.argv; const min=Number(minText); const modes=modesText.split(','); const d=JSON.parse(fs.readFileSync(file,'utf8')); const failures=[]; for(const mode of modes){const r=d.results?.[mode]||d.runs?.[mode]||{}; const n=Number(r.totalTrades ?? r.tradeCount ?? r.summary?.totalTrades ?? 0); if(n<min) failures.push(`${mode}:${n}<${min}`); } if(failures.length){ console.error(`[stage7] TRADE_GATE_FAILED ${failures.join(', ')}`); process.exit(3); } console.log(JSON.stringify({status:'PASS',minTrades:min,modes},null,2));
NODE

printf '{"status":"PASS","brokerWrites":false,"minTradesPerMode":%s,"modes":"%s","report":"%s"}\n' "$MIN_TRADES" "$MODES" "$BENCHMARK" | tee "$REPORT_DIR/stage7-result.json"

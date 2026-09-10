#!/usr/bin/env bash
set -Eeuo pipefail
START_YEAR="${1:-2020}"
END_YEAR="${2:-2024}"
if [[ -n "${HISTDATA_PAIRS:-}" ]]; then
  IFS=',' read -r -a PAIRS <<< "$HISTDATA_PAIRS"
else
  PAIRS=("EURUSD" "GBPUSD" "USDJPY" "XAUUSD")
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/data/raw/histdata/multi-year"
mkdir -p "$OUT_DIR"
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT
for year in $(seq "$START_YEAR" "$END_YEAR"); do
  for pair in "${PAIRS[@]}"; do
    output="$OUT_DIR/HISTDATA_COM_ASCII_${pair}_M1_${year}.zip"
    if [[ -s "$output" ]]; then echo "[skip] $pair $year"; continue; fi
    page="$(mktemp)"
    url="https://www.histdata.com/download-free-forex-data/?/ascii/1-minute-bar-quotes/${pair}/${year}"
    curl --fail --retry 3 --retry-all-errors -c "$COOKIE" -b "$COOKIE" -L -sS "$url" -o "$page"
    token="$(sed -n 's/.*name="tk"[^>]*value="\([^"]*\)".*/\1/p' "$page" | head -1)"
    [[ -n "$token" ]] || { echo "No HistData token for $pair $year" >&2; exit 1; }
    curl --fail --retry 3 --retry-all-errors -c "$COOKIE" -b "$COOKIE" -L -sS -X POST 'https://www.histdata.com/get.php' -H "Referer: $url" -H 'User-Agent: Mozilla/5.0' --data "tk=$token&date=$year&datemonth=$year&platform=ASCII&timeframe=M1&fxpair=$pair" -o "$output"
    file "$output"; sha256sum "$output"; rm -f "$page"
  done
done

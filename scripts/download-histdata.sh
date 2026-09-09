#!/usr/bin/env bash
set -euo pipefail

YEAR="${1:-2024}"
PAIRS=("EURUSD" "GBPUSD" "USDJPY" "XAUUSD")
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/data/raw/histdata"
mkdir -p "$OUT_DIR"
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

for pair in "${PAIRS[@]}"; do
  page="$(mktemp)"
  url="https://www.histdata.com/download-free-forex-data/?/ascii/1-minute-bar-quotes/${pair}/${YEAR}"
  curl --fail --retry 3 --retry-all-errors -c "$COOKIE" -b "$COOKIE" -L -sS "$url" -o "$page"
  token="$(sed -n 's/.*name="tk"[^>]*value="\([^"]*\)".*/\1/p' "$page" | head -1)"
  if [ -z "$token" ]; then
    echo "No HistData token for $pair $YEAR" >&2
    exit 1
  fi
  output="$OUT_DIR/HISTDATA_COM_ASCII_${pair}_M1_${YEAR}.zip"
  curl --fail --retry 3 --retry-all-errors -c "$COOKIE" -b "$COOKIE" -L -sS -X POST 'https://www.histdata.com/get.php' \
    -H "Referer: $url" -H 'User-Agent: Mozilla/5.0' \
    --data "tk=$token&date=$YEAR&datemonth=$YEAR&platform=ASCII&timeframe=M1&fxpair=$pair" \
    -o "$output"
  file "$output"
  sha256sum "$output"
  rm -f "$page"
done

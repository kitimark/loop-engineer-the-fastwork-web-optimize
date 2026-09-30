#!/bin/sh
# Sequential Chrome sweep used for chrome-sweep.md. Never runs two Chromes at once.
# Usage: sh tools/run_chrome_sweep.sh [trace-dir]   (run from research/cpu-throttle-calibration/)
set -e
TRACE_DIR=${1:-${TMPDIR:-/tmp}}
D=data/chrome
mkdir -p $D
node tools/chrome_scroll.mjs --bench --rates 1,2,4,6,10,20 --runs 3 --out $D/bench-curve
for rate in 1 4 6 20; do
  for vp in desktop mobile; do
    node tools/chrome_scroll.mjs --viewport $vp --rate $rate --runs 3 --scroll-cap-ms 60000 --out $D/scroll-$vp-${rate}x
  done
done
for rate in 4 6 20; do
  node tools/chrome_scroll.mjs --viewport desktop --rate $rate --runs 1 --trace --trace-dir "$TRACE_DIR" --no-frames --out $D/trace-desktop-${rate}x
done

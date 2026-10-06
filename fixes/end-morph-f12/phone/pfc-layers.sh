#!/bin/sh
# Probe-only rerun of pfc-run.sh's m 1 probe (lead 15:0xZ): the first run's layer counts failed (DOM.enable, fixed).
# Per arm: open, pfc-probe.mjs (state, a 2 s Timeline, then LayerTree counts). No M run. Inside the caller's phone hold:
# node tools/lock.mjs run iphone --owner fix-end-morph --max-seconds 600 -- sh fixes/end-morph-f12/phone/pfc-layers.sh <v9 port> <optc port>
cd "$(dirname "$0")/../../.." || exit 2
O=out/fade/pfc; mkdir -p $O
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/end-morph-f12/phone/pfc-layers.sh <v9 port> <optc port>"; exit 2; }
trap 'node tools/iphone.mjs park > /dev/null 2>&1' EXIT
for A in v9:$1 optc:$2; do
  L=${A%%:*}; P=${A#*:}
  echo "PFL $L: open, probe at m 1"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node fixes/end-morph-f12/phone/pfc-probe.mjs --match ":$P" --label "$L" --out "$O/layers-$L.json" --secs 2 || exit 5
done
echo "PFL DONE"

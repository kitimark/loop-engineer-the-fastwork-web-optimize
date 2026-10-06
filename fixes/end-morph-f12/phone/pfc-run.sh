#!/bin/sh
# T-204 #35 mechanism proof for platform-fade option (c): no ticket, no card, no gain claim (lead 11:24Z). Runs inside the
# runner's phone hold: node tools/lock.mjs run iphone --owner fix-end-morph --max-seconds 600 -- sh fixes/end-morph-f12/phone/pfc-run.sh <v9 port> <optc port>
# Per arm (v9-final, then option c), plain http on this Mac's LAN (host `lan`, resolved by iphone.mjs open; never written):
#   one M run (iphone.mjs run --driver morph, __fwMorphDrive hold 2000 ms x 3 cycles, the standard probe), then
#   pfc-probe.mjs held at m 1 (state, 6 s WebKit Timeline: Composite per RenderingFrame, then LayerTree layer counts).
# Output: out/fade/pfc/ (labels v9 / optc: distinct names on a case-insensitive disk). Safari parked at the end.
cd "$(dirname "$0")/../../.." || exit 2
O=out/fade/pfc; mkdir -p $O
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/end-morph-f12/phone/pfc-run.sh <v9 port> <optc port>"; exit 2; }
trap 'node tools/iphone.mjs park > /dev/null 2>&1' EXIT
for A in v9:$1 optc:$2; do
  L=${A%%:*}; P=${A#*:}
  U="http://lan:$P/"
  echo "PFC $L: open, M run"
  node tools/iphone.mjs open "$U" || exit 3
  node tools/iphone.mjs run --driver morph --probe std --owner fix-end-morph --label "pfc-$L" --hold 2000 --cycles 3 --out "$O/m-$L.json" --no-park || exit 4
  echo "PFC $L: open, probe at m 1"
  node tools/iphone.mjs open "$U" || exit 3
  node fixes/end-morph-f12/phone/pfc-probe.mjs --match ":$P" --label "$L" --out "$O/probe-$L.json" --secs 6 || exit 5
done
echo "PFC DONE"

#!/bin/sh
# PR-029 rev 3 phone check (lead 15:2xZ): option (a) on CM v1.2, mechanism + no-worse, short, xcode-serious, no cooling.
# Arms: cm = CM v1.2 (JS b9d2eceae44a), cma = CM v1.2 + (a) (JS f1c1834e7d03); plain http on the LAN (host `lan`).
# Order: M runs cm, cma, cma, cm (__fwMorphDrive hold 2000 ms x 3 cycles, std probe; the morph passes the fade band
# both ways), then pfa-probe.mjs per arm (mechanism: fade, pause attribute, running animations at m 0/0.1/0.3/0.5/1).
# node tools/lock.mjs run iphone --owner fix-end-morph --max-seconds 900 -- sh fixes/end-morph-f12/phone/pfa-run.sh <cm port> <cma port>
cd "$(dirname "$0")/../../.." || exit 2
O=out/fade/pfa; mkdir -p $O
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/end-morph-f12/phone/pfa-run.sh <cm port> <cma port>"; exit 2; }
trap 'node tools/iphone.mjs park > /dev/null 2>&1' EXIT
N=0
for A in cm:$1 cma:$2 cma:$2 cm:$1; do
  N=$((N + 1)); L=${A%%:*}; P=${A#*:}
  echo "PFA M$N $L"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node tools/iphone.mjs run --driver morph --probe std --owner fix-end-morph --label "pfa-$N-$L" --hold 2000 --cycles 3 --out "$O/m$N-$L.json" --no-park || exit 4
done
for A in cm:$1 cma:$2; do
  L=${A%%:*}; P=${A#*:}
  echo "PFA probe $L"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node fixes/end-morph-f12/phone/pfa-probe.mjs --match ":$P" --label "$L" --out "$O/probe-$L.json" || exit 5
done
echo "PFA DONE"

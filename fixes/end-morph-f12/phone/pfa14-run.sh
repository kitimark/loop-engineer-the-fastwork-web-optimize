#!/bin/sh
# PR-029 rev 4 phone check (card in README section 9): option (a) on v14, mechanism + no-worse, xcode-serious, no cooling.
# Arms: C = v14 (JS d23ee885d54f / CSS 4fafb83f1e72), V = v14 + (a) (JS edd0f8897172 / CSS 4fafb83f1e72); plain http on
# the LAN (host `lan`), served from snapshot copies out/fade/snap/v14 and out/fade/snap/v14a.
# Order: one uncounted warm-up M run per arm (C, V), then counted M runs C V V C (__fwMorphDrive hold 2000 ms x 3
# cycles, std probe; the morph passes the fade band both ways), then pfa-probe.mjs per arm (fade, pause attribute,
# running animations at m 0/0.1/0.3/0.5/1).
# node tools/lock.mjs run iphone --owner fix-end-morph --max-seconds 900 [--block <ticket>] -- sh fixes/end-morph-f12/phone/pfa14-run.sh <C port> <V port>
cd "$(dirname "$0")/../../.." || exit 2
O=out/fade/pfa14; mkdir -p $O
[ -n "$1" ] && [ -n "$2" ] || { echo "usage: sh fixes/end-morph-f12/phone/pfa14-run.sh <C port> <V port>"; exit 2; }
trap 'node tools/iphone.mjs park > /dev/null 2>&1' EXIT
for A in C:$1 V:$2; do
  L=${A%%:*}; P=${A#*:}
  echo "PFA14 warm-up $L"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node tools/iphone.mjs run --warmup --driver morph --probe std --owner fix-end-morph --label "pfa14-w-$L" --hold 2000 --cycles 3 --out "$O/w-$L.json" --no-park || exit 4
done
N=0
for A in C:$1 V:$2 V:$2 C:$1; do
  N=$((N + 1)); L=${A%%:*}; P=${A#*:}
  echo "PFA14 M$N $L"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node tools/iphone.mjs run --driver morph --probe std --owner fix-end-morph --label "pfa14-$N-$L" --hold 2000 --cycles 3 --out "$O/m$N-$L.json" --no-park || exit 4
done
for A in C:$1 V:$2; do
  L=${A%%:*}; P=${A#*:}
  echo "PFA14 probe $L"
  node tools/iphone.mjs open "http://lan:$P/" || exit 3
  node fixes/end-morph-f12/phone/pfa-probe.mjs --match ":$P" --label "$L" --out "$O/probe-$L.json" || exit 5
done
echo "PFA14 DONE"

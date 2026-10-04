#!/bin/sh
# P-100 (PHONE TICKET P-100 in fixes/cd-roll-ca/README.md): one display-rate hold on the phone. Committed before any
# phone data. Run it only inside its own no-timing hold, with the iphone lease held by cd-roll-ca:
#   node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner cd-roll-ca --doing "P-100 display-rate hold H1" \
#     -- caffeinate -i -s sh fixes/cd-roll-ca/phone/p100-hold.sh H1r quiet ca paused raf VK C8 C8 VK raf paused ca quiet
# Items: quiet / ca / paused / raf = the synthetic one-digit page (p100.html?m=<item>, served from the P100 copy);
#        VK (or V9) / C8 = the real page at y 0 (the hero clock and everything else on the page running).
# The servers (ARMS="B P100 VK C8" sh fixes/cd-roll-ca/phone/serve-snap.sh) are up before the hold, fresh ports (I-131
# interim rule). Per item: `iphone.mjs open <url>`, then p100-rec.mjs (5 s settle, 20 s xctrace of Display, Core Animation
# FPS and Thermal State; no Web Inspector attached while it records). A thermal read (thermal-gate.mjs, recorded, not a
# gate: any state counts, the state is a reported column) at the start and the end, and the I-098 sleep check.
# Last line: "HOLD <H> DONE" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4). Nothing here prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
H=$1; shift
S=out/cd-roll-ca/snap; O=out/cd-roll-ca/p100
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
PU=$(node tools/lan.mjs --url --port "$(port P100)") || exit 2
# Real-page arms: URL looked up per item (re-ticket 2026-10-04, PR-017 land-k: VK replaces V9; V9 stays accepted).
real() { node tools/lan.mjs --url --port "$(port "$1")"; }
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node research/phone-thermal-gate/thermal-gate.mjs --owner cd-roll-ca --label "p100-$H-start" --expect serious --max-c 44 --url "$B"; g=$?
[ $g -eq 3 ] && { echo "HOLD $H VOID ceiling at the start"; exit 3; }
[ $g -eq 1 ] && { echo "HOLD $H VOID no thermal read at the start"; exit 3; }
[ $g -eq 6 ] && { echo "HOLD $H VOID timer grid at 30 ms below Serious (Low Power Mode?) at the start"; exit 3; }
n=0
for I in "$@"; do
  n=$((n + 1))
  case $I in
    quiet|ca|paused|raf) U="${PU%/}/p100.html?m=$I" ;;
    V9|VK|C8) U=$(real "$I") || { echo "HOLD $H VOID no server for $I"; exit 4; } ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  node tools/iphone.mjs open "$U" --owner cd-roll-ca > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node fixes/cd-roll-ca/phone/p100-rec.mjs --arm "$I" --label "p100-$H-$n-$I" --out "$O/p100-$H-$n-$I.json" --seconds 20 --settle 5; r=$?
  echo "REC $n $I exit $r $(date -u +%TZ)"
done
node research/phone-thermal-gate/thermal-gate.mjs --owner cd-roll-ca --label "p100-$H-end" --expect serious --max-c 44 --url "$B"; g=$?
node tools/iphone.mjs park --owner cd-roll-ca > /dev/null
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H DONE (end thermal read exit $g)"

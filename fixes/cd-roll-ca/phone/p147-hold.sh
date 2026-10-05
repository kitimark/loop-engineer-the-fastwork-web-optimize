#!/bin/sh
# P-147 phone no-worse check (PHONE TICKET P-147 in fixes/cd-roll-ca/README.md): the whole block in one phone hold.
# Profile xcode-serious (iphone.mjs run's default --profile serious: Xcode Device Conditions > Thermal State Serious, no
# heat pre-warm, no cooling wait; never thermal.mjs). Run only inside the iphone hold, with the servers up
# (sh fixes/cd-roll-ca/phone/p147-serve.sh), e.g.:
#   node tools/lock.mjs run iphone --owner fix-cd-roll-ca-r4 --block P-147 --max-seconds 3600 -- \
#     node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner fix-cd-roll-ca-r4 \
#       --doing "P-147 phone block" -- caffeinate -i -s sh fixes/cd-roll-ca/phone/p147-hold.sh
# Steps:
#   0. per arm (C, then V): iphone.mjs open; one uncounted W warm-up at the page end (--from 999999 --to 999999, i.e.
#      the instant jump to the end, idle 3 s, hold 2 s, no sentinel, --no-park); then p147-mread.mjs reads the panel's
#      --morph twice 2 s apart and the page end. Both arms '1' both times -> go on; else "HOLD VOID pre-read" (exit 5,
#      no counted run: STOP, report to the lead).
#   1. counted runs C V V C C V V C: iphone.mjs open, then W from (C's page end - 2400) to the end, idle 3 s, hold 12 s
#      at the end, sentinel 3 s (each run parks Safari).
#   2. the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Last line: "HOLD VALID" (exit 0) or "HOLD VOID <why>" (exit 3/4/5). Nothing here prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
S=out/p147; O=out/p147/runs
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
PC=$(port C); PV=$(port V)
CU=$(node tools/lan.mjs --url --port "$PC") || exit 2
VU=$(node tools/lan.mjs --url --port "$PV") || exit 2
T0=$(date +%s)
echo "HOLD start $(date -u +%FT%TZ) block P-147"
for A in C V; do
  if [ $A = C ]; then U=$CU; P=$PC; else U=$VU; P=$PV; fi
  node tools/iphone.mjs open "$U" --owner fix-cd-roll-ca-r4 > /dev/null || { echo "HOLD VOID open $A failed (pre-read)"; exit 4; }
  node tools/iphone.mjs run --driver window --probe std --owner fix-cd-roll-ca-r4 --block P-147 --arm $A --warmup --no-park \
    --from 999999 --to 999999 --idle 3 --hold 2 --sentinel 0 --label "p147-w$A" --out "$O/p147-w$A.json" > "$O/p147-w$A.log" 2>&1
  node fixes/cd-roll-ca/phone/p147-mread.mjs --port $P --arm $A > "$O/p147-mread-$A.json"; r=$?
  cat "$O/p147-mread-$A.json"
  [ $r -eq 0 ] || { echo "HOLD VOID pre-read: arm $A menu not open at rest (exit $r; STOP, report to the lead)"; node tools/iphone.mjs park --owner fix-cd-roll-ca-r4 > /dev/null; exit 5; }
  node tools/iphone.mjs park --owner fix-cd-roll-ca-r4 > /dev/null
done
MAXY=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$O/p147-mread-C.json','utf8')).facts[1].maxY)")
FROM=$((MAXY - 2400)); [ $FROM -lt 0 ] && FROM=0
echo "page end (C, at rest) $MAXY; counted runs from $FROM"
W="--driver window --probe std --owner fix-cd-roll-ca-r4 --block P-147 --from $FROM --to 999999 --idle 3 --hold 12 --sentinel 3"
for I in C1 V2 V3 C4 C5 V6 V7 C8; do
  case $I in C*) A=C; U=$CU ;; V*) A=V; U=$VU ;; esac
  node tools/iphone.mjs open "$U" --owner fix-cd-roll-ca-r4 > /dev/null || { echo "HOLD VOID open $A failed at $I"; exit 4; }
  node tools/iphone.mjs run $W --arm $A --run ${I#?} --label "p147-$I" --out "$O/p147-$I.json" > "$O/p147-$I.log" 2>&1; r=$?
  echo "RUN $I exit $r $(date -u +%TZ)"
done
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $p -ne 0 ] && { echo "HOLD VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD VALID"

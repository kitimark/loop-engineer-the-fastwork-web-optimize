#!/bin/sh
# P-094 (rest-script v4 phone no-worse check; PHONE TICKET in fixes/rest-script/README.md): one phone hold.
# Adapted from fix-cd-roll-ca's fixes/cd-roll-ca/phone/hold.sh (P-093, 3f7ce94a), with credit; committed before any
# phone data. Run it only inside its own no-timing hold, with the iphone lease held by fix-rest-script:
#   node tools/lock.mjs run chrome-measure --no-timing --max-seconds 900 --owner fix-rest-script --doing "P-094 hold H1" \
#     -- caffeinate -i -s sh fixes/rest-script/phone/hold.sh H1 wC wV C1 V2
# Items: wC / wV = the uncounted warm-up on that arm's port; C<n> / V<n> = counted run n (block position 1-8).
# The servers (sh fixes/rest-script/phone/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Nothing here prints the LAN address (Hard rule 12).
# Steps, the same in every hold (one start method):
#   1. pre-warm on B: one uncounted W run on B, then the start gate; while the gate says "too cool" (exit 2), another
#      W run on B and another read, at most 4 pre-warm runs; any other gate failure, or still too cool, ends the hold
#      with no counted run (exit 5)
#   2. the items in order, each `iphone.mjs open <arm URL>` then `iphone.mjs run --driver window` (each run parks Safari)
#   3. the end gate; then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs)
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5): a VOID hold's counted runs are re-run in a
# new hold, in the same order, and its files are left out of the scorer call (listed in the block log).
cd "$(dirname "$0")/../../.." || exit 2
H=$1; shift
S=out/rest-script/snap; O=out/rest-script/p094
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner fix-rest-script --label "p094-$H-$1" --expect serious --max-c 44 --url "$B"; }
# W: 8 s at the top (row far, scene gate active), the 250 px steps down to y >= 2800 through the avatar row (near band
# entered and left), 8 s held at y 2800 (row far again), then the sentinel (jump to the bottom, 3 s)
W="--driver window --probe std --owner fix-rest-script --block P-094 --to 2800 --idle 8 --hold 8 --sentinel 3"
TOPS="people=#people,row=#people .start-selling-avatars"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner fix-rest-script > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $W --warmup --label "p094-$H-prewarm$n" --out "$O/p094-$H-prewarm$n.json" > "$O/p094-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  case $I in
    wC) A=C; U=$CU; X="--warmup --arm C"; L=p094-wC-$H ;;
    wV) A=V; U=$VU; X="--warmup --arm V"; L=p094-wV-$H ;;
    C*) A=C; U=$CU; X="--arm C --run ${I#C}"; L=rs-$I ;;
    V*) A=V; U=$VU; X="--arm V --run ${I#V}"; L=rs-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  node tools/iphone.mjs open "$U" --owner fix-rest-script > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  node tools/iphone.mjs run $W $X --tops "$TOPS" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
  echo "RUN $I exit $r $(date -u +%TZ)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID"

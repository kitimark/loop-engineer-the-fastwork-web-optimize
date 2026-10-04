#!/bin/sh
# P-105 (v7 phone no-worse check vs v6; PHONE TICKET in fixes/v7-best/README.md): one phone hold.
# Adapted from fix-rest-script's fixes/rest-script/phone/hold.sh (P-094, itself from fix-cd-roll-ca's P-093), with
# credit; committed before any phone data. Runs under the iphone lease held by iphone-runner, beside any shared group
# (lead ruling 2026-10-04 13:0xZ: robot runs need no quiet-Mac hold; each run keeps the Mac state in its record):
#   caffeinate -i -s sh fixes/v7-best/phone/hold.sh H1 wC wV C1 V2 V3 C4
# Items:
#   wC / wV            uncounted S warm-up on that arm's port
#   C<n> / V<n>        counted S run n (block position); every counted C run is the heat sentinel
#   sC                 uncounted S run on C judged as the heat sentinel (opens and closes a G hold)
#   g<P><A><n>         counted G run n of part P (F fresh load | H hero | M middle | E end) on arm A (C | V)
# The servers (sh fixes/v7-best/phone/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all three ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps, the same in every hold (one start method):
#   1. pre-warm on B: one uncounted S run on B, then the start gate; while the gate says "too cool" (exit 2), another
#      S run on B and another read, at most 4 pre-warm runs; any other gate failure, or still too cool, ends the hold
#      with no counted run (exit 5)
#   2. the items in order (each run parks Safari; G runs reload the page themselves after the open)
#   3. the end gate; then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs)
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../.." || exit 2
H=$1; shift
S=out/p105/snap; O=out/p105/runs; G=fixes/v7-best/phone/g
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner iphone-runner --label "p105-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner iphone-runner --block P-105"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner iphone-runner > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p105-$H-prewarm$n" --out "$O/p105-$H-prewarm$n.json" > "$O/p105-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v7-best/phone/serve.sh check > "$O/p105-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner iphone-runner --ttl 900 > /dev/null
  case $I in
    wC) A=C; U=$CU; K=S; X="--warmup --arm C"; L=p105-wC-$H ;;
    wV) A=V; U=$VU; K=S; X="--warmup --arm V"; L=p105-wV-$H ;;
    sC) A=C; U=$CU; K=S; X="--warmup --heat-sentinel --arm C"; L=p105-sC-$H ;;
    C[0-9]*) A=C; U=$CU; K=S; X="--arm C --run ${I#C}"; L=p105-$I ;;
    V[0-9]*) A=V; U=$VU; K=S; X="--arm V --run ${I#V}"; L=p105-$I ;;
    g[FHME][CV][0-9]*)
      P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=p105-$I
      [ "$A" = C ] && U=$CU || U=$VU
      case $P in F) SC=$G/flick-fresh-v1.json ;; H) SC=$G/flick-hero-v1.json ;; M) SC=$G/flick-middle-v1.json ;; E) SC=$G/flick-end-v1.json ;; esac ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  node tools/iphone.mjs open "$U" --owner iphone-runner > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  if [ $K = S ]; then
    node tools/iphone.mjs run $SR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
  else
    node tools/iphone.mjs gesture "$SC" --owner iphone-runner --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
    node tools/iphone.mjs park --owner iphone-runner > /dev/null 2>&1
  fi
  echo "RUN $I exit $r $(date -u +%TZ)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID"

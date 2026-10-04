#!/bin/sh
# P-111 (v8 phone no-worse check vs v7; PHONE TICKET in fixes/v8-best/README.md): one phone hold.
# Adapted from iphone-runner's P-105 hold.sh (fixes/v7-best/phone/hold.sh at b9c7d1eb, b277523cc943; itself from
# fix-rest-script's P-094 and fix-cd-roll-ca's P-093), with credit. Changes: the arms and folders, a W leg in place of
# the S leg (P-093's driver, with a longer hold past the hero), and an M leg (P-098's driver). Committed before any
# phone data. Runs under the iphone lease held by the runner (RUNNER, default iphone-runner), beside any shared group
# (lead ruling 2026-10-04 13:0xZ: robot runs need no quiet-Mac hold; each run keeps the Mac state in its record):
#   caffeinate -i -s sh fixes/v8-best/phone/hold.sh H1 wC wV C1 V2 V3 C4
# Items:
#   wC / wV            uncounted W warm-up on that arm's port
#   C<n> / V<n>        counted W run n (block position); every counted C W run is a heat sentinel
#   mC<n> / mV<n>      counted M run n (morph driver at the page end); every counted C M run is a heat sentinel
#   sC                 uncounted S run on C judged as the heat sentinel (opens and closes a G hold)
#   g<P><A><n>         counted G run n of part P (F fresh load | H hero | M middle | E end) on arm A (C | V)
# The servers (sh fixes/v8-best/phone/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
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
R=${RUNNER:-iphone-runner}
S=out/p111/snap; O=out/p111/runs; G=fixes/v8-best/phone/g
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p111-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-111"
WR="--driver window --probe std --owner $R --block P-111 --to 2700 --idle 8 --hold 6 --sentinel 3"
MR="--driver morph --probe std --owner $R --block P-111"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p111-$H-prewarm$n" --out "$O/p111-$H-prewarm$n.json" > "$O/p111-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v8-best/phone/serve.sh check > "$O/p111-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    wC) A=C; U=$CU; K=W; X="--warmup --arm C"; L=p111-wC-$H ;;
    wV) A=V; U=$VU; K=W; X="--warmup --arm V"; L=p111-wV-$H ;;
    sC) A=C; U=$CU; K=S; X="--warmup --heat-sentinel --arm C"; L=p111-sC-$H ;;
    C[0-9]*) A=C; U=$CU; K=W; X="--arm C --run ${I#C}"; L=p111-$I ;;
    V[0-9]*) A=V; U=$VU; K=W; X="--arm V --run ${I#V}"; L=p111-$I ;;
    m[CV][0-9]*)
      A=$(echo "$I" | cut -c2); K=M; X="--arm $A --run ${I#m?}"; L=p111-$I
      [ "$A" = C ] && U=$CU || U=$VU ;;
    g[FHME][CV][0-9]*)
      P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=p111-$I
      [ "$A" = C ] && U=$CU || U=$VU
      case $P in F) SC=$G/flick-fresh-v1.json ;; H) SC=$G/flick-hero-v1.json ;; M) SC=$G/flick-middle-v1.json ;; E) SC=$G/flick-end-v1.json ;; esac ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    W) node tools/iphone.mjs run $WR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    M) node tools/iphone.mjs run $MR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) node tools/iphone.mjs gesture "$SC" --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID"

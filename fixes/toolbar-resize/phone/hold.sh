#!/bin/sh
# toolbar-resize P-115 follow-up phone G check (DRAFT kit, pre-staged per roles v3 R3; not a ticket yet): one phone hold,
# G part H (P-111's flick-hero script, the one P-106 and the Simulator bisects used) with a WebKit Timeline per run, so
# score-tr.mjs's frozen filters (toolbar-moving frames, hero zone, largest Layout, heavy >= 5 ms) apply unchanged.
# A copy of int-v8's P-114 hold.sh (fixes/v8-best/phone/p114/hold.sh), with credit: the M items dropped, --timeline added
# to every G run, the arms C = v8 / V = v8 + candidate (serve.sh), the folders and labels changed. Runs under the iphone
# lease held by the runner (RUNNER, default iphone-runner), inside the runner's exclusive no-timing hold:
#   node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "toolbar-resize G H1" -- \
#     caffeinate -i -s sh fixes/toolbar-resize/phone/hold.sh H1 sCo wgC wgV gHC1 gHV1 gHV2 gHC2 sCc
# Items:
#   sCo / sCc          uncounted S run on C (v8) as the heat sentinel, opening / closing a hold (labels apart, per hold)
#   wgC / wgV          uncounted G part H warm-up on that arm's port (first hold only)
#   gHC<n> / gHV<n>    counted G part H run n, Timeline on (files g-<arm>-H<n>.json + tl-<arm>-H<n>.json for score-tr)
# Before every item the served JS/CSS of all three ports is re-checked (serve.sh check; a wrong hash ends the hold VOID).
# Steps (P-111's): 1. pre-warm on B (S runs, at most 4) and the start gate; 2. the items in order (each G run parks
# Safari); 3. the end gate, then the I-098 sleep check over the hold. Nothing here prints the LAN address (Hard rule 12).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/tr-phone/snap; O=out/tr-phone/runs; SC=fixes/v8-best/phone/g/flick-hero-v1.json
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) arm $(cat $S/ARM) items $*"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "trp-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block toolbar-resize-G"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "trp-$H-prewarm$n" --out "$O/trp-$H-prewarm$n.json" > "$O/trp-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/toolbar-resize/phone/serve.sh check > "$O/trp-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    sC[oc]) A=C; K=S; X="--warmup --heat-sentinel --arm C"; L=trp-$I-$H ;;
    wg[CV]) A=$(echo "$I" | cut -c3); K=G; F=$O/w-$A-$H ;;
    gH[CV][0-9]*) A=$(echo "$I" | cut -c3); K=G; F=$O/$A-H${I#gH?} ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  [ "$A" = C ] && U=$CU || U=$VU
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) D=$(dirname "$F"); N=$(basename "$F")
       node tools/iphone.mjs gesture "$SC" --owner "$R" --label "trp-$I" --out "$D/g-$N.json" --timeline "$D/tl-$N.json" > "$D/$N.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

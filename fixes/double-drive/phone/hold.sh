#!/bin/sh
# P-118 (double-drive phone no-worse check, v8 vs v8 + double-drive; PHONE TICKET research/management/
# p118-double-drive-phone-no-worse.md, ticket text fixes/double-drive/phone/TICKET.md): one phone hold. A copy of
# int-v8's fixes/v8-best/phone/p116/hold.sh (P-116, b25c8fc83e6f) with two arms (C = v8, V = v8 + double-drive) and
# P-117's item layout (S whole-page runs, G part M flicks through the middle); the pre-warm, the start/end gates, the
# served check before every item, the park after every G run and the sleep check are P-116's, unchanged. Committed
# before any phone data. Runs under the iphone lease held by the runner (RUNNER, default iphone-runner), INSIDE the
# runner's exclusive no-timing hold, so no shared job runs beside it:
#   node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-118 H1" -- \
#     caffeinate -i -s sh fixes/double-drive/phone/hold.sh H1 wC wV C1 V2 V3 C4
#   ... H2 C5 V6 V7 C8
#   ... H3 sCo wgC wgV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc
# Items:
#   wC / wV          uncounted S warm-up on that arm's port
#   C<n> / V<n>      counted S run n (block position); every counted C run is the heat sentinel (P-117)
#   sCo / sCc        uncounted S run on C as the heat sentinel, opening / closing the G hold (labels apart, per hold:
#                    p118-sCo-<H> / p118-sCc-<H>)
#   wgC / wgV        uncounted G part M warm-up on that arm's port
#   gMC<n> / gMV<n>  counted G part M run n (flick-middle-v1.json, sha256/12 0f97205f1d42; window mid1 -> end)
# The servers (sh fixes/double-drive/phone/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all three ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps: 1. pre-warm on B (S runs, at most 4) and the start gate; 2. the items in order (each G run parks Safari);
# 3. the end gate, then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Before the items it prints the hold's lock state (chrome-measure line only), so the block log shows the exclusive
# hold; every run record keeps the Mac load (mac.start / mac.end load1).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/pdd/snap; O=out/p118/runs; SC=fixes/v8-best/phone/g/flick-middle-v1.json
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p118-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-118"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p118-$H-prewarm$n" --out "$O/p118-$H-prewarm$n.json" > "$O/p118-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/double-drive/phone/serve.sh check > "$O/p118-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    wC) A=C; K=S; EX="--warmup --arm C"; L=p118-wC-$H ;;
    wV) A=V; K=S; EX="--warmup --arm V"; L=p118-wV-$H ;;
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=p118-$I-$H ;;
    C[0-9]*) A=C; K=S; EX="--arm C --run ${I#C}"; L=p118-$I ;;
    V[0-9]*) A=V; K=S; EX="--arm V --run ${I#V}"; L=p118-$I ;;
    wg[CV]) A=$(echo "$I" | cut -c3); K=G; L=p118-$I-$H ;;
    gM[CV][0-9]*) A=$(echo "$I" | cut -c3); K=G; L=p118-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  case $A in C) U=$CU ;; V) U=$VU ;; esac
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $EX --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) node tools/iphone.mjs gesture "$SC" --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

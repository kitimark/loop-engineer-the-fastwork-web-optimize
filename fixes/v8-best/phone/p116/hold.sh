#!/bin/sh
# P-116 (v8 hero-flick (GH) attribution block, G part H only, on a quiet Mac; PHONE TICKET
# research/management/p116-v8-gh-attribution.md): one phone hold. A copy of P-114's fixes/v8-best/phone/p114/hold.sh
# (6367f45452e4) with the M items dropped and three arms (C = v8, X = v8 minus the countdown group, Y = v8 minus
# rest-script v4); P-114's G part H line (P-111's flick-hero script, unchanged), its S heat sentinel line, the gates and
# the sleep check are unchanged. Committed before any phone data. Runs under the iphone lease held by the runner
# (RUNNER, default iphone-runner), INSIDE the runner's exclusive no-timing hold, so no shared job runs beside it:
#   node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-116 H1" -- \
#     caffeinate -i -s sh fixes/v8-best/phone/p116/hold.sh H1 sCo wgC wgX wgY gHC1 gHX1 gHY1 gHX2 gHY2 gHC2 sCc
#   ... H2 sCo gHY3 gHC3 gHX3 gHC4 gHY4 gHX4 sCc
# Items:
#   sCo / sCc          uncounted S run on C (v8) as the heat sentinel, opening / closing a hold (labels apart, per hold:
#                      p116-sCo-<H> / p116-sCc-<H>; P-105's gap 1)
#   wgC / wgX / wgY    uncounted G part H warm-up on that arm's port (first hold only; A3/U5, P-105's gap 2)
#   gHC<n> / gHX<n> / gHY<n>   counted G part H run n
# The servers (sh fixes/v8-best/phone/p116/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all four ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps (P-111's): 1. pre-warm on B (S runs, at most 4) and the start gate; 2. the items in order (each G run parks
# Safari); 3. the end gate, then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Before the items it prints the hold's lock state (lock.mjs status, chrome-measure line only) so the block log shows
# the exclusive hold; every run record keeps the Mac load (mac.start / mac.end load1).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p116/snap; O=out/p116/runs; SC=fixes/v8-best/phone/g/flick-hero-v1.json
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
XU=$(node tools/lan.mjs --url --port "$(port X)") || exit 2
YU=$(node tools/lan.mjs --url --port "$(port Y)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p116-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-116"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p116-$H-prewarm$n" --out "$O/p116-$H-prewarm$n.json" > "$O/p116-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v8-best/phone/p116/serve.sh check > "$O/p116-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=p116-$I-$H ;;
    wg[CXY]) A=$(echo "$I" | cut -c3); K=G; L=p116-$I-$H ;;
    gH[CXY][0-9]*) A=$(echo "$I" | cut -c3); K=G; L=p116-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  case $A in C) U=$CU ;; X) U=$XU ;; Y) U=$YU ;; esac
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

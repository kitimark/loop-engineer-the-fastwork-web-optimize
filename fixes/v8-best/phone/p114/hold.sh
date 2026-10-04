#!/bin/sh
# P-114 (v8 vs v7 phone confirm block: M leg + G part H, on a quiet Mac; PHONE TICKET in fixes/v8-best/README.md
# "P-114"): one phone hold. Merges P-112's hold.sh (fixes/v8-best/phone/p112/hold.sh: the M items and warm-ups, P-111's M
# driver line unchanged) and P-113's (fixes/v8-best/phone/p113/hold.sh: the G part H items with P-111's flick-hero script
# unchanged, the G warm-ups, the S heat sentinels labelled apart), with P-111's two arms (C = v7, V = v8). Committed
# before any phone data. Runs under the iphone lease held by the runner (RUNNER, default iphone-runner), INSIDE the
# runner's exclusive no-timing hold, so no shared job runs beside it (lead ruling 2026-10-04):
#   node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-114 H1" -- \
#     caffeinate -i -s sh fixes/v8-best/phone/p114/hold.sh H1 wmC wmV mC1 mV2 mV3 mC4
#   ... H2 mC5 mV6 mV7 mC8 · H3 sCo wgC wgV gHC1 gHV1 gHV2 sCc · H4 sCo gHC2 gHC3 gHV3 sCc
# Items:
#   wmC / wmV          uncounted M warm-up on that arm's port (first hold only)
#   mC<n> / mV<n>      counted M run n (morph driver at the page end); every counted C M run is a heat sentinel
#   sCo / sCc          uncounted S run on C (v7) as the heat sentinel, opening / closing a G hold (labels apart, per hold)
#   wgC / wgV          uncounted G part H warm-up on that arm's port (first G hold only)
#   gHC<n> / gHV<n>    counted G part H run n
# The servers (sh fixes/v8-best/phone/p114/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all three ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps (P-111's): 1. pre-warm on B (S runs, at most 4) and the start gate; 2. the items in order (each G run parks
# Safari); 3. the end gate, then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Before the items it prints the hold's lock state (lock.mjs status, chrome-measure line only) so the block log shows
# the exclusive hold; every run record keeps the Mac load (mac.start / mac.end load1).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p114/snap; O=out/p114/runs; SC=fixes/v8-best/phone/g/flick-hero-v1.json
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p114-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-114"
MR="--driver morph --probe std --owner $R --block P-114"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p114-$H-prewarm$n" --out "$O/p114-$H-prewarm$n.json" > "$O/p114-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v8-best/phone/p114/serve.sh check > "$O/p114-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    wm[CV]) A=$(echo "$I" | cut -c3); K=M; X="--warmup --arm $A"; L=p114-$I-$H ;;
    m[CV][0-9]*) A=$(echo "$I" | cut -c2); K=M; X="--arm $A --run ${I#m?}"; L=p114-$I ;;
    sC[oc]) A=C; K=S; X="--warmup --heat-sentinel --arm C"; L=p114-$I-$H ;;
    wg[CV]) A=$(echo "$I" | cut -c3); K=G; L=p114-$I-$H ;;
    gH[CV][0-9]*) A=$(echo "$I" | cut -c3); K=G; L=p114-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  [ "$A" = C ] && U=$CU || U=$VU
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    M) node tools/iphone.mjs run $MR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    S) node tools/iphone.mjs run $SR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
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

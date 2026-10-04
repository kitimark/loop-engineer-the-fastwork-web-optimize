#!/bin/sh
# P-113 (v8 hero-flick cluster attribution, G part H only, three arms; PHONE TICKET in fixes/v8-best/README.md "P-113"):
# one phone hold. A copy of P-111's fixes/v8-best/phone/hold.sh (9a29f95cf06a) with only G part H items (no W, M or other G parts), three
# arms (C, F, R), an uncounted G-H warm-up per arm port, and the heat-sentinel S runs labelled apart (sCo opens the
# hold, sCc closes it: in P-111 both had one label and the closing record overwrote the opening one). The G part H
# script and the S driver line are P-111's unchanged. Committed before any phone data. Runs under the iphone lease held
# by the runner (RUNNER, default iphone-runner), beside any shared group (each run keeps the Mac state in its record):
#   caffeinate -i -s sh fixes/v8-best/phone/p113/hold.sh H1 sCo wgC wgF wgR gHC1 gHF1 gHR1 gHF2 gHR2 gHC2 gHR3 gHC3 gHF3 sCc
# Items:
#   sCo / sCc          uncounted S run on C (v8) as the heat sentinel (bottom >= 58 fps, scroll >= 44 fps)
#   wgC / wgF / wgR    uncounted G part H warm-up on that arm's port (A3/U5)
#   gH<arm><n>         counted G part H run n on arm C, F or R
# The servers (sh fixes/v8-best/phone/p113/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all four ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps (P-111's): 1. pre-warm on B (S runs, at most 4) and the start gate; 2. the items in order (each G run parks
# Safari); 3. the end gate, then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p113/snap; O=out/p113/runs; G=fixes/v8-best/phone/g; SC=$G/flick-hero-v1.json
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
FU=$(node tools/lan.mjs --url --port "$(port F)") || exit 2
RU=$(node tools/lan.mjs --url --port "$(port R)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p113-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-113"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p113-$H-prewarm$n" --out "$O/p113-$H-prewarm$n.json" > "$O/p113-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v8-best/phone/p113/serve.sh check > "$O/p113-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    sC[oc]) A=C; K=S; X="--warmup --heat-sentinel --arm C"; L=p113-$I-$H ;;
    wg[CFR]) A=$(echo "$I" | cut -c3); K=G; L=p113-$I-$H ;;
    gH[CFR][0-9]*) A=$(echo "$I" | cut -c3); K=G; L=p113-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  case $A in C) U=$CU ;; F) U=$FU ;; R) U=$RU ;; esac
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
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

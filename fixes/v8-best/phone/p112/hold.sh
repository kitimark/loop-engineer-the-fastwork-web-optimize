#!/bin/sh
# P-112 (v8 morph close-tween attribution, M leg only; PHONE TICKET in fixes/v8-best/README.md "P-112"): one phone hold.
# A copy of P-111's fixes/v8-best/phone/hold.sh (9a29f95cf06a) with the W/S/G items removed, an uncounted M warm-up
# item per port added (wmC / wmV), and the P-112 folders, labels and block. The M driver line is P-111's unchanged.
# Committed before any phone data. Runs under the iphone lease held by the runner (RUNNER, default iphone-runner),
# beside any shared group (each run keeps the Mac state in its record):
#   caffeinate -i -s sh fixes/v8-best/phone/p112/hold.sh H1 wmC wmV mC1 mV2 mV3 mC4
#   caffeinate -i -s sh fixes/v8-best/phone/p112/hold.sh H2 mC5 mV6 mV7 mC8
# Items:
#   wmC / wmV          uncounted M warm-up on that arm's port (one per port, first hold only)
#   mC<n> / mV<n>      counted M run n (morph driver at the page end); every counted C M run is a heat sentinel
# The servers (sh fixes/v8-best/phone/p112/serve.sh) are up before the hold; B = the plain baseline (no overlay), the
# pre-warm page and the gate's timer page. Before every item the served JS/CSS of all three ports is re-checked
# (serve.sh check; a wrong hash ends the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps, the same in every hold (P-111's):
#   1. pre-warm on B: one uncounted S run on B, then the start gate; while the gate says "too cool" (exit 2), another
#      S run on B and another read, at most 4 pre-warm runs; any other gate failure, or still too cool, ends the hold
#      with no counted run (exit 5)
#   2. the items in order (each run parks Safari)
#   3. the end gate; then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs)
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p112/snap; O=out/p112/runs
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p112-$H-$1" --expect serious --max-c 44 --url "$B"; }
SR="--driver scroll --probe std --owner $R --block P-112"
MR="--driver morph --probe std --owner $R --block P-112"
n=0
while :; do
  n=$((n + 1))
  node tools/iphone.mjs open "$B" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed"; exit 4; }
  node tools/iphone.mjs run $SR --warmup --label "p112-$H-prewarm$n" --out "$O/p112-$H-prewarm$n.json" > "$O/p112-$H-prewarm$n.log" 2>&1
  gate start; g=$?
  [ $g -eq 0 ] && break
  [ $g -eq 2 ] && [ $n -lt 4 ] && continue
  echo "HOLD $H VOID start gate exit $g after $n pre-warm runs (no counted run)"; exit 5
done
for I in "$@"; do
  sh fixes/v8-best/phone/p112/serve.sh check > "$O/p112-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    wm[CV]) A=$(echo "$I" | cut -c3); X="--warmup --arm $A"; L=p112-$I-$H ;;
    m[CV][0-9]*) A=$(echo "$I" | cut -c2); X="--arm $A --run ${I#m?}"; L=p112-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  [ "$A" = C ] && U=$CU || U=$VU
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  node tools/iphone.mjs run $MR $X --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
  echo "RUN $I exit $r $(date -u +%TZ)"
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
echo "HOLD $H VALID"

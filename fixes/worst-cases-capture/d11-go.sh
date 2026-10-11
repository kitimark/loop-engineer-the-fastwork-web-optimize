#!/bin/sh
# d11-go.sh (cap-end-openclose, 2026-10-11, lead request): the whole phone block for the two Day 11 capture items, in the
# lead's priority order. Tool-held Serious (iphone.mjs rearm, as the -ar- runs), Do Not Disturb stays on (no focus step;
# checked afterwards in each recording's status-bar strip).
#   0  servers: tri-serve.sh (O = original; L = g0.0l and M = g0.0m from rf.sh over out/g0-0m/snap) and served-hash checks
#   P  prep (tri-hold.sh P0 --prep): cool below 40 C, rearm (tool-serious), one uncounted warm-up flick per port O, L, M
#   1  reveal flick, g0.0l (A) vs g0.0m (V), A V V A: rf.sh (cap-end-orig's kit) in one phone hold + --no-timing Mac hold
#   2  the user's swipe replay (g-ar-herofinger-v2.json, item w -> -ar-herocatch3-), 3 arms, rotated, 2 per arm
#   3  the 9 Oct slow-drag items, 3 arms, rotated, 2 per arm: hero (h), middle approach (m), people flick (p);
#      optional carousel rest (c) only while the block so far took <= OPT_MAX_MIN (default 45) minutes
#   end: park Safari, `thermal.mjs clear` (inside a phone hold), stop the servers
# Rotations (each arm first, middle and last once per item group): w O L M M L O; h L M O O M L; m M O L L O M; p O L M M L O.
# usage (in the background, from anywhere): sh fixes/worst-cases-capture/d11-go.sh [--from 1|2|3]
cd "$(dirname "$0")/../.." || exit 2
export FW_AGENT=${FW_AGENT:-cap-end-openclose} WC_FOCUS_STEP=skip FW_PHONE_CONDITION=tool
R=$FW_AGENT; D=fixes/worst-cases-capture; O=out/wc/runs; L=out/wc/d11-block.log
FROM=1; [ "$1" = --from ] && FROM=$2
mkdir -p $O
log() { echo "$*" | tee -a $L; }
finish() {
  node tools/lock.mjs run iphone --owner $R --max-seconds 120 --doing "Day 11 captures: park Safari, clear the thermal condition" -- \
    sh -c "node tools/iphone.mjs park > /dev/null 2>&1; node tools/thermal.mjs clear" > $O/d11-thermal-clear.log 2>&1
  log "FINISH park + thermal clear exit $? $(grep -v http $O/d11-thermal-clear.log | tail -1 | cut -c1-120)"
  sh $D/tri-serve.sh stop >> $L 2>&1
  log "D11 EXIT $1 $(date -u +%FT%TZ)"; exit $1
}
log "== d11 start $(date -u +%FT%TZ) from part $FROM"
sh $D/tri-serve.sh >> $L 2>&1 || { log "servers failed"; finish 4; }
# the phone comes after other agents' heat runs: a prep that could not cool below 40 C in 10 min (exit 6) tries once more
for P in P0 P0b; do
  node tools/lock.mjs run iphone --owner $R --max-seconds 900 --keep 120 --doing "Day 11 captures: cool below 40 C, rearm (tool Serious), warm-ups" -- \
    sh $D/tri-hold.sh $P --prep > out/wc/d11-$P.log 2>&1
  e=$?; grep -v http out/wc/d11-$P.log | tail -7 | tee -a $L
  [ $e -eq 6 ] || break
done
[ $e -eq 0 ] || { log "P0 prep exit $e: no block"; finish 4; }
if [ "$FROM" -le 1 ]; then
  log "== part 1 reveal flick $(date -u +%TZ)"
  node tools/lock.mjs run iphone --owner $R --max-seconds 900 --keep 120 --doing "Day 11 reveal flick: g0.0l vs g0.0m, A V V A (screen recording)" -- \
    node tools/lock.mjs run chrome-measure --owner $R --no-timing --max-seconds 600 --doing "Day 11 reveal flick: quiet Mac for the screen recorder" -- \
    sh $D/rf.sh hold rA1 rV1 rV2 rA2 > out/wc/d11-RF.log 2>&1
  e=$?; grep -E '^(COOL|HOLD|RUN)' out/wc/d11-RF.log | tee -a $L
  log "== part 1 exit $e"
  [ $e -eq 0 ] || [ $e -eq 6 ] || finish $e
fi
if [ "$FROM" -le 2 ]; then
  log "== part 2 swipe replay $(date -u +%TZ)"
  TRI_DOING="Day 11: the user's swipe replay on original / g0.0l / g0.0m" sh $D/tri-block.sh "W1:wO1 wL1 wM1" "W2:wM2 wL2 wO2" >> $L 2>&1
  e=$?; log "== part 2 exit $e"
  [ $e -eq 0 ] || finish $e
fi
log "== part 3 slow drags $(date -u +%TZ)"
OPT_MAX_MIN=${OPT_MAX_MIN:-45} TRI_DOING="Day 11: 9 Oct slow drags on original / g0.0l / g0.0m" sh $D/tri-block.sh \
  "H1:hL1 hM1 hO1" "H2:hO2 hM2 hL2" "M1:mM1 mO1 mL1" "M2:mL2 mO2 mM2" "P1:pO1 pL1 pM1 pM2 pL2 pO2" "OPTC:cO1 cL1 cM1 cM2 cL2 cO2" >> $L 2>&1
e=$?; log "== part 3 exit $e"
finish $e

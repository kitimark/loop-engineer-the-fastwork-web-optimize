#!/bin/sh
# go.sh (art-day2-day5-clips, 2026-10-11): the whole phone block for the Day 2 / Day 5 clips, adapted from
# fixes/worst-cases-capture/d11-go.sh part 2 and tri-block.sh (cap-end-openclose, credited). Tool-held Serious
# (`iphone.mjs rearm`, as every -ar- run), Do Not Disturb stays on (no focus step).
#   0  servers: serve.sh (O original, W aw1-10c, S v6) and served-hash checks
#   P  prep (hold.sh P0 --prep): cool below 40 C, rearm, one uncounted warm-up flick per port O, W, S
#   w  the owner's swipe replay (g-ar-herofinger-v2.json), 3 arms rotated, 2 runs per arm: W1 = O W S, W2 = S W O
#      (each arm first or last once; W in the middle both times), one Mac + phone hold per group of 3; a budget stop
#      (exit 3) re-runs the rest in a new hold; a battery >= 40 C before a hold, or a hot stop (exit 6), cools first
#      (`wait.mjs phone-temp --below auto`, <= 10 min) and re-runs what was not run (at most twice)
#   end: park Safari, `thermal.mjs clear` (inside a phone hold), stop the servers
# usage (in the background): sh research/article-clips/recipes/art-d2d5/go.sh
cd "$(dirname "$0")/../../../.." || exit 2
export FW_AGENT=${FW_AGENT:-art-day2-day5-clips} FW_PHONE_CONDITION=tool
R=$FW_AGENT; D=research/article-clips/recipes/art-d2d5; O=out/wc/runs; L=out/d2d5/block.log
mkdir -p $O out/d2d5
log() { echo "$*" | tee -a $L; }
batt() { node tools/iphone.mjs battery 2>/dev/null | head -1 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).temperatureC)}catch{console.log('')}})"; }
cool() {
  log "== COOL $(date -u +%TZ) battery ${1:-?} C: wait.mjs phone-temp --below auto (<= 10 min)"
  node tools/lock.mjs run iphone --owner $R --max-seconds 700 --keep 120 --doing "Day 2/5 article clips: cooling the phone between holds" -- \
    node tools/wait.mjs phone-temp --below auto --timeout 600 --every 60 --owner $R --reason "Day 2/5 clips: cool between holds" > $O/d2d5-cool.log 2>&1
  log "== COOL exit $? $(date -u +%TZ) $(tail -1 $O/d2d5-cool.log | cut -c1-120)"
}
finish() {
  node tools/lock.mjs run iphone --owner $R --max-seconds 120 --doing "Day 2/5 article clips: park Safari, clear the thermal condition" -- \
    sh -c "node tools/iphone.mjs park > /dev/null 2>&1; node tools/thermal.mjs clear" > $O/d2d5-thermal-clear.log 2>&1
  log "FINISH park + thermal clear exit $? $(grep -v http $O/d2d5-thermal-clear.log | tail -1 | cut -c1-120)"
  sh $D/serve.sh stop >> $L 2>&1
  log "D2D5 EXIT $1 $(date -u +%FT%TZ)"; exit $1
}
log "== d2d5 start $(date -u +%FT%TZ)"
sh $D/serve.sh >> $L 2>&1 || { log "servers failed"; finish 4; }
# WDA (the robot finger) must answer before the prep; start it inside a phone hold when it does not (as p152-block.sh)
if ! node tools/iphone.mjs wda check > out/d2d5/wda-pre.log 2>&1; then
  node tools/lock.mjs run iphone --owner $R --timeout ${D2D5_QUEUE_S:-21600} --max-seconds 300 --keep 120 --doing "Day 2/5 article clips: start the robot finger (WDA)" -- \
    sh -c "node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner $R; node tools/iphone.mjs wda check" > out/d2d5/wda-start.log 2>&1
  log "WDA start exit $? $(grep -v http out/d2d5/wda-start.log | tail -1 | cut -c1-120)"
  node tools/iphone.mjs wda check > /dev/null 2>&1 || { log "WDA not ready: stop and report"; finish 5; }
fi
for P in P0 P0b; do
  node tools/lock.mjs run iphone --owner $R --timeout ${D2D5_QUEUE_S:-21600} --max-seconds 900 --keep 120 --doing "Day 2/5 article clips: cool below 40 C, rearm (tool Serious), warm-ups" -- \
    sh $D/hold.sh $P --prep > out/d2d5/$P.log 2>&1
  e=$?; grep -v http out/d2d5/$P.log | tail -7 | tee -a $L
  [ $e -eq 6 ] || break
done
[ $e -eq 0 ] || { log "P0 prep exit $e: no block"; finish 4; }
st=0
for SPEC in "W1:wO1 wW1 wS1" "W2:wS2 wW2 wO2"; do
  H=${SPEC%%:*}; ITEMS=${SPEC#*:}; k=0; hot=0
  while [ -n "$ITEMS" ]; do
    HH=$H; [ $k -gt 0 ] && HH=$H.$k
    T=$(batt); log "== $(date -u +%FT%TZ) $HH: $ITEMS (battery ${T:-?} C)"
    [ -n "$T" ] && python3 -c "import sys; sys.exit(0 if float('$T') >= 40.0 else 1)" && cool "$T"
    rm -f $O/$HH-remaining.txt
    node tools/lock.mjs run iphone --owner $R --max-seconds 900 --keep 120 --doing "Day 2/5 article clips: owner's swipe replay on original / aw1-10c / v6, $HH" -- \
      node tools/lock.mjs run chrome-measure --owner $R --no-timing --max-seconds 600 --doing "Day 2/5 clips $HH: quiet Mac for the screen recorder" -- \
      sh $D/hold.sh $HH $ITEMS > out/d2d5/$HH.log 2>&1
    e=$?
    grep -E '^(COOL|HOLD|RUN|READY|OPEN|ITEM)' out/d2d5/$HH.log | tee -a $L
    log "== $HH exit $e"
    if [ $e -eq 3 ] && [ -s $O/$HH-remaining.txt ] && [ $k -lt 3 ]; then ITEMS=$(cat $O/$HH-remaining.txt); k=$((k + 1)); continue; fi
    if [ $e -eq 6 ] && [ $hot -lt 2 ]; then
      hot=$((hot + 1)); cool "$(batt)"
      [ -s $O/$HH-remaining.txt ] && { ITEMS=$(cat $O/$HH-remaining.txt); k=$((k + 1)); continue; }
      ITEMS=""; continue
    fi
    [ $e -ne 0 ] && { st=$e; break 2; }
    ITEMS=""
  done
done
finish $st

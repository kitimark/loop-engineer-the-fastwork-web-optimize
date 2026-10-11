#!/bin/sh
# tri-block.sh (cap-end-openclose, 2026-10-11): ar-block.sh running tri-hold.sh (three arms O / L / M), plus
#   - a battery read (no lease) before each hold: at >= ${TRI_COOL_AT:-40.0} C the phone cools inside a phone hold with
#     `wait.mjs phone-temp --below auto` (<= 10 min), then the hold runs;
#   - a hold stopped hot (tri-hold exit 6: Critical or >= 43 C after a run) cools the same way and re-runs the items it
#     did not run (out/wc/runs/<H>-remaining.txt), at most twice per spec; the hot run itself is kept, out of the headline.
# Each hold: `lock.mjs run iphone --keep 120` wrapping the runner's 600 s --no-timing chrome-measure hold, as ar-block.sh.
# A budget stop (exit 3) re-runs the rest in a new hold (as ar-block.sh). Optional specs OPT*: only while the block so far
# took <= OPT_MAX_MIN minutes (default 30). Unlike ar-block.sh it does NOT clear the thermal condition: the caller does
# that once at the very end (its last step), after any other part that needs the tool-held Serious profile.
# usage (in the background): sh fixes/worst-cases-capture/tri-block.sh "H1:hO1 hL1 hM1" "H2:hM2 hL2 hO2" ...
cd "$(dirname "$0")/../.." || exit 2
R=${FW_AGENT:-cap-end-openclose}; O=out/wc/runs; D=fixes/worst-cases-capture
batt() { node tools/iphone.mjs battery 2>/dev/null | head -1 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).temperatureC)}catch{console.log('')}})"; }
cool() {
  echo "== COOL $(date -u +%TZ) battery ${1:-?} C: wait.mjs phone-temp --below auto (<= 10 min)"
  node tools/lock.mjs run iphone --owner $R --max-seconds 700 --keep 120 --doing "9 Oct items with g0.0m: cooling the phone between holds" -- \
    node tools/wait.mjs phone-temp --below auto --timeout 600 --every 60 --owner $R --reason "9 Oct items with g0.0m: cool between holds" > $O/tri-cool.log 2>&1
  echo "== COOL exit $? $(date -u +%TZ) $(tail -1 $O/tri-cool.log | cut -c1-120)"
}
st=0; B0=$(date +%s)
for SPEC in "$@"; do
  H=${SPEC%%:*}; ITEMS=${SPEC#*:}; k=0; hot=0
  case $H in OPT*)
    [ $(( ($(date +%s) - B0) / 60 )) -gt ${OPT_MAX_MIN:-30} ] && { echo "== SKIP optional $H after $(( ($(date +%s) - B0) / 60 )) min: $ITEMS"; continue; } ;; esac
  while [ -n "$ITEMS" ]; do
    HH=$H; [ $k -gt 0 ] && HH=$H.$k
    T=$(batt); echo "== $(date -u +%FT%TZ) $HH: $ITEMS (battery ${T:-?} C)"
    [ -n "$T" ] && python3 -c "import sys; sys.exit(0 if float('$T') >= float('${TRI_COOL_AT:-40.0}') else 1)" && cool "$T"
    rm -f $O/$HH-remaining.txt
    node tools/lock.mjs run iphone --owner $R --max-seconds 900 --keep 120 --doing "${TRI_DOING:-9 Oct worst-case items again, original / g0.0l / g0.0m} $HH" -- \
      node tools/lock.mjs run chrome-measure --owner $R --no-timing --max-seconds 600 --doing "9 Oct items with g0.0m $HH: quiet Mac for the screen recorder" -- \
      sh $D/tri-hold.sh $HH $ITEMS
    e=$?
    echo "== $HH exit $e"
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
echo "TRI BLOCK END exit $st $(date -u +%FT%TZ)"
exit $st

#!/bin/sh
# Worst-case captures (cap-worst, 2026-10-09): the recording holds after H0's prep, in order. Each hold is its own
# `lock.mjs run iphone --keep 120` (so the next one continues the same phone hold) wrapping the runner's own 600 s
# --no-timing chrome-measure hold (a quiet Mac for the recorder). A hold that stops on its time budget (exit 3) is
# followed by a new hold with the items it did not run (out/wc/runs/<H>-remaining.txt); any other stop ends the block.
# At the end, always: `node tools/thermal.mjs clear` (the tool-serious condition from H0's rearm).
# usage (in the background): sh fixes/worst-cases-capture/wc-block.sh "H1:hA1 hV1 hV2 hA2" "H2:pA1 pV1 ..." ...
cd "$(dirname "$0")/../.." || exit 2
R=cap-worst; O=out/wc/runs; D=fixes/worst-cases-capture
st=0; B0=$(date +%s)
for SPEC in "$@"; do
  H=${SPEC%%:*}; ITEMS=${SPEC#*:}; k=0
  case $H in OPT*) # optional hold: only when the block so far took <= OPT_MAX_MIN minutes (default 30; lead: ~40 min block)
    [ $(( ($(date +%s) - B0) / 60 )) -gt ${OPT_MAX_MIN:-30} ] && { echo "== SKIP optional $H after $(( ($(date +%s) - B0) / 60 )) min: $ITEMS"; continue; } ;; esac
  while [ -n "$ITEMS" ]; do
    HH=$H; [ $k -gt 0 ] && HH=$H.$k
    echo "== $(date -u +%FT%TZ) $HH: $ITEMS"
    rm -f $O/$HH-remaining.txt
    node tools/lock.mjs run iphone --owner $R --max-seconds 900 --keep 120 --doing "worst-case captures $HH (original vs g0.0l)" -- \
      node tools/lock.mjs run chrome-measure --owner $R --no-timing --max-seconds 600 --doing "worst-case captures $HH: quiet Mac for the screen recorder" -- \
      sh $D/wc-hold.sh $HH $ITEMS
    e=$?
    echo "== $HH exit $e"
    if [ $e -eq 3 ] && [ -s $O/$HH-remaining.txt ] && [ $k -lt 2 ]; then ITEMS=$(cat $O/$HH-remaining.txt); k=$((k + 1)); continue; fi
    [ $e -ne 0 ] && { st=$e; break 2; }
    ITEMS=""
  done
done
node tools/thermal.mjs clear --owner $R > $O/thermal-clear.log 2>&1; echo "THERMAL clear exit $? $(tail -1 $O/thermal-clear.log | cut -c1-120)"
echo "BLOCK END exit $st $(date -u +%FT%TZ)"
exit $st

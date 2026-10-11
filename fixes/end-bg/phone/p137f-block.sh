#!/bin/sh
# P-137o block 2 driver (fixes/end-bg/README.md "P-137o"; lead decision 2026-10-11): p137o-block.sh for three arms O / C / V
# on the fs-fixed script (p137f-hold.sh). Part start inside the phone hold: `iphone.mjs preflight` and `iphone.mjs rearm
# --settle 120` (NOT-NEEDED when our condition already holds); P137F_CLEAR=1 ends the condition after the last hold.
# Usage (cap-end-orig, in the background; servers first: sh fixes/end-bg/phone/p137f-serve.sh start), ONE phone hold:
#   TICKET=P-137o P137F_CLEAR=1 node tools/lock.mjs run iphone --owner cap-end-orig --block P-137o --max-seconds 3600 -- \
#     sh fixes/end-bg/phone/p137f-block.sh H1:WO,WC H2:WV,S0 H3:EO1,EC1 H4:EV1,EC2 H5:EV2,EO2 H6:EV3,EO3 H7:EC3 H8:TAIL
# Counted order: a rotated 3-arm Latin square O C V | C V O | V O C; sentinels S0/S1 on C. TAIL = at most 2 re-runs of
# counted runs named in RERUN-NEEDED lines of hold-H3..H7, then S1. Gates at the phone hold's edges. P137F_DRY=1: plan only.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-137o ] || { echo "TICKET is not P-137o: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-137o sh fixes/end-bg/phone/p137o-block.sh H<n>:<item>,<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-cap-end-orig}; LG=out/p137f; HS=fixes/end-bg/phone/p137f-hold.sh
export FW_PHONE_CONDITION=tool
mkdir -p $LG
clear_cond() { node tools/thermal.mjs clear --owner "$R" > $LG/thermal-clear-$(date +%s).log 2>&1; echo "THERMAL clear exit $?"; }
if [ "$P137F_DRY" != 1 ]; then
  trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1' EXIT
  node tools/iphone.mjs preflight --owner "$R" > $LG/preflight-$(date +%s).log 2>&1; pe=$?
  [ $pe -eq 0 ] || { echo "BLOCK STOP preflight exit $pe (see $LG/preflight-*.log)"; exit 9; }
  echo "PREFLIGHT ok $(date -u +%TZ)"
  RL=$LG/rearm-$(date +%s).log
  node tools/iphone.mjs rearm --owner "$R" --settle 120 > $RL 2>&1; re=$?
  echo "REARM exit $re: $(grep -E '^REARM' $RL | tail -1 | cut -c1-160)"
  [ $re -eq 0 ] || { clear_cond; echo "BLOCK STOP rearm exit $re"; exit 8; }
fi
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P137F_DRY" != 1 ]; then sh fixes/end-bg/phone/heat-step.sh "$R" $LG/runs $h; hs=$?; [ $hs -eq 0 ] || { echo "$h heat step exit $hs (re-arm failed)"; return 5; }; fi   # heat step in the phone hold, before the Mac hold (2026-10-11)
  if [ "$P137F_DRY" = 1 ]; then P137F_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P137F_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-137o $h: $* (original / pictures on / pictures off, end of page, phone)" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID|GATE .* fallback)' $LG/hold-$h.log
  [ "$P137F_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { if [ $FIRST = 1 ] && [ $1 = 1 ]; then echo both; elif [ $FIRST = 1 ]; then echo start; elif [ $1 = 1 ]; then echo end; else echo none; fi; }
run1() { # last(0|1) H items...
  GMODE=$(gmode $1); shift
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; [ "$P137F_DRY" = 1 ] || clear_cond; exit $e; }
  FIRST=0
}
i=0
for spec in "$@"; do
  i=$((i + 1)); LAST=0; [ $i -eq $# ] && LAST=1
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H3.log $LG/hold-H4.log $LG/hold-H5.log $LG/hold-H6.log $LG/hold-H7.log; do [ -e $f ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' $f; done | tr ' ' '\n' | grep -E '^E[OCV][1-3]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run, the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2}, then S1"
    if [ -z "$R1" ]; then run1 $LAST $H S1
    elif [ -z "$R2" ]; then run1 $LAST $H ${R1}r S1
    else run1 0 $H ${R1}r ${R2}r; N=H$(( ${H#H} + 1 )); run1 $LAST $N S1; fi
  else run1 $LAST $H $items; fi
done
[ "$P137F_CLEAR" = 1 ] && [ "$P137F_DRY" != 1 ] && [ ! -e $LG/NO_CLEAR ] && clear_cond   # NO_CLEAR (lead 00:1xZ): P-095o follows back to back on the same condition
echo "BLOCK PART DONE: $*"
# THEN_P095O (lead 2026-10-11 00:1xZ: block 2 and P-095o back to back on the same tool-held condition, one phone hold):
# after a complete block 2, the hold's mark becomes P-095o and P-095o's driver runs here; it clears the condition at its end.
if [ -e $LG/THEN_P095O ] && [ "$P137F_DRY" != 1 ]; then
  node tools/lock.mjs doing iphone --owner "$R" --block P-095o > /dev/null 2>&1
  echo "P-095o start $(date -u +%TZ) (log out/p095o/block.log)"
  TICKET=P-095o P095O_CLEAR=1 sh fixes/hero-exit-threaded/p095o/block.sh H1:wO,wC,wV,S0 H2:O1,C1,V1 H3:C2,V2,O2 H4:V3,O3,C3 H5:TAIL > out/p095o/block.log 2>&1
  echo "P-095o exit $? $(date -u +%TZ): $(tail -1 out/p095o/block.log)"
fi

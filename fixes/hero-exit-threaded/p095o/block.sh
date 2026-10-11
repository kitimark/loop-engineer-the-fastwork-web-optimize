#!/bin/sh
# P-095o block driver (fixes/hero-exit-threaded/README.md "P-095o"): fixes/end-bg/phone/p137o-block.sh for the hero
# block with three arms O (original), C (v4 = best-build) and V (v6 = B-R2). At the part's start, inside the phone hold:
# `iphone.mjs preflight` (I-227) and `iphone.mjs rearm --settle 120` (I-225, the thermal tool holds the Serious device
# condition; NOT-NEEDED when ours already fits); P095O_CLEAR=1 ends it with `thermal.mjs clear` after the last hold.
# Usage (cap-end-orig, in the background; servers first: sh fixes/hero-exit-threaded/p095o/serve.sh start):
#   TICKET=P-095o P095O_CLEAR=1 node tools/lock.mjs run iphone --owner cap-end-orig --block P-095o --max-seconds 3600 -- \
#     sh fixes/hero-exit-threaded/p095o/block.sh H1:wO,wC,wV,S0 H2:O1,C1,V1 H3:C2,V2,O2 H4:V3,O3,C3 H5:TAIL
# Counted order: a rotated 3-arm Latin square, O C V | C V O | V O C; sentinels S0/S1 on C. TAIL = at most 2 re-runs of
# void counted runs (from RERUN-NEEDED lines of hold-H2..H4), then S1. Gates at the phone hold's edges (P095O_GATE).
# Logs out/p095o/hold-<H>.log. P095O_DRY=1: pins and plan only.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-095o ] || { echo "TICKET is not P-095o: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-095o sh fixes/hero-exit-threaded/p095o/block.sh H<n>:<item>,<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-cap-end-orig}; LG=out/p095o; HS=fixes/hero-exit-threaded/p095o/hold.sh
export FW_PHONE_CONDITION=tool
mkdir -p $LG
clear_cond() { node tools/thermal.mjs clear --owner "$R" > $LG/thermal-clear-$(date +%s).log 2>&1; echo "THERMAL clear exit $?"; }
if [ "$P095O_DRY" != 1 ]; then
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
  if [ "$P095O_DRY" != 1 ]; then sh fixes/end-bg/phone/heat-step.sh "$R" $LG/runs $h; hs=$?; [ $hs -eq 0 ] || { echo "$h heat step exit $hs (re-arm failed)"; return 5; }; fi   # heat step in the phone hold, before the Mac hold (2026-10-11)
  if [ "$P095O_DRY" = 1 ]; then P095O_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P095O_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-095o $h: $* (original vs v4 vs v6, hero, phone)" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID|GATE .* fallback)' $LG/hold-$h.log
  [ "$P095O_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { if [ $FIRST = 1 ] && [ $1 = 1 ]; then echo both; elif [ $FIRST = 1 ]; then echo start; elif [ $1 = 1 ]; then echo end; else echo none; fi; }
run1() { # last(0|1) H items...
  GMODE=$(gmode $1); shift
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; [ "$P095O_DRY" = 1 ] || clear_cond; exit $e; }
  FIRST=0
}
i=0
for spec in "$@"; do
  i=$((i + 1)); LAST=0; [ $i -eq $# ] && LAST=1
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H2.log $LG/hold-H3.log $LG/hold-H4.log; do [ -e $f ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' $f; done | tr ' ' '\n' | grep -E '^[OCV][1-3]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run, the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2}, then S1"
    if [ -z "$R1" ]; then run1 $LAST $H S1
    elif [ -z "$R2" ]; then run1 $LAST $H ${R1}r S1
    else run1 0 $H ${R1}r ${R2}r; N=H$(( ${H#H} + 1 )); run1 $LAST $N S1; fi
  else run1 $LAST $H $items; fi
done
[ "$P095O_CLEAR" = 1 ] && [ "$P095O_DRY" != 1 ] && clear_cond
echo "BLOCK PART DONE: $*"

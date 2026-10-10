#!/bin/sh
# P-137o block driver (fixes/end-bg/README.md "P-137o"): a copy of p137-block.sh (P-137) for arms O (original) and C,
# with two additions at the part's start, both inside the phone hold and before the first chrome-measure hold:
#   1. `iphone.mjs preflight` (I-227: WDA, automation, Safari in front, one tab);
#   2. `iphone.mjs rearm --settle 120` (I-225): the thermal tool holds Xcode's Serious device condition for the block
#      (REARM NOT-NEEDED when our own condition already fits, e.g. in part 2). P137O_CLEAR=1 (the last part) ends it
#      with `thermal.mjs clear` after the last hold; any BLOCK STOP ends it too.
# Usage (cap-end-orig, in the background; servers first: sh fixes/end-bg/phone/p137o-serve.sh start):
#   TICKET=P-137o node tools/lock.mjs run iphone --owner cap-end-orig --block P-137o --max-seconds 3600 -- \
#     sh fixes/end-bg/phone/p137o-block.sh H1:WO,WC H2:S0,EO1 H3:EC1,EC2
#   TICKET=P-137o P137O_CLEAR=1 node tools/lock.mjs run iphone --owner cap-end-orig --block P-137o --max-seconds 3600 -- \
#     sh fixes/end-bg/phone/p137o-block.sh H4:EO2,EO3 H5:EC3,EC4 H6:EO4 H7:TAIL
# Counted order O C C O O C C O (EO1 EC1 EC2 EO2 EO3 EC3 EC4 EO4); sentinels S0/S1 on C. TAIL, time-guard retry,
# gate placement (P137O_GATE: start / none / end at the phone hold's edges) and logs (out/p137o/hold-<H>.log): as P-137.
# P137O_DRY=1: pins and plan only (no lock, no phone, no rearm).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-137o ] || { echo "TICKET is not P-137o: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-137o sh fixes/end-bg/phone/p137o-block.sh H<n>:<item>,<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-cap-end-orig}; LG=out/p137o; HS=fixes/end-bg/phone/p137o-hold.sh
export FW_PHONE_CONDITION=tool
mkdir -p $LG
clear_cond() { node tools/thermal.mjs clear --owner "$R" > $LG/thermal-clear-$(date +%s).log 2>&1; echo "THERMAL clear exit $?"; }
if [ "$P137O_DRY" != 1 ]; then
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
  if [ "$P137O_DRY" = 1 ]; then P137O_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P137O_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-137o $h: $* (original vs C, end of page, phone)" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID|GATE .* fallback)' $LG/hold-$h.log
  [ "$P137O_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { if [ $FIRST = 1 ] && [ $1 = 1 ]; then echo both; elif [ $FIRST = 1 ]; then echo start; elif [ $1 = 1 ]; then echo end; else echo none; fi; }
run1() { # last(0|1) H items...
  GMODE=$(gmode $1); shift
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; [ "$P137O_DRY" = 1 ] || clear_cond; exit $e; }
  FIRST=0
}
i=0
for spec in "$@"; do
  i=$((i + 1)); LAST=0; [ $i -eq $# ] && LAST=1
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H2.log $LG/hold-H3.log $LG/hold-H4.log $LG/hold-H5.log $LG/hold-H6.log; do [ -e $f ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' $f; done | tr ' ' '\n' | grep -E '^E[OC][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run, the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2}, then S1"
    if [ -z "$R1" ]; then run1 $LAST $H S1
    elif [ -z "$R2" ]; then run1 $LAST $H ${R1}r S1
    else run1 0 $H ${R1}r ${R2}r; N=H$(( ${H#H} + 1 )); run1 $LAST $N S1; fi
  else run1 $LAST $H $items; fi
done
[ "$P137O_CLEAR" = 1 ] && [ "$P137O_DRY" != 1 ] && clear_cond
echo "BLOCK PART DONE: $*"

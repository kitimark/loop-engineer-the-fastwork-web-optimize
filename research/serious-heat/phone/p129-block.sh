#!/bin/sh
# P-129 block driver (card: research/serious-heat/README.md §5 "P-129" rev 2.1; the lead's 08:57Z run conditions):
# runs inside ONE phone hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order,
# each holding at most 2 fs runs (p129-hold.sh). Usage (the runner, in the background):
#   TICKET=P-129 node tools/lock.mjs run iphone --owner iphone-runner --block P-129 --max-seconds 3600 -- \
#     sh research/serious-heat/phone/p129-block.sh H1:W,S0 H2:E1,L1 H3:L2,E2
#   TICKET=P-129 node tools/lock.mjs run iphone --owner iphone-runner --block P-129 --max-seconds 3600 -- \
#     sh research/serious-heat/phone/p129-block.sh H4:E3,L3 H5:L4,E4 H6:TAIL
# (two phone holds split at a pair boundary: the budget total, 7 x 229 + 6 x 246 s of fs runs plus the gates, is over the
# lead's ~55 min for one 3600 s phone hold; the unmarked gap between them is accepted, I-202.)
# H<n>:TAIL = the block's tail: the counted runs named in RERUN-NEEDED lines of out/p129/hold-H[2-5].log, at most 2 per
# block, each re-run once as <run>r, then S1. One re-run: H<n> "<r> S1"; two: H<n> "<r1> <r2>" and H<n+1> "S1"; none: "S1".
# A hold that exits 7 (its time guard) is re-run whole once; any other non-zero exit stops the driver (exit = the hold's).
# Logs: out/p129/hold-<H>.log (an earlier one moved aside). After each hold: doing iphone --between 1.
# P129_DRY=1: calls p129-hold.sh directly (its dry mode: pins and plan only, no lock, no phone).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-129 ] || { echo "TICKET is not P-129: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-129 sh research/serious-heat/phone/p129-block.sh H<n>:<item>,<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p129; HS=research/serious-heat/phone/p129-hold.sh
mkdir -p $LG
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P129_DRY" = 1 ]; then sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-129 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P129_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
run1() { # H items...: one hold, a time-guard VOID (7) re-run whole once
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
}
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H2.log $LG/hold-H3.log $LG/hold-H4.log $LG/hold-H5.log; do [ -e $f ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' $f; done | tr ' ' '\n' | grep -E '^[EL][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run (card: at most 2 per block), the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2} (as ${R1:+${R1}r}${R2:+ ${R2}r}), then S1"
    if [ -z "$R1" ]; then run1 $H S1
    elif [ -z "$R2" ]; then run1 $H ${R1}r S1
    else run1 $H ${R1}r ${R2}r; N=H$(( ${H#H} + 1 )); run1 $N S1; fi
  else run1 $H $items; fi
done
echo "BLOCK PART DONE: $*"

#!/bin/sh
# P-140 block driver (card: fixes/hero-park/TICKET.md), adapted from P-129's p129-block.sh: runs inside ONE phone
# hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order, each holding at most
# 2 fs runs (p140-hold.sh). Start the servers first: sh fixes/hero-park/phone/p140-serve.sh start. Usage (the runner, in
# the background):
#   TICKET=P-140 node tools/lock.mjs run iphone --owner iphone-runner --block P-140 --max-seconds 3600 -- \
#     sh fixes/hero-park/phone/p140-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2
#   TICKET=P-140 node tools/lock.mjs run iphone --owner iphone-runner --block P-140 --max-seconds 3600 -- \
#     sh fixes/hero-park/phone/p140-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL
# (two phone holds split at a pair boundary: 12-14 fs runs of about 229 s plus 4 gates are over one 3600 s phone hold.)
# H<n>:TAIL = the block's tail: the counted runs named in RERUN-NEEDED lines of out/p140/hold-H[2-6].log, at most 2 per
# block, each re-run once as <run>r, then S1. One re-run: H<n> "<r> S1"; two: H<n> "<r1> <r2>" and H<n+1> "S1"; none: "S1".
# A hold that exits 7 (its time guard) is re-run whole once; any other non-zero exit stops the driver (exit = the hold's).
# Logs: out/p140/hold-<H>.log (an earlier one moved aside). After each hold: doing iphone --between 1.
# Thermal gates: only at this phone hold's edges, via P140_GATE: the first hold "start", the last "end" (a part with
# one hold: "both"), every middle hold "none"; with two parts that is 4 gates in the block.
# P140_DRY=1: calls p140-hold.sh directly (its dry mode: pins and plan only, no lock, no phone).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-140 ] || { echo "TICKET is not P-140: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-140 sh fixes/hero-park/phone/p140-block.sh H<n>:<item>,<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p140; HS=fixes/hero-park/phone/p140-hold.sh
mkdir -p $LG
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P140_DRY" = 1 ]; then P140_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P140_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-140 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P140_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { # last(0|1) -> the hold's P140_GATE: gates only at this phone hold's edges
  if [ $FIRST = 1 ] && [ $1 = 1 ]; then echo both; elif [ $FIRST = 1 ]; then echo start; elif [ $1 = 1 ]; then echo end; else echo none; fi; }
run1() { # last(0|1) H items...: one hold, a time-guard VOID (7) re-run whole once
  GMODE=$(gmode $1); shift
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
  FIRST=0
}
i=0
for spec in "$@"; do
  i=$((i + 1)); LAST=0; [ $i -eq $# ] && LAST=1
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H2.log $LG/hold-H3.log $LG/hold-H4.log $LG/hold-H5.log $LG/hold-H6.log; do [ -e $f ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' $f; done | tr ' ' '\n' | grep -E '^E[CV][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run (card: at most 2 per block), the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2} (as ${R1:+${R1}r}${R2:+ ${R2}r}), then S1"
    if [ -z "$R1" ]; then run1 $LAST $H S1
    elif [ -z "$R2" ]; then run1 $LAST $H ${R1}r S1
    else run1 0 $H ${R1}r ${R2}r; N=H$(( ${H#H} + 1 )); run1 $LAST $N S1; fi
  else run1 $LAST $H $items; fi
done
echo "BLOCK PART DONE: $*"

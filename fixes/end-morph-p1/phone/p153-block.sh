#!/bin/sh
# P-153 block driver (card: fixes/end-morph-p1/README.md "P-153", rev 1.1), a copy of fix-end-morph's P-152 rev 1.1 driver
# (fixes/end-morph-f12/phone/p152-block.sh d2d8e37c419d at ac229f7f; names changed, plus ENDGATE below), itself fix-end-bg's P-137 driver (fixes/end-bg/phone/
# p137-block.sh at 24041a92, from P-129's p129-block.sh) with the P-153 names, a WDA restart at the start of every part
# (lead condition 6, the I-212 lesson) and Safari parked at its end. Runs inside ONE phone
# hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order, each holding at most
# 2 fs runs (p153-hold.sh). Start the servers first: sh fixes/end-morph-p1/phone/p153-serve.sh start. Usage (the runner, in
# the background):
#   TICKET=P-153 node tools/lock.mjs run iphone --owner iphone-runner --block P-153 --max-seconds 3600 -- \
#     sh fixes/end-morph-p1/phone/p153-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2
#   TICKET=P-153 node tools/lock.mjs run iphone --owner iphone-runner --block P-153 --max-seconds 3600 -- \
#     sh fixes/end-morph-p1/phone/p153-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1
# (two phone holds split at a pair boundary: 12-14 fs runs of about 229 s plus 4 gates are over one 3600 s phone hold.)
# H<n>:TAIL = the block's tail: the counted runs named in RERUN-NEEDED lines of out/p153/hold-H[2-6].log, at most 2 per
# block, each re-run once as <run>r, then S1. One re-run: H<n> "<r> S1"; two: H<n> "<r1> <r2>" and H<n+1> "S1"; none: "S1".
# A hold that exits 7 (its time guard) is re-run whole once; any other non-zero exit stops the driver (exit = the hold's).
# Logs: out/p153/hold-<H>.log (an earlier one moved aside). After each hold: doing iphone --between 1.
# Thermal gates: only at this phone hold's edges, via P153_GATE: the first hold "start", the last "end" (a part with
# one hold: "both"), every middle hold "none"; with two parts that is 4 gates in the block.
# P153_DRY=1: calls p153-hold.sh directly (its dry mode: pins and plan only, no lock, no phone).
# Rev 1.1 (lead rulings on the pre-data read, 2026-10-06):
#   N4: Safari is parked on EVERY exit of a part (an EXIT trap), a BLOCK STOP on a failed hold or gate included.
#   N6: every part starts with p153-serve.sh check, appended to out/p153/serve-check.log (B, C and V served hashes);
#       a failed check stops the part before anything runs (exit 4).
#   N2: before block 2 (only after a block-1 FAIL and the lead's go): TICKET=P-153 sh p153-block.sh ARCHIVE-BLOCK1 moves
#       out/p153/runs, the hold logs, the WDA logs and serve-check.log to out/p153/block1/ (refuses when it exists) and
#       restarts the three servers; block 2 is read by itself from out/p153/runs (never pooled with block 1).
#   N3: part 2's end gate runs only in HA (after the attribution runs); an HA end-gate failure (over 44 °C, or not
#       Serious) voids part 2's counted runs (p153-read.mjs reads hold-HA.log).
#   Late P-152 delta (lead, 2026-10-06): part 2 counts only when hold-HA.log ends "HOLD HA VALID", or when HA stopped
#       before its end gate (another VOID) and a standalone end gate runs right after it, inside the same phone hold:
#       TICKET=P-153 sh p153-block.sh ENDGATE  -> out/p153/endgate-HA.log, last line "ENDGATE PASS" or "ENDGATE FAIL exit N".
#       A VOID block 1 is archived the same way (ARCHIVE-BLOCK1) and counts as one of the 2 blocks.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-153 sh fixes/end-morph-p1/phone/p153-block.sh H<n>:<item>,<item> ... [H<n>:TAIL] | ARCHIVE-BLOCK1 | ENDGATE"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p153; HS=fixes/end-morph-p1/phone/p153-hold.sh; SS=fixes/end-morph-p1/phone/p153-serve.sh
mkdir -p $LG
if [ "$1" = ARCHIVE-BLOCK1 ]; then
  [ -e $LG/block1 ] && { echo "ARCHIVE refused: $LG/block1 exists"; exit 2; }
  mkdir -p $LG/block1 || exit 2
  [ -d $LG/runs ] && mv $LG/runs $LG/block1/
  for f in $LG/hold-* $LG/wda-restart-* $LG/serve-check.log $LG/endgate-HA.log $LG/void; do [ -e "$f" ] && mv "$f" $LG/block1/; done
  sh $SS stop && sh $SS start || { echo "ARCHIVE done, but the servers did not restart: no block 2"; exit 4; }
  echo "ARCHIVED block 1 into $LG/block1; servers restarted"; exit 0
fi
if [ "$1" = ENDGATE ]; then
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)") && BU=$(node tools/lan.mjs --url --port "$PB") || { echo "ENDGATE FAIL no B server" | tee $LG/endgate-HA.log; exit 4; }
  { echo "== $(date -u +%FT%TZ) standalone end gate after HA"; node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label p153-HA-endgate --expect serious --max-c 44 --accept-induced --url "$BU"; g=$?
    [ $g -eq 0 ] && echo "ENDGATE PASS" || echo "ENDGATE FAIL exit $g"; } > $LG/endgate-HA.log 2>&1
  tail -1 $LG/endgate-HA.log; grep -q "^ENDGATE PASS" $LG/endgate-HA.log; exit $?
fi
# N4: park Safari on every exit of a part (not in dry mode)
[ "$P153_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
# N6: the servers' check, logged, at every part start
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p153-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok$') of 3 servers"
# lead condition 6: a fresh WDA at the start of every part (not in dry mode)
if [ "$P153_DRY" != 1 ]; then
  { node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner "$R"; node tools/iphone.mjs wda check; } > $LG/wda-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: wda stop/start/check failed (see $LG/wda-restart-*.log)"; exit 5; }
  echo "WDA restarted and READY"
fi
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P153_DRY" = 1 ]; then P153_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P153_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-153 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P153_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { # last(0|1) -> the hold's P153_GATE: gates only at this phone hold's edges
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

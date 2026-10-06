#!/bin/sh
# P-153 block driver (card: fixes/end-morph-p1/README.md "P-153", rev 1.2), a copy of fix-end-morph's P-152 rev 1.3 driver
# (fixes/end-morph-f12/phone/p152-block.sh 4b8c70324a81 at e3c1a254; names changed; the block-1 archive also moves
# out/p153/void), itself fix-end-bg's P-137 driver (fixes/end-bg/phone/
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
# Thermal gates (rev 1.3): EVERY hold runs a start and an end gate (P153_GATE=both); an end-gate FAIL voids only that
# hold's runs (p153-read.mjs) and the block stops. (Rev 1-1.2 gated only each phone hold's edges.)
# P153_DRY=1: calls p153-hold.sh directly (its dry mode: pins and plan only, no lock, no phone).
# Rev 1.1 (lead rulings on the pre-data read, 2026-10-06):
#   N4: Safari is parked on EVERY exit of a part (an EXIT trap), a BLOCK STOP on a failed hold or gate included.
#   N6: every part starts with p153-serve.sh check, appended to out/p153/serve-check.log (B, C and V served hashes);
#       a failed check stops the part before anything runs (exit 4).
#   N2: before block 2 (only after a block-1 FAIL and the lead's go): TICKET=P-153 sh p153-block.sh ARCHIVE-BLOCK1 moves
#       out/p153/runs, the hold logs, the WDA logs and serve-check.log to out/p153/block1/ (refuses when it exists) and
#       restarts the three servers; block 2 is read by itself from out/p153/runs (never pooled with block 1).
#   N3: part 2's end gate runs only in HA (after the attribution runs); an HA end-gate failure (over 44 °C, or not
#       Serious) voids part 2's counted runs (p153-read.mjs reads hold-HA.log). Superseded by rev 1.3 (every hold gated).
# Rev 1.3 (lead rulings after block 1 stopped at H3's end gate, Critical at 43.0 °C, 2026-10-06):
#   (a) every hold gets a start and an end gate; an end-gate FAIL voids only that hold's runs; the block stops.
#   (b) after each hold but the part's last, when that hold's end gate read the battery at >= 41.5 °C, a logged cooling
#       gap: wait.mjs phone-temp --below 40 --timeout 600 (out/p153/cooling.log). Under xcode-serious it is a ceiling
#       guard, not a heat-profile change. A cooling timeout is logged and the next hold's start gate decides.
#   (c) no hold carries more than two counted runs (E[CV]n, E[CV]nr): the driver refuses such a plan before anything runs.
#   (d) P153_COOL_FIRST=<°C> (block 2's part 1: 38): before anything else, wait.mjs phone-temp --below <°C> --timeout
#       900, logged; a timeout stops the part (exit 6). The first hold's start gate then must read Serious, induced Yes.
#   I-214's workaround at every part start, after the WDA restart: iphone.mjs safari-restart --url <B> (exit 5 if it fails).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-153 sh fixes/end-morph-p1/phone/p153-block.sh H<n>:<item>,<item> ... [H<n>:TAIL] | ARCHIVE-BLOCK1"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p153; HS=fixes/end-morph-p1/phone/p153-hold.sh; SS=fixes/end-morph-p1/phone/p153-serve.sh
mkdir -p $LG
if [ "$1" = ARCHIVE-BLOCK1 ]; then
  [ -e $LG/block1 ] && { echo "ARCHIVE refused: $LG/block1 exists"; exit 2; }
  mkdir -p $LG/block1 || exit 2
  [ -d $LG/runs ] && mv $LG/runs $LG/block1/
  for f in $LG/hold-* $LG/wda-restart-* $LG/serve-check.log $LG/void; do [ -e "$f" ] && mv "$f" $LG/block1/; done
  sh $SS stop && sh $SS start || { echo "ARCHIVE done, but the servers did not restart: no block 2"; exit 4; }
  echo "ARCHIVED block 1 into $LG/block1; servers restarted"; exit 0
fi
# (c) at most two counted runs per hold, checked before anything runs
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -cE '^E[CV][1-4]r?$')
  [ "$it" -gt 2 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it counted runs (rev 1.3: at most 2 per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "P-153 $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -2 $LG/cooling.log | sed -n 's/^\(MET\|TIMEOUT\|UNAVAILABLE\)/\1/p;/^COOL/p'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
PSTART=$(date -u +%FT%TZ) # gate records of this part only (the cooling-gap read)
# N4: park Safari on every exit of a part (not in dry mode)
[ "$P153_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
# N6: the servers' check, logged, at every part start
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p153-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok$') of 3 servers"
# (d) cooling before the part (block 2's part 1)
if [ -n "$P153_COOL_FIRST" ] && [ "$P153_DRY" != 1 ]; then
  coolwait "$P153_COOL_FIRST" 900 "cooling before the part" || { echo "BLOCK STOP: the phone did not cool below $P153_COOL_FIRST °C in 900 s"; exit 6; }
fi
# lead condition 6: a fresh WDA at the start of every part (not in dry mode)
if [ "$P153_DRY" != 1 ]; then
  { node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner "$R"; node tools/iphone.mjs wda check; } > $LG/wda-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: wda stop/start/check failed (see $LG/wda-restart-*.log)"; exit 5; }
  echo "WDA restarted and READY"
  # I-214 workaround (lead): a fresh Safari with the timer page before the first gate opens it
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
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
gmode() { echo both; } # rev 1.3 (a): every hold runs a start and an end gate
run1() { # last(0|1) H items...: one hold, a time-guard VOID (7) re-run whole once
  LASTH=$1; GMODE=$(gmode $1); shift
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
  FIRST=0
  # (b) a cooling gap when this hold's end gate read >= 41.5 °C (not after the part's last hold)
  if [ "$LASTH" != 1 ] && [ "$P153_DRY" != 1 ]; then
    bt=$(node -e "const L=require('fs').readFileSync('out/thermal-gate/gates.jsonl','utf8').trim().split('\\n').map(JSON.parse).filter(r=>r.label==='p153-$1-end'&&r.at>='$PSTART');const r=L.pop();console.log(r?(r.battEndC??r.battC):'')" 2>/dev/null)
    echo "BATT after $1: ${bt:-unknown} C"
    if [ -n "$bt" ] && node -e "process.exit(Number('$bt')>=41.5?0:1)"; then
      coolwait 40 600 "cooling gap after $1 (end gate read $bt C)" || echo "COOLING GAP TIMEOUT after $1: the next start gate decides"
    fi
  fi
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

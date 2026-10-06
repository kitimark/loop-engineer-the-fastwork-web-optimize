#!/bin/sh
# P-153 block driver (card: fixes/end-morph-p1/README.md "P-153", rev 1.3), a copy of fix-end-morph's P-152 rev 1.3 driver
# (fixes/end-morph-f12/phone/p152-block.sh 4b8c70324a81 at e3c1a254; names changed; the block-1 archive also moves
# out/p153/void), itself fix-end-bg's P-137 driver (fixes/end-bg/phone/
# p137-block.sh at 24041a92, from P-129's p129-block.sh) with the P-153 names, a WDA restart at the start of every part
# (lead condition 6, the I-212 lesson) and Safari parked at its end. Runs inside ONE phone
# hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order, each holding at most
# ONE counted run (rev 1.3; p153-hold.sh), each after the phone cooled below 38 °C. Start the servers first:
# sh fixes/end-morph-p1/phone/p153-serve.sh start. Usage (the runner, in the background), block 2 = four phone holds:
#   TICKET=P-153 node tools/lock.mjs run iphone --owner iphone-runner --block P-153 --max-seconds 3600 --keep 120 -- \
#     sh fixes/end-morph-p1/phone/p153-block.sh H1:WC H2:WV H3:S0 H4:EC1 H5:EV1            (part 1)
#   ... p153-block.sh H6:EV2 H7:EC2 H8:EC3 H9:EV3                                          (part 2)
#   ... p153-block.sh H10:EV4 H11:EC4 H12:TAIL                                             (part 3)
#   ... p153-block.sh HA:AC1,AV1                                                           (part 4, attribution)
# (counted order C V V C C V V C kept: EC1 EV1 EV2 EC2 EC3 EV3 EV4 EC4; one hold per counted run, the sentinel S0 in its
# own hold before them, the warm-ups in their own holds, S1 last in its own hold.)
# H<n>:TAIL = the block's tail: the counted runs named in RERUN-NEEDED lines of out/p153/hold-H*.log (current logs, not
# .prev), at most 2 per block, each re-run once as <run>r in its OWN hold (H<n>, H<n+1>), then S1 in the next hold.
# None: H<n> "S1"; one: H<n> "<r>", H<n+1> "S1"; two: H<n> "<r1>", H<n+1> "<r2>", H<n+2> "S1".
# A hold that exits 7 (its time guard) is re-run whole once (after its own cooling wait); any other non-zero exit stops
# the driver (exit = the hold's).
# Logs: out/p153/hold-<H>.log (an earlier one moved aside), out/p153/cooling.log. After each hold: doing iphone --between 5.
# Thermal gates: EVERY hold runs a start and an end gate (P153_GATE=both); an end-gate FAIL (Critical, or over 44 °C)
# voids only that hold's runs (p153-read.mjs) and the block stops.
# P153_DRY=1: calls p153-hold.sh directly (its dry mode: pins and plan only, no lock, no phone, no cooling wait).
# Rev 1.1 (lead rulings on the pre-data read, 2026-10-06):
#   N4: Safari is parked on EVERY exit of a part (an EXIT trap), a BLOCK STOP on a failed hold or gate included.
#   N6: every part starts with p153-serve.sh check, appended to out/p153/serve-check.log (B, C and V served hashes);
#       a failed check stops the part before anything runs (exit 4).
#   N2: before block 2 (only after the lead's go): TICKET=P-153 sh p153-block.sh ARCHIVE-BLOCK1 moves
#       out/p153/runs, the hold logs, the WDA logs and serve-check.log to out/p153/block1/ (refuses when it exists) and
#       restarts the three servers; block 2 is read by itself from out/p153/runs (never pooled with block 1).
# Rev 1.2 (= P-152 rev 1.3): every hold gated at start and end; I-214's workaround at every part start, after the WDA
#   restart: iphone.mjs safari-restart --url <B> (exit 5 if it fails).
# Rev 1.3 (lead ruling after block 1 went VOID on heat, H2's end gate Critical at 41.9 °C, 2026-10-06; = P-152 rev 1.4).
#   OBSERVED in our setup, cause unknown: under induced Serious, Critical returns near 41.5-42 °C after about 2 G runs
#   from 39 °C.
#   (1) before EVERY hold (the time-guard re-run included): wait.mjs phone-temp --below 38 --timeout 600 (logged in
#       out/p153/cooling.log); not MET (TIMEOUT or UNAVAILABLE): one more wait of 600 s; still not MET: BLOCK STOP, the
#       block is VOID and not scored (exit 6). Then the hold's own wda check, then its start gate (p153-hold.sh).
#   (2) at most ONE counted run (E[CV]n, E[CV]nr) per hold: the driver refuses a plan with more before anything runs.
#       Warm-ups and S0 get their own holds before the counted ones; S1 its own hold at the end.
#   (3) the end-gate rule stays: Critical (or over 44 °C) at a hold's end voids that hold's run and stops the block.
#   (4) the run order and the C/V balance stay as signed (rev 1.2); only the holds split.
#   Removed against rev 1.2: the cooling gap after a hold whose end gate read >= 41.5 °C (superseded by (1)) and
#   P153_COOL_FIRST (superseded by (1); the variable is ignored).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-153 sh fixes/end-morph-p1/phone/p153-block.sh H<n>:<item>[,<item>] ... [H<n>:TAIL] | ARCHIVE-BLOCK1"; exit 2; }
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
# rev 1.3 (2): at most one counted run per hold, checked before anything runs
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -cE '^E[CV][1-4]r?$')
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it counted runs (rev 1.3: at most 1 per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "P-153 $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -3 $LG/cooling.log | grep -E '^(MET|TIMEOUT|UNAVAILABLE|COOL)'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
# rev 1.3 (1): below 38 °C before every hold; one more 600 s wait; still not: the block is VOID (exit 6)
cool() { # H
  [ "$P153_DRY" = 1 ] && { echo "COOL $1 (dry: no wait)"; return 0; }
  coolwait 38 600 "cooling before $1" && return 0
  coolwait 38 600 "cooling before $1, second wait" && return 0
  echo "BLOCK STOP VOID: the phone did not cool below 38 °C in 2 x 600 s before $1 (block VOID, not scored)"; exit 6
}
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
  # I-214 workaround (lead): a fresh Safari with the timer page before the first gate opens it
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
fi
hold() { # H items...
  h=$1; shift
  cool $h
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P153_DRY" = 1 ]; then P153_GATE=both sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P153_GATE=both node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-153 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates both exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(GATE |RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P153_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 5 > /dev/null 2>&1
  return $e
}
run1() { # H items...: one hold, a time-guard VOID (7) re-run whole once
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
  return 0
}
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H*.log; do [ -e "$f" ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^E[CV][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run (card: at most 2 per block), the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2} (as ${R1:+${R1}r}${R2:+ ${R2}r}, one per hold), then S1 in its own hold"
    k=${H#H}
    for r in $R1 $R2; do run1 H$k ${r}r; k=$((k + 1)); done
    run1 H$k S1
  else run1 $H $items; fi
done
echo "BLOCK PART DONE: $*"

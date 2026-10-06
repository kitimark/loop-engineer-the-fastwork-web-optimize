#!/bin/sh
# P-156 block driver (card: fixes/end-morph-p1b-a/README.md "Phone card P-156"). A copy of this topic's P-153 rev 1.3
# driver (fixes/end-morph-p1/phone/p153-block.sh: a WDA restart and a fresh Safari at every part start, the servers'
# check, Safari parked on every exit and before every cooling wait, at most ONE counted run per hold) with the P-156
# names, the arms C / A, part B items, and no attribution part. Runs inside ONE phone hold with the block mark and
# starts the block's 600 s chrome-measure --no-timing holds in order (p156-hold.sh).
# Start the servers first: P156_BASE=1|0 sh fixes/end-morph-p1/phone/p156-serve.sh start (the base P-155 lands).
# Usage (the runner, in the background), one block = parts of at most ~50 min:
#   TICKET=P-156 node tools/lock.mjs run iphone --owner iphone-runner --block P-156 --max-seconds 3600 --keep 120 -- \
#     sh fixes/end-morph-p1/phone/p156-block.sh H1:WC H2:WA H3:S0 H4:EC1 H5:EA1                 (part 1)
#   ... p156-block.sh H6:EA2 H7:EC2 H8:EC3 H9:EA3                                              (part 2)
#   ... p156-block.sh H10:EA4 H11:EC4 H12:BC1 H13:BA1                                          (part 3)
#   ... p156-block.sh H14:BA2 H15:BC2 H16:TAIL                                                 (part 4)
# (part A counted C A A C C A A C; part B C A A C; sentinels on C: S0 before the counted runs, S1 last in its own hold)
# H<n>:TAIL = the counted runs named in RERUN-NEEDED lines of out/p156/hold-H*.log, at most 2 per block, each re-run once
# as <run>r in its own hold, then S1 in the next hold.
# Cooling (P-153 rev 1.3, profile xcode-serious): before EVERY hold wait.mjs phone-temp --below 38 --timeout 600 (logged in
# out/p156/cooling.log); not MET: one more 600 s wait; still not: BLOCK STOP, VOID, not scored (exit 6). An end gate at
# Critical or over 44 °C voids that hold's run and stops the block (p156-hold.sh exit 3).
# P156_DRY=1: calls p156-hold.sh directly (its dry mode: pins and plan only, no lock, no phone, no cooling wait).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-156 ] || { echo "TICKET is not P-156: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-156 sh fixes/end-morph-p1/phone/p156-block.sh H<n>:<item>[,<item>] ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p156; HS=fixes/end-morph-p1/phone/p156-hold.sh; SS=fixes/end-morph-p1/phone/p156-serve.sh
mkdir -p $LG
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -cE '^[EB][CA][1-4]r?$')
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it counted runs (at most 1 per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "P-156 $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -3 $LG/cooling.log | grep -E '^(MET|TIMEOUT|UNAVAILABLE|COOL)'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
cool() { # H
  [ "$P156_DRY" = 1 ] && { echo "COOL $1 (dry: no wait)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari before cooling for $1" || echo "PARK before $1 failed (the wait goes on)"
  coolwait 38 600 "cooling before $1" && return 0
  coolwait 38 600 "cooling before $1, second wait" && return 0
  echo "BLOCK STOP VOID: the phone did not cool below 38 °C in 2 x 600 s before $1 (block VOID, not scored)"; exit 6
}
[ "$P156_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p156-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok (base') of 3 servers"
if [ "$P156_DRY" != 1 ]; then
  { node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner "$R"; node tools/iphone.mjs wda check; } > $LG/wda-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: wda stop/start/check failed (see $LG/wda-restart-*.log)"; exit 5; }
  echo "WDA restarted and READY"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
fi
hold() { # H items...
  h=$1; shift
  cool $h
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P156_DRY" = 1 ]; then P156_GATE=both sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P156_GATE=both node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-156 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates both exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(GATE |RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P156_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 5 > /dev/null 2>&1
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
    RR=$(for f in $LG/hold-H*.log; do [ -e "$f" ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^[EB][CA][1-4]$' | awk '!s[$0]++' )
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

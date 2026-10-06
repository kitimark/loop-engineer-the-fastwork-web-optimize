#!/bin/sh
# P-155 block driver (card: fixes/end-morph-f12/README.md "Split block", signed as P-155). P-152's p152-block.sh (rev 1.4
# + park, a60e0c9fe0a6) with the P-155 names and three arms. Runs inside ONE phone hold with the block mark and starts
# the block's 600 s chrome-measure --no-timing holds in order, one item each (p155-hold.sh). Start the servers first:
# sh fixes/end-morph-f12/phone/p155-serve.sh start. Usage (the runner, in the background, Bash timeout 7200000):
#   TICKET=P-155 node tools/lock.mjs run iphone --owner iphone-runner --block P-155 --max-seconds 3600 --keep 120 -- \
#     sh fixes/end-morph-f12/phone/p155-block.sh H1:WC H2:WF H3:WU H4:S0
#   then ... H5:EC1 H6:EF1 H7:EU1, then ... H8:EF2 H9:EU2 H10:EC2, then ... H11:EU3 H12:EC3 H13:EF3, then ... H14:TAIL
# Rules, all as P-152 rev 1.4 + park (lead-signed):
#   - every part starts with p155-serve.sh check (logged to out/p155/serve-check.log; exit 4 if wrong), a WDA restart and a
#     Safari restart (I-214); Safari is parked on every exit of a part (an EXIT trap);
#   - before EVERY hold: Safari parked, wait.mjs phone-temp --below 38 --timeout 900 (out/p155/cooling.log; a timeout stops
#     the part, exit 6), then iphone.mjs wda check (not READY: one WDA restart; still not: exit 5);
#   - ONE item per hold (the driver refuses any other plan before anything runs); every hold runs a start and an end gate;
#     an end-gate FAIL voids that hold's runs and the block stops; a hold that exits 7 (time guard) is re-run whole once,
#     any other non-zero exit stops the driver (exit = the hold's);
#   - H<n>:TAIL = the counted runs named in RERUN-NEEDED lines of every out/p155/hold-H*.log, at most 2 per block, each
#     re-run once as <run>r in its own hold, then S1 in the next hold.
# Logs: out/p155/hold-<H>.log (an earlier one moved aside). After each hold: doing iphone --between 1.
# P155_DRY=1: calls p155-hold.sh directly (its dry mode: pins and plan only, no lock, no phone, no cooling, no WDA).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-155 ] || { echo "TICKET is not P-155: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-155 sh fixes/end-morph-f12/phone/p155-block.sh H<n>:<item> ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p155; HS=fixes/end-morph-f12/phone/p155-hold.sh; SS=fixes/end-morph-f12/phone/p155-serve.sh
mkdir -p $LG
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -c .)
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it items (one item per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "P-155 $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -2 $LG/cooling.log | grep -E '^(MET|TIMEOUT|UNAVAILABLE|COOL)'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
[ "$P155_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p155-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -5 $LG/serve-check.log | grep -c ' ok$') of 4 servers"
wdarestart() {
  { node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner "$R"; node tools/iphone.mjs wda check; } > $LG/wda-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: wda stop/start/check failed (see $LG/wda-restart-*.log)"; exit 5; }
  echo "WDA restarted and READY"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
}
[ "$P155_DRY" = 1 ] || wdarestart
prehold() { # H: Safari parked, cooling below 38 °C, then the WDA check (one restart if it is not READY)
  [ "$P155_DRY" = 1 ] && { echo "PREHOLD $1 (dry: no park, no cooling, no WDA check)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari before cooling for $1" || echo "PARK before $1 failed (the wait goes on)"
  coolwait 38 900 "cooling before $1" || { echo "BLOCK STOP: the phone did not cool below 38 °C in 900 s before $1"; exit 6; }
  if node tools/iphone.mjs wda check > $LG/wda-check-$1-$(date +%s).log 2>&1; then echo "WDA READY before $1"
  else echo "WDA not ready before $1: one restart"; wdarestart; fi
}
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P155_DRY" = 1 ]; then P155_GATE=both sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P155_GATE=both node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-155 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P155_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
run1() { # H items...: cooling + WDA check, then one hold; a time-guard VOID (7) is re-run whole once
  prehold $1; hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; prehold $1; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
}
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(ls $LG/hold-H*.log 2>/dev/null | sort -t H -k 2 -n | while read f; do sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^E[CFU][1-3]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run (card: at most 2 per block), the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2} (as ${R1:+${R1}r}${R2:+ ${R2}r}), then S1, one item per hold"
    N=${H#H}
    [ -n "$R1" ] && { run1 H$N ${R1}r; N=$((N + 1)); }
    [ -n "$R2" ] && { run1 H$N ${R2}r; N=$((N + 1)); }
    run1 H$N S1
  else run1 $H $items; fi
done
echo "BLOCK PART DONE: $*"

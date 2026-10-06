#!/bin/sh
# P-152 block driver (card: fixes/end-morph-f12/README.md "P-152"), a copy of fix-end-bg's P-137 driver (fixes/end-bg/phone/
# p137-block.sh at 24041a92, from P-129's p129-block.sh) with the P-152 names, a WDA restart at the start of every part
# (lead condition 6, the I-212 lesson) and Safari parked at its end. Runs inside ONE phone
# hold with the block mark and starts the block's 600 s chrome-measure --no-timing holds in order, each holding at most
# 2 fs runs (p152-hold.sh). Start the servers first: sh fixes/end-morph-f12/phone/p152-serve.sh start. Usage (the runner, in
# the background):
#   TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- \
#     sh fixes/end-morph-f12/phone/p152-block.sh H1:WC,WV H2:S0,EC1 H3:EV1,EV2
#   TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- \
#     sh fixes/end-morph-f12/phone/p152-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1
# (two phone holds split at a pair boundary: 12-14 fs runs of about 229 s plus 4 gates are over one 3600 s phone hold.)
# H<n>:TAIL = the block's tail: the counted runs named in RERUN-NEEDED lines of out/p152/hold-H[2-6].log, at most 2 per
# block, each re-run once as <run>r, then S1. One re-run: H<n> "<r> S1"; two: H<n> "<r1> <r2>" and H<n+1> "S1"; none: "S1".
# A hold that exits 7 (its time guard) is re-run whole once; any other non-zero exit stops the driver (exit = the hold's).
# Logs: out/p152/hold-<H>.log (an earlier one moved aside). After each hold: doing iphone --between 1.
# Thermal gates (rev 1.3): EVERY hold runs a start and an end gate (P152_GATE=both); an end-gate FAIL voids only that
# hold's runs (p152-read.mjs) and the block stops. (Rev 1-1.2 gated only each phone hold's edges.)
# P152_DRY=1: calls p152-hold.sh directly (its dry mode: pins and plan only, no lock, no phone).
# Rev 1.1 (lead rulings on the pre-data read, 2026-10-06):
#   N4: Safari is parked on EVERY exit of a part (an EXIT trap), a BLOCK STOP on a failed hold or gate included.
#   N6: every part starts with p152-serve.sh check, appended to out/p152/serve-check.log (B, C and V served hashes);
#       a failed check stops the part before anything runs (exit 4).
#   N2: before block 2 (only after a block-1 FAIL and the lead's go): TICKET=P-152 sh p152-block.sh ARCHIVE-BLOCK1 moves
#       out/p152/runs, the hold logs, the WDA logs and serve-check.log to out/p152/block1/ (refuses when it exists) and
#       restarts the three servers; block 2 is read by itself from out/p152/runs (never pooled with block 1).
#   N3: part 2's end gate runs only in HA (after the attribution runs); an HA end-gate failure (over 44 °C, or not
#       Serious) voids part 2's counted runs (p152-read.mjs reads hold-HA.log). Superseded by rev 1.3 (every hold gated).
# Rev 1.3 (lead rulings after block 1 stopped at H3's end gate, Critical at 43.0 °C, 2026-10-06):
#   (a) every hold gets a start and an end gate; an end-gate FAIL voids only that hold's runs; the block stops.
#   (b) after each hold but the part's last, when that hold's end gate read the battery at >= 41.5 °C, a logged cooling
#       gap: wait.mjs phone-temp --below 40 --timeout 600 (out/p152/cooling.log). Under xcode-serious it is a ceiling
#       guard, not a heat-profile change. A cooling timeout is logged and the next hold's start gate decides.
#   (c) no hold carries more than two counted runs (E[CV]n, E[CV]nr): the driver refuses such a plan before anything runs.
#   (d) P152_COOL_FIRST=<°C> (block 2's part 1: 38): before anything else, wait.mjs phone-temp --below <°C> --timeout
#       900, logged; a timeout stops the part (exit 6). The first hold's start gate then must read Serious, induced Yes.
#   I-214's workaround at every part start, after the WDA restart: iphone.mjs safari-restart --url <B> (exit 5 if it fails).
# Rev 1.4 (lead rulings after P-153 block 1 went VOID at 04:07Z, H2's end gate Critical at 41.9 °C from 39.3 °C, 2026-10-06):
#   (e) before EVERY hold: wait.mjs phone-temp --below 38 --timeout 900 (out/p152/cooling.log); a timeout stops the part
#       (exit 6). Right after the cooling: iphone.mjs wda check; if it is not READY, one WDA restart (stop/start/check) and
#       a Safari restart (I-214); still not ready: the part stops (exit 5). Supersedes rev 1.3 (b) (the gap only after a
#       hold at >= 41.5 °C) and (d) (P152_COOL_FIRST: cooling before the part only; the variable is now ignored).
#   (f) ONE item per hold: at most 1 counted run per hold, and each warm-up (WC, WV), sentinel (S0, S1) and attribution
#       run (AC1, AV1) in its own hold; the driver refuses any other plan before anything runs. TAIL: each re-run in its own
#       hold, then S1 in the next (H<n> <r1>r, H<n+1> <r2>r, H<n+2> S1). The end-gate Critical rule (a) stays.
#   The run order and the 4 v 4 balance stay (C V V C C V V C); only the holds split. Plan (4 phone holds):
#     part 1: H1:WC H2:WV H3:S0 H4:EC1     part 2: H5:EV1 H6:EV2 H7:EC2     part 3: H8:EC3 H9:EV3 H10:EV4
#     part 4: H11:EC4 H12:TAIL H15:AC1 H16:AV1   (TAIL takes H12-H14; the re-run scan reads every hold-H*.log of the block)
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-152 ] || { echo "TICKET is not P-152: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=P-152 sh fixes/end-morph-f12/phone/p152-block.sh H<n>:<item>,<item> ... [H<n>:TAIL] | ARCHIVE-BLOCK1"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p152; HS=fixes/end-morph-f12/phone/p152-hold.sh; SS=fixes/end-morph-f12/phone/p152-serve.sh
mkdir -p $LG
if [ "$1" = ARCHIVE-BLOCK1 ]; then
  [ -e $LG/block1 ] && { echo "ARCHIVE refused: $LG/block1 exists"; exit 2; }
  mkdir -p $LG/block1 || exit 2
  [ -d $LG/runs ] && mv $LG/runs $LG/block1/
  for f in $LG/hold-* $LG/wda-restart-* $LG/serve-check.log; do [ -e "$f" ] && mv "$f" $LG/block1/; done
  sh $SS stop && sh $SS start || { echo "ARCHIVE done, but the servers did not restart: no block 2"; exit 4; }
  echo "ARCHIVED block 1 into $LG/block1; servers restarted"; exit 0
fi
# (f) rev 1.4: one item per hold (TAIL expands to one item per hold), checked before anything runs
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -c .)
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it items (rev 1.4: one item per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "P-152 $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -2 $LG/cooling.log | sed -n 's/^\(MET\|TIMEOUT\|UNAVAILABLE\)/\1/p;/^COOL/p'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
PSTART=$(date -u +%FT%TZ) # gate records of this part only (the cooling-gap read)
# N4: park Safari on every exit of a part (not in dry mode)
[ "$P152_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
# N6: the servers' check, logged, at every part start
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p152-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok$') of 3 servers"
[ -n "$P152_COOL_FIRST" ] && echo "NOTE P152_COOL_FIRST is ignored since rev 1.4: every hold cools below 38 °C first"
# lead condition 6 and I-214: a fresh WDA and a fresh Safari with the timer page (not in dry mode)
wdarestart() {
  { node tools/iphone.mjs wda stop; node tools/iphone.mjs wda start --owner "$R"; node tools/iphone.mjs wda check; } > $LG/wda-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: wda stop/start/check failed (see $LG/wda-restart-*.log)"; exit 5; }
  echo "WDA restarted and READY"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
}
[ "$P152_DRY" = 1 ] || wdarestart
# (e) rev 1.4: before every hold, cooling below 38 °C, then the WDA check (one restart if it is not READY)
prehold() { # H
  [ "$P152_DRY" = 1 ] && { echo "PREHOLD $1 (dry: no cooling, no WDA check)"; return 0; }
  coolwait 38 900 "cooling before $1" || { echo "BLOCK STOP: the phone did not cool below 38 °C in 900 s before $1"; exit 6; }
  if node tools/iphone.mjs wda check > $LG/wda-check-$1-$(date +%s).log 2>&1; then echo "WDA READY before $1"
  else echo "WDA not ready before $1: one restart"; wdarestart; fi
}
hold() { # H items...
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$P152_DRY" = 1 ]; then P152_GATE=$GMODE sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else P152_GATE=$GMODE node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-152 $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates $GMODE exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$P152_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
FIRST=1
gmode() { echo both; } # rev 1.3 (a): every hold runs a start and an end gate
run1() { # last(0|1) H items...: (e) cooling + WDA check, then one hold; a time-guard VOID (7) re-run whole once
  LASTH=$1; GMODE=$(gmode $1); shift
  prehold $1; hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; prehold $1; hold "$@"; e=$?; }
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
  FIRST=0
  # rev 1.3 (b), the cooling gap after a hot hold, is superseded by (e): every hold now cools below 38 °C first
}
i=0
for spec in "$@"; do
  i=$((i + 1)); LAST=0; [ $i -eq $# ] && LAST=1
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    # rev 1.4: every hold log of the block (one counted run per hold), in hold order; each re-run in its own hold
    RR=$(ls $LG/hold-H*.log 2>/dev/null | sort -t H -k 2 -n | while read f; do sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^E[CV][1-4]$' | awk '!s[$0]++' )
    n=$(echo "$RR" | grep -c .)
    [ "$n" -gt 2 ] && echo "RERUN over the cap: $(echo $RR) need one; the first 2 are re-run (card: at most 2 per block), the rest stay invalid"
    R1=$(echo "$RR" | sed -n 1p); R2=$(echo "$RR" | sed -n 2p)
    echo "TAIL re-runs: ${R1:-none}${R2:+ $R2} (as ${R1:+${R1}r}${R2:+ ${R2}r}), then S1, one item per hold"
    N=${H#H}
    [ -n "$R1" ] && { run1 0 H$N ${R1}r; N=$((N + 1)); }
    [ -n "$R2" ] && { run1 0 H$N ${R2}r; N=$((N + 1)); }
    run1 $LAST H$N S1
  else run1 $LAST $H $items; fi
done
echo "BLOCK PART DONE: $*"

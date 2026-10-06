#!/bin/sh
# P-152 standalone end gate after an early HA stop (card rev 1.2, addendum D1; lead, 2026-10-06). Part 2's end thermal gate
# runs only in its last hold HA. When HA stops before that gate ran (exit 4: served hash or open failed; 5: WDA; 7: the
# time guard twice), this script runs the same gate once, right after, in the same phone hold, inside its own 600 s
# chrome-measure --no-timing hold, and logs it to out/p152/end-gate-after-HA.log. It does nothing when HA ended VALID,
# when HA's own end gate ran (VALID, or "VOID end gate"), or when hold-HA.log is missing (part 2 is then VOID anyway).
# Part 2 is run through it so that the gate is in the same phone hold (the card's part-2 command):
#   TICKET=P-152 node tools/lock.mjs run iphone --owner iphone-runner --block P-152 --max-seconds 3600 -- sh -c \
#     'sh fixes/end-morph-f12/phone/p152-block.sh H4:EC2,EC3 H5:EV3,EV4 H6:EC4 H7:TAIL HA:AC1,AV1; e=$?; \
#      sh fixes/end-morph-f12/phone/p152-endgate.sh; exit $e'
# Last line of the log: "ENDGATE PASS" or "ENDGATE FAIL exit <n>". The reader (p152-read.mjs rev 1.2) counts part 2 only
# when hold-HA.log ends "HOLD HA VALID", or HA stopped early and this log ends "ENDGATE PASS". Nothing here prints the
# LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-152 ] || { echo "TICKET is not P-152: no gate"; exit 2; }
R=${RUNNER:-iphone-runner}; LG=out/p152; HA=$LG/hold-HA.log; OUT=$LG/end-gate-after-HA.log
[ -e $HA ] || { echo "ENDGATE skipped: no hold-HA.log (part 2 is VOID by D1)"; exit 0; }
last=$(grep -E '^HOLD HA (VALID|VOID|DRY)' $HA | tail -1)
case "$last" in
  "HOLD HA VALID"*) echo "ENDGATE skipped: HA ended VALID (its own end gate passed)"; exit 0 ;;
  "HOLD HA VOID end gate"*) echo "ENDGATE skipped: HA's own end gate ran and failed (part 2 VOID)"; exit 0 ;;
  "HOLD HA DRY"*) echo "ENDGATE skipped: dry run"; exit 0 ;;
esac
[ "$P152_DRY" = 1 ] && { echo "ENDGATE DRY: HA stopped early (${last:-no HOLD line}); would run the standalone gate"; exit 0; }
PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)") || { echo "ENDGATE FAIL exit 4 (no server state)" | tee -a $OUT; exit 4; }
BU=$(node tools/lan.mjs --url --port "$PB") || { echo "ENDGATE FAIL exit 4 (no LAN url)" | tee -a $OUT; exit 4; }
{ echo "== $(date -u +%FT%TZ) HA stopped early: ${last:-no HOLD line}"
  node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "P-152 standalone end gate after HA" -- \
    node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label p152-HA-end-standalone --expect serious --max-c 44 --accept-induced --url "$BU"
  g=$?; node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  [ $g -eq 0 ] && echo "ENDGATE PASS" || echo "ENDGATE FAIL exit $g"; } >> $OUT 2>&1
tail -2 $OUT

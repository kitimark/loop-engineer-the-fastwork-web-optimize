#!/bin/sh
# v11 no-worse block driver (int-v11, lead 2026-10-06; card fixes/v11/README.md "Phone block v11-nw"). A credited copy of
# int-v8's fixes/v10/phone/nw-block.sh (v10cm-nw) with these changes:
#   - ticket v11-nw, folder out/v11nw, scripts fixes/v11/phone/nw11-{hold,serve}.sh, counted items [EB][CA]1-5;
#   - part start (lead; I-227, I-212, I-225): a FRESH WDA session (iphone.mjs wda stop, wda start, wda check) instead of
#     `wda ensure`, then a 60 s settle, then a tab check: Safari parked and exactly ONE tab listed by iphone.mjs status;
#     a WDA start failure or another tab count stops the part before any hold (BLOCK STOP, exit 5: message the lead, who
#     posts the user step: unlock / UI Automation / close tabs). NW_PREFLIGHT=<cmd> runs that command instead of these
#     three steps (for ts-i227's phone preflight tool once it lands; exit 0 = go);
#   - ceiling cooling (lead: "cool to <= 39.5 C only at the ceiling"): no cooling between holds; when a hold ends VOID at
#     a thermal gate (nw11-hold.sh exit 3 or 5), Safari is parked, wait.mjs phone-temp --below 39.5 --timeout 600 runs
#     (cooling.log), and the hold is re-run whole once; a second gate VOID, or no cooling in 600 s: BLOCK STOP (exit 6).
#     NW_COOL=1 still adds the v10 kit's cooling before EVERY hold (38 C, off by default);
#   - order (lead): uncounted warm-ups WC WA, sentinel S0 on C, counted EC1 EA1 EA2 EC2 EC3 EA3 EA4 EC4 (+ EC5), at most
#     one counted run per hold, TAIL re-runs, then S1 on C in its own hold. Suggested parts (each one phone hold <= 3600 s):
#       TICKET=v11-nw RUNNER=int-v11 node tools/lock.mjs run iphone --owner int-v11 --block v11-nw --max-seconds 3600 --keep 120 -- \
#         sh fixes/v11/phone/nw11-block.sh H1:WC H2:WA H3:S0 H4:EC1 H5:EA1 H6:EA2              (part 1)
#       ... nw11-block.sh H7:EC2 H8:EC3 H9:EA3 H10:EA4 H11:EC4                                    (part 2)
#       ... nw11-block.sh H12:EC5 H13:TAIL                                                        (part 3; TAIL ends with S1)
#   Read: node fixes/v11/phone/nw11-read.mjs out/v11nw/runs --base v11
# The v10 header follows (read v10cm-nw as v11-nw, nw-*.sh as nw11-*.sh; its "wda ensure" and cooling paragraphs are
# replaced by the changes above).
# ---- v10 header ----
# v10 no-worse phone check (int-v8, lead 2026-10-06 15:36Z: "a short phone no-worse check on V vs C in your own hold,
# profile xcode-serious, no cooling wait"). A copy of fix-end-morph-p1's P-156 kit (fixes/end-morph-p1/phone/p156-*.sh,
# credited) with: the arms C = main's C (rev 7d, 1b2eecc66011 / e1359ab9994a) and A = v10 + CM's V (a33a6c7c1f2b / 62743920fe1a)
# from out/v10/snap-a33a6c7c1f2b-62743920fe1a, ticket v10cm-nw, folder out/v10cmnw, env NW_*; the arm letter A is kept so
# pA-read.mjs and the gates read it unchanged. Part A (fs) only. The original header follows.
# P-156 block driver (card: fixes/end-morph-p1b-a/README.md "Phone card P-156"). A copy of this topic's P-153 rev 1.3
# driver (fixes/end-morph-p1/phone/p153-block.sh: WDA ensured (rev 2: I-220's `wda ensure`) at every part start, the servers'
# check, Safari parked on every exit and before every cooling wait, at most ONE counted run per hold) with the P-156
# names, the arms C / A, part B items, and no attribution part. Runs inside ONE phone hold with the block mark and
# starts the block's 600 s chrome-measure --no-timing holds in order (p156-hold.sh).
# Start the servers first: P156_BASE=1|0 sh fixes/v10/phone/nw-serve.sh start (the base P-155 lands).
# NW_DIR (default out/v10cmnw) is passed on to p156-serve.sh and p156-hold.sh (a dry run uses its own folder).
# Usage (the runner, in the background), one block = parts of at most ~50 min:
#   ... p156-block.sh H0:PC                                                                    (part 0, rev 2: the
#       uncounted park30 pilot on C; a PILOT FAIL (hold exit 9) stops here and the block does not start)
#   TICKET=v10cm-nw node tools/lock.mjs run iphone --owner iphone-runner --block v10cm-nw --max-seconds 3600 --keep 120 -- \
#     sh fixes/v10/phone/nw-block.sh H1:WC H2:WA H3:S0 H4:EC1 H5:EA1                 (part 1)
#   ... p156-block.sh H6:EA2 H7:EC2 H8:EC3 H9:EA3                                              (part 2)
#   ... p156-block.sh H10:EA4 H11:EC4 H12:BC1 H13:BA1                                          (part 3)
#   ... p156-block.sh H14:BA2 H15:BC2 H16:TAIL                                                 (part 4)
# (part A counted C A A C C A A C; part B C A A C; sentinels on C: S0 before the counted runs, S1 last in its own hold)
# H<n>:TAIL = the counted runs named in RERUN-NEEDED lines of out/v10cmnw/hold-H*.log, at most 2 per block, each re-run once
# as <run>r in its own hold, then S1 in the next hold.
# Cooling (kit change after P-156 block 1, lead 2026-10-06, map-p156-gaps: the wait cost 13 of 107 min): OFF by default,
# as the xcode-serious rule says (no cooling wait; the sentinel decides validity; memory phone-checks-start-warm).
# NW_COOL=1 restores block 1's behaviour: Safari parked, then before EVERY hold wait.mjs phone-temp --below 38
# --timeout 600 (logged in out/v10cmnw/cooling.log); not MET: one more 600 s wait; still not: BLOCK STOP, VOID (exit 6).
# The ceiling stays in both modes: each hold's start and end gate (--max-c 44, Critical) voids that hold and stops the
# block (p156-hold.sh exit 3/5). With cooling off nothing runs between holds, so the next hold's chrome-measure
# `lock run` is queued right after the previous one ends (no park in between; p156-hold.sh parks Safari after every
# run): shared jobs no longer slip into a park/cooling window (I-224).
# Device lost (I-222): before every hold `idevice_id -l` must list the phone, and a phone-temp UNAVAILABLE during a
# cooling wait means the same: a re-plug console step is posted and waited on, then BLOCK STOP DEVICE LOST (exit 5); the
# block resumes from that hold with one uncounted warm-up per arm first (the lead's ruling after block 1).
# NW_DRY=1: calls p156-hold.sh directly (its dry mode: pins and plan only, no lock, no phone, no cooling wait).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = v11-nw ] || { echo "TICKET is not v11-nw: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: TICKET=v11-nw sh fixes/v11/phone/nw11-block.sh H<n>:<item>[,<item>] ... [H<n>:TAIL]"; exit 2; }
R=${RUNNER:-int-v11}; LG=${NW_DIR:-out/v11nw}; export NW_DIR=$LG; HS=fixes/v11/phone/nw11-hold.sh; SS=fixes/v11/phone/nw11-serve.sh
mkdir -p $LG
for spec in "$@"; do it=$(echo "${spec#*:}" | tr ',' '\n' | grep -cE '^[EB][CAD][1-5]r?$')
  [ "$it" -gt 1 ] && { echo "PLAN REFUSED: ${spec%%:*} carries $it counted runs (at most 1 per hold)"; exit 2; }; done
coolwait() { # below timeout why
  { echo "== $(date -u +%FT%TZ) $3: phone-temp --below $1 --timeout $2"
    node tools/wait.mjs phone-temp --below "$1" --timeout "$2" --every 60 --owner "$R" --reason "v11 no-worse $3"; c=$?
    echo "COOL $3 exit $c"; } >> $LG/cooling.log 2>&1
  tail -3 $LG/cooling.log | grep -E '^(MET|TIMEOUT|UNAVAILABLE|COOL)'
  return $(sed -n '$s/^COOL .* exit \([0-9]*\)$/\1/p' $LG/cooling.log)
}
devlost() { # H why
  echo "DEVICE LOST before $1: $2"
  replug "device lost before $1: $2"
  echo "BLOCK STOP DEVICE LOST before $1 (re-plugged; holds so far stand; resume from $1 with WC and WA warm-ups first)"; exit 5
}
cool() { # H
  [ "$NW_DRY" = 1 ] && { echo "COOL $1 (dry: no wait)"; return 0; }
  [ "$(idevice_id -l 2>/dev/null | grep -c .)" -ge 1 ] || devlost "$1" "idevice_id -l lists no device"
  [ "${NW_COOL:-0}" = 1 ] || { echo "COOL $1 off (NW_COOL unset: no cooling wait; the gates keep the 44 °C / Critical ceiling)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari before cooling for $1" || echo "PARK before $1 failed (the wait goes on)"
  coolwait 38 600 "cooling before $1" && return 0
  tail -3 $LG/cooling.log | grep -q '^UNAVAILABLE' && devlost "$1" "phone-temp UNAVAILABLE"
  coolwait 38 600 "cooling before $1, second wait" && return 0
  tail -3 $LG/cooling.log | grep -q '^UNAVAILABLE' && devlost "$1" "phone-temp UNAVAILABLE"
  echo "BLOCK STOP VOID: the phone did not cool below 38 °C in 2 x 600 s before $1 (block VOID, not scored)"; exit 6
}
[ "$NW_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: nw11-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok (base') of 3 servers"
# rev 2 (I-220, ts-i220's 2d6d7327): `wda ensure` instead of stop/start/check. Exit 0: go on (Safari restarted only when
# the line says "restarted"); exit 4 WDA REPLUG NEEDED: post a re-plug console step, wait for its Done, ensure again
# (at most 2 re-plugs); exit 3 (or anything else): BLOCK STOP.
replug() { # why
  P=$(node tools/console.mjs post --by "$R" --kind action --phone --no-record --no-gate --topic v11 \
    --title "v11 no-worse check: re-plug the iPhone cable" \
    --instructions "The phone lost its USB link to the Mac. Unplug the iPhone's cable, plug it back in, keep the phone unlocked, then press Done." 2>&1)
  id=$(echo "$P" | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p')
  [ -n "$id" ] || { echo "BLOCK STOP: re-plug step not posted ($P)"; exit 5; }
  echo "REPLUG step $id posted ($1)"
  node tools/console.mjs wait "$id" --until done --timeout 1800 --quiet; w=$?
  [ $w -eq 0 ] || { echo "BLOCK STOP: re-plug step $id not done (wait exit $w)"; exit 5; }
  echo "REPLUG $id done"
}
if [ "$NW_DRY" != 1 ] && [ "${NW_ENSURE:-0}" = 1 ]; then
  k=0
  while :; do
    WL=$LG/wda-ensure-$(date +%s).log
    node tools/iphone.mjs wda ensure --owner "$R" > $WL 2>&1; e=$?
    last=$(tail -1 $WL)
    case $e in
      0) echo "WDA ensure: $last"; break ;;
      4) k=$((k + 1)); [ $k -gt 2 ] && { echo "BLOCK STOP: WDA REPLUG NEEDED after 2 re-plugs ($last)"; exit 5; }
         replug "$last" ;;
      *) echo "BLOCK STOP: wda ensure exit $e ($last; see $WL)"; exit 5 ;;
    esac
  done
  case $last in *restarted*)
    PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
    node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
      || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
    echo "SAFARI restarted (WDA was restarted)" ;;
  *) echo "SAFARI kept (WDA kept)" ;;
  esac
  # v10 (lead 15:46Z, I-225: a false Critical at the start gate right after a WDA or Safari restart): wait 60 s after
  # any restart before the first hold's start gate (a settle wait, not a cooling wait)
  case $last in *restarted*|*started*) echo "SETTLE 60 s after the WDA/Safari restart (I-225)"; sleep 60 ;; esac
elif [ "$NW_DRY" != 1 ]; then
  # v11 (lead): a fresh WDA session, a 60 s settle and a tab check at every part start (I-227, I-212, I-225)
  if [ -n "$NW_PREFLIGHT" ]; then
    sh -c "$NW_PREFLIGHT" > $LG/preflight-$(date +%s).log 2>&1 || { echo "BLOCK STOP: preflight failed ($NW_PREFLIGHT; see $LG/preflight-*.log): message the lead"; exit 5; }
    echo "PREFLIGHT ok ($NW_PREFLIGHT)"
  else
    WL=$LG/wda-fresh-$(date +%s).log
    node tools/iphone.mjs park --owner "$R" > $WL 2>&1
    node tools/iphone.mjs wda stop >> $WL 2>&1
    node tools/iphone.mjs wda start --owner "$R" >> $WL 2>&1 || { echo "BLOCK STOP: wda start failed (see $WL; phone locked or UI Automation off? message the lead for the user step)"; exit 5; }
    node tools/iphone.mjs wda check >> $WL 2>&1 || { echo "BLOCK STOP: wda check failed after a fresh start (see $WL)"; exit 5; }
    echo "WDA fresh session; SETTLE 60 s (I-225)"; sleep 60
    node tools/iphone.mjs park --owner "$R" >> $WL 2>&1
    TABS=$(node tools/iphone.mjs status 2>/dev/null | sed -n 's/^tabs: //p' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).length)}catch{console.log('?')}})")
    [ "$TABS" = 1 ] || { echo "BLOCK STOP: tab check: $TABS Safari tabs listed after the park, want exactly 1 (message the lead: the user closes the extra tabs)"; exit 5; }
    echo "TAB CHECK ok: 1 tab"
  fi
else
  echo "WDA fresh session, settle and tab check (dry: not run)"
fi
hold() { # H items...
  h=$1; shift
  cool $h
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$NW_DRY" = 1 ]; then NW_GATE=both sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else NW_GATE=both node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "v11 no-worse $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) gates both exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(GATE |RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID)' $LG/hold-$h.log
  [ "$NW_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 5 > /dev/null 2>&1
  return $e
}
ceiling() { # H: a hold ended VOID at a gate: park, cool to <= 39.5 C (600 s at most); 0 = cooled
  [ "$NW_DRY" = 1 ] && { echo "CEILING $1 (dry: no wait)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari for the ceiling cooling after $1"
  coolwait 39.5 600 "ceiling cooling after $1" && return 0
  tail -3 $LG/cooling.log | grep -q '^UNAVAILABLE' && devlost "$1" "phone-temp UNAVAILABLE"
  return 1
}
run1() { # H items...: one hold; a time-guard VOID (7) re-run whole once; a gate VOID (3, 5) cooled to 39.5 C and re-run once
  hold "$@"; e=$?
  [ $e -eq 7 ] && { echo "RETRY $1 (time guard)"; hold "$@"; e=$?; }
  if [ $e -eq 3 ] || [ $e -eq 5 ]; then
    ceiling $1 || { echo "BLOCK STOP VOID at $1: gate VOID and the phone did not cool to 39.5 C in 600 s"; exit 6; }
    echo "RETRY $1 (after the ceiling cooling)"; hold "$@"; e=$?
    [ $e -eq 3 ] || [ $e -eq 5 ] && { echo "BLOCK STOP at $1: a second gate VOID after cooling (exit $e)"; exit 6; }
  fi
  [ $e -ne 0 ] && { echo "BLOCK STOP at $1 exit $e"; exit $e; }
  return 0
}
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  if [ "$items" = TAIL ]; then
    RR=$(for f in $LG/hold-H*.log; do [ -e "$f" ] && sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^[EB][CAD][1-5]$' | awk '!s[$0]++' )
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

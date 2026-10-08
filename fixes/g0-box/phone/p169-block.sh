#!/bin/sh
# P-169 (window B only): a copy of p168-block.sh with P-169's log dir (out/p169ph) and hold script p169-hold.sh.
# Header below is P-168's.
# P-168 stage 2 phone kit (card: fixes/g0-box/README.md "P-168", stage 2 signed 41b8b179; lead amendment 10:4xZ, user
# T-247 #12): the block driver inside ONE phone hold (one part = one spot), profile tool-serious (P-164's path, a copy of
# g0b-block.sh's condition handling):
#   - CM_THERMAL=serious: ONE owner of the condition, `iphone.mjs rearm` (I-225): it reads the phone, clears, waits for a
#     plain Nominal/Fair read, starts its own detached `thermal.mjs set serious` (which holds the condition after rearm
#     exits) and settles 120 s; this script never starts a set of its own. It runs once at the part's start (after the
#     preflight and the ready step), after a re-plug, and when a hold voids at its start gate (Critical, exit 3, or too
#     cool, exit 2: the condition is gone) or on a profile misfit (MISFIT); that hold then runs once more (at most 2
#     re-arms per hold). Rearm exit != 0: BLOCK STOP 10, message the lead. FW_PHONE_CONDITION=tool: the iphone.mjs gates
#     post no Xcode step; Xcode is never touched. The runner (p168-run.sh) ends the condition with `node tools/thermal.mjs
#     clear` right after `lock.mjs run iphone` returns (not in this script's exit trap).
#   - no heat phase, no margin, no cooling by state (the amendment);
#   - a failing heat sentinel (hold exit 8): only the uncounted Timeline-OFF S control run on v0 (<S>sC, at the part's
#     start after the warm-ups and in the TAIL) is judged (lead ruling 11:1xZ, protocol §5.2); BLOCK STOP 8, the lead
#     decides. Counted Timeline-on W runs are never judged as sentinels;
#   - H<n>:TAIL<S> re-runs the spot's RERUN-NEEDED counted items once each (as <item>x), then the spot's control sentinel.
# Kept: served check at the part start, wda ensure + Safari restart, Safari parked before every hold and on exit, the
# time-guard re-run (exit 7), the end-gate re-run (exit 3), USB link loss (re-plug, re-arm, then one W warm-up per arm port
# of the current spot), the unlock / close-tabs steps on preflight.
# CM_READY=1: ONE console action step asks the user to get the phone ready and not use it (posted from inside this phone
# hold; one phone step at a time) and waits for its Done (the signature's condition 3). P166_READY=0 skips it when the
# user already answered the ready step (C-119, 10:41Z).
#   CM_TICKET=P-168 CM_THERMAL=serious node tools/lock.mjs run iphone --owner fix-g0-box --block P-168 --max-seconds 3600 \
#     --keep 120 -- sh fixes/g0-box/phone/p168-block.sh H1:Aw0,Awe,Awk,AsC,A01 H2:Ae1,Ak1,Ae2,Ak2 H3:A02,Ak3,A03,Ae3 H4:TAILA
# Logs: out/p168ph/hold-<H>.log, out/p168ph/order.log, out/p168ph/rearm-*.log. CM_DRY=1: p168-hold.sh dry.
# P-168 (DRAFT until the lead signs): a copy of p166-block.sh with P-168's names and paths; the logic is unchanged.
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: CM_TICKET=P-169 CM_THERMAL=serious sh fixes/g0-box/phone/p169-block.sh H<n>:<item>[,<item>...] ... [H<n>:TAIL<S>]"; exit 2; }
ALL="$*"; R=${RUNNER:-fix-g0-box}; LG=out/p169ph; HS=fixes/g0-box/phone/p169-hold.sh; SS=fixes/g0-box/phone/p168-serve.sh
mkdir -p $LG
[ "$CM_DRY" = 1 ] || [ "$CM_THERMAL" = serious ] || { echo "BLOCK STOP: CM_THERMAL=serious is not set (P-169 runs tool-serious, lead amendment 10:4xZ)"; exit 2; }
[ "$CM_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap); now run: node tools/thermal.mjs clear"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p168-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -4 $LG/serve-check.log | grep -c ' ok$') of 4 servers"
linkstate() { node tools/usblink.mjs status 2>&1 | tail -1; }
linkok() { [ "$CM_DRY" = 1 ] && return 0; node tools/usblink.mjs status >> $LG/usblink.log 2>&1; }
wdarestart() {
  node tools/iphone.mjs wda ensure --owner "$R" > $LG/wda-ensure-$(date +%s).log 2>&1; we=$?
  if [ $we -eq 4 ] && [ "$INRELINK" != 1 ] && ! linkok; then relink "wda ensure REPLUG"; return 0; fi
  [ $we -eq 4 ] && { echo "BLOCK STOP: WDA REPLUG NEEDED (cable) with usblink $(linkstate): message the lead"; exit 5; }
  [ $we -eq 0 ] || { echo "BLOCK STOP: wda ensure exit $we (see $LG/wda-ensure-*.log)"; exit 5; }
  echo "WDA READY (ensure)"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('out/p168/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
}
thermalrearm() {
  [ "$CM_DRY" = 1 ] && { echo "REARM (dry) $1"; return 0; }
  RL=$LG/rearm-$(date +%s).log
  # P-161 lesson: wdarestart leaves Safari on B (the gate's timer page, animations running); park first, so the rearm
  # waits on a still phone
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  node tools/iphone.mjs rearm --owner "$R" --settle 120 > $RL 2>&1; re=$?
  echo "$(grep -E '^REARM (CLEARED|NOT-NEEDED|STILL-CRITICAL|MISFIT|TIMEOUT|ERROR)' $RL | tail -1) (exit $re; $1)"
  [ $re -eq 0 ] || { echo "BLOCK STOP 10: iphone.mjs rearm exit $re (8 still Critical or misfit, 13 timeout; see $RL): message the lead"; exit 10; }
}
needsready() { [ "$1" -eq 10 ] || { [ "$1" -eq 3 ] && grep -q 'Failed to initialize for UI testing' "$2"; }; }
step() {
  node tools/console.mjs post --by "$R" --kind action --phone --no-record --no-gate --topic g0-box --title "$1" --instructions "$2" 2>&1 \
    | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p'
}
tabsstep() {
  tid=$(step "$CM_TICKET: close the extra Safari tabs" "On the iPhone, open Safari's tab view and close every tab but one (leave one tab open, any page). Then press Done; the test goes on by itself.")
  [ -n "$tid" ] || { echo "BLOCK STOP: close-tabs step not posted"; exit 11; }
  echo "TABS step $tid posted ($1)"
  node tools/console.mjs wait "$tid" --until done --timeout 3600 --quiet; w=$?
  [ $w -eq 0 ] || { echo "BLOCK STOP: close-tabs step $tid not done (wait exit $w)"; exit 11; }
  echo "TABS $tid done"
}
unlockstep() {
  uid=$(step "$CM_TICKET: get the iPhone ready for the test" "Unlock the iPhone and close any message on screen. In Settings > Developer, check that Enable UI Automation is on. Leave Safari open, then press Done.")
  [ -n "$uid" ] || { echo "BLOCK STOP: unlock step not posted"; exit 9; }
  echo "UNLOCK step $uid posted ($1)"
  node tools/console.mjs wait "$uid" --until done --timeout 3600 --quiet; w=$?
  [ $w -eq 0 ] || { echo "BLOCK STOP: unlock step $uid not done (wait exit $w)"; exit 9; }
  echo "UNLOCK $uid done"
}
preflight() {
  PL=$LG/preflight-$1-$(date +%s).log; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?
  if needsready $pe $PL; then unlockstep "preflight exit $pe ($1)"; PL=$PL.2; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?; fi
  if [ $pe -eq 11 ]; then tabsstep "preflight TABS ($1)"; PL=$PL.3; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?; fi
  [ $pe -eq 0 ] || echo "PREFLIGHT exit $pe ($1): $(tail -1 $PL | cut -c1-160)"
  return $pe
}
LN=0; CURW=""
relink() {
  LN=$((LN + 1))
  [ $LN -gt 3 ] && { echo "BLOCK STOP: link lost a 4th time in this part ($1): message the lead"; exit 11; }
  echo "LINK LOST ($1) $(date -u +%FT%TZ): $(linkstate); paused until usblink status exit 0, at most ${CM_LINK_MAX:-3600} s"
  node tools/lock.mjs doing iphone --owner "$R" --text "$CM_TICKET paused: USB link lost, waiting for the re-plug" > /dev/null 2>&1
  t0=$(date +%s)
  until node tools/usblink.mjs status >> $LG/usblink.log 2>&1; do
    [ $(( $(date +%s) - t0 )) -ge "${CM_LINK_MAX:-3600}" ] && { echo "BLOCK STOP: the USB link did not come back: message the lead"; exit 11; }
    sleep 20
  done
  echo "LINK BACK after $(( $(date +%s) - t0 )) s: $(linkstate)"
  node tools/lock.mjs doing iphone --owner "$R" --clear > /dev/null 2>&1
  INRELINK=1; wdarestart; INRELINK=0
  thermalrearm "after the re-plug"
  [ -n "$CURW" ] && { WH=Hlw$LN; echo "WARM-UP after the re-plug: $WH $CURW (uncounted)"; hold $WH $CURW || { linkok && { echo "BLOCK STOP: warm-up $WH failed with the link ok: message the lead"; exit 5; }; relink "in warm-up $WH"; }; }
  return 0
}
prehold() {
  [ "$CM_DRY" = 1 ] && { echo "PREHOLD $1 (dry)"; return 0; }
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 && echo "PARKED Safari before $1" || echo "PARK before $1 failed (the hold goes on)"
  linkok || relink "before $1"
  if node tools/iphone.mjs wda check > $LG/wda-check-$1-$(date +%s).log 2>&1; then echo "WDA READY before $1"
  else echo "WDA not ready before $1: one restart"; wdarestart; fi
}
hold() {
  h=$1; shift
  [ -e $LG/hold-$h.log ] && mv $LG/hold-$h.log $LG/hold-$h.log.prev-$(date +%s)
  if [ "$CM_DRY" = 1 ]; then sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?
  else node tools/lock.mjs run chrome-measure --owner "$R" --no-timing --max-seconds 600 --doing "$CM_TICKET $h: $*" -- \
      caffeinate -i -s sh $HS $h "$@" > $LG/hold-$h.log 2>&1; e=$?; fi
  echo "$h ($*) exit $e: $(grep -E '^HOLD .* (VALID|VOID|DRY)' $LG/hold-$h.log | tail -1)"
  grep -E '^(RERUN-NEEDED|SENTINEL|ITEM .* VOID|PLAN|START GATE|TOOLS|SERVED|ATTACH)' $LG/hold-$h.log
  if grep -q -E "^HOLD $h VALID" $LG/hold-$h.log; then grep -E '^(RUN|SENTINEL) ' $LG/hold-$h.log | sed "s/^/$h /" >> $LG/order.log; fi
  [ "$CM_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
run1() {
  h=$1; shift; tries=0; rearms=0; e=1
  while :; do
    tries=$((tries + 1))
    prehold $h; hold $h "$@"; e=$?
    case $e in
      0) return 0 ;;
      7|3) [ $tries -le 2 ] && { echo "RETRY $h (exit $e)"; continue; } ;;
      5) if grep -q -E "^HOLD $h VOID (start gate exit [23] |profile misfit)" $LG/hold-$h.log && [ $rearms -lt 2 ]; then
           rearms=$((rearms + 1)); echo "CONDITION at $h's start ($(grep -E "^HOLD $h VOID" $LG/hold-$h.log | cut -c1-120)): re-arm $rearms"
           thermalrearm "re-arm for $h"; echo "RE-RUN $h after the re-arm"; continue; fi ;;
      8) echo "BLOCK STOP 8: a failing heat sentinel in $h ($(grep '^SENTINEL' $LG/hold-$h.log | grep -v PASS | head -2 | tr '\n' ' ')): message the lead"; exit 8 ;;
    esac
    if [ "$CM_DRY" != 1 ] && ! linkok; then relink "in $h (exit $e)"; echo "RE-RUN $h after the re-plug"; continue; fi
    if [ "$CM_DRY" != 1 ]; then
      PF=$LG/preflight-$h-$(date +%s).log; node tools/iphone.mjs preflight --owner "$R" > $PF 2>&1; pf=$?
      if needsready $pf $PF && [ $tries -le 3 ]; then unlockstep "in $h (exit $e)"; wdarestart; echo "RE-RUN $h after the unlock"; continue; fi
      if [ $pf -eq 11 ] && [ $tries -le 3 ]; then tabsstep "in $h (exit $e)"; echo "RE-RUN $h after closing the tabs"; continue; fi
    fi
    echo "BLOCK STOP at $h exit $e"; exit $e
  done
}
if [ "$CM_DRY" != 1 ]; then
  export CM_PROFILE=tool-serious FW_PHONE_CONDITION=tool
  wdarestart
  preflight start || { echo "BLOCK STOP: preflight exit $pe: message the lead"; exit 9; }
  echo "PREFLIGHT ok"
  if [ "$CM_READY" = 1 ]; then
    uid=$(step "$CM_TICKET: the iPhone test runs about 45 minutes" "Please don't use the iPhone for about 45 minutes and keep it plugged in to the Mac. Unlock it, close any message on screen and leave Safari open. Press Done when the phone is ready; the test starts then.")
    [ -n "$uid" ] || { echo "BLOCK STOP: ready step not posted"; exit 13; }
    echo "READY step $uid posted"
    node tools/console.mjs wait "$uid" --until done --timeout 3600 --quiet; w=$?
    [ $w -eq 0 ] || { echo "BLOCK STOP 13: ready step $uid not done (wait exit $w)"; exit 13; }
    echo "READY $uid done $(date -u +%FT%TZ)"
  fi
fi
thermalrearm "part start"
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  case $items in
    TAIL[AB])
      S=${items#TAIL}
      XS=$(ls $LG/hold-H*.log 2>/dev/null | while read f; do sed -n 's/^RERUN-NEEDED \(.*\)$/\1/p' "$f"; done | tr ' ' '\n' | grep -E "^$S[0ek][1-3]$" | awk '!s[$0]++' | sed 's/$/x/' | tr '\n' ' ')
      echo "TAIL$S: re-runs ${XS:-none}; then the S heat sentinel ${S}sC"
      CURW=$(grep -h -o "${S}w[0ek]" $LG/hold-*.log 2>/dev/null | awk '!s[$0]++' | tr '\n' ' ')
      run1 $H $XS ${S}sC ;;
    *) case $items in *[AB]w*) CURW=$(echo "$items" | tr ' ' '\n' | grep -E '^[AB]w' | tr '\n' ' ') ;;
         *) [ -n "$CURW" ] || CURW=$(grep -h -o "$(echo "$items" | cut -c1)w[0ek]" $LG/hold-*.log 2>/dev/null | awk '!s[$0]++' | tr '\n' ' ') ;; esac
       run1 $H $items ;;
  esac
done
echo "BLOCK PART DONE: $ALL"

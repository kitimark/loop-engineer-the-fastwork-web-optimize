#!/bin/sh
# P-166 stage 2 phone kit (card: fixes/g0-box/README.md "P-166", stage 2 signed 41b8b179): the block driver inside ONE
# phone hold (one part = one spot). A copy of p165-block.sh (P-165's final rules) for the W attribution block:
#   - no thermal condition: every hold reads the real state with the gate (p166-hold.sh); a TOOCOOL hold (exit 5) is
#     followed by a heat hold (H<n>h<k>: PW) and runs again; pre-warm time capped at CM_PW_MAX s per part (default 2400);
#   - a ceiling (exit 6) cools BY STATE (lead ruling after P-165 H10: Critical came below 42 C): Safari parked, no runs,
#     one thermal-gate --no-timer read every ~3 min inside this hold, at most 15 min, until the read is not Critical;
#     still Critical: BLOCK STOP 6 (message the lead); at most 2 ceiling coolings per hold;
#   - a failing heat sentinel (hold exit 8: a counted v0 run's W sentinel or the spot's control sentinel): BLOCK STOP 8,
#     the lead decides (a simplification of P-165's TAIL voiding; the scorer voids by the chain in any case);
#   - H<n>:TAIL<S> re-runs the spot's RERUN-NEEDED counted items once each (as <item>x), then the spot's control sentinel.
# Kept: served check at the part start, wda ensure + Safari restart, Safari parked before every hold and on exit, the
# time-guard re-run (exit 7), the end-gate re-run (exit 3), USB link loss (re-plug, then one W warm-up per arm port of
# the current spot), the unlock / close-tabs steps on preflight, the first heat (CM_FIRSTHEAT=1) as its own phase.
# CM_READY=1 (the first part): ONE console action step asks the user to get the phone ready and not use it (posted from
# inside this phone hold; one phone step at a time) and waits for its Done (the signature's condition 3).
#   CM_TICKET=P-166 node tools/lock.mjs run iphone --owner fix-g0-box --block P-166 --max-seconds 3600 --keep 120 -- \
#     sh fixes/g0-box/phone/p166-block.sh H1:Aw0,Awe,Awn,A01,Ae1 H2:An1,Ae2,An2,A02 H3:An3,A03,Ae3 H4:TAILA
# Logs: out/p166ph/hold-<H>.log, out/p166ph/order.log. CM_DRY=1: p166-hold.sh dry (pins, hashes, tools head, plan).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: CM_TICKET=P-166 sh fixes/g0-box/phone/p166-block.sh H<n>:<item>[,<item>...] ... [H<n>:TAIL<S>]"; exit 2; }
ALL="$*"; R=${RUNNER:-fix-g0-box}; LG=out/p166ph; HS=fixes/g0-box/phone/p166-hold.sh; SS=fixes/g0-box/phone/p166-serve.sh
mkdir -p $LG
unset FW_PHONE_CONDITION
[ "$CM_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p166-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -7 $LG/serve-check.log | grep -c ' ok$') of 7 servers"
linkstate() { node tools/usblink.mjs status 2>&1 | tail -1; }
linkok() { [ "$CM_DRY" = 1 ] && return 0; node tools/usblink.mjs status >> $LG/usblink.log 2>&1; }
wdarestart() {
  node tools/iphone.mjs wda ensure --owner "$R" > $LG/wda-ensure-$(date +%s).log 2>&1; we=$?
  if [ $we -eq 4 ] && [ "$INRELINK" != 1 ] && ! linkok; then relink "wda ensure REPLUG"; return 0; fi
  [ $we -eq 4 ] && { echo "BLOCK STOP: WDA REPLUG NEEDED (cable) with usblink $(linkstate): message the lead"; exit 5; }
  [ $we -eq 0 ] || { echo "BLOCK STOP: wda ensure exit $we (see $LG/wda-ensure-*.log)"; exit 5; }
  echo "WDA READY (ensure)"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('out/p166/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
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
  grep -E '^(RERUN-NEEDED|SENTINEL|ITEM .* VOID|PLAN|START GATE|PREWARM|MARGIN|GRIDCHECK|TOOLS|SERVED)' $LG/hold-$h.log
  if grep -q -E "^HOLD $h VALID" $LG/hold-$h.log; then grep -E '^(RUN|SENTINEL) ' $LG/hold-$h.log | sed "s/^/$h /" >> $LG/order.log; fi
  [ "$CM_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
coolstate() { # lead ruling (P-165 H10): cool by state; Safari parked, no runs, a --no-timer read every ~3 min, <= 15 min
  t0=$(date +%s); n=0
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  while :; do
    sleep 150; n=$((n + 1))
    node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p166-cool-$1-$n" --expect serious --max-c 44 --no-timer > $LG/cool-$1-$n.log 2>&1; c=$?
    echo "COOL read $n ($1) at +$(( $(date +%s) - t0 )) s exit $c: $(grep '^GATE' $LG/cool-$1-$n.log | tail -1)"
    case $c in 0|2) echo "COOLED by state ($1): not Critical"; return 0 ;; esac
    [ $(( $(date +%s) - t0 + 180 )) -le 900 ] || { echo "BLOCK STOP 6: still Critical after $(( $(date +%s) - t0 )) s of cooling ($1): message the lead"; exit 6; }
  done
}
PW0=0; NHEAT=0
heat() {
  NHEAT=$((NHEAT + 1)); t=$(date +%s)
  prehold $1h$NHEAT; hold $1h$NHEAT PW; he=$?
  PW0=$((PW0 + $(date +%s) - t))
  echo "HEAT $1h$NHEAT exit $he (pre-warm so far ${PW0} s of ${CM_PW_MAX:-2400})"
  case $he in
    0) return 0 ;;
    5) grep -q 'TOOCOOL' $LG/hold-$1h$NHEAT.log || { echo "BLOCK STOP at heat hold $1h$NHEAT exit 5 (not too cool): message the lead"; exit 5; } ;;
    6) coolstate $1h$NHEAT ;;
    7|3) ;;
    9) echo "BLOCK STOP 9 at $1h$NHEAT: induced Serious: message the lead"; exit 9 ;;
    *) echo "BLOCK STOP at heat hold $1h$NHEAT exit $he: message the lead"; exit $he ;;
  esac
  [ $PW0 -ge "${CM_PW_MAX:-2400}" ] && { echo "BLOCK STOP 12: not real Serious within ${CM_PW_MAX:-2400} s of pre-warm in this part: message the lead"; exit 12; }
  return 1
}
run1() {
  h=$1; shift; tries=0; ceil=0; e=1
  while :; do
    tries=$((tries + 1))
    prehold $h; hold $h "$@"; e=$?
    case $e in
      0) return 0 ;;
      7|3) [ $tries -le 2 ] && { echo "RETRY $h (exit $e)"; continue; } ;;
      5) if grep -q 'TOOCOOL' $LG/hold-$h.log; then until heat $h; do :; done; echo "RE-RUN $h after the heat hold"; continue; fi ;;
      6) ceil=$((ceil + 1)); [ $ceil -le 2 ] && { coolstate $h; echo "RE-RUN $h after the cooling"; continue; } ;;
      8) echo "BLOCK STOP 8: a failing heat sentinel in $h ($(grep '^SENTINEL' $LG/hold-$h.log | grep -v PASS | head -2 | tr '\n' ' ')): message the lead"; exit 8 ;;
      9) echo "BLOCK STOP 9 at $h: induced Serious: message the lead"; exit 9 ;;
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
  wdarestart
  preflight start || { echo "BLOCK STOP: preflight exit $pe: message the lead"; exit 9; }
  echo "PREFLIGHT ok"
  if [ "$CM_READY" = 1 ]; then
    uid=$(step "$CM_TICKET: the iPhone test runs about 1 hour (real heat)" "Please don't use the iPhone for about 1 hour and keep it plugged in to the Mac. Unlock it, close any message on screen and leave Safari open. Press Done when the phone is ready; the test starts then.")
    [ -n "$uid" ] || { echo "BLOCK STOP: ready step not posted"; exit 13; }
    echo "READY step $uid posted"
    node tools/console.mjs wait "$uid" --until done --timeout 3600 --quiet; w=$?
    [ $w -eq 0 ] || { echo "BLOCK STOP 13: ready step $uid not done (wait exit $w)"; exit 13; }
    echo "READY $uid done $(date -u +%FT%TZ)"
  fi
fi
firstheat() {
  t0=$(date +%s); k=0
  while :; do
    k=$((k + 1)); prehold H0h$k; hold H0h$k PW; fe=$?
    case $fe in
      0) echo "FIRST HEAT done in $(( $(date +%s) - t0 )) s ($k heat holds)"; return 0 ;;
      5|7|3) ;;
      6) coolstate H0h$k ;;
      9) echo "BLOCK STOP 9 in the first heat: induced Serious: message the lead"; exit 9 ;;
      10) echo "BLOCK STOP 10 in the first heat: the heat page did not open: message the lead"; exit 10 ;;
      *) if [ "$CM_DRY" != 1 ] && ! linkok; then relink "in the first heat"; continue; fi
         if [ "$CM_DRY" != 1 ]; then preflight H0h$k && continue; fi
         echo "BLOCK STOP in the first heat at H0h$k exit $fe: message the lead"; exit $fe ;;
    esac
    if [ $(( $(date +%s) - t0 )) -ge "${CM_FIRSTHEAT_MAX:-3600}" ]; then
      echo "BLOCK STOP 12: still not real Serious after $(( $(date +%s) - t0 )) s of first heat ($k heat holds): message the lead with the curve"
      grep '"label":"p166-H0h' out/thermal-gate/gates.jsonl 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.trim().split("\n")){try{const r=JSON.parse(l);console.log("CURVE",r.at,r.label,r.state,r.battC,"->",r.battEndC,"C")}catch{}}})'
      exit 12
    fi
  done
}
[ "$CM_FIRSTHEAT" = 1 ] && { [ "$CM_DRY" = 1 ] && { prehold H0h1; hold H0h1 PW; } || firstheat; }
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  case $items in
    TAIL[AB])
      S=${items#TAIL}
      XS=$(ls $LG/hold-H*.log 2>/dev/null | while read f; do sed -n 's/^RERUN-NEEDED \(.*\)$/\1/p' "$f"; done | tr ' ' '\n' | grep -E "^$S[0enf][1-3]$" | awk '!s[$0]++' | sed 's/$/x/' | tr '\n' ' ')
      echo "TAIL$S: re-runs ${XS:-none}; then the control sentinel ${S}s0"
      CURW=$(grep -h -o "${S}w[0enf]" $LG/hold-*.log 2>/dev/null | awk '!s[$0]++' | tr '\n' ' ')
      run1 $H $XS ${S}s0 ;;
    *) case $items in *[AB]w*) CURW=$(echo "$items" | tr ' ' '\n' | grep -E '^[AB]w' | tr '\n' ' ') ;; esac
       run1 $H $items ;;
  esac
done
echo "BLOCK PART DONE: $ALL"

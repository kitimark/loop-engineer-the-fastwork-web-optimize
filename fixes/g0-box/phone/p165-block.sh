#!/bin/sh
# P-165 phone kit (card: fixes/g0-box/README.md "P-165", signed c31626f2): the block driver inside ONE phone hold (one
# part). A copy of g0b-block.sh (P-164; credit: fix-g0-box, arch-compositor-morph, fix-end-morph) for real heat:
#   - no thermal condition at all: no iphone.mjs rearm, no thermal.mjs set, no FW_PHONE_CONDITION, no cooling before a
#     hold (the phone must stay warm); every hold reads the real state with the gate (p165-hold.sh);
#   - a hold whose start gate stays too cool after its 2 pre-warm runs (exit 5 TOOCOOL) is followed by a heat hold
#     (H<n>h<k>: PW, pre-warm runs on B until the gate passes, at most 6) and then runs again; pre-warm time is capped at
#     CM_PW_MAX s per part (default 2400 = 40 min), then BLOCK STOP 12;
#   - a ceiling at the start gate (exit 6) waits `wait.mjs phone-temp --below 42 --timeout 600`, then runs the hold again
#     (at most 2 ceiling waits per hold, then BLOCK STOP 6); an induced read (exit 9) stops the block;
#   - a failing heat sentinel (hold exit 8): the counted items since the last passing sentinel (block order, all parts,
#     out/p165/order.log) are voided and queued for the TAIL as <item>x; the phone cools with `wait.mjs phone-temp --below
#     auto --timeout 600` (the last passing sentinel's battery minus 0.5 C, 38 if none today); a second failing sentinel
#     in the block is BLOCK STOP 8 (the lead decides);
#   - more than one item per hold; H<n>:TAIL runs the gate re-runs (RERUN-NEEDED, at most 2 per leg, as <item>r for G and
#     <item>x for S) and the sentinel-voided items (<item>x), S items up to 3 per hold, G items one per hold, then sC.
# Kept from g0b-block: served check at the part start, `wda ensure` + Safari restart (I-220, I-214), Safari parked on
# exit and before every hold, WDA check before every hold, the time-guard re-run (exit 7), the end-gate re-run (exit 3,
# once), USB link loss (I-222: pause, re-plug, WDA + Safari, one warm-up per arm port of the current leg), the get-ready
# step on preflight AUTH (lead lesson 4).
# CM_READY=1 (part 1): before the first hold, ONE console action step asks the user to get the phone ready (about 2 h,
# don't use it, keep it plugged in) and waits for its Done; a background `console.mjs wait --until redo` is armed, and a
# Start over before a hold stops the block (BLOCK STOP 13). Posted from inside this phone hold (one phone step at a time).
#   CM_TICKET=P-165 node tools/lock.mjs run iphone --owner fix-g0-box --block P-165 --max-seconds 3600 --keep 120 -- \
#     sh fixes/g0-box/phone/p165-block.sh H1:wC,wV,C1,V2 H2:V3,C4,C5,V6 H3:V7,C8
# Logs: out/p165/hold-<H>.log, out/p165/order.log (RUN and SENTINEL lines of VALID holds in block order), out/p165/tail.txt.
# CM_DRY=1: calls p165-hold.sh directly (dry: pins and plan only).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set: no run"; exit 2; }
[ $# -gt 0 ] || { echo "usage: CM_TICKET=P-165 sh fixes/g0-box/phone/p165-block.sh H<n>:<item>[,<item>...] ... [H<n>:TAIL]"; exit 2; }
ALL="$*"; R=${RUNNER:-fix-g0-box}; LG=out/p165; HS=fixes/g0-box/phone/p165-hold.sh; SS=fixes/g0-box/phone/p165-serve.sh
mkdir -p $LG
unset FW_PHONE_CONDITION
[ "$CM_DRY" = 1 ] || trap 'node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "Safari parked (exit trap)"' EXIT
{ echo "== $(date -u +%FT%TZ) part start: $*"; sh $SS check; } >> $LG/serve-check.log 2>&1 \
  || { echo "BLOCK STOP: p165-serve.sh check failed (see $LG/serve-check.log)"; exit 4; }
echo "SERVE CHECK ok: $(tail -3 $LG/serve-check.log | grep -c ' ok$') of 3 servers"
linkstate() { node tools/usblink.mjs status 2>&1 | tail -1; }
linkok() { [ "$CM_DRY" = 1 ] && return 0; node tools/usblink.mjs status >> $LG/usblink.log 2>&1; }
wdarestart() { # I-220: wda ensure keeps a READY WDA, else restarts what is down; exit 4 = re-plug the cable
  node tools/iphone.mjs wda ensure --owner "$R" > $LG/wda-ensure-$(date +%s).log 2>&1; we=$?
  if [ $we -eq 4 ] && [ "$INRELINK" != 1 ] && ! linkok; then relink "wda ensure REPLUG"; return 0; fi
  [ $we -eq 4 ] && { echo "BLOCK STOP: WDA REPLUG NEEDED (cable; see $LG/wda-ensure-*.log) with usblink $(linkstate): message the lead"; exit 5; }
  [ $we -eq 0 ] || { echo "BLOCK STOP: wda ensure exit $we (see $LG/wda-ensure-*.log)"; exit 5; }
  echo "WDA READY (ensure)"
  PB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$LG/serve-B.json','utf8')).port)")
  node tools/iphone.mjs safari-restart --owner "$R" --url "$(node tools/lan.mjs --url --port "$PB")" --timeout 60 > $LG/safari-restart-$(date +%s).log 2>&1 \
    || { echo "BLOCK STOP: safari-restart failed (see $LG/safari-restart-*.log)"; exit 5; }
  echo "SAFARI restarted"
}
needsready() { [ "$1" -eq 10 ] || { [ "$1" -eq 3 ] && grep -q 'Failed to initialize for UI testing' "$2"; }; }
tabsstep() { # preflight TABS (exit 11, I-037; P-165 H1 06:34Z): Safari has several pages; the user closes all but one
  tid=$(step "$CM_TICKET: close the extra Safari tabs" "On the iPhone, open Safari's tab view and close every tab but one (leave one tab open, any page). Then press Done; the test goes on by itself.")
  [ -n "$tid" ] || { echo "BLOCK STOP: close-tabs step not posted"; exit 11; }
  echo "TABS step $tid posted ($1)"
  node tools/console.mjs wait "$tid" --until done --timeout 3600 --quiet; w=$?
  [ $w -eq 0 ] || { echo "BLOCK STOP: close-tabs step $tid not done (wait exit $w)"; exit 11; }
  echo "TABS $tid done"
}
preflight() { # -> 0 ok, else the preflight's exit; posts the unlock or close-tabs step once each and re-runs
  PL=$LG/preflight-$1-$(date +%s).log; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?
  if needsready $pe $PL; then unlockstep "preflight exit $pe ($1)"; PL=$PL.2; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?; fi
  if [ $pe -eq 11 ]; then tabsstep "preflight TABS ($1)"; PL=$PL.3; node tools/iphone.mjs preflight --owner "$R" > $PL 2>&1; pe=$?; fi
  [ $pe -eq 0 ] || echo "PREFLIGHT exit $pe ($1): $(tail -1 $PL | cut -c1-160)"
  return $pe
}
step() { # title instructions -> posts ONE phone action step from inside this hold and prints its id
  node tools/console.mjs post --by "$R" --kind action --phone --no-record --no-gate --topic g0-box --title "$1" --instructions "$2" 2>&1 \
    | sed -n 's/^POSTED \(C-[0-9]*\).*/\1/p'
}
unlockstep() {
  uid=$(step "$CM_TICKET: get the iPhone ready for the test" "Unlock the iPhone and close any message on screen. In Settings > Developer, check that Enable UI Automation is on. Leave Safari open, then press Done.")
  [ -n "$uid" ] || { echo "BLOCK STOP: unlock step not posted"; exit 9; }
  echo "UNLOCK step $uid posted ($1)"
  node tools/console.mjs wait "$uid" --until done --timeout 3600 --quiet; w=$?
  [ $w -eq 0 ] || { echo "BLOCK STOP: unlock step $uid not done (wait exit $w)"; exit 9; }
  echo "UNLOCK $uid done"
}
LN=0; N0=0; CURLEG=S
relink() {
  LN=$((LN + 1)); LW=lw$LN
  [ $LN -gt 3 ] && { echo "BLOCK STOP: link lost a 4th time in this part ($1): message the lead"; exit 11; }
  echo "LINK LOST ($1) $(date -u +%FT%TZ): $(linkstate); paused until usblink status exit 0, at most ${CM_LINK_MAX:-3600} s"
  node tools/lock.mjs doing iphone --owner "$R" --text "$CM_TICKET paused: USB link lost, waiting for the re-plug" > /dev/null 2>&1
  t0=$(date +%s)
  until node tools/usblink.mjs status >> $LG/usblink.log 2>&1; do
    [ $(( $(date +%s) - t0 )) -ge "${CM_LINK_MAX:-3600}" ] && { echo "BLOCK STOP: the USB link did not come back in ${CM_LINK_MAX:-3600} s ($(linkstate)): message the lead"; exit 11; }
    sleep 20
  done
  echo "LINK BACK after $(( $(date +%s) - t0 )) s: $(linkstate)"
  node tools/lock.mjs doing iphone --owner "$R" --clear > /dev/null 2>&1
  INRELINK=1; wdarestart; INRELINK=0
  case $CURLEG in S) W1=wC; W2=wV ;; *) W1=WC; W2=WV ;; esac
  for WI in $W1 $W2; do
    WH=H$N0$LW$WI; echo "WARM-UP after the re-plug: $WH $WI (uncounted)"
    hold $WH $WI; we2=$?
    if [ $we2 -ne 0 ]; then linkok && { echo "BLOCK STOP: warm-up $WH exit $we2 with the link ok: message the lead"; exit $we2; }
      relink "in warm-up $WH"; return 0; fi
  done
}
REDOLOG=$LG/ready-redo.log
redocheck() { [ -s "$REDOLOG" ] && grep -q -E '^(REDO|MET)' "$REDOLOG" && { echo "BLOCK STOP: the user started the ready step over ($(tail -1 $REDOLOG | cut -c1-80)): message the lead"; exit 13; }; return 0; }
prehold() {
  [ "$CM_DRY" = 1 ] && { echo "PREHOLD $1 (dry: no park, no WDA check)"; return 0; }
  redocheck
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
  grep -E '^(RERUN-NEEDED|SENTINEL|GATES .* INVALID|ITEM .* VOID|PROG|PLAN|START GATE|PREWARM)' $LG/hold-$h.log
  if grep -q -E "^HOLD $h VALID" $LG/hold-$h.log; then grep -E '^(RUN|SENTINEL) ' $LG/hold-$h.log | sed "s/^/$h /" >> $LG/order.log; fi
  [ "$CM_DRY" = 1 ] || node tools/lock.mjs doing iphone --owner "$R" --between 1 > /dev/null 2>&1
  return $e
}
PW0=0; NHEAT=0; SFAILS=$(grep -c ' SENTINEL [^ ]* FAIL' $LG/order.log 2>/dev/null); SFAILS=${SFAILS:-0}
heat() { # a heat hold after a TOOCOOL hold; pre-warm minutes are capped per part
  NHEAT=$((NHEAT + 1)); t=$(date +%s)
  prehold $1h$NHEAT; hold $1h$NHEAT PW; he=$?
  PW0=$((PW0 + $(date +%s) - t))
  echo "HEAT $1h$NHEAT exit $he (pre-warm so far ${PW0} s of ${CM_PW_MAX:-2400})"
  case $he in
    0) return 0 ;;
    5) grep -q 'TOOCOOL' $LG/hold-$1h$NHEAT.log || { echo "BLOCK STOP at heat hold $1h$NHEAT exit 5 (not too cool): message the lead"; exit 5; } ;;
    6) node tools/wait.mjs phone-temp --below 42 --timeout 600 --every 60 --owner "$R" --reason "$CM_TICKET ceiling in a heat hold" >> $LG/cooling.log 2>&1; echo "COOLED (ceiling) after $1h$NHEAT: exit $?" ;;
    7|3) ;;
    9) echo "BLOCK STOP 9 at $1h$NHEAT: induced Serious (a thermal condition is on): message the lead"; exit 9 ;;
    *) echo "BLOCK STOP at heat hold $1h$NHEAT exit $he: message the lead"; exit $he ;;
  esac
  [ $PW0 -ge "${CM_PW_MAX:-2400}" ] && { echo "BLOCK STOP 12: the phone did not reach real Serious within ${CM_PW_MAX:-2400} s of pre-warm in this part: message the lead"; exit 12; }
  return 1
}
voidsince() { # the counted items since the last passing sentinel, before the failing one (block order), -> tail.txt as <item>x
  awk '
    $2=="SENTINEL" && $4=="PASS" { n=0; next }
    $2=="SENTINEL" { for (i=1;i<=n;i++) print v[i]; if ($3 ~ /^C[1-8]$/) print $3; n=0; next }
    $2=="RUN" && $3 ~ /^([CV][1-8]|E[CV][1-4][r]?)$/ { v[++n]=$3 }
  ' $LG/order.log | awk '!s[$0]++' | sed 's/$/x/' | sed 's/rx$/x/'
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
      6) ceil=$((ceil + 1)); [ $ceil -le 2 ] && { node tools/wait.mjs phone-temp --below 42 --timeout 600 --every 60 --owner "$R" --reason "$CM_TICKET ceiling before $h" >> $LG/cooling.log 2>&1; echo "COOLED (ceiling) before $h: exit $?"; continue; } ;;
      8) SFAILS=$((SFAILS + 1))
         [ $SFAILS -ge 2 ] && { echo "BLOCK STOP 8: a second failing heat sentinel in the block ($h): message the lead"; exit 8; }
         voidsince >> $LG/tail.txt; echo "SENTINEL FAIL in $h: voided for the TAIL: $(tr '\n' ' ' < $LG/tail.txt)"
         node tools/wait.mjs phone-temp --below auto --timeout 600 --every 60 --owner "$R" --reason "$CM_TICKET sentinel cooling after $h" >> $LG/cooling.log 2>&1; echo "COOLED (sentinel) after $h: exit $?"
         return 0 ;;
      9) echo "BLOCK STOP 9 at $h: induced Serious (a thermal condition is on): message the lead"; exit 9 ;;
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
    uid=$(step "$CM_TICKET: the iPhone test runs about 2 hours (real heat)" "Please don't use the iPhone for about 2 hours and keep it plugged in to the Mac. Unlock it, close any message on screen and leave Safari open. Press Done when the phone is ready; the test starts then.")
    [ -n "$uid" ] || { echo "BLOCK STOP: ready step not posted"; exit 13; }
    echo "READY step $uid posted"
    : > $REDOLOG
    nohup node tools/console.mjs wait "$uid" --until redo --timeout 9000 >> $REDOLOG 2>&1 &
    node tools/console.mjs wait "$uid" --until done --timeout 3600 --quiet; w=$?
    [ $w -eq 0 ] || { echo "BLOCK STOP 13: ready step $uid not done (wait exit $w)"; exit 13; }
    echo "READY $uid done $(date -u +%FT%TZ)"
  fi
fi
firstheat() { # P-165 lead 06:4xZ: the first heat as its own phase before H1 (heat holds H0h<k>: PW), at most CM_FIRSTHEAT_MAX s
  t0=$(date +%s); k=0
  while :; do
    k=$((k + 1)); prehold H0h$k; hold H0h$k PW; fe=$?
    case $fe in
      0) echo "FIRST HEAT done in $(( $(date +%s) - t0 )) s ($k heat holds)"; return 0 ;;
      5|7|3) ;;
      6) node tools/wait.mjs phone-temp --below 42 --timeout 600 --every 60 --owner "$R" --reason "$CM_TICKET ceiling in the first heat" >> $LG/cooling.log 2>&1 ;;
      9) echo "BLOCK STOP 9 in the first heat: induced Serious (a thermal condition is on): message the lead"; exit 9 ;;
      10) echo "BLOCK STOP 10 in the first heat: the live heat page did not open (see out/p165/runs/pw-*-open.log): message the lead"; exit 10 ;;
      *) if [ "$CM_DRY" != 1 ] && ! linkok; then relink "in the first heat"; continue; fi
         if [ "$CM_DRY" != 1 ]; then preflight H0h$k && continue; fi
         echo "BLOCK STOP in the first heat at H0h$k exit $fe: message the lead"; exit $fe ;;
    esac
    if [ $(( $(date +%s) - t0 )) -ge "${CM_FIRSTHEAT_MAX:-3600}" ]; then
      echo "BLOCK STOP 12: still not real Serious after $(( $(date +%s) - t0 )) s of first heat ($k heat holds): message the lead with the curve"
      grep '"label":"p165-H0h' out/thermal-gate/gates.jsonl 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.trim().split("\n")){try{const r=JSON.parse(l);console.log("CURVE",r.at,r.label,r.state,r.battC,"->",r.battEndC,"C")}catch{}}})'
      exit 12
    fi
  done
}
[ "$CM_FIRSTHEAT" = 1 ] && { [ "$CM_DRY" = 1 ] && { prehold H0h1; hold H0h1 PW; } || firstheat; }
for spec in "$@"; do
  H=${spec%%:*}; items=$(echo "${spec#*:}" | tr ',' ' ')
  N0=${H#H}
  case $items in *E[CV]*|*W[CV]*) CURLEG=G ;; *) CURLEG=S ;; esac
  if [ "$items" = TAIL ]; then
    RR=$(ls $LG/hold-H*.log 2>/dev/null | while read f; do sed -n 's/^RERUN-NEEDED \([^(]*\) (.*/\1/p' "$f"; done | tr ' ' '\n' | grep -E '^(E[CV][1-4]|[CV][1-8])$' | awk '!s[$0]++')
    RG=$(echo "$RR" | grep -E '^E' | head -2 | sed 's/$/r/'); RS=$(echo "$RR" | grep -E '^[CV]' | head -2 | sed 's/$/x/')
    XS=$( (cat $LG/tail.txt 2>/dev/null; echo "$RS") | grep -E '^[CV][1-8]x$' | awk '!s[$0]++' | tr '\n' ' ')
    XG=$( (echo "$RG"; cat $LG/tail.txt 2>/dev/null | grep -E '^E') | grep -E '^E[CV][1-4][rx]$' | awk '!s[$0]++' | tr '\n' ' ')
    echo "TAIL: S re-runs ${XS:-none}; G re-runs ${XG:-none}; then sC"
    N=${H#H}
    set -- $XS
    while [ $# -gt 0 ]; do g3="$1"; shift; [ $# -gt 0 ] && { g3="$g3,$1"; shift; }; [ $# -gt 0 ] && { g3="$g3,$1"; shift; }
      CURLEG=S; run1 H$N $(echo $g3 | tr ',' ' '); N=$((N + 1)); done
    for g in $XG; do CURLEG=G; run1 H$N $g; N=$((N + 1)); done
    CURLEG=S; run1 H$N sC
  else run1 $H $items; fi
done
echo "BLOCK PART DONE: $ALL"

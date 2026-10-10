#!/bin/sh
# ar-hold.sh: wc-hold.sh plus items c (g-ar-carousel-v1) and t (g-ar-ptitle-v1) and WC_SET=g0m (arm V = g0.0m,
# names -ar-carousel-<orig|g0m>, -ar-ptitle-<orig|g0m>); a copy, so the running wc-hold.sh was never edited mid-run.
# Worst-case captures, original vs g0.0l (cap-worst, 2026-10-09; lead GO, option a): one phone hold.
# Adapted from research/team-article/capture/phone/hold.sh (art-worst-cases, T-170 #101), with credit; the thermal
# handling follows fixes/g0-0l/phone/g0l-block.sh (fix-scrollcb-g0, P-174): tool-serious via `iphone.mjs rearm`.
# Records the iPhone screen (tools/ioscap.mjs, the only allowed recorder, I-062) while a G program (WDA robot finger)
# drives the original page (arm A, "orig") or g0.0l (arm V, "g0l"); the same program and input on both arms.
#
#   H0 (prep; inside `lock.mjs run iphone` only, no chrome-measure hold):
#     node tools/lock.mjs run iphone --owner cap-worst --max-seconds 900 --keep 120 -- sh fixes/worst-cases-capture/wc-hold.sh H0 --prep
#     = the Do Not Disturb / Sleep focus console step (waits for Done), cooling below 40 C, `iphone.mjs rearm` (the thermal
#       tool holds Serious until `node tools/thermal.mjs clear` after the last hold), then one uncounted warm-up flick per
#       arm port (--warmup, no recording).
#   H1.. (counted; inside the runner's own --no-timing chrome-measure hold, inside the phone hold):
#     node tools/lock.mjs run iphone --owner cap-worst --max-seconds 900 --keep 120 -- \
#       node tools/lock.mjs run chrome-measure --owner cap-worst --no-timing --max-seconds 600 -- \
#       sh fixes/worst-cases-capture/wc-hold.sh H1 hA1 hV1 hV2 hA2
# Items <case><arm><n>, A V V A order per case:
#   u  fixes/worst-cases-capture/g-ar-herofinger-v1.json  the user's own hero gesture (C-146, record --touches ->
#      gesture-from-record.mjs), reload at the top, same clock alignment as h; names -ar-herofinger-<orig|g0m>
#   w  fixes/worst-cases-capture/g-ar-herofinger-v2.json  u plus a catch after each up fling (the user's stop taps,
#      not in the touch log); names -ar-herocatch-<orig|g0m>
#   o  fixes/worst-cases-capture/g-ar-endoc-v1.json  the end of the page: approach, then open/close/open/close pushes on
#      fixed waits (one take, cap-end-openclose 2026-10-10); names -ar-endoc-<orig|g0m>
#   h  research/team-article/capture/phone/g/hero-fade-v1.json  12 s rest at the top (countdown window), then 3 slow drags
#      through the hero cards' fade-out; recorder starts at Mac second :20-:27, driver at :40 (both arms see the same
#      clock seconds), as in hold.sh
#   m  fixes/g0-0l/phone/g-approach-g0l.json   slow drags to y >= 3400: people deck, dark section (~1,970), #platform switch
#   p  fixes/g0-0l/phone/g-flick-g0l.json      one fast flick that lands on the people deck, 3 s rest
#   e  fixes/g0-box/phone/g-fastshort-g0.json  the end of the page: approach, then short pushes that open/close the menu
#   f  fixes/v8-best/phone/g/flick-hero-v1.json (optional) fast flicks through the top card and back, twice
# Recording per item: out/iphone-screen/<UTC stamp>-wc-<case>-<orig|g0l>.mov (+ .frames.json .result.json .log .json);
# the driver's own record (rAF frame log, marks, thermal profile read) in out/wc/runs/<same name>.json.
# Stop rules: a profile misfit at a gate (exit 8), an end battery >= 43.0 C or a Critical read (exit 6), the time left in
# the 600 s Mac hold below the program's GESTURE_BUDGET_S + 20 s (exit 3: requeue the rest in a new hold).
# Nothing here prints or stores the LAN address outside out/ (Hard rule 12); nobody views a frame (I-062).
# Last line: "HOLD <H> DONE <ok>/<n>" (exit 0) or "HOLD <H> STOP <why>".
cd "$(dirname "$0")/../.." || exit 2
H=$1; shift
R=${FW_AGENT:-cap-worst}  # cap-finger-hero runs it with FW_AGENT=cap-finger-hero (item u, 2026-10-10)
S=out/wc/snap${WC_SET:+-$WC_SET}; O=out/wc/runs; D=fixes/worst-cases-capture; VV=research/team-article/capture/phone/vv.mjs
export FW_PHONE_CONDITION=tool
mkdir -p $O out/iphone-screen
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
PA=$(port A); PV=$(port V)
AU=$(node tools/lan.mjs --url --port "$PA") || exit 2
VU=$(node tools/lan.mjs --url --port "$PV") || exit 2
stamp() { python3 -c "import time,json,sys; print(json.dumps({'label': sys.argv[1], 'wallNs': time.time_ns(), 'upRawNs': time.clock_gettime_ns(time.CLOCK_UPTIME_RAW)}))" "$1" >> $O/stamps.jsonl; }
prog() { case $1 in
  h) echo research/team-article/capture/phone/g/hero-fade-v1.json ;; m) echo fixes/g0-0l/phone/g-approach-g0l.json ;;
  p) echo fixes/g0-0l/phone/g-flick-g0l.json ;; e) echo fixes/g0-box/phone/g-fastshort-g0.json ;;
  f) echo fixes/v8-best/phone/g/flick-hero-v1.json ;; a) echo fixes/worst-cases-capture/g-ar-menu-v1.json ;; c) echo fixes/worst-cases-capture/g-ar-carousel-v1.json ;; t) echo fixes/worst-cases-capture/g-ar-ptitle-v2.json ;; u) echo fixes/worst-cases-capture/g-ar-herofinger-v1.json ;; w) echo fixes/worst-cases-capture/g-ar-herofinger-v2.json ;; o) echo fixes/worst-cases-capture/g-ar-endoc-v1.json ;; *) echo none ;; esac; }
cname() { case $1 in h) echo hero ;; m) echo middle ;; p) echo people ;; e) echo end ;; f) echo flick ;; esac; }
# I-262 (lead's diagnosis, 2026-10-09 13:0xZ): another app's background web views can be listed before Safari's tab, and the
# tab picker then takes the wrong target. Pin the picker to Safari: FW_IPHONE_APPID=PID:<Safari's pid from WDA activeAppInfo>,
# read at the hold's start and before every item (the pid changes when Safari restarts).
safpid() {
  SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  if [ -n "$SP" ]; then export FW_IPHONE_APPID=PID:$SP; else echo "SAFARI not frontmost (WDA activeAppInfo); FW_IPHONE_APPID kept at ${FW_IPHONE_APPID:-unset}"; fi
}
safpid
echo "HOLD $H start $(date -u +%FT%TZ) args $* (Safari ${FW_IPHONE_APPID:-unpinned})"
sh $D/ar-serve.sh check > $O/$H-check.log 2>&1 || { cat $O/$H-check.log; echo "HOLD $H STOP served hash check failed"; exit 4; }
node tools/iphone.mjs wda check > $O/$H-wda.log 2>&1 || { tail -2 $O/$H-wda.log; echo "HOLD $H STOP WDA not ready"; exit 5; }

if [ "$1" = --prep ]; then
  if [ -n "$WC_FOCUS_STEP" ]; then echo "$WC_FOCUS_STEP (already posted)" > $O/$H-dnd.log; else
  node tools/console.mjs post --by $R --kind action --phone --title "iPhone: turn on Do Not Disturb or Sleep focus for the screen recordings" \
    --instructions "Turn on Do Not Disturb or Sleep focus on the iPhone (Control Center, Focus) so no notification can appear, leave Safari open and don't touch the phone. Press Done when it is on; the robot then records the clips (about 15-30 minutes)." \
    > $O/$H-dnd.log 2>&1 || { cat $O/$H-dnd.log; echo "HOLD $H STOP could not post the focus step (another phone step open?)"; exit 4; }
  fi
  if [ "$WC_FOCUS_STEP" = skip ]; then echo "FOCUS no step (memory deck-recording-pictures: Do Not Disturb stays on; checked in each recording's status bar)"; else
  ID=$(grep -o 'C-[0-9][0-9]*' $O/$H-dnd.log | head -1)
  echo "FOCUS step $ID posted $(date -u +%TZ); waiting for Done"
  node tools/console.mjs wait "$ID" --until answered --timeout 1800 > $O/$H-dnd-wait.log 2>&1 || { tail -2 $O/$H-dnd-wait.log; echo "HOLD $H STOP focus step $ID not answered"; exit 3; }
  echo "FOCUS step $ID answered $(date -u +%TZ): $(tail -1 $O/$H-dnd-wait.log | cut -c1-200)"
  fi
  node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  node tools/wait.mjs phone-temp --below 40 --timeout 600 --every 60 --owner $R --reason "worst-case captures: cool below 40 C before the block" > $O/$H-cool.log 2>&1
  ce=$?; echo "COOL exit $ce $(tail -1 $O/$H-cool.log | cut -c1-160)"
  [ $ce -eq 0 ] || { echo "HOLD $H STOP the phone did not cool below 40 C in 10 min"; exit 6; }
  node tools/iphone.mjs rearm --owner $R --settle 120 > $O/$H-rearm.log 2>&1; re=$?
  tail -3 $O/$H-rearm.log
  [ $re -eq 0 ] || { echo "HOLD $H STOP rearm exit $re (run node tools/thermal.mjs clear; message the lead)"; exit 8; }
  for A in A V; do
    [ $A = A ] && U=$AU || U=$VU
    node tools/iphone.mjs open "$U" --owner $R > /dev/null || { echo "HOLD $H STOP open $A failed (warm-up)"; exit 4; }
    node tools/iphone.mjs gesture "$(prog p)" --warmup --owner $R --label "wc-$H-W$A" --out "$O/wc-$H-W$A.json" > "$O/wc-$H-W$A.log" 2>&1
    echo "WARMUP $A exit $? $(date -u +%TZ)"
    node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  done
  echo "HOLD $H DONE prep"; exit 0
fi

n=0; ok=0; T0=$(date +%s); CAP=${HOLD_CAP:-600}
for I in "$@"; do
  n=$((n + 1))
  SC=$(echo "$I" | cut -c1); A=$(echo "$I" | cut -c2); G=$(prog $SC)
  [ "$G" = none ] && { echo "HOLD $H STOP unknown item $I"; exit 4; }
  case $SC in e) NEED=249 ;; h|u|w) NEED=${HF_NEED:-230} ;; *) NEED=170 ;; esac   # GESTURE_BUDGET_S (229 / 150) + 20 s set-up; h + 60 s clock waits
  LEFT=$((CAP - ($(date +%s) - T0)))
  if [ $LEFT -lt $NEED ]; then
    REST=$(echo "$*" | tr ' ' '\n' | tail -n +$n | tr '\n' ' ')
    echo "$REST" > $O/$H-remaining.txt
    echo "HOLD $H STOP budget: $LEFT s left, $I needs $NEED s; requeue: $REST($ok/$((n - 1)) done)"; exit 3
  fi
  sh $D/ar-serve.sh check > $O/$H-check-$I.log 2>&1 || { echo "HOLD $H STOP served hash check failed before $I"; exit 4; }
  [ "$A" = A ] && { U=$AU; PP=$PA; AN=orig; } || { U=$VU; PP=$PV; AN=g0l; [ "$WC_SET" = menu ] && AN=v14; [ "$WC_SET" = g0m ] && AN=g0m; }
  safpid
  L=$(date -u +%Y%m%dT%H%M%SZ)-wc-$(cname $SC)-$AN
  # item a = the Day 8 article pair: the user's -ar- picture rule (2026-10-10), names -ar-menu-orig- / -ar-menu-v14-
  [ "$SC" = a ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-menu-$AN
  [ "$SC" = c ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-carousel-$AN
  [ "$SC" = t ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-ptitle-$AN
  [ "$SC" = u ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-herofinger-$AN
  [ "$SC" = o ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-endoc-$AN   # end of the page, open/close in one take (cap-end-openclose)
  [ "$SC" = w ] && L=$(date -u +%Y%m%dT%H%M%SZ)-ar-herocatch-$AN   # v2: the same flings plus the user's stop catches (T-170 #200)   # the user's own hero gesture, replayed (cap-finger-hero, T-170 #193)
  echo "ITEM $I = $L"
  # H1 lesson (13:29Z, hV2): right after a recorder stop the inspector proxy can answer "fetch failed" for a while
  # (the USB link re-forming; thermal.mjs clear saw the tunnel refuse too). Retry the open, at most 6 tries.
  k=0
  until node tools/iphone.mjs open "$U" --owner $R > $O/$H-open-$I.log 2>&1; do
    k=$((k + 1)); [ $k -ge 6 ] && { tail -1 $O/$H-open-$I.log; echo "HOLD $H STOP open $A failed at $I after $k tries"; exit 4; }
    sleep 5; safpid
  done
  [ $k -gt 0 ] && echo "OPEN $I after $k retries"
  sleep 2
  node $VV --port "$PP" --label "$L-start" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err
  if [ "$SC" = h ] || [ "$SC" = u ] || [ "$SC" = w ]; then python3 -c "import time; s = time.time() % 60; time.sleep(0 if 20 <= s < 28 else (20 - s) % 60)"; fi
  stamp "$L-pre"
  # recorder cap: 240 s ended both original end runs mid-program (the recorder's stop drops the inspector link, the
  # driver aborts; H3 14:14Z/14:28Z), so the cap is 600 s (ioscap's maximum); wc-hold stops the recorder after the driver
  node tools/ioscap.mjs record --owner $R --seconds 600 --label "$L" --out out/iphone-screen/$L.mov > $O/$L.cap.log 2>&1 &
  CP=$!
  w=0; until grep -q 'recording the iPhone screen' $O/$L.cap.log out/iphone-screen/$L.log 2>/dev/null || [ $w -ge 100 ] || ! kill -0 $CP 2>/dev/null; do sleep 0.2; w=$((w + 1)); done
  sleep 1
  k=0  # hold.sh's H1 lesson: a recorder start can drop the inspector/WDA links for a few seconds; re-open, at most 6 tries
  until node tools/iphone.mjs wda check > /dev/null 2>&1 && node $VV --port "$PP" --label "$L-ready" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err; do
    k=$((k + 1)); [ $k -ge 6 ] && break
    sleep 3; node tools/iphone.mjs open "$U" --owner $R > /dev/null 2>&1
  done
  echo "READY $I after $k retries $(date -u +%TZ)"
  if [ "$SC" = h ] || [ "$SC" = u ] || [ "$SC" = w ]; then python3 -c "import time; s = time.time() % 60; time.sleep((40 - s) % 60)"; fi
  stamp "$L-rec"
  node tools/iphone.mjs gesture "$G" --owner $R --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
  stamp "$L-post"
  node $VV --port "$PP" --label "$L-end" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err
  sleep 1
  kill -TERM $CP 2>/dev/null; wait $CP; c=$?
  node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  [ $r -eq 0 ] && [ $c -eq 0 ] && ok=$((ok + 1))
  TH=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$O/$L.json','utf8')).meta.profile||{};const e=p.end||p.start||{};console.log((e.state||'?')+' '+(e.battC??'?')+' drift '+!!p.drift)}catch(e){console.log('? ? no record')}")
  echo "RUN $I $L driver exit $r recorder exit $c $(date -u +%TZ) thermal $TH load1 $(sysctl -n vm.loadavg | cut -d' ' -f2) $(grep -m1 -o 'frames [^,]*' $O/$L.cap.log)"
  [ $r -eq 8 ] && { echo "HOLD $H STOP profile misfit at $I"; exit 8; }
  TS=$(echo "$TH" | cut -d' ' -f1); TB=$(echo "$TH" | cut -d' ' -f2)
  [ "$TS" = Critical ] && { echo "HOLD $H STOP Critical after $I"; exit 6; }
  python3 -c "import sys; sys.exit(0 if '$TB' == '?' or float('$TB') < 43.0 else 1)" || { echo "HOLD $H STOP battery $TB C >= 43.0 after $I"; exit 6; }
done
echo "HOLD $H DONE $ok/$n"

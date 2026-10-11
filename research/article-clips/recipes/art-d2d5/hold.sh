#!/bin/sh
# hold.sh (art-day2-day5-clips, 2026-10-11, owner T-170 #359/#363): fixes/worst-cases-capture/tri-hold.sh (cap-end-
# openclose, which is ar-hold.sh / wc-hold.sh by cap-worst and cap-finger-hero, credited) with the arms of the Day 2 and
# Day 5 clips and only item w, the owner's own hero swipe replayed by the robot (g-ar-herofinger-v2.json, compiled
# 13b7b2c21740, the program behind article clip 1 and Fig. 14):
#   arm O = the original (names -orig), W = aw1-10c (-aw1), S = v6 (-v6); servers from serve.sh (this folder).
# Item w<arm><n>; runs are named <UTC stamp>-ar-herocatch4-<orig|aw1|v6> so they never mix with the 10 Oct (-herocatch-)
# or 11 Oct (-herocatch3-) runs. The hero clock alignment (recorder from Mac second :20-:27, driver at :40), the recorder,
# ready checks and stop rules are tri-hold.sh's, unchanged. Usage (inside the phone hold and the runner's own --no-timing
# Mac hold, as tri-block.sh / block.sh run it):
#   prep:    node tools/lock.mjs run iphone --owner <o> --max-seconds 900 --keep 120 -- sh <this> P0 --prep
#            = cooling below 40 C, `iphone.mjs rearm` (tool-held Serious), one uncounted warm-up flick per arm port
#            (g-flick-g0l.json --warmup, no recording). No focus step: Do Not Disturb stays on (memory deck-recording-
#            pictures), checked afterwards in each recording's status-bar strip by numbers only.
#   counted: node tools/lock.mjs run iphone ... -- node tools/lock.mjs run chrome-measure --owner <o> --no-timing
#            --max-seconds 600 -- sh <this> W1 wO1 wW1 wS1
# Recording per item: out/iphone-screen/<name>.mov (+ .frames.json .result.json .log .json, ioscap.mjs, the only allowed
# recorder, I-062); the driver's record (rAF frame log, marks, thermal read) in out/wc/runs/<name>.json; clock stamps in
# out/wc/runs/stamps.jsonl (the strips' clock chain). Stop rules: profile misfit (exit 8), Critical or battery >= 43.0 C
# after a run (exit 6, items not run in out/wc/runs/<H>-remaining.txt), hold time left below the item's need (exit 3).
# Nothing here prints or stores the LAN address outside out/ (Hard rule 12); nobody views a frame (I-062).
cd "$(dirname "$0")/../../../.." || exit 2
H=$1; shift
R=${FW_AGENT:-art-day2-day5-clips}
O=out/wc/runs; D=research/article-clips/recipes/art-d2d5; VV=research/team-article/capture/phone/vv.mjs
GW=fixes/worst-cases-capture/g-ar-herofinger-v2.json; GP=fixes/g0-0l/phone/g-flick-g0l.json
export FW_PHONE_CONDITION=tool
mkdir -p $O out/iphone-screen
PO=$(sh $D/serve.sh port O) && PW=$(sh $D/serve.sh port W) && PS=$(sh $D/serve.sh port S) || { echo "HOLD $H STOP no server state (run serve.sh first)"; exit 4; }
OU=$(node tools/lan.mjs --url --port "$PO") || exit 2
WU=$(node tools/lan.mjs --url --port "$PW") || exit 2
SU=$(node tools/lan.mjs --url --port "$PS") || exit 2
stamp() { python3 -c "import time,json,sys; print(json.dumps({'label': sys.argv[1], 'wallNs': time.time_ns(), 'upRawNs': time.clock_gettime_ns(time.CLOCK_UPTIME_RAW)}))" "$1" >> $O/stamps.jsonl; }
# I-262: pin the tab picker to Safari by its pid (WDA activeAppInfo), read at the start and before every item
safpid() {
  SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  if [ -n "$SP" ]; then export FW_IPHONE_APPID=PID:$SP; else echo "SAFARI not frontmost (WDA activeAppInfo); FW_IPHONE_APPID kept at ${FW_IPHONE_APPID:-unset}"; fi
}
safpid
echo "HOLD $H start $(date -u +%FT%TZ) args $* (Safari ${FW_IPHONE_APPID:+pinned})"
sh $D/serve.sh check > $O/$H-check.log 2>&1 || { cat $O/$H-check.log; echo "HOLD $H STOP served hash check failed"; exit 4; }
node tools/iphone.mjs wda check > $O/$H-wda.log 2>&1 || { tail -2 $O/$H-wda.log; echo "HOLD $H STOP WDA not ready"; exit 5; }

if [ "$1" = --prep ]; then
  echo "FOCUS no step (memory deck-recording-pictures: Do Not Disturb stays on; checked in each recording's status bar)"
  node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  node tools/wait.mjs phone-temp --below 40 --timeout 600 --every 60 --owner $R --reason "Day 2/5 clips: cool below 40 C before the block" > $O/$H-cool.log 2>&1
  ce=$?; echo "COOL exit $ce $(tail -1 $O/$H-cool.log | cut -c1-160)"
  [ $ce -eq 0 ] || { echo "HOLD $H STOP the phone did not cool below 40 C in 10 min"; exit 6; }
  node tools/iphone.mjs rearm --owner $R --settle 120 > $O/$H-rearm.log 2>&1; re=$?
  tail -3 $O/$H-rearm.log
  [ $re -eq 0 ] || { echo "HOLD $H STOP rearm exit $re (run node tools/thermal.mjs clear; message the lead)"; exit 8; }
  for A in O W S; do
    case $A in O) U=$OU ;; W) U=$WU ;; S) U=$SU ;; esac
    node tools/iphone.mjs open "$U" --owner $R > /dev/null || { echo "HOLD $H STOP open $A failed (warm-up)"; exit 4; }
    node tools/iphone.mjs gesture "$GP" --warmup --owner $R --label "d2d5-$H-W$A" --out "$O/d2d5-$H-W$A.json" > "$O/d2d5-$H-W$A.log" 2>&1
    echo "WARMUP $A exit $? $(date -u +%TZ)"
    node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  done
  echo "HOLD $H DONE prep"; exit 0
fi

n=0; ok=0; T0=$(date +%s); CAP=${HOLD_CAP:-600}
for I in "$@"; do
  n=$((n + 1))
  SC=$(echo "$I" | cut -c1); A=$(echo "$I" | cut -c2)
  [ "$SC" = w ] || { echo "HOLD $H STOP unknown item $I"; exit 4; }
  NEED=${HF_NEED:-230}   # GESTURE_BUDGET_S + set-up + the clock waits (tri-hold.sh's value for w)
  LEFT=$((CAP - ($(date +%s) - T0)))
  if [ $LEFT -lt $NEED ]; then
    REST=$(echo "$*" | tr ' ' '\n' | tail -n +$n | tr '\n' ' ')
    echo "$REST" > $O/$H-remaining.txt
    echo "HOLD $H STOP budget: $LEFT s left, $I needs $NEED s; requeue: $REST($ok/$((n - 1)) done)"; exit 3
  fi
  sh $D/serve.sh check > $O/$H-check-$I.log 2>&1 || { echo "HOLD $H STOP served hash check failed before $I"; exit 4; }
  case $A in O) U=$OU; PP=$PO; AN=orig ;; W) U=$WU; PP=$PW; AN=aw1 ;; S) U=$SU; PP=$PS; AN=v6 ;; *) echo "HOLD $H STOP unknown arm in $I"; exit 4 ;; esac
  safpid
  L=$(date -u +%Y%m%dT%H%M%SZ)-ar-herocatch4-$AN
  echo "ITEM $I = $L"
  k=0
  until node tools/iphone.mjs open "$U" --owner $R > $O/$H-open-$I.log 2>&1; do
    k=$((k + 1)); [ $k -ge 6 ] && { tail -1 $O/$H-open-$I.log | grep -v http; echo "HOLD $H STOP open $A failed at $I after $k tries"; exit 4; }
    sleep 5; safpid
  done
  [ $k -gt 0 ] && echo "OPEN $I after $k retries"
  sleep 2
  node $VV --port "$PP" --label "$L-start" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err
  python3 -c "import time; s = time.time() % 60; time.sleep(0 if 20 <= s < 28 else (20 - s) % 60)"
  stamp "$L-pre"
  node tools/ioscap.mjs record --owner $R --seconds 600 --label "$L" --out out/iphone-screen/$L.mov > $O/$L.cap.log 2>&1 &
  CP=$!
  w=0; until grep -q 'recording the iPhone screen' $O/$L.cap.log out/iphone-screen/$L.log 2>/dev/null || [ $w -ge 100 ] || ! kill -0 $CP 2>/dev/null; do sleep 0.2; w=$((w + 1)); done
  sleep 1
  k=0
  until node tools/iphone.mjs wda check > /dev/null 2>&1 && node $VV --port "$PP" --label "$L-ready" --out $O/vv.jsonl > /dev/null 2>> $O/$L.vv.err; do
    k=$((k + 1)); [ $k -ge 6 ] && break
    sleep 3; node tools/iphone.mjs open "$U" --owner $R > /dev/null 2>&1
  done
  echo "READY $I after $k retries $(date -u +%TZ)"
  python3 -c "import time; s = time.time() % 60; time.sleep((40 - s) % 60)"
  stamp "$L-rec"
  node tools/iphone.mjs gesture "$GW" --owner $R --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
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
  REST=$(echo "$*" | tr ' ' '\n' | tail -n +$((n + 1)) | tr '\n' ' ')
  [ "$TS" = Critical ] && { echo "$REST" > $O/$H-remaining.txt; echo "HOLD $H STOP Critical after $I; not run: $REST"; exit 6; }
  python3 -c "import sys; sys.exit(0 if '$TB' == '?' or float('$TB') < 43.0 else 1)" || { echo "$REST" > $O/$H-remaining.txt; echo "HOLD $H STOP battery $TB C >= 43.0 after $I; not run: $REST"; exit 6; }
done
echo "HOLD $H DONE $ok/$n"

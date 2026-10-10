#!/bin/sh
# hf-user.sh: the user's own finger through the hero cards, original vs g0.0m (cap-finger-hero, 2026-10-10, user T-170 #193).
# One console step (--record --gate --phone, 2 parts): part 1 on the original page (arm A), part 2 on g0.0m (arm V), each
# opened fresh at the top. After the user's Start: the screen recorder (tools/ioscap.mjs, the only allowed one, I-062)
# and `iphone.mjs record --touches` (I-218: frames + the finger's touches, for tools/gesture-from-record.mjs), both inside
# a --no-timing chrome-measure hold (phoneGuard, I-056; the iPhone holder queues first, I-172). No thermal gate on the
# user's part (memory user-steps-first; record without --profile, I-257): the robot replay is the measured comparison.
# Names: <UTC stamp>-ar-herouser-<orig|g0m> (out/iphone-screen/*.mov, out/wc/runs/*.json).
# Inside the phone hold only (in the background):
#   node tools/lock.mjs run iphone --owner cap-finger-hero --max-seconds 900 --keep 120 -- sh fixes/worst-cases-capture/hf-user.sh
# Prints no LAN address (Hard rule 12). Last line: "HFUSER DONE <step>" or "HFUSER STOP <why>".
cd "$(dirname "$0")/../.." || exit 2
R=cap-finger-hero; export FW_AGENT=$R; export WC_SET=g0m
S=out/wc/snap-g0m; O=out/wc/runs; D=fixes/worst-cases-capture; VV=research/team-article/capture/phone/vv.mjs
SEC=${HF_SECONDS:-22}
mkdir -p $O out/iphone-screen
if [ "$1" = rec ]; then # rec <label>: inside the --no-timing chrome-measure hold: screen recorder, then the touch record
  L=$2
  node tools/ioscap.mjs record --owner $R --seconds 120 --label "$L" --out out/iphone-screen/$L.mov > $O/$L.cap.log 2>&1 &
  CP=$!
  w=0; until grep -q 'recording the iPhone screen' $O/$L.cap.log out/iphone-screen/$L.log 2>/dev/null || [ $w -ge 100 ] || ! kill -0 $CP 2>/dev/null; do sleep 0.2; w=$((w + 1)); done
  sleep 1
  node tools/iphone.mjs record --owner $R --touches --seconds $SEC --poll 5 --label "$L" --out $O/$L.json > $O/$L.rec.log 2>&1 &
  RP=$!
  node tools/wait.mjs file $O/$L.rec.log --match '^RECORDING' --pid $RP --owner $R --timeout 60 --reason "user finger record starts" > /dev/null 2>&1
  kill -0 $RP 2>/dev/null && node tools/console.mjs ack $ID --by $R --part $P --attempt $AT --state recording --message "recording: swipe now, about 10-15 s, then press Done" > /dev/null 2>&1
  echo "REC $L recording $(date -u +%TZ)"
  wait $RP; r=$?
  sleep 1
  kill -TERM $CP 2>/dev/null; wait $CP; c=$?
  echo "REC $L record exit $r recorder exit $c $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2) $(grep -m1 -o 'frames [^,]*' $O/$L.cap.log)"
  grep -v 'RECORDING\|http' $O/$L.rec.log | tail -2 | cut -c1-200
  exit $r
fi
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
PA=$(port A); PV=$(port V)
AU=$(node tools/lan.mjs --url --port "$PA") || exit 2
VU=$(node tools/lan.mjs --url --port "$PV") || exit 2
safpid() {
  SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  [ -n "$SP" ] && export FW_IPHONE_APPID=PID:$SP
}
safpid
echo "HFUSER start $(date -u +%FT%TZ) (Safari ${FW_IPHONE_APPID:-unpinned})"
sh $D/ar-serve.sh check > $O/hfu-check.log 2>&1 || { cat $O/hfu-check.log; echo "HFUSER STOP served hash check failed"; exit 4; }
if [ -n "$HF_STEP" ]; then ID=$HF_STEP; else
  node tools/console.mjs post --by $R --kind action --record --gate --phone --topic cap-finger-hero \
    --title "iPhone: scroll the hero cards with your own finger (original, then g0.0m)" \
    --instructions "Two short recordings. Each page opens at the top; when the page says swipe, scroll down slowly through the hero cards with one finger, the way you normally would, for about 10-15 seconds, then press Done." \
    --parts '[{"label":"Page 1: the original","record":true,"gate":true,"instructions":"When it says swipe: scroll slowly down through the hero cards with one finger, about 10-15 s, then Done."},{"label":"Page 2: g0.0m","record":true,"gate":true,"instructions":"The same again on this build: from the top, scroll the hero cards the same way, about 10-15 s, then Done."}]' \
    > $O/hfu-post.log 2>&1 || { cat $O/hfu-post.log; echo "HFUSER STOP could not post the step"; exit 4; }
  ID=$(grep -o 'C-[0-9][0-9]*' $O/hfu-post.log | head -1)
fi
echo "STEP $ID $(date -u +%TZ)"
export ID
attempt() { node tools/console.mjs show $ID --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log((s.parts[$1-1]||{}).attempt||1)})"; }
P=1; redos=0
while [ $P -le 2 ]; do
  AT=$(attempt $P); export P AT
  if [ $P = 1 ]; then U=$AU; PP=$PA; AN=orig; else U=$VU; PP=$PV; AN=g0m; fi
  node tools/console.mjs ack $ID --by $R --part $P --attempt $AT --state loading --message "opening the page at the top (about 20 s)" > /dev/null || { echo "HFUSER ack loading refused (part $P attempt $AT)"; }
  safpid
  k=0
  until node tools/iphone.mjs open "$U" --owner $R > $O/hfu-open-$P.log 2>&1; do
    k=$((k + 1)); [ $k -ge 6 ] && { tail -1 $O/hfu-open-$P.log; echo "HFUSER STOP open part $P failed"; exit 4; }
    sleep 5; safpid
  done
  sleep 3
  node $VV --port "$PP" --label "hfu-$ID-p$P-a$AT-open" --out $O/vv.jsonl 2>> $O/hfu-vv.err | tail -1
  node tools/console.mjs ack $ID --by $R --part $P --attempt $AT --state ready --message "ready: press Start (don't swipe until it says swipe)" > /dev/null || echo "HFUSER ack ready refused"
  echo "READY part $P attempt $AT $(date -u +%TZ)"
  node tools/console.mjs wait $ID --until started --part $P --timeout 1800 --json > $O/hfu-wait-$P.json 2>> $O/hfu-wait.err; e=$?
  if [ $e -eq 5 ]; then
    redos=$((redos + 1)); [ $redos -gt 4 ] && { echo "HFUSER STOP too many redos"; exit 5; }
    P=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('$O/hfu-wait-$P.json','utf8'));console.log(j.part||1)}catch{console.log(1)}")
    echo "REDO -> part $P $(date -u +%TZ)"; continue
  fi
  [ $e -eq 0 ] || { echo "HFUSER STOP wait started part $P exit $e"; exit 3; }
  AT=$(attempt $P); export AT
  node tools/console.mjs ack $ID --by $R --part $P --attempt $AT --message "starting the recorders (about 10 s), don't swipe yet" > /dev/null 2>&1
  L=$(date -u +%Y%m%dT%H%M%SZ)-ar-herouser-$AN
  echo "PART $P attempt $AT = $L"
  node tools/lock.mjs run chrome-measure --owner $R --no-timing --max-seconds 240 --doing "your finger on the hero cards: screen + touch recording" -- sh $D/hf-user.sh rec "$L"
  r=$?
  # the record ends at $SEC s; the user's Done may already be in
  node tools/console.mjs wait $ID --until done --part $P --timeout 3 > /dev/null 2>&1; d=$?
  if [ $d -eq 5 ]; then P=1; echo "REDO after part (restart) $(date -u +%TZ)"; redos=$((redos + 1)); continue; fi
  [ $d -eq 0 ] || node tools/console.mjs ack $ID --by $R --part $P --attempt $AT --state done --message "recorded ($SEC s)" > /dev/null 2>&1
  echo "DONE part $P record exit $r $(date -u +%TZ)"
  node tools/iphone.mjs park --owner $R > /dev/null 2>&1
  P=$((P + 1))
done
echo "HFUSER DONE $ID"

#!/bin/sh
# rf.sh: Day 11 article pair "reveal flick" (cap-end-orig, 2026-10-11, lead request): the moment the People card appears
# after one fast robot flick from the top, g0.0l (A) against g0.0m (V, the final build: the hidden People card is painted
# before it shows, P-175 / fixes/reveal-paint, fixes/g0-0m). Screen recording (tools/ioscap.mjs, the only allowed recorder,
# I-062) plus the phone's own frame log, A V V A, names <stamp>-ar-revealflick-<g0l|g0m>.
# Builds: out/g0-0m/snap/{C,V} from fixes/g0-0m/phone/g0m-snap.sh (C = g0.0l JS 4106679e0a8a / CSS 440582cec781, V = g0.0m
# JS 37af49aef32b / CSS 7a8ecdd8f8e4; HASHES.txt e7947589f4c9, as P-175), served plain http, --vendors=local --latency 150.
# Program: P-174 / P-175's FLICK, fixes/g0-0m/phone/g-flick-g0m.json (compiled 22b636f36a82: reload, 4 s, mark flick, one
# flick up 300 px / 220 ms, until settled, mark landed, 3 s, mark flick-end), with fixes/g0-0m/phone/pb-lite.mjs injected
# (rAF scrollY + the #people class flips) so the reader finds the reveal frame. No Timeline (a recording, not a block).
# The recorder: this checkout's own out/ioscap/ioscap.app (built and allowed there; the lead runs any first run), output in
# out/iphone-screen/. Run it from the worktree that has the allowed app (lead 2026-10-11: cap-end-openclose's).
#   sh fixes/worst-cases-capture/rf.sh serve | check | stop
#   sh fixes/worst-cases-capture/rf.sh hold rA1 rV1 rV2 rA2     (inside the runner's phone hold; FW_PHONE_CONDITION=tool)
# Per item: served hashes, Safari pinned by pid (I-262), open, the recorder started and confirmed, the flick, recorder
# stopped, park; a battery >= 43.0 C or a Critical read stops (exit 6). Before the first item: cool below 39 C (<= 10 min).
# Prints no LAN address (Hard rule 12); nobody views a frame (I-062).
cd "$(dirname "$0")/../.." || exit 2
R=${FW_AGENT:-cap-end-orig}; S=out/rf; O=out/rf/runs; SNAP=out/g0-0m/snap
G=fixes/g0-0m/phone/g-flick-g0m.json; PROG=22b636f36a82; LOGGER=fixes/g0-0m/phone/pb-lite.mjs
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
mkdir -p $O
pin() { case $1 in A) echo "4106679e0a8a 440582cec781" ;; V) echo "37af49aef32b 7a8ecdd8f8e4" ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
check() { (cd $SNAP && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED"; return 4; }
  for X in A V; do P=$(port $X) || return 4; [ "$(served $P $J) $(served $P $C)" = "$(pin $X)" ] || { echo "SERVED $X wrong"; return 4; }; done; echo "SERVED A V ok"; }
case "$1" in
  serve)
    for X in A V; do
      [ -f $S/serve-$X.pid ] && kill -0 "$(cat $S/serve-$X.pid)" 2>/dev/null && continue
      D=$SNAP/C; [ $X = V ] && D=$SNAP/V
      rm -f $S/serve-$X.json
      nohup node tools/serve.mjs --root site-pretty --overlay $D --port auto --vendors=local --latency 150 --state $S/serve-$X.json > $S/serve-$X.log 2>&1 &
      echo $! > $S/serve-$X.pid
      node tools/wait.mjs serve $S/serve-$X.json --pid $! --timeout 60 --owner "$R" --reason "reveal-flick capture server $X" > /dev/null || { echo "server $X failed"; exit 4; }
    done
    check || exit 4; exit 0 ;;
  check) check || exit 4; exit 0 ;;
  stop) for X in A V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done; echo stopped; exit 0 ;;
  hold) shift ;;
  *) echo "usage: sh fixes/worst-cases-capture/rf.sh serve|check|stop|hold <items>"; exit 2 ;;
esac
[ -d out/ioscap/ioscap.app ] || { echo "HOLD RF STOP no out/ioscap/ioscap.app in this checkout (run from the worktree with the allowed app)"; exit 4; }
export FW_PHONE_CONDITION=tool
SH=out/iphone-screen; mkdir -p "$SH"
safpid() { SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  [ -n "$SP" ] && export FW_IPHONE_APPID=PID:$SP; }
check > /dev/null || { echo "HOLD RF STOP served hashes"; exit 4; }
BE=$(node tools/iphone.mjs gesture $G --owner "$R" --dry-run 2>&1); hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p')
[ "$hE" = $PROG ] || { echo "HOLD RF STOP program ${hE:-none}, pinned $PROG"; exit 4; }
node tools/wait.mjs phone-temp --below 39 --timeout 600 --owner "$R" --reason "reveal-flick capture: cool below 39 C first" > $O/cool.log 2>&1; echo "COOL exit $? $(tail -1 $O/cool.log | cut -c1-140)"
echo "HOLD RF start $(date -u +%FT%TZ) items $* (program $PROG)"
ok=0; n=0
for I in "$@"; do
  n=$((n + 1)); A=$(echo $I | cut -c2); [ $A = A ] && AN=g0l || AN=g0m
  check > /dev/null || { echo "HOLD RF STOP served hashes before $I"; exit 4; }
  U=$(node tools/lan.mjs --url --port "$(port $A)")
  safpid
  k=0; until node tools/iphone.mjs open "$U" --owner "$R" > $O/open-$I.log 2>&1; do k=$((k + 1)); [ $k -ge 6 ] && { echo "HOLD RF STOP open failed at $I"; exit 4; }; sleep 5; safpid; done
  sleep 2
  L=$(date -u +%Y%m%dT%H%M%SZ)-ar-revealflick-$AN
  node tools/ioscap.mjs record --owner "$R" --seconds 120 --label "$L" --out "$SH/$L.mov" > $O/$L.cap.log 2>&1 &
  CP=$!
  w=0; until grep -q 'recording the iPhone screen' $O/$L.cap.log "$SH/$L.log" 2>/dev/null || [ $w -ge 100 ] || ! kill -0 $CP 2>/dev/null; do sleep 0.2; w=$((w + 1)); done
  sleep 1
  k=0; until node tools/iphone.mjs wda check > /dev/null 2>&1; do k=$((k + 1)); [ $k -ge 6 ] && break; sleep 3; done
  safpid; node tools/iphone.mjs open "$U" --owner "$R" > /dev/null 2>&1 || true
  node tools/iphone.mjs gesture $G --inject $LOGGER --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
  sleep 1; kill -TERM $CP 2>/dev/null; wait $CP; c=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  [ $r -eq 0 ] && [ $c -eq 0 ] && ok=$((ok + 1))
  TH=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$O/$L.json','utf8')).meta.profile||{};const s=p.start||{},e=p.end||{};console.log((e.state||s.state||'?')+' '+(s.battC??'?')+' '+(e.battC??s.battC??'?')+' drift '+!!p.drift)}catch(e){console.log('? ? ? no record')}")
  echo "RUN $I $L driver exit $r recorder exit $c $(date -u +%TZ) thermal $TH $(grep -m1 -o 'frames [^,]*' $O/$L.cap.log)"
  [ $r -eq 8 ] && { echo "HOLD RF STOP profile misfit at $I"; exit 8; }
  TS=$(echo "$TH" | cut -d' ' -f1); TB=$(echo "$TH" | cut -d' ' -f3)
  [ "$TS" = Critical ] && { echo "HOLD RF STOP Critical after $I"; exit 6; }
  python3 -c "import sys; sys.exit(0 if '$TB' == '?' or float('$TB') < 43.0 else 1)" || { echo "HOLD RF STOP battery $TB C after $I"; exit 6; }
done
echo "HOLD RF DONE $ok/$n"

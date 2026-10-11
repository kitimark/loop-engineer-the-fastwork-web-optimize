#!/bin/sh
# serve.sh (art-day2-day5-clips, 2026-10-11): three arms for the Day 2 / Day 5 article clips, adapted from
# fixes/worst-cases-capture/tri-serve.sh and rf.sh (credit cap-end-openclose, cap-end-orig):
#   O = the original page: the plain baseline snapshot, no overlay (JS 4606120cf392, CSS 27776f3d4138)
#   W = aw1-10c (Day 2's "laggy the same" build): out/d2d5/snap/W (snap.sh), JS 757e2cbc44e7 / CSS c6aad94b455f
#   S = v6 (Day 5's breakthrough build, B-R2):    out/d2d5/snap/S (snap.sh), JS 8018ce062d30 / CSS 71b65c667720
# All plain http (I-003), --vendors=local --latency 150, as the -ar- runs. Phone URLs come from tools/lan.mjs at run
# time; never copied into a committed file (Hard rule 12).
#   sh research/article-clips/recipes/art-d2d5/serve.sh          start the servers that are not running, check all three
#   sh research/article-clips/recipes/art-d2d5/serve.sh check    re-check the snapshot and the served hashes (exit 4 if wrong)
#   sh research/article-clips/recipes/art-d2d5/serve.sh stop     stop these three servers (only these, by their pid files)
#   sh research/article-clips/recipes/art-d2d5/serve.sh port O|W|S
cd "$(dirname "$0")/../../../.." || exit 2
S=out/d2d5/serve; OWNER=${FW_AGENT:-art-day2-day5-clips}
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
mkdir -p $S
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
pin() { case $1 in O) echo "4606120cf392 27776f3d4138" ;; W) echo "757e2cbc44e7 c6aad94b455f" ;; S) echo "8018ce062d30 71b65c667720" ;; esac; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
case "$1" in
  port) port "$2"; exit $? ;;
  stop) for X in O W S; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done; echo stopped; exit 0 ;;
  check) ;;
  "")
    for X in O W S; do
      [ -f $S/serve-$X.pid ] && kill -0 "$(cat $S/serve-$X.pid)" 2>/dev/null && continue
      rm -f $S/serve-$X.json
      if [ $X = O ]; then
        nohup node tools/serve.mjs --root site-pretty --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
      else
        nohup node tools/serve.mjs --root site-pretty --overlay out/d2d5/snap/$X --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
      fi
      echo $! > $S/serve-$X.pid
      node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --timeout 60 --owner "$OWNER" --reason "Day 2/5 clips: server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
    done ;;
  *) echo "usage: serve.sh [check|stop|port O|W|S]"; exit 2 ;;
esac
(cd out/d2d5/snap && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 4; }
bad=0
for X in O W S; do
  P=$(port $X) || { echo "$X: no server state"; exit 4; }
  H="$(served $P $J) $(served $P $C)"
  [ "$H" = "$(pin $X)" ] && ok=ok || { ok=WRONG; bad=1; }
  echo "$X port $P served JS/CSS $H $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

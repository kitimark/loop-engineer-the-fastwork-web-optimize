#!/bin/sh
# tri-serve.sh: three arms for the 9 Oct slow-drag items again, now with g0.0m (cap-end-openclose, 2026-10-11, lead request):
#   O = the original page: the plain baseline snapshot, no overlay (JS 4606120cf392, CSS 27776f3d4138), served here
#   L = g0.0l (JS 4106679e0a8a / CSS 440582cec781) and M = g0.0m (JS 37af49aef32b / CSS 7a8ecdd8f8e4): rf.sh's two servers
#       (out/rf/serve-A / serve-V) over out/g0-0m/snap/{C,V} (fixes/g0-0m/phone/g0m-snap.sh from main's patches with
#       `fix.mjs apply g0-0l|g0-0m --reset`, HASHES.txt e7947589f4c9, as P-175)
# All plain http (I-003), --vendors=local --latency 150, as ar-serve.sh / rf.sh (adapted from them, credit cap-worst and
# cap-end-orig). Phone URLs come from tools/lan.mjs at run time; never copied into a committed file (Hard rule 12).
#   sh fixes/worst-cases-capture/tri-serve.sh          start O (and rf.sh's A/V), check all three
#   sh fixes/worst-cases-capture/tri-serve.sh check    re-check the served hashes (exit 4 if wrong)
#   sh fixes/worst-cases-capture/tri-serve.sh stop     stop O and rf.sh's servers (only these, by their pid files)
#   sh fixes/worst-cases-capture/tri-serve.sh port O|L|M
cd "$(dirname "$0")/../.." || exit 2
S=out/wc/snap-tri; OWNER=${FW_AGENT:-cap-end-openclose}
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
mkdir -p $S
state() { case $1 in O) echo $S/serve-O.json ;; L) echo out/rf/serve-A.json ;; M) echo out/rf/serve-V.json ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$(state $1)','utf8')).port)"; }
pin() { case $1 in O) echo "4606120cf392 27776f3d4138" ;; L) echo "4106679e0a8a 440582cec781" ;; M) echo "37af49aef32b 7a8ecdd8f8e4" ;; esac; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
case "$1" in
  port) port "$2"; exit $? ;;
  stop) [ -f $S/serve-O.pid ] && kill "$(cat $S/serve-O.pid)" 2>/dev/null; rm -f $S/serve-O.pid
        FW_AGENT=$OWNER sh fixes/worst-cases-capture/rf.sh stop; exit 0 ;;
  check) ;;
  "")
    if ! { [ -f $S/serve-O.pid ] && kill -0 "$(cat $S/serve-O.pid)" 2>/dev/null; }; then
      rm -f $S/serve-O.json
      nohup node tools/serve.mjs --root site-pretty --port 0 --state $S/serve-O.json --vendors=local --latency 150 > $S/serve-O.log 2>&1 &
      echo $! > $S/serve-O.pid
      node tools/wait.mjs serve $S/serve-O.json --pid "$(cat $S/serve-O.pid)" --timeout 60 --owner "$OWNER" --reason "9 Oct items again: original-page server" > /dev/null || { echo "server O failed, see $S/serve-O.log"; exit 1; }
    fi
    FW_AGENT=$OWNER sh fixes/worst-cases-capture/rf.sh serve > /dev/null || { echo "rf.sh serve failed"; exit 1; } ;;
  *) echo "usage: tri-serve.sh [check|stop|port O|L|M]"; exit 2 ;;
esac
(cd out/g0-0m/snap && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 4; }
bad=0
for X in O L M; do
  P=$(port $X) || { echo "$X: no server state"; exit 4; }
  H="$(served $P $J) $(served $P $C)"
  [ "$H" = "$(pin $X)" ] && ok=ok || { ok=WRONG; bad=1; }
  echo "$X port $P served JS/CSS $H $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

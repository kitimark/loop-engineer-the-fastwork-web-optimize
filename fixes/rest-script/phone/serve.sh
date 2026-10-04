#!/bin/sh
# P-094 (rest-script v4 phone no-worse check): serve the arms from immutable snapshot copies, plain http (I-003),
# --port auto, --latency 150, --vendors=local. Adapted from cd-roll-ca's out/cd-roll-ca/serve-snap.sh.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = st6-rb2 (JS 7bf7c4657d21, CSS f523598b2a24), copy out/rest-script/snap/C
#   V = st6-rb2 + rest-script v4 = fixes/rest-script-live (JS 520d5f1139c7, CSS f523598b2a24), copy out/rest-script/snap/V
# Usage: sh fixes/rest-script/phone/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/rest-script/phone/serve.sh stop     stop them (only these three, by their pid files)
# Phone URLs are printed for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/rest-script/snap
if [ "$1" = stop ]; then
  for X in B C V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
for X in B C V; do
  [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
  rm -f $S/serve-$X.json
  OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
  node tools/serve.mjs --root site-pretty $OV --port auto --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
  echo $! > $S/serve-$X.pid
done
for X in B C V; do
  node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner fix-rest-script --reason "rest-script P-094 server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
done
bad=0
for X in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:7bf7c4657d21:f523598b2a24|V:520d5f1139c7:f523598b2a24) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok phone $(node tools/lan.mjs --url --port $P)"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

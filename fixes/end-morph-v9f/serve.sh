#!/bin/sh
# end-morph-v9f phone servers (int-v8 for fix-end-morph's phone no-worse check): a copy of fixes/v9-2/phone/serve142.sh
# with the arms changed. Plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local; served
# from the immutable snapshot out/emv9f/snap-a6426953727a (sh fixes/end-morph-v9f/build.sh).
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final as landed            JS 647c9ef2b1e2  CSS e1359ab9994a
#   V = v9-final + F1 + U2            JS a6426953727a  CSS e1359ab9994a
# Usage: sh fixes/end-morph-v9f/serve.sh          start B C V (stops this script's servers first), check, print ports
#        sh fixes/end-morph-v9f/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/end-morph-v9f/serve.sh stop     stop them (only these three, by their pid files)
# State: out/emv9f/serve-{B,C,V}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs (http://lan:<port>/);
# never copy the LAN address into a committed file.
cd "$(dirname "$0")/../.." || exit 2
D=out/emv9f/snap-a6426953727a; S=out/emv9f
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = 0817a71bf0c7 ] || { echo "HASHES.txt is not 0817a71bf0c7: refuse"; exit 3; }
if [ "$1" != check ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $D/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "end-morph v9-final phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:647c9ef2b1e2:e1359ab9994a|V:a6426953727a:e1359ab9994a) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

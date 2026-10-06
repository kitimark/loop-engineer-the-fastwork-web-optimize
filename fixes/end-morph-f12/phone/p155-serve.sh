#!/bin/sh
# P-155 phone servers (card: fixes/end-morph-f12/README.md "Split block", signed as P-155). P-152's p152-serve.sh with
# three arms instead of two. Plain http (I-003), OS-assigned ports, --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final as landed            JS 647c9ef2b1e2  CSS e1359ab9994a
#   F = C + end-morph F1 only         JS b1c1320fde83  CSS e1359ab9994a   (split/f1-only.diff ac63c37da60a)
#   U = C + nav-hit-cache U2 only     JS 4389044c1ec4  CSS e1359ab9994a   (split/u2-only.diff 2f69e5532ad3)
# The snapshot: out/split/snap (built in this checkout; HASHES.txt sha256/12 6a368e804fb0), copied once into
# out/p155/snap (P155_SNAP_SRC overrides the source); HASHES.txt is checked on the copy before every start and check.
# Usage: sh fixes/end-morph-f12/phone/p155-serve.sh start    copy (first time), start B C F U, check, print ports
#        sh fixes/end-morph-f12/phone/p155-serve.sh check    re-check the snapshot and the served hashes (exit 4 if wrong)
#        sh fixes/end-morph-f12/phone/p155-serve.sh stop     stop these four servers (by their pid files)
# State: out/p155/serve-{B,C,F,U}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p155; D=$S/snap
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
SRC=${P155_SNAP_SRC:-out/split/snap}
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/end-morph-f12/phone/p155-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C F U; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
if [ ! -e $D/HASHES.txt ]; then
  [ -e "$SRC/HASHES.txt" ] || { echo "no snapshot at $SRC: refuse"; exit 3; }
  mkdir -p $D && cp -R "$SRC/C" "$SRC/F" "$SRC/U" "$SRC/HASHES.txt" $D/ && chmod -R a-w $D/C $D/F $D/U $D/HASHES.txt
  echo "copied the snapshot into $D"
fi
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = 6a368e804fb0 ] || { echo "HASHES.txt is not 6a368e804fb0: refuse"; exit 3; }
x=$(cd $D && find C F U -type f | sort | tr '\n' ' ')
[ "$x" = "C/$CSS C/$JS F/$CSS F/$JS U/$CSS U/$JS " ] || { echo "SNAPSHOT has other files than the six pinned ones ($x): refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in B C F U; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $D/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C F U; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-155 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C F U; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:647c9ef2b1e2:e1359ab9994a|F:b1c1320fde83:e1359ab9994a|U:4389044c1ec4:e1359ab9994a) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

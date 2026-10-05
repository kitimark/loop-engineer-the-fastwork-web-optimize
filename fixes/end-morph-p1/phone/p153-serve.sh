#!/bin/sh
# P-153 phone servers (card: fixes/end-morph-p1/README.md "P-153"). A copy of fix-end-morph's P-152 server script
# (fixes/end-morph-f12/phone/p152-serve.sh 2548d4588b0e at d705bdd6, itself int-v8's fixes/end-morph-v9f/serve.sh) with
# the P-153 arms; it serves from this checkout's own copy of the snapshot. Plain http (I-003), OS-assigned ports,
# --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final + F1 + U2            JS a6426953727a  CSS e1359ab9994a
#   V = C + P1 (PR-012 rev 1 port)    JS 4da641f828bb  CSS a81b9af7b2c9
# The snapshot: int-v8's out/emp1v9f/snap-4da641f828bb (read-only; HASHES.txt sha256/12 c5138adb7dd2, HASHES_PIN),
# copied once into out/p153/snap (P153_SNAP_SRC overrides the source); HASHES.txt is checked on the copy before every
# start and check.
# Usage: sh fixes/end-morph-p1/phone/p153-serve.sh start    copy (first time), start B C V, check, print ports
#        sh fixes/end-morph-p1/phone/p153-serve.sh check    re-check the snapshot and the served hashes (exit 4 if wrong)
#        sh fixes/end-morph-p1/phone/p153-serve.sh stop     stop these three servers (by their pid files)
# State: out/p153/serve-{B,C,V}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p153; D=$S/snap
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
HASHES_PIN=c5138adb7dd2
SRC=${P153_SNAP_SRC:-$(git rev-parse --git-common-dir)/../.claude/worktrees/agent-a068af37646232e05/out/emp1v9f/snap-4da641f828bb}
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/end-morph-p1/phone/p153-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
if [ ! -e $D/HASHES.txt ]; then
  [ -e "$SRC/HASHES.txt" ] || { echo "no snapshot at $SRC: refuse"; exit 3; }
  mkdir -p $D && cp -R "$SRC/C" "$SRC/V" "$SRC/HASHES.txt" $D/ && chmod -R a-w $D/C $D/V $D/HASHES.txt
  echo "copied the snapshot into $D"
fi
(cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = $HASHES_PIN ] || { echo "HASHES.txt is not $HASHES_PIN: refuse"; exit 3; }
x=$(cd $D && find C V -type f | sort | tr '\n' ' ')
[ "$x" = "C/$CSS C/$JS V/$CSS V/$JS " ] || { echo "SNAPSHOT has other files than the four pinned ones ($x): refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $D/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-153 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:a6426953727a:e1359ab9994a|V:4da641f828bb:a81b9af7b2c9) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

#!/bin/sh
# P-152 phone servers (card: fixes/end-morph-f12/README.md "P-152"). A copy of int-v8's fixes/end-morph-v9f/serve.sh
# (75ef0eb8 on worktree-agent-a068af37646232e05) that serves from this checkout's own copy of the snapshot, so the block
# does not depend on int-v8's worktree staying in place. Plain http (I-003), OS-assigned ports, --latency 150,
# --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = v9-final as landed            JS 647c9ef2b1e2  CSS e1359ab9994a
#   V = v9-final + F1 + U2            JS a6426953727a  CSS e1359ab9994a
# The snapshot: int-v8's out/emv9f/snap-a6426953727a (read-only; HASHES.txt sha256/12 0817a71bf0c7), copied once into
# out/p152/snap (P152_SNAP_SRC overrides the source); HASHES.txt is checked on the copy before every start and check.
# Usage: sh fixes/end-morph-f12/phone/p152-serve.sh start    copy (first time), start B C V, check, print ports
#        sh fixes/end-morph-f12/phone/p152-serve.sh check    re-check the snapshot and the served hashes (exit 4 if wrong)
#        sh fixes/end-morph-f12/phone/p152-serve.sh stop     stop these three servers (by their pid files)
# State: out/p152/serve-{B,C,V}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p152; D=$S/snap
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
SRC=${P152_SNAP_SRC:-$(git rev-parse --git-common-dir)/../.claude/worktrees/agent-a068af37646232e05/out/emv9f/snap-a6426953727a}
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/end-morph-f12/phone/p152-serve.sh start|check|stop"; exit 2 ;; esac
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
[ "$(shasum -a 256 $D/HASHES.txt | cut -c1-12)" = 0817a71bf0c7 ] || { echo "HASHES.txt is not 0817a71bf0c7: refuse"; exit 3; }
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-152 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
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

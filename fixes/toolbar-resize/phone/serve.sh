#!/bin/sh
# toolbar-resize P-115 follow-up phone G check (DRAFT kit, pre-staged per roles v3 R3; becomes a ticket only after P-115's
# Simulator result names a locating, look-identical candidate and ops gives a P-id). Serve the arms from immutable
# snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
# A copy of int-v8's P-114 serve.sh (fixes/v8-best/phone/p114/serve.sh, itself from P-111's and iphone-runner's P-105),
# with credit: only the arms, the folder, the snap source and the hash table changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v8-best (JS 3e3e94cb6e9f, CSS f836404b3728), from fixes/v8-best/overlay (fix.mjs apply v8-best)
#   V = v8 + the candidate ARM (csl: CSS 010f197b09d0 | cva: CSS cade62fb4bd2; JS unchanged), from
#       fixes/toolbar-resize--p115-$ARM/overlay (node fixes/toolbar-resize/p115-cands.mjs, which refuses another v8)
# Usage: ARM=csl|cva sh fixes/toolbar-resize/phone/serve.sh snap   make the copies once; refuses if out/tr-phone/snap exists
#        sh fixes/toolbar-resize/phone/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/toolbar-resize/phone/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/toolbar-resize/phone/serve.sh stop     stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/tr-phone/snap
OWNER=${FW_AGENT:-fix-toolbar-resize}
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  case "$ARM" in csl) VC=010f197b09d0 ;; cva) VC=cade62fb4bd2 ;; *) echo "ARM must be csl or cva"; exit 1 ;; esac
  for X in C V; do
    F=fixes/v8-best/overlay; [ $X = V ] && F=fixes/toolbar-resize--p115-$ARM/overlay
    mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets
    cp $F/_app/immutable/nodes/2.DyWL8TcE.js $S/$X/_app/immutable/nodes/
    cp $F/_app/immutable/assets/2.gBuqKVzi.css $S/$X/_app/immutable/assets/
  done
  echo "$ARM" > $S/ARM
  (cd $S && shasum -a 256 ARM C/_app/immutable/nodes/2.DyWL8TcE.js C/_app/immutable/assets/2.gBuqKVzi.css V/_app/immutable/nodes/2.DyWL8TcE.js V/_app/immutable/assets/2.gBuqKVzi.css > HASHES.txt)
  chmod -R a-w $S/C $S/V; chmod a-w $S/HASHES.txt $S/ARM
  cat $S/HASHES.txt
  grep -q '^3e3e94cb6e9f.* C/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* C/_app/immutable/assets' $S/HASHES.txt &&
    grep -q '^3e3e94cb6e9f.* V/_app/immutable/nodes' $S/HASHES.txt && grep -q "^$VC.* V/_app/immutable/assets" $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok ($ARM)"; exit 0
fi
if [ "$1" = stop ]; then
  for X in B C V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
case "$(cat $S/ARM)" in csl) VC=010f197b09d0 ;; cva) VC=cade62fb4bd2 ;; *) echo "bad ARM file"; exit 3 ;; esac
if [ "$1" != check ]; then
  for X in B C V; do
    [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
    rm -f $S/serve-$X.json
    OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
    echo $! > $S/serve-$X.pid
  done
  for X in B C V; do
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "toolbar-resize phone server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|V:3e3e94cb6e9f:$VC) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

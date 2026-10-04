#!/bin/sh
# double-drive phone no-worse check (v8 vs v8 + double-drive; PHONE TICKET draft fixes/double-drive/phone/TICKET.md):
# serve the arms from immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150,
# --vendors=local. A copy of int-v8's fixes/v8-best/phone/p116/serve.sh (P-116) with this ticket's arms; only the arms,
# the folder (out/pdd/snap), the snapshot source and the labels changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v8-best                (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/pdd/snap/C
#   V = v8 + double-drive      (JS 3076c5a8c9a3, CSS 2f7197880ffd), copy out/pdd/snap/V
#       = fixes/double-drive/delta.diff (sha256/12 baae6114cd65) applied with `patch -p1` to C, exact
# Usage: sh fixes/double-drive/phone/serve.sh snap   build the copies once from C = out/double-drive/snap/A (v8) plus
#                                                     delta.diff; refuses if out/pdd/snap exists or a hash differs
#        sh fixes/double-drive/phone/serve.sh        start B C V, check the copies and the served hashes, print ports
#        sh fixes/double-drive/phone/serve.sh check  re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/double-drive/phone/serve.sh stop   stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/pdd/snap
OWNER=${FW_AGENT:-fix-double-drive}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  mkdir -p $S/C/_app/immutable/nodes $S/C/_app/immutable/assets
  cp out/double-drive/snap/A/$JS $S/C/$JS && cp out/double-drive/snap/A/$CSS $S/C/$CSS || exit 3
  cp -R $S/C $S/V && chmod -R u+w $S/V
  patch -p1 -s -d $S/V -i "$PWD/fixes/double-drive/delta.diff" || { echo "delta did not apply: refuse"; exit 3; }
  find $S/V -name '*.orig' -o -name '*.rej' | grep -q . && { echo "patch left .orig/.rej: refuse"; exit 3; }
  (cd $S && shasum -a 256 C/$JS C/$CSS V/$JS V/$CSS > HASHES.txt)
  chmod -R a-w $S/C $S/V; chmod a-w $S/HASHES.txt
  cat $S/HASHES.txt
  grep -q "^3e3e94cb6e9f.* C/$JS" $S/HASHES.txt && grep -q "^f836404b3728.* C/$CSS" $S/HASHES.txt &&
    grep -q "^3076c5a8c9a3.* V/$JS" $S/HASHES.txt && grep -q "^2f7197880ffd.* V/$CSS" $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $S/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "double-drive phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case "$A:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|V:3076c5a8c9a3:2f7197880ffd) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

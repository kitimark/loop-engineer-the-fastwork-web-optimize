#!/bin/sh
# P-113 (v8 hero-flick cluster attribution: G part H only, three arms; PHONE TICKET in fixes/v8-best/README.md "P-113"):
# serve the arms from immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150,
# --vendors=local. A copy of P-112's fixes/v8-best/phone/p112/serve.sh (6b33baed1949); only the arms, the folder, the
# expected hashes and the `snap` step changed.
#   B = the plain baseline (no overlay): the pre-warm page and the thermal gate's timer page; no counted run on it
#   C = v8-best (JS 3e3e94cb6e9f, CSS f836404b3728): out/p113/snap/C
#   F = v8 minus countdown-faces and the heUp glue (JS cf7ec51d037e, CSS f836404b3728): out/p113/snap/F
#   R = v8 with cd-roll-ca V9 in place of K (JS 5ea2a58788cf, CSS f836404b3728): out/p113/snap/R
# Usage: sh fixes/v8-best/phone/p113/serve.sh snap   node fixes/v8-best/phone/p113/build.mjs (strict applier, identity
#                                                    checks, refuses if out/p113/snap exists), then the hash check
#        sh fixes/v8-best/phone/p113/serve.sh        start B C F R, check the copies and the served hashes, print ports
#        sh fixes/v8-best/phone/p113/serve.sh check  re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/v8-best/phone/p113/serve.sh stop   stop them (only these four, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/p113/snap
OWNER=${FW_AGENT:-int-v8}
if [ "$1" = snap ]; then
  node fixes/v8-best/phone/p113/build.mjs || exit 3
  grep -q '^3e3e94cb6e9f.* C/_app/immutable/nodes' $S/HASHES.txt && grep -q '^cf7ec51d037e.* F/_app/immutable/nodes' $S/HASHES.txt &&
    grep -q '^5ea2a58788cf.* R/_app/immutable/nodes' $S/HASHES.txt && [ "$(grep -c '^f836404b3728.*/_app/immutable/assets' $S/HASHES.txt)" = 3 ] ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for X in B C F R; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for X in B C F R; do
    [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
    rm -f $S/serve-$X.json
    OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
    echo $! > $S/serve-$X.pid
  done
  for X in B C F R; do
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "P-113 server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in B C F R; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:3e3e94cb6e9f:f836404b3728|F:cf7ec51d037e:f836404b3728|R:5ea2a58788cf:f836404b3728) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

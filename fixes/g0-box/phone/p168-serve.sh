#!/bin/sh
# P-168 pre-stage: the servers, one per arm (p167-serve.sh with P-168's arms; plain http, OS-assigned ports,
# --latency 150, --vendors=local). Arms:
#   B      the plain baseline on its own port (the gate's timer page)         JS 4606120cf392  CSS 27776f3d4138
#   v0     the plain baseline (site-pretty, no overlay)                         JS 4606120cf392  CSS 27776f3d4138
#   f      g0.0f (out/g0box/snap4/V)                                            JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
#   g      g0.0g = g0.0f + isolation on [data-fw-wc] (p168-build.py)            JS 30fd80ccbb3f  CSS 2390e4715327
#   fko3   g0.0f with fwWC a no-op (diagnostic only)                            JS 3778b38a6fe8  CSS 1d1e5d62a2c4
#   fko25  g0.0f + ko2 (no idle un-skip) + ko5 (no idle mount; diagnostic only) JS 120386db2e02  CSS 1d1e5d62a2c4
#   fcv25  g0.0f + ko2 + panel content-visibility: hidden until its trigger      JS b700ddaf88b4  CSS fa5888cfa299
#   fB     g0.0f + de-offscreen KO B (paused col-track animations off; diag.)  JS 30fd80ccbb3f  CSS cafb80014f69
#   fC     g0.0f + de-offscreen KO C (paused row-title sweeps off; diag.)      JS 30fd80ccbb3f  CSS a94dbaa09b27
# Usage: sh fixes/g0-box/phone/p168-serve.sh start|check|stop    State: out/p168/serve-<arm>.json, .pid, .log
cd "$(dirname "$0")/../../.." || exit 2
S=out/p168; OWNER=${FW_AGENT:-fix-g0-box}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
ARMS=${P168_ARMS:-"v0 f g fko3"}
root() { case $1 in B|v0) echo "--root site-pretty" ;; f) echo "--root site-pretty --overlay out/g0box/snap4/V" ;;
  g) echo "--root site-pretty --overlay out/g0box/p168/g" ;; fko3) echo "--root site-pretty --overlay out/g0box/p168/f-ko3" ;; fko25) echo "--root site-pretty --overlay out/g0box/p168/f-ko25" ;; fcv25) echo "--root site-pretty --overlay out/g0box/p168/f-cv25" ;; fB) echo "--root site-pretty --overlay out/g0box/p168/f-B" ;; fC) echo "--root site-pretty --overlay out/g0box/p168/f-C" ;; esac; }
pin() { case $1 in B|v0) echo "4606120cf392 27776f3d4138" ;; f) echo "30fd80ccbb3f 1d1e5d62a2c4" ;;
  g) echo "30fd80ccbb3f 2390e4715327" ;; fko3) echo "3778b38a6fe8 1d1e5d62a2c4" ;; fko25) echo "120386db2e02 1d1e5d62a2c4" ;; fcv25) echo "b700ddaf88b4 fa5888cfa299" ;; fB) echo "30fd80ccbb3f cafb80014f69" ;; fC) echo "30fd80ccbb3f a94dbaa09b27" ;; esac; }
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/g0-box/phone/p168-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in $ARMS; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
if [ "$1" = start ]; then
  for A in $ARMS; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    node tools/serve.mjs $(root $A) --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in $ARMS; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-168 server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  K=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  if [ "$J $K" = "$(pin $A)" ]; then ok=ok; else ok=WRONG; bad=1; fi
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $K $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

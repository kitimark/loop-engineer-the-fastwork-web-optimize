#!/bin/sh
# P-167 pre-stage: the servers, one per arm (a copy of p166-serve.sh; plain http, OS-assigned ports, --latency 150,
# --vendors=local). Arms (knock-outs built by fixes/g0-box/phone/p167-build.py, diagnostic only):
#   B      the plain baseline on its own port (the gate's timer page)          JS 4606120cf392  CSS 27776f3d4138
#   v0     the plain baseline (site-pretty, no overlay)                         JS 4606120cf392  CSS 27776f3d4138
#   e      g0.0e (out/g0box/g00e)                                               JS 5c39f7a96e41  CSS d4e684032482
#   ko1    g0.0e, accent idle frames on the baseline step-end keyframes         JS 5c39f7a96e41  CSS 533ce66d250b
#   ko2    g0.0e, no idle un-skip, cE re-defers as the baseline                 JS 43e9c65489bf  CSS d4e684032482
#   ko3    g0.0e, no data-fw-wc will-change windows                             JS 213044665cd2  CSS d4e684032482
#   ko123  all three                                                            JS 9f3958a06d59  CSS 533ce66d250b
#   (follow-up census arms, p167b-build.py; served only when P167_ARMS names them:)
#   ko4    g0.0e, countdown strips and cells unlayered (pixels change)          JS 5c39f7a96e41  CSS 9331d4959523
#   ko5    g0.0e, no idle mount of the morph panel                              JS 56a47bcf38e7  CSS d4e684032482
#   ko245  ko2 + ko4 + ko5                                                      JS eb2eaa4a13f1  CSS 9331d4959523
# Usage: sh fixes/g0-box/phone/p167-serve.sh start|check|stop    State: out/p167/serve-<arm>.json, .pid, .log
cd "$(dirname "$0")/../../.." || exit 2
S=out/p167; OWNER=${FW_AGENT:-fix-g0-box}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
ARMS=${P167_ARMS:-"B v0 e ko1 ko2 ko3 ko123"}
root() { case $1 in B|v0) echo "--root site-pretty" ;; e) echo "--root site-pretty --overlay out/g0box/g00e" ;;
  ko1|ko2|ko3|ko123|ko4|ko5|ko245) echo "--root site-pretty --overlay out/g0box/p167/e-$1" ;; esac; }
pin() { case $1 in B|v0) echo "4606120cf392 27776f3d4138" ;; e) echo "5c39f7a96e41 d4e684032482" ;; ko1) echo "5c39f7a96e41 533ce66d250b" ;;
  ko2) echo "43e9c65489bf d4e684032482" ;; ko3) echo "213044665cd2 d4e684032482" ;; ko123) echo "9f3958a06d59 533ce66d250b" ;;
  ko4) echo "5c39f7a96e41 9331d4959523" ;; ko5) echo "56a47bcf38e7 d4e684032482" ;; ko245) echo "eb2eaa4a13f1 9331d4959523" ;; esac; }
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/g0-box/phone/p167-serve.sh start|check|stop"; exit 2 ;; esac
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-167 server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
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

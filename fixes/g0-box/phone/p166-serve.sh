#!/bin/sh
# P-166 (attribution of P-165's two S clusters; card: fixes/g0-box/README.md "P-166"): the servers, one per arm.
# A copy of p165-serve.sh with P-166's six arms (plain http, OS-assigned ports, --latency 150, --vendors=local):
#   v0     the plain baseline (site-pretty, no overlay)                      JS 4606120cf392  CSS 27776f3d4138
#   e      g0.0e (out/g0box/g00e)                                            JS 5c39f7a96e41  CSS d4e684032482
#   f      g0.0f = g0.0e + v3-W (out/g0box/snap4/V)                          JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
#   enohe  knock-out: g0.0e with heCss false (out/g0box/p166/e-nohe)         JS 779fc9f36fc1  CSS d4e684032482
#   fnowc  knock-out: g0.0f without [data-fw-wc="0"] (out/g0box/p166/f-nowc) JS 30fd80ccbb3f  CSS 0e2950034f24
#   fnogl  knock-out: g0.0f, glint not animated (out/g0box/p166/f-noglint)   JS 30fd80ccbb3f  CSS f5239e3f348d
# The knock-outs are built by fixes/g0-box/phone/p166-build.py (diagnostic only, never a candidate build).
# Usage: sh fixes/g0-box/phone/p166-serve.sh start|check|stop    State: out/p166/serve-<arm>.json, .pid, .log
cd "$(dirname "$0")/../../.." || exit 2
S=out/p166; OWNER=${FW_AGENT:-fix-g0-box}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
ARMS="v0 e f enohe fnowc fnogl"
root() { case $1 in v0) echo "--root site-pretty" ;; e) echo "--root site-pretty --overlay out/g0box/g00e" ;; f) echo "--root site-pretty --overlay out/g0box/snap4/V" ;;
  enohe) echo "--root site-pretty --overlay out/g0box/p166/e-nohe" ;; fnowc) echo "--root site-pretty --overlay out/g0box/p166/f-nowc" ;; fnogl) echo "--root site-pretty --overlay out/g0box/p166/f-noglint" ;; esac; }
pin() { case $1 in v0) echo "4606120cf392 27776f3d4138" ;; e) echo "5c39f7a96e41 d4e684032482" ;; f) echo "30fd80ccbb3f 1d1e5d62a2c4" ;;
  enohe) echo "779fc9f36fc1 d4e684032482" ;; fnowc) echo "30fd80ccbb3f 0e2950034f24" ;; fnogl) echo "30fd80ccbb3f f5239e3f348d" ;; esac; }
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/g0-box/phone/p166-serve.sh start|check|stop"; exit 2 ;; esac
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-166 server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
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

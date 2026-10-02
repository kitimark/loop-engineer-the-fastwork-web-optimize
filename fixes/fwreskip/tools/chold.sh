#!/bin/sh
# fwreskip (a1h) Chrome functional check (headless, shared lane, no timing): servers on fresh ports for ARMS
# (B = RB base, P = fwreskip on RB, A = RB again for A/A), then cfix.mjs in MODE.
# usage: lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fwreskip -- env TAG=c1 MODE=G "ARMS=B P A" sh fixes/fwreskip/tools/chold.sh
W=$(git rev-parse --show-toplevel)
S=$W/fixes/fwreskip/tools
cd "$W" || exit 1
O=$W/out/fwreskip
T0=$(date +%s)
mkdir -p $O/vres
date -u +"HOLD $TAG $MODE start %H:%M:%SZ"
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
for a in $ARMS; do
  case $a in P) OV=fixes/fwreskip/overlay,fixes/rb/overlay ;; *) OV=fixes/rb/overlay ;; esac
  rm -f $O/vres/serve-$TAG-$a.json
  node tools/serve.mjs --root site-pretty --overlay $OV --port 0 --vendors=local --latency 150 --state $O/vres/serve-$TAG-$a.json > $O/vres/serve-$TAG-$a.log 2>&1 &
  PIDS="$PIDS $!"
done
for a in $ARMS; do node tools/wait.mjs serve $O/vres/serve-$TAG-$a.json > /dev/null || { echo "serve $a failed"; exit 1; }; done
URLS=""
for a in $ARMS; do
  PORT=$(node -e "console.log(require('$O/vres/serve-$TAG-$a.json').port)")
  echo "$a :$PORT JS $(curl -s http://localhost:$PORT/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12) CSS $(curl -s http://localhost:$PORT/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)"
  URLS="$URLS $a=http://localhost:$PORT/"
done
if [ "$MODE" = DBG ]; then node $S/cdbg.mjs $URLS; else for m in $MODE; do MODE=$m node $S/cfix.mjs $O/vres/$TAG $URLS; echo "cfix $m exit $?"; done; fi
for a in $ARMS; do echo "$a GETs JS $(grep -c 'GET /_app/immutable/nodes/2.DyWL8TcE.js' $O/vres/serve-$TAG-$a.log)"; done
date -u +"HOLD $TAG end %H:%M:%SZ ($(( $(date +%s) - T0 ))s)"

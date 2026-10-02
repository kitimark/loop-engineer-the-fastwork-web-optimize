#!/bin/sh
# fwreskip (a1h) verification hold: three servers on fresh ephemeral ports (B = RB base, P = fwreskip on RB, A = RB
# again for A/A), served-file hashes by curl, then a functional Sim session running vfix.mjs in MODE over ARMS.
# usage: lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fwreskip -- env TAG=v1 MODE=T "ARMS=B P" sh fixes/fwreskip/tools/vhold.sh
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
  # P = the live overlay (P3 staged un-skip from 2026-10-02 on); Q = the exact P2b build G1b ran (immutable snapshot)
  case $a in P) OV=fixes/fwreskip/overlay,fixes/rb/overlay ;; Q) OV=out/fwreskip/snap-g1b2/P2b ;; *) OV=fixes/rb/overlay ;; esac
  rm -f $O/vres/serve-$TAG-$a.json
  node tools/serve.mjs --root site-pretty --overlay $OV --port 0 --vendors=local --latency 150 --state $O/vres/serve-$TAG-$a.json > $O/vres/serve-$TAG-$a.log 2>&1 &
  PIDS="$PIDS $!"
done
for a in $ARMS; do node tools/wait.mjs serve $O/vres/serve-$TAG-$a.json > /dev/null || { echo "serve $a failed"; exit 1; }; done
URLS=""
FIRST=""
for a in $ARMS; do
  PORT=$(node -e "console.log(require('$O/vres/serve-$TAG-$a.json').port)")
  echo "$a :$PORT JS $(curl -s http://localhost:$PORT/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12) CSS $(curl -s http://localhost:$PORT/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12)"
  URLS="$URLS $a=http://localhost:$PORT/"
  [ -z "$FIRST" ] && FIRST="http://localhost:$PORT/"
done
export T0 W S O TAG MODE URLS FIRST JUMPS
# optional Chrome functional check in the same hold (one queue entry): CTAG/CMODE/CARMS
if [ -n "$CTAG" ]; then env TAG=$CTAG "MODE=$CMODE" "ARMS=$CARMS" "JSTARTS=$CJSTARTS" "REPS=$CREPS" "SCEN=$CSCEN" sh $S/chold.sh > $O/vres-$CTAG.log 2>&1 & CPID=$!; PIDS="$PIDS $CPID"; fi
node tools/sim.mjs session --functional --owner fwreskip --window shown -- sh $S/vinner.sh
echo "session exit $?"
[ -n "$CPID" ] && { node tools/wait.mjs pid $CPID --timeout 200 > /dev/null; echo "chrome $CTAG: $(tail -1 $O/vres-$CTAG.log)"; }
for a in $ARMS; do echo "$a GETs JS $(grep -c 'GET /_app/immutable/nodes/2.DyWL8TcE.js' $O/vres/serve-$TAG-$a.log) CSS $(grep -c 'GET /_app/immutable/assets/2.gBuqKVzi.css' $O/vres/serve-$TAG-$a.log)"; done
date -u +"HOLD $TAG end %H:%M:%SZ ($(( $(date +%s) - T0 ))s)"

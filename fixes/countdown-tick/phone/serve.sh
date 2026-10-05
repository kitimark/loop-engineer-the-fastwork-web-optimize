#!/bin/sh
# countdown-tick P-130: serve the arms from immutable snapshot copies, plain http (I-003), OS-assigned ports (--port 0,
# I-131), --latency 150, --vendors=local. Adapted from toolbar-resize's phone/serve.sh (itself int-v8's P-114 serve.sh),
# with credit: the arms, the folder, the pins (phone/PINS) and the V build (C + the delta, by patch) changed.
#   B = the plain baseline (no overlay): the thermal gate's timer page; no counted run on it
#   C = the landed v9-final (pins C_JS / C_CSS in phone/PINS), copied from CDIR (its overlay, after it lands on main)
#   V = C + fixes/countdown-tick-v9/patch.diff (pin V_JS; CSS = C's)
# Usage: CDIR=<v9-final overlay dir> sh fixes/countdown-tick/phone/serve.sh snap   once; refuses if the snap exists or a pin is OPEN
#        sh fixes/countdown-tick/phone/serve.sh          start B C V, check the copies and the served hashes, print ports
#        sh fixes/countdown-tick/phone/serve.sh check    re-check the served hashes of the running servers (exit 4 if wrong)
#        sh fixes/countdown-tick/phone/serve.sh stop     stop them (only these three, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../.." || exit 2
S=out/countdown-tick/p130/snap
OWNER=${FW_AGENT:-fix-countdown-tick}
N=_app/immutable/nodes/2.DyWL8TcE.js; A=_app/immutable/assets/2.gBuqKVzi.css
pin() { sed -n "s/^$1=//p" fixes/countdown-tick/phone/PINS; }
CJ=$(pin C_JS); CC=$(pin C_CSS); VJ=$(pin V_JS)
case "$CJ$CC$VJ" in *OPEN*|"") echo "PINS OPEN: the control is not pinned yet (v9-final not on main): refuse"; exit 3 ;; esac
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  [ -n "$CDIR" ] && [ -f "$CDIR/$N" ] && [ -f "$CDIR/$A" ] || { echo "CDIR must hold the v9-final $N and $A"; exit 1; }
  for X in C V; do mkdir -p $S/$X/_app/immutable/nodes $S/$X/_app/immutable/assets; cp "$CDIR/$N" $S/$X/$N; cp "$CDIR/$A" $S/$X/$A; done
  (cd $S/V && patch -p1 --no-backup-if-mismatch < ../../../../../fixes/countdown-tick-v9/patch.diff) || { echo "delta does not apply: refuse"; exit 3; }
  (cd $S && shasum -a 256 C/$N C/$A V/$N V/$A > HASHES.txt)
  chmod -R a-w $S/C $S/V; chmod a-w $S/HASHES.txt
  cut -c1-12,65- $S/HASHES.txt
  grep -q "^$CJ.* C/$N" $S/HASHES.txt && grep -q "^$CC.* C/$A" $S/HASHES.txt && grep -q "^$VJ.* V/$N" $S/HASHES.txt && grep -q "^$CC.* V/$A" $S/HASHES.txt ||
    { echo "SNAPSHOT NOT THE TICKET'S BUILDS: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for X in B C V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for X in B C V; do
    [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
    rm -f $S/serve-$X.json
    OV="--overlay $S/$X"; [ "$X" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
    echo $! > $S/serve-$X.pid
  done
  for X in B C V; do
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "countdown-tick P-130 server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$N | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$A | shasum -a 256 | cut -c1-12)
  case "$X:$J:$C" in
    B:4606120cf392:27776f3d4138|C:$CJ:$CC|V:$VJ:$CC) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

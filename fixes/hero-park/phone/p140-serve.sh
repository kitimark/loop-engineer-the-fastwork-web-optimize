#!/bin/sh
# P-140 servers (card: fixes/hero-park/TICKET.md part 2), from fixes/end-bg/phone/p137-serve.sh (P-137, signed); changes:
# the arms' sources and pins. Builds two immutable snapshots in this checkout's out/p140/snap/{C,V} from the committed
# kit (baseline site-pretty + fixes/hero-park/base-v9-1d.diff, then + fixes/hero-park/delta.diff for V; `patch -p1 -F0`),
# checks their pinned hashes, makes them read-only, and starts three plain-http mirror servers in the background (nohup;
# the phone loads plain http, I-003), each with --vendors=local --latency 150:
#   C  v9.1d                       JS 941aa13e5bdf  CSS f1997edf5309  -> out/p140/serve-C.json
#   V  v9.1d + hero-park           JS 8ce731d584d9  CSS f1997edf5309  -> out/p140/serve-V.json
#   B  the plain baseline (the thermal gate's timer page)             -> out/p140/serve-B.json
#   sh fixes/hero-park/phone/p140-serve.sh start | stop | status
# Prints no LAN address (Hard rule 12). Exit 0 ok, 2 usage, 4 a hash, build or server problem.
cd "$(dirname "$0")/../../.." || exit 2
SV=out/p140; mkdir -p $SV/snap
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=941aa13e5bdf; V_JS=8ce731d584d9; CSS_PIN=f1997edf5309
CD=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 4
HOME_=$(dirname "$CD"); ROOT=$HOME_/site-pretty
h() { shasum -a 256 "$1" | cut -c1-12; }
pid() { [ -s $SV/serve-$1.pid ] && cat $SV/serve-$1.pid; }
build() { # arm dir
  D=$2; T=$D.tmp; rm -rf "$T"; mkdir -p "$T/_app/immutable/nodes" "$T/_app/immutable/assets"
  cp "$ROOT/$JS" "$T/$JS" && cp "$ROOT/$CSS" "$T/$CSS" || return 1
  patch -s -p1 -F0 -d "$T" < fixes/hero-park/base-v9-1d.diff || return 1
  [ $1 = V ] && { patch -s -p1 -F0 -d "$T" < fixes/hero-park/delta.diff || return 1; }
  find "$T" -name '*.orig' -delete; mv "$T" "$D" && chmod -R a-w "$D"
}
case "$1" in
  start)
    for A in C V; do
      D=$SV/snap/$A; [ $A = C ] && P=$C_JS || P=$V_JS
      [ -d "$D" ] || build $A "$D" || { echo "SERVE build failed for $A"; exit 4; }
      [ "$(h $D/$JS)" = $P ] && [ "$(h $D/$CSS)" = $CSS_PIN ] || { echo "SERVE $A snapshot hashes JS $(h $D/$JS) CSS $(h $D/$CSS), pinned $P $CSS_PIN"; exit 4; }
      echo "SNAP $A JS $P CSS $CSS_PIN ok"
    done
    for A in C V B; do
      [ -n "$(pid $A)" ] && kill -0 "$(pid $A)" 2>/dev/null && { echo "SERVE $A already running (pid $(pid $A))"; continue; }
      rm -f $SV/serve-$A.json
      OV=""; [ $A != B ] && OV="--overlay $SV/snap/$A"
      nohup node tools/serve.mjs --root "$ROOT" $OV --port auto --vendors=local --latency 150 --state $SV/serve-$A.json > $SV/serve-$A.log 2>&1 &
      echo $! > $SV/serve-$A.pid
      node tools/wait.mjs serve $SV/serve-$A.json --pid $! --timeout 60 --owner "${RUNNER:-fix-hero-exit-threaded}" --reason "P-140 server $A" > /dev/null || { echo "SERVE $A did not start (see $SV/serve-$A.log)"; exit 4; }
      echo "SERVE $A up (pid $(pid $A))"
    done
    for A in C V; do P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$A.json','utf8')).port)")
      SJ=$(curl -s "http://127.0.0.1:$P/$JS" | shasum -a 256 | cut -c1-12); SC=$(curl -s "http://127.0.0.1:$P/$CSS" | shasum -a 256 | cut -c1-12)
      echo "SERVED $A JS $SJ CSS $SC"; done ;;
  stop) for A in C V B; do p=$(pid $A); [ -n "$p" ] && kill "$p" 2>/dev/null && echo "STOPPED $A ($p)"; rm -f $SV/serve-$A.pid; done ;;
  status) for A in C V B; do p=$(pid $A); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$A running pid $p" || echo "$A not running"; done ;;
  *) echo "usage: sh fixes/hero-park/phone/p140-serve.sh start|stop|status"; exit 2 ;;
esac

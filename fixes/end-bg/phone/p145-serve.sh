#!/bin/sh
# P-145 servers (card: fixes/end-bg/README.md "P-145"), from p137-serve.sh with three arms. Copies the immutable build
# snapshots into this checkout's out/p145/snap/{C,P,T}, checks their pinned hashes, makes them read-only, and starts four
# plain-http mirror servers in the background (nohup; the phone loads plain http, I-003), each --vendors=local --latency 150:
#   C  v9-final + morph-scroll 7d                            JS 1b2eecc66011  CSS e1359ab9994a  -> out/p145/serve-C.json
#   P  C + fixes/end-bg/sim/pictures-off.css appended        JS 1b2eecc66011  CSS a9fd8338d8ed  -> out/p145/serve-P.json
#   T  C + fixes/end-bg/sim/titles-off.css appended          JS 1b2eecc66011  CSS 8f4d806323a9  -> out/p145/serve-T.json
#   B  the plain baseline (the thermal gate's timer page)                                     -> out/p145/serve-B.json
# (P and T are plain concatenations of C's CSS and the arm file, built the way P-137's V was: C + nobg.css = 38679ce9de15.)
# Source of the snapshots: $EB_SRC (default: fix-end-bg's worktree out/snapshots, found through the git common dir).
#   sh fixes/end-bg/phone/p145-serve.sh start | stop | status
# Prints no LAN address (Hard rule 12). Exit 0 ok, 2 usage, 4 a hash or server problem.
cd "$(dirname "$0")/../../.." || exit 2
SV=out/p145; mkdir -p $SV/snap
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
JS_PIN=1b2eecc66011; C_CSS=e1359ab9994a; P_CSS=a9fd8338d8ed; T_CSS=8f4d806323a9
CD=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 4
HOME_=$(dirname "$CD")
EB_SRC=${EB_SRC:-$HOME_/.claude/worktrees/agent-a79a177eb14781f17/out/snapshots}
h() { shasum -a 256 "$1" | cut -c1-12; }
pid() { [ -s $SV/serve-$1.pid ] && cat $SV/serve-$1.pid; }
pin() { case $1 in C) echo $C_CSS ;; P) echo $P_CSS ;; T) echo $T_CSS ;; esac; }
case "$1" in
  start)
    for A in C P T; do
      P=$(pin $A); S=$EB_SRC/endbg-$A-$P; D=$SV/snap/$A
      if [ ! -d "$D" ]; then [ -d "$S" ] || { echo "SERVE no source snapshot $S"; exit 4; }
        cp -R "$S" "$D" && chmod -R a-w "$D" || { echo "SERVE copy failed for $A"; exit 4; }; fi
      [ "$(h $D/$JS)" = $JS_PIN ] && [ "$(h $D/$CSS)" = $P ] || { echo "SERVE $A snapshot hashes JS $(h $D/$JS) CSS $(h $D/$CSS), pinned $JS_PIN $P"; exit 4; }
      echo "SNAP $A JS $JS_PIN CSS $P ok"
    done
    ROOT=$HOME_/site-pretty
    for A in C P T B; do
      [ -n "$(pid $A)" ] && kill -0 "$(pid $A)" 2>/dev/null && { echo "SERVE $A already running (pid $(pid $A))"; continue; }
      rm -f $SV/serve-$A.json
      OV=""; [ $A != B ] && OV="--overlay $SV/snap/$A"
      nohup node tools/serve.mjs --root "$ROOT" $OV --port auto --vendors=local --latency 150 --state $SV/serve-$A.json > $SV/serve-$A.log 2>&1 &
      echo $! > $SV/serve-$A.pid
      node tools/wait.mjs serve $SV/serve-$A.json --pid $! --timeout 60 --owner "${RUNNER:-iphone-runner}" --reason "P-145 server $A" > /dev/null || { echo "SERVE $A did not start (see $SV/serve-$A.log)"; exit 4; }
      echo "SERVE $A up (pid $(pid $A))"
    done
    for A in C P T; do P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$A.json','utf8')).port)")
      SJ=$(curl -s "http://127.0.0.1:$P/$JS" | shasum -a 256 | cut -c1-12); SC=$(curl -s "http://127.0.0.1:$P/$CSS" | shasum -a 256 | cut -c1-12)
      echo "SERVED $A JS $SJ CSS $SC"; done ;;
  stop) for A in C P T B; do p=$(pid $A); [ -n "$p" ] && kill "$p" 2>/dev/null && echo "STOPPED $A ($p)"; rm -f $SV/serve-$A.pid; done ;;
  status) for A in C P T B; do p=$(pid $A); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$A running pid $p" || echo "$A not running"; done ;;
  *) echo "usage: sh fixes/end-bg/phone/p145-serve.sh start|stop|status"; exit 2 ;;
esac

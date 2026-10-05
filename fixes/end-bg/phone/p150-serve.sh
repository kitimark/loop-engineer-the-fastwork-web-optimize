#!/bin/sh
# P-150 servers (card: fixes/end-bg/README.md "P-150"), from p137-serve.sh. Copies the two immutable build snapshots into
# this checkout's out/p150/snap/{C,N}, checks their pinned hashes (N also file by file against
# fixes/end-bg/img/b-manifest.json), makes them read-only, and starts three plain-http mirror servers in the background
# (nohup; the phone loads plain http, I-003), each with --vendors=local --latency 150:
#   C  v9-final + morph-scroll 7d                       JS 1b2eecc66011  CSS e1359ab9994a  -> out/p150/serve-C.json
#   N  C + PR-025 option B (lighter files + AVIF, 38 files: 35 pictures, JS, CSS, index.html; rebuilt by
#      fixes/end-bg/img/rebuild-b.mjs)                   JS 049b13ced4e3  CSS e1359ab9994a  -> out/p150/serve-N.json
#   B  the plain baseline (the thermal gate's timer page)                                  -> out/p150/serve-B.json
# Source of the snapshots: $EB_SRC (default: fix-end-bg's worktree out/snapshots, found through the git common dir).
#   sh fixes/end-bg/phone/p150-serve.sh start | stop | status
# Prints no LAN address (Hard rule 12). Exit 0 ok, 2 usage, 4 a hash or server problem.
cd "$(dirname "$0")/../../.." || exit 2
SV=out/p150; mkdir -p $SV/snap
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=1b2eecc66011; N_JS=049b13ced4e3; CSS_PIN=e1359ab9994a
CD=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 4
HOME_=$(dirname "$CD")
EB_SRC=${EB_SRC:-$HOME_/.claude/worktrees/agent-a79a177eb14781f17/out/snapshots}
h() { shasum -a 256 "$1" | cut -c1-12; }
pid() { [ -s $SV/serve-$1.pid ] && cat $SV/serve-$1.pid; }
case "$1" in
  start)
    for A in C N; do
      [ $A = C ] && { S=$EB_SRC/endbg-C-$CSS_PIN; J=$C_JS; } || { S=$EB_SRC/endbg-B-$N_JS; J=$N_JS; }
      D=$SV/snap/$A
      if [ ! -d "$D" ]; then [ -d "$S" ] || { echo "SERVE no source snapshot $S"; exit 4; }
        cp -R "$S" "$D" && chmod -R a-w "$D" || { echo "SERVE copy failed for $A"; exit 4; }; fi
      [ "$(h $D/$JS)" = $J ] && [ "$(h $D/$CSS)" = $CSS_PIN ] || { echo "SERVE $A snapshot hashes JS $(h $D/$JS) CSS $(h $D/$CSS), pinned $J $CSS_PIN"; exit 4; }
      [ $A = N ] && { node fixes/end-bg/img/rebuild-b.mjs --check $D > $SV/snap-N-check.log 2>&1 || { echo "SERVE N snapshot != manifest ($(tail -1 $SV/snap-N-check.log))"; exit 4; }; }
      echo "SNAP $A JS $J CSS $CSS_PIN ok$( [ $A = N ] && echo ', manifest 38/38')"
    done
    ROOT=$HOME_/site-pretty
    for A in C N B; do
      [ -n "$(pid $A)" ] && kill -0 "$(pid $A)" 2>/dev/null && { echo "SERVE $A already running (pid $(pid $A))"; continue; }
      rm -f $SV/serve-$A.json
      OV=""; [ $A != B ] && OV="--overlay $SV/snap/$A"
      nohup node tools/serve.mjs --root "$ROOT" $OV --port auto --vendors=local --latency 150 --state $SV/serve-$A.json > $SV/serve-$A.log 2>&1 &
      echo $! > $SV/serve-$A.pid
      node tools/wait.mjs serve $SV/serve-$A.json --pid $! --timeout 60 --owner "${RUNNER:-iphone-runner}" --reason "P-150 server $A" > /dev/null || { echo "SERVE $A did not start (see $SV/serve-$A.log)"; exit 4; }
      echo "SERVE $A up (pid $(pid $A))"
    done
    for A in C N; do P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$A.json','utf8')).port)")
      SJ=$(curl -s "http://127.0.0.1:$P/$JS" | shasum -a 256 | cut -c1-12); SC=$(curl -s "http://127.0.0.1:$P/$CSS" | shasum -a 256 | cut -c1-12)
      echo "SERVED $A JS $SJ CSS $SC"; done ;;
  stop) for A in C N B; do p=$(pid $A); [ -n "$p" ] && kill "$p" 2>/dev/null && echo "STOPPED $A ($p)"; rm -f $SV/serve-$A.pid; done ;;
  status) for A in C N B; do p=$(pid $A); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$A running pid $p" || echo "$A not running"; done ;;
  *) echo "usage: sh fixes/end-bg/phone/p150-serve.sh start|stop|status"; exit 2 ;;
esac

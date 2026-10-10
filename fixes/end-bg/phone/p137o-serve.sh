#!/bin/sh
# P-137o servers (fixes/end-bg/README.md "P-137o"): p137-serve.sh with arm V replaced by O = the original (the plain
# baseline snapshot pinned by baseline.json, served from site-pretty with no overlay). Copies C's immutable overlay
# snapshot into this checkout's out/p137o/snap/C, checks its pinned hashes, makes it read-only, and starts three
# plain-http mirror servers in the background (nohup; the phone loads plain http, I-003), each with
# --vendors=local --latency 150:
#   O  the original (baseline b1789284481295-a455e793, no overlay)  JS 4606120cf392  CSS 27776f3d4138  -> out/p137o/serve-O.json
#   C  v9-final + morph-scroll 7d (overlay on that baseline)        JS 1b2eecc66011  CSS e1359ab9994a  -> out/p137o/serve-C.json
#   B  the plain baseline again (the thermal gate's timer page, never a counted run)                    -> out/p137o/serve-B.json
# C's snapshot is the two overlay files only (JS + CSS); every other file (images included) comes from today's baseline.
# Source: $EB_SRC (default: fix-end-bg's worktree out/snapshots, found through the git common dir).
#   sh fixes/end-bg/phone/p137o-serve.sh start | stop | status | check
# check: served JS/CSS of O and C against the pins (exit 4 on a mismatch). Prints no LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
SV=out/p137o; mkdir -p $SV/snap
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=1b2eecc66011; C_CSS=e1359ab9994a; O_JS=4606120cf392; O_CSS=27776f3d4138
CD=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 4
HOME_=$(dirname "$CD")
EB_SRC=${EB_SRC:-$HOME_/.claude/worktrees/agent-a79a177eb14781f17/out/snapshots}
h() { shasum -a 256 "$1" | cut -c1-12; }
pid() { [ -s $SV/serve-$1.pid ] && cat $SV/serve-$1.pid; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
check() {
  PO=$(port O) && PC=$(port C) || { echo "CHECK no server state"; return 4; }
  a=$(served $PO $JS); b=$(served $PO $CSS); c=$(served $PC $JS); d=$(served $PC $CSS)
  echo "SERVED O JS $a CSS $b, C JS $c CSS $d"
  [ "$a" = $O_JS ] && [ "$b" = $O_CSS ] && [ "$c" = $C_JS ] && [ "$d" = $C_CSS ] || { echo "CHECK mismatch (pins O $O_JS $O_CSS, C $C_JS $C_CSS)"; return 4; }
}
case "$1" in
  start)
    node tools/baseline.mjs status > /dev/null 2>&1 || { echo "SERVE baseline is not the pinned snapshot (node tools/baseline.mjs status)"; exit 4; }
    S=$EB_SRC/endbg-C-$C_CSS; D=$SV/snap/C
    if [ ! -d "$D" ]; then [ -d "$S" ] || { echo "SERVE no source snapshot $S"; exit 4; }
      cp -R "$S" "$D" && chmod -R a-w "$D" || { echo "SERVE copy failed for C"; exit 4; }; fi
    [ "$(h $D/$JS)" = $C_JS ] && [ "$(h $D/$CSS)" = $C_CSS ] || { echo "SERVE C snapshot hashes JS $(h $D/$JS) CSS $(h $D/$CSS), pinned $C_JS $C_CSS"; exit 4; }
    echo "SNAP C JS $C_JS CSS $C_CSS ok"
    ROOT=$(pwd)/site-pretty; [ -f "$ROOT/$JS" ] || ROOT=$HOME_/site-pretty
    [ "$(h $ROOT/$JS)" = $O_JS ] && [ "$(h $ROOT/$CSS)" = $O_CSS ] || { echo "SERVE baseline JS/CSS $(h $ROOT/$JS) $(h $ROOT/$CSS), pinned $O_JS $O_CSS"; exit 4; }
    for A in O C B; do
      [ -n "$(pid $A)" ] && kill -0 "$(pid $A)" 2>/dev/null && { echo "SERVE $A already running (pid $(pid $A))"; continue; }
      rm -f $SV/serve-$A.json
      OV=""; [ $A = C ] && OV="--overlay $SV/snap/C"
      nohup node tools/serve.mjs --root "$ROOT" $OV --port auto --vendors=local --latency 150 --state $SV/serve-$A.json > $SV/serve-$A.log 2>&1 &
      echo $! > $SV/serve-$A.pid
      node tools/wait.mjs serve $SV/serve-$A.json --pid $! --timeout 60 --owner "${RUNNER:-cap-end-orig}" --reason "P-137o server $A" > /dev/null || { echo "SERVE $A did not start (see $SV/serve-$A.log)"; exit 4; }
      echo "SERVE $A up (pid $(pid $A))"
    done
    check || exit 4 ;;
  check) check || exit 4 ;;
  stop) for A in O C B; do p=$(pid $A); [ -n "$p" ] && kill "$p" 2>/dev/null && echo "STOPPED $A ($p)"; rm -f $SV/serve-$A.pid; done ;;
  status) for A in O C B; do p=$(pid $A); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$A running pid $p" || echo "$A not running"; done ;;
  *) echo "usage: sh fixes/end-bg/phone/p137o-serve.sh start|stop|status|check"; exit 2 ;;
esac

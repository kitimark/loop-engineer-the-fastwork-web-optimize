#!/bin/sh
# P-137o block 2 servers (fixes/end-bg/README.md "P-137o"; lead decision 2026-10-11: three arms on fs-fixed): plain http
# (I-003), --vendors=local --latency 150, all on today's pinned baseline b1789284481295-a455e793:
#   O  the original (no overlay)                                  JS 4606120cf392  CSS 27776f3d4138
#   C  v9-final + morph-scroll 7d (P-137's C, pictures on)        JS 1b2eecc66011  CSS e1359ab9994a
#   V  C + nobg.css (P-137's V, pictures off)                     JS 1b2eecc66011  CSS 38679ce9de15
#   B  the plain baseline again (the thermal gate's timer page, never a counted run)
# C and V: P-137's immutable overlay snapshots (2 files each) from $EB_SRC (fix-end-bg's worktree out/snapshots), copied
# read-only into out/p137f/snap/{C,V} and hash-checked.
#   sh fixes/end-bg/phone/p137f-serve.sh start | stop | status | check
cd "$(dirname "$0")/../../.." || exit 2
SV=out/p137f; mkdir -p $SV/snap
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
CD=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 4
HOME_=$(dirname "$CD")
EB_SRC=${EB_SRC:-$HOME_/.claude/worktrees/agent-a79a177eb14781f17/out/snapshots}
pin() { case $1 in O) echo "4606120cf392 27776f3d4138" ;; C) echo "1b2eecc66011 e1359ab9994a" ;; V) echo "1b2eecc66011 38679ce9de15" ;; esac; }
h() { shasum -a 256 "$1" | cut -c1-12; }
pid() { [ -s $SV/serve-$1.pid ] && cat $SV/serve-$1.pid; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
check() {
  st=0; line="SERVED"
  for A in O C V; do P=$(port $A) || { echo "CHECK no server state for $A"; return 4; }
    x="$(served $P $JS) $(served $P $CSS)"; line="$line $A $x"; [ "$x" = "$(pin $A)" ] || st=4; done
  echo "$line"; [ $st = 0 ] || echo "CHECK mismatch"; return $st
}
case "$1" in
  start)
    node tools/baseline.mjs status > /dev/null 2>&1 || { echo "SERVE baseline is not the pinned snapshot"; exit 4; }
    for A in C V; do
      S=$EB_SRC/endbg-$A-$(pin $A | cut -d' ' -f2); D=$SV/snap/$A
      if [ ! -d "$D" ]; then [ -d "$S" ] || { echo "SERVE no source snapshot $S"; exit 4; }
        cp -R "$S" "$D" && chmod -R a-w "$D" || { echo "SERVE copy failed for $A"; exit 4; }; fi
      [ "$(h $D/$JS) $(h $D/$CSS)" = "$(pin $A)" ] || { echo "SERVE $A snapshot hashes $(h $D/$JS) $(h $D/$CSS), pinned $(pin $A)"; exit 4; }
      echo "SNAP $A $(pin $A) ok"
    done
    ROOT=$(pwd)/site-pretty; [ -f "$ROOT/$JS" ] || ROOT=$HOME_/site-pretty
    [ "$(h $ROOT/$JS) $(h $ROOT/$CSS)" = "$(pin O)" ] || { echo "SERVE baseline JS/CSS not the pins"; exit 4; }
    for A in O C V B; do
      [ -n "$(pid $A)" ] && kill -0 "$(pid $A)" 2>/dev/null && { echo "SERVE $A already running (pid $(pid $A))"; continue; }
      rm -f $SV/serve-$A.json
      OV=""; case $A in C|V) OV="--overlay $SV/snap/$A" ;; esac
      nohup node tools/serve.mjs --root "$ROOT" $OV --port auto --vendors=local --latency 150 --state $SV/serve-$A.json > $SV/serve-$A.log 2>&1 &
      echo $! > $SV/serve-$A.pid
      node tools/wait.mjs serve $SV/serve-$A.json --pid $! --timeout 60 --owner "${RUNNER:-cap-end-orig}" --reason "P-137o server $A" > /dev/null || { echo "SERVE $A did not start"; exit 4; }
      echo "SERVE $A up (pid $(pid $A))"
    done
    check || exit 4 ;;
  check) check || exit 4 ;;
  stop) for A in O C V B; do p=$(pid $A); [ -n "$p" ] && kill "$p" 2>/dev/null && echo "STOPPED $A ($p)"; rm -f $SV/serve-$A.pid; done ;;
  status) for A in O C V B; do p=$(pid $A); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$A running pid $p" || echo "$A not running"; done ;;
  *) echo "usage: sh fixes/end-bg/phone/p137f-serve.sh start|stop|status|check"; exit 2 ;;
esac

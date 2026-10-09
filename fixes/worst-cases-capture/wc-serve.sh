#!/bin/sh
# Worst-case captures (cap-worst, 2026-10-09; lead GO option a): serve the two arms from immutable snapshot copies,
# plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
# Adapted from research/team-article/capture/phone/serve.sh (art-worst-cases; lineage fixes/v8-best/phone/p116),
# with credit: only the arms, pins and folder changed.
#   A = the original page: the plain baseline snapshot b1789284481295-a455e793, no overlay (JS 4606120cf392, CSS 27776f3d4138)
#   V = g0.0l (fixes/g0-0l/patch.diff, `node tools/fix.mjs apply g0-0l --reset`; JS 4106679e0a8a, CSS 440582cec781)
# Usage: sh fixes/worst-cases-capture/wc-serve.sh snap    copy V once from fixes/g0-0l/overlay (refuses an existing copy
#                                                          or a wrong hash)
#        sh fixes/worst-cases-capture/wc-serve.sh         start A V, check the copy and the served hashes
#        sh fixes/worst-cases-capture/wc-serve.sh check   re-check the served hashes (exit 4 if wrong)
#        sh fixes/worst-cases-capture/wc-serve.sh stop    stop them (only these two, by their pid files)
# Phone URLs come from tools/lan.mjs at run time; never copy them into a committed file (Hard rule 12).
cd "$(dirname "$0")/../.." || exit 2
S=out/wc/snap
OWNER=${FW_AGENT:-cap-worst}
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  F=fixes/g0-0l/overlay
  mkdir -p $S/V/_app/immutable/nodes $S/V/_app/immutable/assets
  cp $F/$J $S/V/$J && cp $F/$C $S/V/$C || exit 3
  (cd $S && shasum -a 256 V/$J V/$C > HASHES.txt)
  chmod -R a-w $S/V; chmod a-w $S/HASHES.txt
  cat $S/HASHES.txt
  grep -q '^4106679e0a8a.* V/_app/immutable/nodes' $S/HASHES.txt && grep -q '^440582cec781.* V/_app/immutable/assets' $S/HASHES.txt ||
    { echo "SNAPSHOT NOT g0.0l: refuse"; exit 3; }
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for X in A V; do [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null; rm -f $S/serve-$X.pid; done
  echo stopped; exit 0
fi
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for X in A V; do
    [ -f $S/serve-$X.pid ] && kill "$(cat $S/serve-$X.pid)" 2>/dev/null
    rm -f $S/serve-$X.json
    OV="--overlay $S/$X"; [ "$X" = A ] && OV=""
    nohup node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$X.json --vendors=local --latency 150 > $S/serve-$X.log 2>&1 &
    echo $! > $S/serve-$X.pid
  done
  for X in A V; do
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "worst-case capture server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in A V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  HJ=$(curl -s http://localhost:$P/$J | shasum -a 256 | cut -c1-12)
  HC=$(curl -s http://localhost:$P/$C | shasum -a 256 | cut -c1-12)
  case "$X:$HJ:$HC" in
    A:4606120cf392:27776f3d4138|V:4106679e0a8a:440582cec781) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $HJ CSS $HC $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

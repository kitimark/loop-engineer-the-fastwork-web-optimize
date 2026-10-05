#!/bin/sh
# Phone clips of the trouble spots (T-170 #101): serve the two arms from immutable snapshot copies, plain http (I-003),
# OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local. Adapted from fixes/v8-best/phone/p116/serve.sh
# (int-v8 / iphone-runner), with credit: only the arms and the folder changed.
#   A = the original page: the plain baseline, no overlay (JS 4606120cf392, CSS 27776f3d4138)
#   V = v8-best (JS 3e3e94cb6e9f, CSS f836404b3728), copy out/phone-clips/snap/V
# Usage: sh research/team-article/capture/phone/serve.sh snap   copy V once from the v8-best overlay that the Chrome
#                                                               clips used (out/before-after/v8-best-worst/overlay);
#                                                               refuses if the copy exists or a hash differs
#        sh research/team-article/capture/phone/serve.sh        start A V, check the copy and the served hashes
#        sh research/team-article/capture/phone/serve.sh check  re-check the served hashes (exit 4 if wrong)
#        sh research/team-article/capture/phone/serve.sh stop   stop them (only these two, by their pid files)
# Phone URLs are for the runner's terminal only (tools/lan.mjs); never copy them into a committed file.
cd "$(dirname "$0")/../../../.." || exit 2
S=out/phone-clips/snap
OWNER=${FW_AGENT:-art-worst-cases}
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  F=out/before-after/v8-best-worst/overlay
  mkdir -p $S/V/_app/immutable/nodes $S/V/_app/immutable/assets
  cp $F/$J $S/V/$J && cp $F/$C $S/V/$C || exit 3
  (cd $S && shasum -a 256 V/$J V/$C > HASHES.txt)
  chmod -R a-w $S/V; chmod a-w $S/HASHES.txt
  cat $S/HASHES.txt
  grep -q '^3e3e94cb6e9f.* V/_app/immutable/nodes' $S/HASHES.txt && grep -q '^f836404b3728.* V/_app/immutable/assets' $S/HASHES.txt ||
    { echo "SNAPSHOT NOT v8-best: refuse"; exit 3; }
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
    node tools/wait.mjs serve $S/serve-$X.json --pid "$(cat $S/serve-$X.pid)" --owner "$OWNER" --reason "phone clips server $X" > /dev/null || { echo "server $X failed, see $S/serve-$X.log"; exit 1; }
  done
fi
bad=0
for X in A V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$X.json','utf8')).port)")
  HJ=$(curl -s http://localhost:$P/$J | shasum -a 256 | cut -c1-12)
  HC=$(curl -s http://localhost:$P/$C | shasum -a 256 | cut -c1-12)
  case "$X:$HJ:$HC" in
    A:4606120cf392:27776f3d4138|V:3e3e94cb6e9f:f836404b3728) ok=ok ;;
    *) ok=WRONG; bad=1 ;;
  esac
  echo "$X pid $(cat $S/serve-$X.pid) port $P served JS $HJ CSS $HC $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

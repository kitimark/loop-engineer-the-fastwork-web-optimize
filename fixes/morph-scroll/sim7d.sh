#!/bin/sh
# PR-018 rev 7d Simulator mechanism check (fix-hero-exit-threaded; counts only, no timing), one shared Simulator job:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded \
#     -- sh fixes/morph-scroll/sim7d.sh <tag> ARM:script.json [ARM:script.json ...]
# ARM: R7C (rev 7c, ms-428961bda278) | R7D (rev 7d, ${R7D:-ms-16f618ba68dc}). Each item: open the arm, then
# sim.mjs gesture <script> --inject fixes/morph-scroll/msdbg-inject.mjs -> out/morph-scroll/sim7d/<tag>-<n>-<ARM>-<script>.json
# Analysis: node fixes/morph-scroll/sim7d-analyze.mjs out/morph-scroll/sim7d
OWN=fix-hero-exit-threaded
OUT=out/morph-scroll/sim7d
TAG=$1; shift
mkdir -p "$OUT"
serve() { # name snapdir
  rm -f "$OUT/serve-$1.json"
  node tools/serve.mjs --root site-pretty --overlay "$PWD/out/snapshots/$2" --port 0 --no-cache --vendors=local --quiet --state "$OUT/serve-$1.json" > /dev/null 2>&1 &
  PIDS="$PIDS $!"
  node tools/wait.mjs serve "$OUT/serve-$1.json" --owner $OWN --timeout 60 --reason "PR-018 rev 7d Simulator server $1" > /dev/null || { echo "EXIT server $1"; exit 3; }
}
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
serve R7C ms-428961bda278
serve R7D ${R7D:-ms-16f618ba68dc}
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-$1.json','utf8')).port)"; }
CMDS="node tools/sim.mjs wda start || exit 3"
n=0
for it in "$@"; do
  n=$((n + 1)); arm=${it%%:*}; scr=${it#*:}; b=$(basename "$scr" .json)
  CMDS="$CMDS; echo RUN $n $arm $b; node tools/sim.mjs open http://localhost:$(port $arm)/ > /dev/null && node tools/sim.mjs gesture $scr --label ms7d-$arm-$b --inject fixes/morph-scroll/msdbg-inject.mjs --out $OUT/$TAG-$n-$arm-$b.json 2>&1 | grep -E 'aborted|ERROR|WAIT|refus|budget|GESTURE' | head -4"
done
node tools/sim.mjs session --functional --owner $OWN -- sh -c "$CMDS"
echo "EXIT $?"

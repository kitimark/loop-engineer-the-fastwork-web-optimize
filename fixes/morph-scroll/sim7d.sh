#!/bin/sh
# PR-018 rev 7d Simulator mechanism check and P-124 dry run (fix-hero-exit-threaded; --count-only gestures, I-184), one
# shared Simulator job:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded \
#     -- sh fixes/morph-scroll/sim7d.sh <tag> ARM:script.json [ARM:script.json ...]
# ARM: R7C (rev 7c, JS 428961bda278) | R7D (rev 7d speed rule only, JS 16f618ba68dc) | R7E (rev 7d candidate, speed +
# finger travel, JS 29c0d537e0c9). Snapshots are fixed (no override); every session prints "SERVED <arm> <hash>" per arm
# and stops (EXIT 4, no item runs) when a served 2.DyWL8TcE.js is not its pin (ops D3).
# An items file out/morph-scroll/sim7d/items-<tag>.txt (one ARM:script per line), when present, replaces the items on
# the command line (a queued hold keeps its place while its items change).
# Each item: move an earlier record of the same name aside (ops D5), open the arm, then
#   sim.mjs gesture <script> --count-only --inject fixes/morph-scroll/msdbg-inject.mjs -> $OUT/<tag>-<n>-<ARM>-<script>.json
# with its full output in the same name .log. Per item one line "ITEM <n> <ARM> <script> OK" or "ITEM ... VOID <why>"
# (exit non-zero, or no record: ops D2/D4); last line "EXIT <code>", 0 only when every item left a record.
# Analysis: node fixes/morph-scroll/sim7d-analyze.mjs <records>; C vs V path check: node fixes/morph-scroll/sim7d-compare.mjs
OWN=fix-hero-exit-threaded
OUT=out/morph-scroll/sim7d
if [ "$1" = --inner ]; then # inside sim.mjs session: <tag> items...
  shift; TAG=$1; shift
  port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-$1.json','utf8')).port)"; }
  node tools/sim.mjs wda start > "$OUT/$TAG-wda.log" 2>&1 || { echo "WDA start failed (see $OUT/$TAG-wda.log)"; exit 3; }
  n=0; bad=0
  for it in "$@"; do
    n=$((n + 1)); arm=${it%%:*}; scr=${it#*:}; b=$(basename "$scr" .json); F=$OUT/$TAG-$n-$arm-$b
    [ -e "$F.json" ] && { mv "$F.json" "$F.json.prev-$(date +%s)" || { echo "ITEM $n $arm $b VOID cannot move aside $F.json"; bad=1; continue; }; echo "MOVED $F.json aside"; }
    echo "RUN $n $arm $b $(date -u +%TZ)"
    if ! node tools/sim.mjs open "http://localhost:$(port "$arm")/" > "$F.log" 2>&1; then echo "ITEM $n $arm $b VOID open failed (see $F.log)"; bad=1; continue; fi
    node tools/sim.mjs gesture "$scr" --count-only --label "ms7d-$arm-$b" --inject fixes/morph-scroll/msdbg-inject.mjs --out "$F.json" >> "$F.log" 2>&1; r=$?
    grep -E 'COUNT_ONLY|aborted|ERROR|Error|WAIT|refus|budget|needs about' "$F.log" | cut -c1-300 | head -3
    if [ $r -ne 0 ]; then echo "ITEM $n $arm $b VOID exit $r (see $F.log)"; bad=1
    elif [ ! -s "$F.json" ]; then echo "ITEM $n $arm $b VOID exit 0, no record"; bad=1
    else echo "ITEM $n $arm $b OK"; fi
  done
  exit $bad
fi
TAG=$1; shift
mkdir -p "$OUT"
[ -f "$OUT/items-$TAG.txt" ] && set -- $(cat "$OUT/items-$TAG.txt")
echo "ITEMS $*"
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
serve() { # name snapdir expected-js-hash
  rm -f "$OUT/serve-$1.json"
  node tools/serve.mjs --root site-pretty --overlay "$PWD/out/snapshots/$2" --port 0 --no-cache --vendors=local --quiet --state "$OUT/serve-$1.json" > /dev/null 2>&1 &
  PIDS="$PIDS $!"
  node tools/wait.mjs serve "$OUT/serve-$1.json" --owner $OWN --timeout 60 --reason "PR-018 rev 7d Simulator server $1" > /dev/null || { echo "EXIT server $1"; exit 3; }
  p=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-$1.json','utf8')).port)")
  h=$(curl -s "http://127.0.0.1:$p/_app/immutable/nodes/2.DyWL8TcE.js" | shasum -a 256 | cut -c1-12)
  echo "SERVED $1 $h"
  [ "$h" = "$3" ] || { echo "EXIT 4 served $1 is $h, not $3"; exit 4; }
}
serve R7C ms-428961bda278 428961bda278
serve R7D ms-16f618ba68dc 16f618ba68dc
serve R7E ms-29c0d537e0c9 29c0d537e0c9
node tools/sim.mjs session --functional --owner $OWN -- sh fixes/morph-scroll/sim7d.sh --inner "$TAG" "$@"
echo "EXIT $?"

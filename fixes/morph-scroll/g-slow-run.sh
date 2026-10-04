#!/bin/sh
# PR-018 rev 6 proof on the phone (G driver, WDA robot finger), run from the worktree root with the iphone lease, one
# part per own hold (I-056: phone runs refuse beside another agent's normal hold; each part fits 600 s):
#   node tools/lock.mjs run chrome-measure --owner fix-hero-exit-threaded --no-timing --max-seconds 600 -- sh fixes/morph-scroll/g-slow-run.sh slow
#   node tools/lock.mjs run chrome-measure --owner fix-hero-exit-threaded --no-timing --max-seconds 600 -- sh fixes/morph-scroll/g-slow-run.sh mom
# 1. g-slowswipe-v1.json (swipes at the end of the page that lift while moving) on rev 4 and rev 6: R4 R6 R6 R4
# 2. g-momentum-v1.json (mid-page glide) on rev 6 and v7: R6 V7
# c. rev 6c (commit at lift-off, ms-654da079999d): glide R6C V7, then slow swipes R6C R6C
# d. rev 6d (500 ms look-ahead, ms-49c2317ecf98): slow swipes R6D R6D
# Records: out/morph-scroll/g6/slow/<arm>-<n>.json, out/morph-scroll/g6/mom/<arm>-<n>.json;
# analysis: node fixes/morph-scroll/g-momentum-analyze.mjs <dir>
OWN=fix-hero-exit-threaded
OUT=out/morph-scroll/g6
mkdir -p "$OUT/slow" "$OUT/mom"
node tools/iphone.mjs wda check || { echo "EXIT wda not ready"; exit 3; }
serve() { # name snapdir
  rm -f "$OUT/serve-$1.json"
  node tools/serve.mjs --root site-pretty --overlay "$PWD/out/snapshots/$2" --port 0 --no-cache --vendors=local --quiet --state "$OUT/serve-$1.json" > /dev/null 2>&1 &
  echo $! >> "$OUT/pids"
  node tools/wait.mjs serve "$OUT/serve-$1.json" --owner $OWN --reason "PR-018 rev 6 phone server $1" > /dev/null || { echo "EXIT server $1"; exit 3; }
}
rm -f "$OUT/pids"
serve V7 msbase-8c90da217745
serve R4 ms-5372c2d68c7d
serve R6 ms-d5ddd1b9d9c2
serve R6C ms-654da079999d
serve R6D ms-49c2317ecf98
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-$1.json','utf8')).port)"; }
run() { # n arm script outdir
  node tools/lock.mjs renew iphone --owner $OWN --ttl 900 > /dev/null
  echo "RUN $1 $2 $(basename $3) $(date -u +%H:%M:%SZ)"
  node tools/iphone.mjs open "http://lan:$(port $2)/" --owner $OWN > /dev/null || { echo "open failed $2"; return; }
  node tools/iphone.mjs gesture $3 --owner $OWN --label "ms6-$2-$1" --out "$4/$2-$1.json" 2>&1 | grep -E "aborted|ERROR|WAIT|refus" | head -4
}
PART=${1:-slow}
if [ "$PART" = slow ]; then
  n=0; for arm in R4 R6 R6 R4; do n=$((n + 1)); run $n $arm fixes/morph-scroll/g-slowswipe-v1.json "$OUT/slow"; done
elif [ "$PART" = c ]; then
  run 7 R6C fixes/morph-scroll/g-momentum-v1.json "$OUT/mom"
  run 8 V7 fixes/morph-scroll/g-momentum-v1.json "$OUT/mom"
  run 5 R6C fixes/morph-scroll/g-slowswipe-v1.json "$OUT/slow"
  run 6 R6C fixes/morph-scroll/g-slowswipe-v1.json "$OUT/slow"
elif [ "$PART" = d ]; then
  run 9 R6D fixes/morph-scroll/g-slowswipe-v1.json "$OUT/slow"
  run 10 R6D fixes/morph-scroll/g-slowswipe-v1.json "$OUT/slow"
else
  n=4; for arm in R6 V7; do n=$((n + 1)); run $n $arm fixes/morph-scroll/g-momentum-v1.json "$OUT/mom"; done
fi
node tools/iphone.mjs park --owner $OWN > /dev/null
for p in $(cat "$OUT/pids"); do kill $p 2> /dev/null; done
echo "EXIT 0"

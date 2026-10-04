#!/bin/sh
# PR-018 rev 4 proof on the phone (G driver, WDA robot finger): the same gesture script
# (fixes/morph-scroll/g-momentum-v1.json) on v7 (A, no end screen), rev 3 (root snap) and rev 4 (no snap, settle),
# in the order R4 V7 R3 R3 V7 R4. Needs the iphone lease (owner fix-hero-exit-threaded). Run from the worktree root:
#   sh fixes/morph-scroll/g-momentum-run.sh
# Records: out/morph-scroll/g/<arm>-<n>.json; analysis: node fixes/morph-scroll/g-momentum-analyze.mjs out/morph-scroll/g
OWN=fix-hero-exit-threaded
G=fixes/morph-scroll/g-momentum-v1.json
OUT=out/morph-scroll/g
mkdir -p "$OUT"
node tools/iphone.mjs wda check || { echo "EXIT wda not ready"; exit 3; }
serve() { # name snapdir
  rm -f "$OUT/serve-$1.json"
  node tools/serve.mjs --root site-pretty --overlay "$PWD/out/snapshots/$2" --port 0 --no-cache --vendors=local --quiet --state "$OUT/serve-$1.json" > /dev/null 2>&1 &
  echo $! >> "$OUT/pids"
  node tools/wait.mjs serve "$OUT/serve-$1.json" --owner $OWN --reason "PR-018 rev 4 phone server $1" > /dev/null || { echo "EXIT server $1"; exit 3; }
}
rm -f "$OUT/pids"
serve V7 msbase-8c90da217745
serve R3 ms-d661831b8797
serve R4 ms-5372c2d68c7d
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT/serve-$1.json','utf8')).port)"; }
n=0
for arm in R4 V7 R3 R3 V7 R4; do
  n=$((n + 1))
  node tools/lock.mjs renew iphone --owner $OWN --ttl 900 > /dev/null
  echo "RUN $n $arm $(date -u +%H:%M:%SZ)"
  node tools/iphone.mjs open "http://lan:$(port $arm)/" --owner $OWN > /dev/null || { echo "open failed $arm"; continue; }
  node tools/iphone.mjs gesture $G --owner $OWN --label "ms-mom-$arm-$n" --out "$OUT/$arm-$n.json" 2>&1 | grep -E "^(G_|GESTURE|WROTE|ERROR|WAIT|refus)|error" | head -8
done
node tools/iphone.mjs park --owner $OWN > /dev/null
for p in $(cat "$OUT/pids"); do kill $p 2> /dev/null; done
echo "EXIT 0"

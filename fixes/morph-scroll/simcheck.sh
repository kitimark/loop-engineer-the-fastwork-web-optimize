#!/bin/sh
# One functional fw-sim session for simcheck.mjs (fix-hero-exit-threaded, morph-scroll). Inside a shared-lane hold:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- sh fixes/morph-scroll/simcheck.sh
# env: A (snapshot dir, default newest out/snapshots/msbasehook-*), B (default newest out/snapshots/ms-*), OUTNAME,
#      PROBE (default fixes/morph-scroll/simcheck.mjs; fixes/morph-scroll/simk0.mjs), ARMS2=1 (arms B,A only).
A=${A:-$(ls -td out/snapshots/msbasehook-* | head -1)}
B=${B:-$(ls -td out/snapshots/ms-* | head -1)}
OUT=out/morph-scroll/${OUTNAME:-sim-$(date +%Y%m%dT%H%M%S)}
mkdir -p "$OUT"
echo "A=$A B=$B OUT=$OUT"
node tools/serve.mjs --root site-pretty --overlay "$A" --port 0 --vendors=local --no-cache --quiet --state "$OUT/serve-A.json" > "$OUT/serve-A.log" 2>&1 &
PA=$!
node tools/serve.mjs --root site-pretty --overlay "$B" --port 0 --vendors=local --no-cache --quiet --state "$OUT/serve-B.json" > "$OUT/serve-B.log" 2>&1 &
PB=$!
trap 'kill $PA $PB 2>/dev/null' EXIT INT TERM
UA=$(node tools/wait.mjs serve "$OUT/serve-A.json" --pid $PA --timeout 60 --owner fix-hero-exit-threaded --reason "base server for the WebKit morph check" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
UB=$(node tools/wait.mjs serve "$OUT/serve-B.json" --pid $PB --timeout 60 --owner fix-hero-exit-threaded --reason "proposal server for the WebKit morph check" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
[ -n "$UA" ] && [ -n "$UB" ] || { echo "servers did not come up: A=$UA B=$UB"; exit 2; }
for U in "$UA" "$UB"; do
  echo "$U js: $(curl -sk "${U}_app/immutable/nodes/2.DyWL8TcE.js" | shasum -a 256 | cut -c1-12) css: $(curl -sk "${U}_app/immutable/assets/2.gBuqKVzi.css" | shasum -a 256 | cut -c1-12)"
done
if [ -n "$ARMS2" ]; then ARMS="B=$UB,A=$UA"; else ARMS="B=$UB,A=$UA,A2=$UA"; fi
node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node "${PROBE:-fixes/morph-scroll/simcheck.mjs}" --arms "$ARMS" --out "$OUT"
echo "EXIT $?"

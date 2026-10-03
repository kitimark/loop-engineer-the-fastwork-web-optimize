#!/bin/sh
# carousel-leaver Chrome hold (P-086): baseline + 2 immutable snapshot arms, then clp.mjs over A S E A2 E2.
# node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-carousel-leaver -- \
#   sh fixes/carousel-leaver/probe/hold.sh <modes> <outdir>
# Snapshots: $SNAP/S (st6-rb2: JS 7bf7c4657d21, CSS f523598b2a24), $SNAP/E1 (E: JS 7bf7c4657d21, CSS 9c12648e24e1).
set -u
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a468e571c76f341a1
SNAP=/private/tmp/claude-501/-Users-<user>-source-fastwork-com-web-optimize/391f6dee-c7ee-40f4-93c3-f4c2dce764ec/scratchpad/carousel-leaver/snap
MODES=$1; OUTD=$2
cd $W && mkdir -p out/carousel-leaver "$OUTD"
for k in a s e; do rm -f out/carousel-leaver/serve-$k.json; done
node tools/serve.mjs --root site-pretty --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-a.json > out/carousel-leaver/serve-a.log 2>&1 & P0=$!
node tools/serve.mjs --root site-pretty --overlay $SNAP/S --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-s.json > out/carousel-leaver/serve-s.log 2>&1 & P1=$!
node tools/serve.mjs --root site-pretty --overlay $SNAP/E1 --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-e.json > out/carousel-leaver/serve-e.log 2>&1 & P2=$!
for x in a:$P0 s:$P1 e:$P2; do
  node tools/wait.mjs serve out/carousel-leaver/serve-${x%%:*}.json --pid ${x##*:} --reason "carousel-leaver probe server" > /dev/null || { kill $P0 $P1 $P2; echo EXIT 1; exit 1; }
done
# served hashes (must be the table's)
for k in a s e; do
  U=$(node -e "const s=require('./out/carousel-leaver/serve-$k.json'); console.log(s.url || 'https://localhost:' + s.port + '/')")
  for f in _app/immutable/nodes/2.DyWL8TcE.js _app/immutable/assets/2.gBuqKVzi.css; do
    echo "served $k $f $(curl -sk "$U$f" | shasum -a 256 | cut -c1-12)"
  done
done | tee "$OUTD/served.txt"
node fixes/carousel-leaver/probe/clp.mjs --arms A=out/carousel-leaver/serve-a.json,S=out/carousel-leaver/serve-s.json,E=out/carousel-leaver/serve-e.json,A2=out/carousel-leaver/serve-a.json,E2=out/carousel-leaver/serve-e.json --modes "$MODES" --out "$OUTD"
R=$?
kill $P0 $P1 $P2
echo EXIT $R

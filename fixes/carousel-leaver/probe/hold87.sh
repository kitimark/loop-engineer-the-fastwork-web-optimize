#!/bin/sh
# carousel-leaver Chrome hold (P-087): baseline + 3 immutable snapshot arms (S, E1, F1), served hashes, then one probe.
# node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-carousel-leaver -- \
#   sh fixes/carousel-leaver/probe/hold87.sh <clp|pord> <modes or -> <outdir> <arms, e.g. A=a,E=e,F=f,A2=a,F2=f>
# Snapshots: $SNAP/S (st6-rb2), $SNAP/E1 (E), $SNAP/F1 (F); hashes in the README table. clp.mjs is P-086's, unchanged.
set -u
W=/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a468e571c76f341a1
SNAP=/private/tmp/claude-501/-Users-<user>-source-fastwork-com-web-optimize/391f6dee-c7ee-40f4-93c3-f4c2dce764ec/scratchpad/carousel-leaver/snap
TOOL=$1; MODES=$2; OUTD=$3; ARMSPEC=$4
cd $W && mkdir -p out/carousel-leaver "$OUTD"
for k in a s e f; do rm -f out/carousel-leaver/serve-$k.json; done
node tools/serve.mjs --root site-pretty --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-a.json > out/carousel-leaver/serve-a.log 2>&1 & P0=$!
node tools/serve.mjs --root site-pretty --overlay $SNAP/S --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-s.json > out/carousel-leaver/serve-s.log 2>&1 & P1=$!
node tools/serve.mjs --root site-pretty --overlay $SNAP/E1 --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-e.json > out/carousel-leaver/serve-e.log 2>&1 & P2=$!
node tools/serve.mjs --root site-pretty --overlay $SNAP/F1 --port auto --https --vendors=local --no-http-twin --no-cache --state out/carousel-leaver/serve-f.json > out/carousel-leaver/serve-f.log 2>&1 & P3=$!
for x in a:$P0 s:$P1 e:$P2 f:$P3; do
  node tools/wait.mjs serve out/carousel-leaver/serve-${x%%:*}.json --pid ${x##*:} --reason "carousel-leaver probe server" > /dev/null || { kill $P0 $P1 $P2 $P3; echo EXIT 1; exit 1; }
done
# served hashes (must be the README table's; a mismatch voids the hold)
for k in a s e f; do
  U=$(node -e "const s=require('./out/carousel-leaver/serve-$k.json'); console.log(s.url || 'https://localhost:' + s.port + '/')")
  for f in _app/immutable/nodes/2.DyWL8TcE.js _app/immutable/assets/2.gBuqKVzi.css; do
    echo "served $k $f $(curl -sk "$U$f" | shasum -a 256 | cut -c1-12)"
  done
done | tee "$OUTD/served.txt"
# arms: A=a -> A=out/carousel-leaver/serve-a.json
ARMS=$(echo "$ARMSPEC" | sed -e 's#=\([asef]\)#=out/carousel-leaver/serve-\1.json#g')
if [ "$TOOL" = clp ]; then
  node fixes/carousel-leaver/probe/clp.mjs --arms "$ARMS" --modes "$MODES" --out "$OUTD"
else
  node fixes/carousel-leaver/probe/pord.mjs --arms "$ARMS" --out "$OUTD"
fi
R=$?
kill $P0 $P1 $P2 $P3
rm -rf out/carousel-leaver/clp-* out/carousel-leaver/pord-*
echo EXIT $R

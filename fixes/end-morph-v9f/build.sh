#!/bin/sh
# end-morph on the best build (int-v8 for fix-end-morph; lead, user T-204 #4): C = v9-final as landed (8b5ce9b3), V = C +
# fix-end-morph's end-morph-f12/delta.diff (F1 + U2, befc17cec97f, commit 293876b8 on worktree-agent-aa06ada9c80534d32),
# applied unchanged with patch -p1 -F 0. Writes the immutable snapshot out/emv9f/snap-<V js12>/{C,V} + HASHES.txt and
# refuses any other bytes. Usage (worktree root): sh fixes/end-morph-v9f/build.sh
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
SRC=out/p142/snap/C                      # v9-final, pinned in P-142 (HASHES.txt)
DELTA=fixes/nav-hit-cache/patch-on-v9f-f12.diff   # byte copy of end-morph-f12/delta.diff @293876b8
C_JS=647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2
C_CSS=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
V_JS12=a6426953727a
[ "$(shasum -a 256 $DELTA | cut -c1-12)" = befc17cec97f ] || { echo "delta is not befc17cec97f: refuse"; exit 3; }
[ "$(shasum -a 256 $SRC/$JS | cut -c1-64)" = $C_JS ] && [ "$(shasum -a 256 $SRC/$CSS | cut -c1-64)" = $C_CSS ] || { echo "source C is not v9-final: refuse"; exit 3; }
D=out/emv9f/snap-$V_JS12
[ -e $D ] && { echo "$D exists: refuse (immutable)"; exit 3; }
for X in C V; do mkdir -p $D/$X/_app/immutable/nodes $D/$X/_app/immutable/assets; cp $SRC/$JS $D/$X/$JS && cp $SRC/$CSS $D/$X/$CSS || exit 3; done
(cd $D/V && patch -p1 -s -F 0 -N < ../../../../$DELTA) || { echo "delta does not apply strictly: refuse"; rm -rf $D; exit 3; }
rm -f $D/V/$JS.orig $D/V/$JS.rej   # patch's backup / reject files: never served, kept out of the snapshot (fix-end-morph's note)
node --check $D/V/$JS || { echo "V fails node --check: refuse"; rm -rf $D; exit 3; }
[ "$(find $D -type f | wc -l | tr -d ' ')" = 4 ] || { echo "snapshot holds files beyond the four arms' files: refuse"; find $D -type f; exit 3; }
(cd $D && shasum -a 256 C/$JS C/$CSS V/$JS V/$CSS > HASHES.txt)
grep -q "^$C_JS  V/$JS" $D/HASHES.txt && { echo "V equals C: refuse"; exit 3; }
[ "$(grep "  V/$JS" $D/HASHES.txt | cut -c1-12)" = $V_JS12 ] && grep -q "^$C_CSS  V/$CSS" $D/HASHES.txt || { echo "V is not the pinned $V_JS12 / e1359ab9994a: refuse"; exit 3; }
chmod -R a-w $D/C $D/V; chmod a-w $D/HASHES.txt
cat $D/HASHES.txt; echo "snap ok $D"

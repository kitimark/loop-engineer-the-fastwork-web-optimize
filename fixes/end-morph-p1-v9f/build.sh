#!/bin/sh
# P1 on v9-final + F1 + U2 (int-v8 for fix-end-morph-p1's phone card P-153; lead GO 2026-10-06): C = v9-final + F1 + U2
# (the accepted landing base, out/emv9f/snap-a6426953727a/V, HASHES 0817a71bf0c7), V = C + fix-end-morph-p1's
# fixes/end-morph-p1/delta.diff (PR-012 rev 1 port, d310e4d2ba0c, commit 0af9e816), byte copy in p1-delta.diff, applied
# unchanged with patch -p1 -F 0. Writes the immutable snapshot out/emp1v9f/snap-<V js12>/{C,V} + HASHES.txt and refuses
# any other bytes. Usage (worktree root): sh fixes/end-morph-p1-v9f/build.sh
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
SRCD=out/emv9f/snap-a6426953727a; SRC=$SRCD/V   # v9-final + F1 + U2, pinned (fixes/end-morph-v9f/build.sh)
DELTA=fixes/end-morph-p1-v9f/p1-delta.diff      # byte copy of end-morph-p1/delta.diff @0af9e816
C_JS=a6426953727acd4342fd17f6f114d840e67b5e612b63d41dc45c7abab1362c5b
C_CSS=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
V_JS12=4da641f828bb; V_CSS12=a81b9af7b2c9       # fix-end-morph-p1's expected stack (both orders), 0af9e816
[ "$(shasum -a 256 $DELTA | cut -c1-12)" = d310e4d2ba0c ] || { echo "delta is not d310e4d2ba0c: refuse"; exit 3; }
[ "$(shasum -a 256 $SRCD/HASHES.txt | cut -c1-12)" = 0817a71bf0c7 ] && (cd $SRCD && shasum -a 256 -c --quiet HASHES.txt) || { echo "source snapshot is not HASHES 0817a71bf0c7 unchanged: refuse"; exit 3; }
[ "$(shasum -a 256 $SRC/$JS | cut -c1-64)" = $C_JS ] && [ "$(shasum -a 256 $SRC/$CSS | cut -c1-64)" = $C_CSS ] || { echo "source C is not v9-final + F1 + U2: refuse"; exit 3; }
D=out/emp1v9f/snap-$V_JS12
[ -e $D ] && { echo "$D exists: refuse (immutable)"; exit 3; }
for X in C V; do mkdir -p $D/$X/_app/immutable/nodes $D/$X/_app/immutable/assets; cp $SRC/$JS $D/$X/$JS && cp $SRC/$CSS $D/$X/$CSS || exit 3; done
(cd $D/V && patch -p1 -s -F 0 -N < ../../../../$DELTA) || { echo "delta does not apply strictly: refuse"; rm -rf $D; exit 3; }
rm -f $D/V/$JS.orig $D/V/$JS.rej $D/V/$CSS.orig $D/V/$CSS.rej   # patch's backup / reject files: never in the snapshot
node --check $D/V/$JS || { echo "V fails node --check: refuse"; rm -rf $D; exit 3; }
[ "$(find $D -type f | wc -l | tr -d ' ')" = 4 ] || { echo "snapshot holds files beyond the four arms' files: refuse"; find $D -type f; exit 3; }
(cd $D && shasum -a 256 C/$JS C/$CSS V/$JS V/$CSS > HASHES.txt)
grep -q "^$C_JS  V/$JS" $D/HASHES.txt && { echo "V JS equals C: refuse"; exit 3; }
[ "$(grep "  V/$JS" $D/HASHES.txt | cut -c1-12)" = $V_JS12 ] && [ "$(grep "  V/$CSS" $D/HASHES.txt | cut -c1-12)" = $V_CSS12 ] || { echo "V is not the pinned $V_JS12 / $V_CSS12: refuse"; cat $D/HASHES.txt; rm -rf $D; exit 3; }
chmod -R a-w $D/C $D/V; chmod a-w $D/HASHES.txt
cat $D/HASHES.txt; echo "HASHES $(shasum -a 256 $D/HASHES.txt | cut -c1-12)"; echo "snap ok $D"

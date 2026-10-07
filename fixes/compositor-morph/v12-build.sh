#!/bin/sh
# v12 (arch-compositor-morph; lead 2026-10-07 04:4xZ, after the user accepted PR-031 X2 and PR-032 rev 3):
#   v12 = v11 + X2 + c2 + PR-032 rev 3
#   V11  9b4a829d15a0 / 62743920fe1a   int-v11's v11 (out/cm/snap11/V, the P-158 snapshot, HASHES 4b9448f985b1)
#   X2   fixes/people-gpu/patch.diff                 24c2a1625316 (fix-people-gpu, PR-031; made on V)
#        V11 + X2 = 71ad4f9b82ac / 592d1f2a8af4 (int-v11's V11X pin)
#   c2   fixes/compositor-morph/c2-on-v11.diff       9e5d6780c85c (JS only; made on V11)
#   rev3 fixes/compositor-morph/fade3-on-v11.diff    21a4199bd6fc (JS + CSS; made on V11)
# Every apply is patch -p1 -F 0 (offsets allowed, no fuzz). Two routes must give the same bytes:
#   R1  V11 + X2 + c2 + rev3      R2  V11 + c2 + rev3 + X2
# node --check on the result. Writes out/cm/v12 (read-only) unless DRY=1.
#   sh fixes/compositor-morph/v12-build.sh            (DRY=1: routes, compare and check only)
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
S11=out/cm/snap11
X2D=fixes/people-gpu/patch.diff; C2D=fixes/compositor-morph/c2-on-v11.diff; F3D=fixes/compositor-morph/fade3-on-v11.diff
h() { shasum -a 256 "$1" | cut -c1-12; }
for p in "$X2D 24c2a1625316" "$C2D 9e5d6780c85c" "$F3D 21a4199bd6fc"; do
  set -- $p; [ "$(h $1)" = $2 ] || { echo "$1 is $(h $1), pinned $2: refuse"; exit 3; }; echo "  delta $1: $2 ok"
done
[ "$(h $S11/HASHES.txt)" = 4b9448f985b1 ] && (cd $S11 && shasum -a 256 -c --quiet HASHES.txt) || { echo "$S11 missing or not HASHES 4b9448f985b1: refuse"; exit 3; }
pin() { [ "$(h $1/$JS)" = $2 ] && [ "$(h $1/$CSS)" = $3 ] || { echo "$4 is $(h $1/$JS) / $(h $1/$CSS), pinned $2 / $3: refuse"; exit 3; }; echo "  $4: $2 / $3 ok"; }
pin $S11/V 9b4a829d15a0 62743920fe1a "V11 (input)"
T=out/cm/v12tmp-$$; rm -rf $T; mkdir -p $T; trap 'rm -rf $T' EXIT
TAB=$(printf '\t')
norm() { sed -E -e "s#^--- [^$TAB]*(_app/immutable/[^[:space:]]*).*#--- a/\1#" -e "s#^\+\+\+ [^$TAB]*(_app/immutable/[^[:space:]]*).*#+++ b/\1#" $1 > $2 || exit 3; }
norm $X2D $T/x2.diff; norm $C2D $T/c2.diff; norm $F3D $T/f3.diff
tree() { mkdir -p $1/_app/immutable/nodes $1/_app/immutable/assets; cp $2/$JS $1/$JS && cp $2/$CSS $1/$CSS && chmod -R u+w $1 || exit 3; }
ap() { (cd $1 && patch -p1 -s -F 0 -N < "$OLDPWD/$2") || { echo "$2 does not apply strictly on $1: refuse"; exit 3; }; rm -f $1/$JS.orig $1/$CSS.orig; echo "  $3: $(h $1/$JS) / $(h $1/$CSS)"; }
echo "R1  V11 + X2 + c2 + rev3"
tree $T/r1 $S11/V; ap $T/r1 $T/x2.diff "R1 V11+X2"; pin $T/r1 71ad4f9b82ac 592d1f2a8af4 "V11X (int-v11's pin)"
ap $T/r1 $T/c2.diff "R1 +c2"; ap $T/r1 $T/f3.diff "R1 +rev3 = v12"
echo "R2  V11 + c2 + rev3 + X2"
tree $T/r2 $S11/V; ap $T/r2 $T/c2.diff "R2 V11+c2"; [ "$(h $T/r2/$JS)" = 59b07dadb99c ] || { echo "R2 V11+c2 is not out/cm/c2 (59b07dadb99c): refuse"; exit 3; }
ap $T/r2 $T/f3.diff "R2 +rev3"; ap $T/r2 $T/x2.diff "R2 +X2"
cmp -s $T/r1/$JS $T/r2/$JS && cmp -s $T/r1/$CSS $T/r2/$CSS || { echo "routes differ: refuse"; exit 3; }
echo "  routes R1 = R2 byte for byte"
node --check $T/r1/$JS || { echo "node --check failed: refuse"; exit 3; }
echo "  node --check ok"
echo "v12 $(h $T/r1/$JS) / $(h $T/r1/$CSS)"
[ "$DRY" = 1 ] && { echo "DRY: nothing written"; exit 0; }
[ -e out/cm/v12 ] && { echo "out/cm/v12 exists (read-only): refuse to rebuild"; exit 3; }
mkdir -p out/cm/v12; tree out/cm/v12 $T/r1; chmod -R a-w out/cm/v12; echo "wrote out/cm/v12 (read-only)"

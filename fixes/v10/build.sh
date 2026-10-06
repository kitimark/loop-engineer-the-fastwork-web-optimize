#!/bin/sh
# v10 (int-v8; lead: "v10 = 1b2eecc66011 + F1+U2 + P1 (+ the PR-027 option the user picks)", plan accepted 2026-10-06;
# the user picked PR-027 "nolift"):
#   C = v9-final on main since 189ca7ed (rev 7d) = baseline + fixes/morph-scroll-v9try/patch.diff (6d1632eb0ee9)
#   N = C + F1+U2 (fix-end-morph's end-morph-f12/delta.diff befc17cec97f @293876b8; byte copy
#       fixes/nav-hit-cache/patch-on-v9f-f12.diff) + P1 (fix-end-morph-p1's end-morph-p1/delta.diff d310e4d2ba0c @0af9e816;
#       byte copy fixes/end-morph-p1-v9f/p1-delta.diff): v10 before nolift (the pre-stage, d37aacb0), f5068db34a32 / a81b9af7b2c9
#   V = N + nolift (fixes/v10/nolift-delta.diff 074e4667190a: the CSS-only delta of PR-027 option nolift, extracted as
#       measured build 4da641f828bb's CSS -> the nolift arm's CSS; the arm is fixes/joinwl-nolift/patch.diff bec7169bd7cc @9f9f703f
#       = 4da641f828bb / a4ed5432f2f7, option B's Try-it build): v10
# Every apply is patch -p1 -F 0 (offsets allowed, no fuzz) and every step is pinned. V is built by four routes that must
# give the same bytes:
#   R1  C + F1+U2 + P1 + nolift
#   R1b C + nolift + P1 + F1+U2              (the deltas commute)
#   R2  rev 7d's own diff (v9-final 647c9ef2b1e2 -> C) on the measured P-152/P-153 build (4da641f828bb) + nolift
#   R3  rev 7d's own diff on the nolift arm as the user tried it (baseline + joinwl-nolift/patch.diff @9f9f703f)
# then code parity (fixes/v10/codeparity.mjs: C -> V's changed lines = the three deltas' changed lines, and N -> V's =
# nolift's, 0 differences). Writes the immutable snapshot out/v10/snap-<V js12>-<V css12>/{C,N,V} + HASHES.txt.
# Usage (worktree root): sh fixes/v10/build.sh
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
REV7D=fixes/morph-scroll-v9try/patch.diff; V9F=fixes/v9-best/patch.diff
F12=fixes/nav-hit-cache/patch-on-v9f-f12.diff; P1=fixes/end-morph-p1-v9f/p1-delta.diff; NL=fixes/v10/nolift-delta.diff
node tools/baseline.mjs status > /dev/null || { echo "baseline is not the pinned snapshot: refuse"; exit 3; }
BASE=$(node --input-type=module -e "import { resolveTree } from './tools/lib/paths.mjs'; console.log(resolveTree('site-pretty'))") || exit 3
h() { shasum -a 256 "$1" | cut -c1-12; }
pin() { # pin <dir> <js12> <css12> <what>
  [ "$(h $1/$JS)" = $2 ] && [ "$(h $1/$CSS)" = $3 ] || { echo "$4 is $(h $1/$JS) / $(h $1/$CSS), pinned $2 / $3: refuse"; exit 3; }
  echo "  $4: $2 / $3 ok"
}
for p in "$REV7D 6d1632eb0ee9" "$V9F 4196eaa61d96" "$F12 befc17cec97f" "$P1 d310e4d2ba0c" "$NL 074e4667190a"; do
  set -- $p; [ "$(h $1)" = $2 ] || { echo "$1 is not $2: refuse"; exit 3; }
done
N_JS12=f5068db34a32; N_CSS12=a81b9af7b2c9; V_JS12=f5068db34a32; V_CSS12=a4ed5432f2f7
D=out/v10/snap-$V_JS12-$V_CSS12
[ -e $D ] && { echo "$D exists: refuse (immutable)"; exit 3; }
T=out/v10/tmp-$$; rm -rf $T; mkdir -p $T
trap 'rm -rf $T' EXIT
tree() { mkdir -p $1/_app/immutable/nodes $1/_app/immutable/assets; cp $2/$JS $1/$JS && cp $2/$CSS $1/$CSS && chmod -R u+w $1 || exit 3; }
ap() { (cd $1 && patch -p1 -s -F 0 -N < "$OLDPWD/$2") || { echo "$2 does not apply strictly on $1: refuse"; exit 3; }; rm -f $1/$JS.orig $1/$CSS.orig; }
git show 9f9f703f:fixes/joinwl-nolift/patch.diff > $T/nolift-arm.diff || exit 3
[ "$(h $T/nolift-arm.diff)" = bec7169bd7cc ] || { echo "joinwl-nolift/patch.diff @9f9f703f is not bec7169bd7cc: refuse"; exit 3; }
echo "R1: C + F1+U2 + P1 + nolift"
tree $T/c $BASE; ap $T/c $REV7D; pin $T/c 1b2eecc66011 e1359ab9994a "C (baseline + rev 7d build)"
tree $T/r1 $T/c; ap $T/r1 $F12; pin $T/r1 738bc075f7f8 e1359ab9994a "C + F1+U2"
ap $T/r1 $P1; pin $T/r1 $N_JS12 $N_CSS12 "N = C + F1+U2 + P1"
tree $T/n $T/r1
ap $T/r1 $NL; pin $T/r1 $V_JS12 $V_CSS12 "V = N + nolift"
echo "R1b: C + nolift + P1 + F1+U2"
tree $T/r1b $T/c; ap $T/r1b $NL; pin $T/r1b 1b2eecc66011 edc20be46534 "C + nolift"
ap $T/r1b $P1; pin $T/r1b 291f70523bd6 $V_CSS12 "C + nolift + P1"
ap $T/r1b $F12; pin $T/r1b $V_JS12 $V_CSS12 "V (other order)"
echo "R2 / R3: rev 7d's diff on the measured build + nolift, and on the nolift arm the user tried"
tree $T/v9 $BASE; ap $T/v9 $V9F; pin $T/v9 647c9ef2b1e2 e1359ab9994a "v9-final"
cmp -s $T/v9/$CSS $T/c/$CSS || { echo "rev 7d changes the CSS: R2 does not cover it: refuse"; exit 3; }
diff -u --label a/$JS --label b/$JS $T/v9/$JS $T/c/$JS > $T/rev7d.diff; [ $? -eq 1 ] || { echo "rev 7d diff failed: refuse"; exit 3; }
echo "  rev 7d diff (v9-final -> C): $(h $T/rev7d.diff), $(grep -c '^@@' $T/rev7d.diff) hunks"
tree $T/r2 $T/v9; ap $T/r2 $F12; pin $T/r2 a6426953727a e1359ab9994a "v9-final + F1+U2"
ap $T/r2 $P1; pin $T/r2 4da641f828bb a81b9af7b2c9 "v9-final + F1+U2 + P1 (measured)"
ap $T/r2 $T/rev7d.diff; pin $T/r2 $N_JS12 $N_CSS12 "measured + rev 7d"
ap $T/r2 $NL; pin $T/r2 $V_JS12 $V_CSS12 "measured + rev 7d + nolift"
tree $T/r3 $BASE; ap $T/r3 $T/nolift-arm.diff; pin $T/r3 4da641f828bb $V_CSS12 "nolift arm as tried (Try-it option B)"
ap $T/r3 $T/rev7d.diff; pin $T/r3 $V_JS12 $V_CSS12 "nolift arm + rev 7d"
for r in r1b r2 r3; do for f in $JS $CSS; do cmp -s $T/r1/$f $T/$r/$f || { echo "route $r differs on $f: refuse"; exit 3; }; done; done
echo "  R1 = R1b = R2 = R3, byte for byte"
echo "code parity: C -> V vs the three deltas; N -> V vs nolift"
node fixes/v10/codeparity.mjs $T/c $T/r1 $F12 $P1 $NL || { echo "code parity failed: refuse"; exit 3; }
node fixes/v10/codeparity.mjs $T/n $T/r1 $NL || { echo "code parity (nolift) failed: refuse"; exit 3; }
node --check $T/r1/$JS || { echo "V fails node --check: refuse"; exit 3; }
mkdir -p $D; tree $D/C $T/c; tree $D/N $T/n; tree $D/V $T/r1
[ "$(find $D -type f | wc -l | tr -d ' ')" = 6 ] || { echo "snapshot holds files beyond the three arms' files: refuse"; find $D -type f; rm -rf $D; exit 3; }
(cd $D && shasum -a 256 C/$JS C/$CSS N/$JS N/$CSS V/$JS V/$CSS > HASHES.txt)
chmod -R a-w $D/C $D/N $D/V; chmod a-w $D/HASHES.txt
cat $D/HASHES.txt; echo "HASHES $(h $D/HASHES.txt)"; echo "snap ok $D"

#!/bin/sh
# v11 (int-v11; lead ruling 2026-10-06 17:45Z): v11 = Vc + V13 + H1c, with an X2 slot that stays off.
#   C   main's v9-final rev 7d                                1b2eecc66011 / e1359ab9994a  (int-v8's v10 snapshot)
#   V   v10 + CM                                              a33a6c7c1f2b / 62743920fe1a  (int-v8's v10 snapshot)
#   Vc  V + c1 (fixes/v10/cm-c1.diff e7ec73c26c9c) = v10       b8b194b7ff56 / 62743920fe1a  (int-v8's snapc)
#   V11 Vc + V13 (fixes/compositor-morph/v13-on-c1.diff be94cbcf4ac0, arch-compositor-morph; Vc+V13 = JS a769bb169c4a)
#          + H1c (fixes/hero-covered-pause/patch.diff db74aaf9e3c1, fix-people-gpu; made on V: V+H1c = JS 784175f26a60)
#   X2 slot (fixes/people-gpu/patch.diff 24c2a1625316, PR-031, user decision pending; made on V: V+X2 = 9e66ff0696b4 /
#          592d1f2a8af4): X2=off (default) applies it on V11 in a temp copy only and prints the hash (nothing in the
#          snapshot); X2=on (only on the lead's word that the user accepted PR-031) adds arm V11X = V11 + X2 and needs
#          PIN_X=<js12>/<css12>.
# Every apply is patch -p1 -F 0 (offsets allowed, no fuzz); every input and step is pinned. V11 is built by three routes
# that must give the same bytes:
#   R1  Vc + V13 + H1c
#   R2  V + H1c + c1 + V13     (H1c's own base first: reproduces 784175f26a60)
#   R3  Vc + H1c + V13
# then code parity per step of R1 (fixes/v10/codeparity.mjs: the step's changed lines = its delta's, context ignored) and
# node --check on every arm's JS. Writes the immutable snapshot out/v11/snap-<V11 js12>-<V11 css12>/{C,Vc,V11[,V11X]}
# + HASHES.txt (read-only).
# Usage (worktree root, in a --no-timing chrome-measure hold): PIN_V11=<js12>/<css12> sh fixes/v11/build.sh
#   DRY=1: every route, the byte compare, parity and node --check on temp copies; prints the hashes, writes nothing.
# Inputs: out/v10/snap-a33a6c7c1f2b-62743920fe1a and out/v10/snapc-b8b194b7ff56-62743920fe1a (int-v8's immutable
# snapshots, HASHES.txt checked; copy them from int-v8's worktree out/ when missing).
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
S10=out/v10/snap-a33a6c7c1f2b-62743920fe1a; S10C=out/v10/snapc-b8b194b7ff56-62743920fe1a
C1=fixes/v10/cm-c1.diff; V13=fixes/compositor-morph/v13-on-c1.diff
H1C=fixes/hero-covered-pause/patch.diff; X2D=fixes/people-gpu/patch.diff
node tools/baseline.mjs status > /dev/null || { echo "baseline is not the pinned snapshot: refuse"; exit 3; }
h() { shasum -a 256 "$1" | cut -c1-12; }
pin() { # pin <dir> <js12> <css12> <what>
  [ "$(h $1/$JS)" = $2 ] && [ "$(h $1/$CSS)" = $3 ] || { echo "$4 is $(h $1/$JS) / $(h $1/$CSS), pinned $2 / $3: refuse"; exit 3; }
  echo "  $4: $2 / $3 ok"
}
for p in "$C1 e7ec73c26c9c" "$V13 be94cbcf4ac0" "$H1C db74aaf9e3c1" "$X2D 24c2a1625316"; do
  set -- $p; [ "$(h $1)" = $2 ] || { echo "$1 is $(h $1), pinned $2: refuse"; exit 3; }; echo "  delta $1: $2 ok"
done
[ "$(h $S10/HASHES.txt)" = dd33efddcece ] && (cd $S10 && shasum -a 256 -c --quiet HASHES.txt) || { echo "$S10 missing or not HASHES dd33efddcece: refuse"; exit 3; }
(cd $S10C && shasum -a 256 -c --quiet HASHES.txt) || { echo "$S10C missing or changed: refuse"; exit 3; }
pin $S10/C 1b2eecc66011 e1359ab9994a "C (input)"; pin $S10/V a33a6c7c1f2b 62743920fe1a "V (input)"
pin $S10C/V b8b194b7ff56 62743920fe1a "Vc (input)"
T=out/v11/tmp-$$; rm -rf $T; mkdir -p $T
trap 'rm -rf $T' EXIT
TAB=$(printf '\t')
norm() { sed -E -e "s#^--- [^$TAB]*(_app/immutable/[^[:space:]]*).*#--- a/\1#" -e "s#^\+\+\+ [^$TAB]*(_app/immutable/[^[:space:]]*).*#+++ b/\1#" $1 > $2 || exit 3; }
norm $C1 $T/c1.diff; norm $V13 $T/v13.diff; norm $H1C $T/h1c.diff; norm $X2D $T/x2.diff
tree() { mkdir -p $1/_app/immutable/nodes $1/_app/immutable/assets; cp $2/$JS $1/$JS && cp $2/$CSS $1/$CSS && chmod -R u+w $1 || exit 3; }
ap() { (cd $1 && patch -p1 -s -F 0 -N < "$OLDPWD/$2") || { echo "$2 does not apply strictly on $1: refuse"; exit 3; }; rm -f $1/$JS.orig $1/$CSS.orig; }
step() { # step <from dir> <to dir> <delta> <what> [<js12> <css12>]: apply, parity of this step, pin or print
  tree $2 $1; ap $2 $3
  node fixes/v10/codeparity.mjs $1 $2 $3 > $T/par.log 2>&1 || { cat $T/par.log; echo "code parity failed for $4: refuse"; exit 3; }
  if [ -n "$5" ]; then pin $2 $5 $6 "$4"; else echo "  $4: $(h $2/$JS) / $(h $2/$CSS) (not pinned)"; fi
  echo "    parity: $(tail -1 $T/par.log)"
}
echo "R1  Vc + V13 + H1c"
step $S10C/V $T/r1a $T/v13.diff "R1 Vc+V13" a769bb169c4a 62743920fe1a
step $T/r1a $T/r1 $T/h1c.diff "R1 Vc+V13+H1c = V11"
echo "R2  V + H1c + c1 + V13"
step $S10/V $T/r2a $T/h1c.diff "R2 V+H1c" 784175f26a60 62743920fe1a
step $T/r2a $T/r2b $T/c1.diff "R2 V+H1c+c1"
step $T/r2b $T/r2 $T/v13.diff "R2 V+H1c+c1+V13"
echo "R3  Vc + H1c + V13"
step $S10C/V $T/r3a $T/h1c.diff "R3 Vc+H1c"
step $T/r3a $T/r3 $T/v13.diff "R3 Vc+H1c+V13"
for r in r2 r3; do cmp -s $T/r1/$JS $T/$r/$JS && cmp -s $T/r1/$CSS $T/$r/$CSS || { echo "route $r differs from R1: refuse"; exit 3; }; done
echo "routes: R1 = R2 = R3 byte for byte"
echo "code parity, Vc -> V11 against V13 + H1c:"
node fixes/v10/codeparity.mjs $S10C/V $T/r1 $T/v13.diff $T/h1c.diff | tail -1 | sed 's/^/  /'
W=$(h $T/r1/$JS)/$(h $T/r1/$CSS)
echo "X2 slot (PR-031):"
step $S10/V $T/xv $T/x2.diff "X2 on V (its own pin)" 9e66ff0696b4 592d1f2a8af4
step $T/r1 $T/x $T/x2.diff "V11 + X2 = V11X"
XW=$(h $T/x/$JS)/$(h $T/x/$CSS)
for d in $T/r1 $T/x; do node --check $d/$JS || { echo "node --check failed on $d: refuse"; exit 3; }; done
echo "node --check: V11 and V11X ok"
echo "V11 $W  V11X $XW  (X2=${X2:-off})"
[ "$DRY" = 1 ] && { echo "DRY: nothing written"; exit 0; }
[ -n "$PIN_V11" ] || { echo "PIN_V11=<js12>/<css12> required (V11 is $W): refuse"; exit 3; }
[ "$PIN_V11" = "$W" ] || { echo "V11 is $W, PIN_V11 $PIN_V11: refuse"; exit 3; }
ARMS="C Vc V11"
if [ "${X2:-off}" = on ]; then
  [ "$PIN_X" = "$XW" ] || { echo "X2=on needs PIN_X=$XW (got '${PIN_X}'): refuse"; exit 3; }
  ARMS="$ARMS V11X"
elif [ "${X2:-off}" != off ]; then echo "X2 is on or off: refuse"; exit 3; fi
D=out/v11/snap-${W%/*}-${W#*/}; [ "${X2:-off}" = on ] && D=$D-x
[ -e $D ] && { echo "$D exists (immutable): refuse"; exit 3; }
mkdir -p $D
tree $D/C $S10/C; tree $D/Vc $S10C/V; tree $D/V11 $T/r1; [ "${X2:-off}" = on ] && tree $D/V11X $T/x
(cd $D && for a in $ARMS; do shasum -a 256 $a/$JS $a/$CSS; done > HASHES.txt)
for a in $ARMS; do chmod -R a-w $D/$a; done; chmod a-w $D/HASHES.txt
cat $D/HASHES.txt; echo "HASHES $(h $D/HASHES.txt)"; echo "snap ok $D"

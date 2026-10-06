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
#
# Optional deltas (pre-staged for the lead's "one rebuild with both", 2026-10-06; without them the build is exactly the
# one above). The order is fixed (lead): F1+U2, P1 -> P1b, nolift, I-219.
#   P1B="<d> [<d> ...]" P1B_SHA="<sha12> [...]"  fix-end-morph-p1's first-open fix; applied on top of P1 (right after it in
#                                               every route), its files in the given order, each checked against its hash
#   I219="<d>" I219_SHA="<sha12>"               fix-i219-hydrate's delta (e56f09e5:fixes/i219-hydrate/delta.diff is
#                                               947c88282561); applied last; adds arm CI = C + I-219 (same hydration as V)
#   <d> is a file or <commit>:<path> (git show); diff headers are normalised to a/_app/... b/_app/... before the apply
#   PIN_N=<js12>/<css12> (with P1B), PIN_V=<js12>/<css12> (with either), PIN_CI=<js12>/<css12> (with an I-219 delta other
#   than 947c88282561): the new arms' pins; required unless DRY
#   DRY=1  every route, the byte compare, code parity and node --check on temp copies; prints every hash, pins only what
#          is known or given, writes nothing (the dry-check of the order)
#   NAV=<d>|none NAV_SHA=<sha12> [NAV_NAME=<label>]  replaces F1+U2 (the P-152 split, lead 09:05Z): another nav delta in
#          its place (e.g. U2-only), or none; R3 is skipped then (the nolift arm as tried carries F1+U2), and the
#          F1+U2-based intermediate pins become printed hashes
#   N = C + F1+U2 + P1 [+ P1b]; V = N + nolift [+ I-219]. Routes with the options:
#   R1  C + F1+U2 + P1 [+ P1b] + nolift [+ I-219]
#   R1b C + nolift + P1 + F1+U2 [+ P1b] [+ I-219]   (P1b after F1+U2 here too: the draft (b) part edits next to F1+U2's
#                                                  U2 code, context lines from it, so it does not commute ahead of F1+U2)
#   R2  measured [+ P1b] + rev 7d + nolift [+ I-219]          (P1b's own base is the measured build)
#   R3  nolift arm [+ P1b] + rev 7d [+ I-219]
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
stage() { # stage <dir> <what> [<js12> <css12>]: pin when the pin is known, else print the hashes
  if [ -n "$3" ]; then pin $1 $3 $4 "$2"; else echo "  $2: $(h $1/$JS) / $(h $1/$CSS) (not pinned)"; fi
}
for p in "$REV7D 6d1632eb0ee9" "$V9F 4196eaa61d96" "$F12 befc17cec97f" "$P1 d310e4d2ba0c" "$NL 074e4667190a"; do
  set -- $p; [ "$(h $1)" = $2 ] || { echo "$1 is not $2: refuse"; exit 3; }
done
T=out/v10/tmp-$$; rm -rf $T; mkdir -p $T
trap 'rm -rf $T' EXIT
TAB=$(printf '\t')
get() { # get <spec> <out> <sha12> <what>: fetch, check the hash of the owner's bytes, normalise the headers
  if [ -f "$1" ]; then cp "$1" $2.raw || exit 3; else git show "$1" > $2.raw 2> /dev/null || { echo "$4 $1: not a file or <commit>:<path>: refuse"; exit 3; }; fi
  [ "$(h $2.raw)" = "$3" ] || { echo "$4 $1 is $(h $2.raw), given $3: refuse"; exit 3; }
  sed -E -e "s#^--- [^$TAB]*(_app/immutable/[^$TAB]*).*#--- a/\1#" -e "s#^\+\+\+ [^$TAB]*(_app/immutable/[^$TAB]*).*#+++ b/\1#" $2.raw > $2 || exit 3
  echo "  $4 $1: $3 ok, $(grep -c '^@@' $2) hunks"
}
P1BL=""; I219L=""
if [ -n "$P1B" ]; then
  set -- $P1B_SHA; i=0
  for s in $P1B; do
    i=$((i + 1)); [ $# -ge 1 ] || { echo "P1B_SHA has no hash for $s: refuse"; exit 3; }
    get "$s" $T/p1b-$i.diff $1 "P1b ($i)"; P1BL="$P1BL $T/p1b-$i.diff"; shift
  done
  [ $# -eq 0 ] || { echo "P1B_SHA has more hashes than P1B has files: refuse"; exit 3; }
fi
if [ -n "$I219" ]; then get "$I219" $T/i219.diff "$I219_SHA" "I-219"; I219L=$T/i219.diff; fi
NAVL=$F12; NAVN="F1+U2"; ALT=
if [ -n "$NAV" ]; then
  ALT=1
  if [ "$NAV" = none ]; then NAVL=""; NAVN="no F1+U2"
  else get "$NAV" $T/nav.diff "$NAV_SHA" "nav delta (in place of F1+U2)"; NAVL=$T/nav.diff; NAVN=${NAV_NAME:-nav delta}; fi
fi
apl() { d=$1; shift; for x in "$@"; do ap $d $x; done; }
N_JS12=f5068db34a32; N_CSS12=a81b9af7b2c9; V_JS12=f5068db34a32; V_CSS12=a4ed5432f2f7; CI_JS12=; CI_CSS12=
[ -n "$P1BL$ALT" ] && { N_JS12=${PIN_N%/*}; N_CSS12=${PIN_N#*/}; [ -n "$PIN_N" ] || N_JS12= N_CSS12=; }
[ -n "$P1BL$I219L$ALT" ] && { V_JS12=${PIN_V%/*}; V_CSS12=${PIN_V#*/}; [ -n "$PIN_V" ] || V_JS12= V_CSS12=; }
if [ -n "$I219L" ]; then
  if [ -n "$PIN_CI" ]; then CI_JS12=${PIN_CI%/*}; CI_CSS12=${PIN_CI#*/}
  elif [ "$I219_SHA" = 947c88282561 ]; then CI_JS12=30d41592a308; CI_CSS12=e1359ab9994a; fi
fi
if [ -z "$DRY" ]; then
  [ -n "$N_JS12" ] && [ -n "$V_JS12" ] && { [ -z "$I219L" ] || [ -n "$CI_JS12" ]; } || { echo "an optional delta without PIN_N / PIN_V / PIN_CI: refuse (DRY=1 prints them)"; exit 3; }
  D=out/v10/snap-$V_JS12-$V_CSS12
  [ -e $D ] && { echo "$D exists: refuse (immutable)"; exit 3; }
fi
tree() { mkdir -p $1/_app/immutable/nodes $1/_app/immutable/assets; cp $2/$JS $1/$JS && cp $2/$CSS $1/$CSS && chmod -R u+w $1 || exit 3; }
ap() { (cd $1 && patch -p1 -s -F 0 -N < "$OLDPWD/$2") || { echo "$2 does not apply strictly on $1: refuse"; exit 3; }; rm -f $1/$JS.orig $1/$CSS.orig; }
git show 9f9f703f:fixes/joinwl-nolift/patch.diff > $T/nolift-arm.diff || exit 3
[ "$(h $T/nolift-arm.diff)" = bec7169bd7cc ] || { echo "joinwl-nolift/patch.diff @9f9f703f is not bec7169bd7cc: refuse"; exit 3; }
echo "R1: C + $NAVN + P1${P1BL:+ + P1b} + nolift${I219L:+ + I-219}"
tree $T/c $BASE; ap $T/c $REV7D; pin $T/c 1b2eecc66011 e1359ab9994a "C (baseline + rev 7d build)"
tree $T/r1 $T/c; apl $T/r1 $NAVL
if [ -z "$ALT" ]; then pin $T/r1 738bc075f7f8 e1359ab9994a "C + F1+U2"; elif [ -n "$NAVL" ]; then stage $T/r1 "C + $NAVN"; fi
ap $T/r1 $P1
if [ -n "$P1BL" ]; then
  if [ -z "$ALT" ]; then pin $T/r1 f5068db34a32 a81b9af7b2c9 "C + F1+U2 + P1"; else stage $T/r1 "C + $NAVN + P1"; fi
  apl $T/r1 $P1BL
fi
stage $T/r1 "N = C + $NAVN + P1${P1BL:+ + P1b}" $N_JS12 $N_CSS12
tree $T/n $T/r1
ap $T/r1 $NL
if [ -n "$I219L" ]; then
  if [ -z "$P1BL$ALT" ]; then stage $T/r1 "N + nolift" f5068db34a32 a4ed5432f2f7; else stage $T/r1 "N + nolift"; fi
  ap $T/r1 $I219L
fi
stage $T/r1 "V = N + nolift${I219L:+ + I-219}" $V_JS12 $V_CSS12
echo "R1b: C + nolift + P1 + $NAVN${P1BL:+ + P1b}${I219L:+ + I-219}"
tree $T/r1b $T/c; ap $T/r1b $NL; pin $T/r1b 1b2eecc66011 edc20be46534 "C + nolift"
ap $T/r1b $P1; pin $T/r1b 291f70523bd6 a4ed5432f2f7 "C + nolift + P1"
apl $T/r1b $NAVL
[ -n "$P1BL" ] && { stage $T/r1b "C + nolift + P1 + $NAVN"; apl $T/r1b $P1BL; }
[ -n "$I219L" ] && { stage $T/r1b "... ${P1BL:++ P1b}"; ap $T/r1b $I219L; }
stage $T/r1b "V (other order)" $V_JS12 $V_CSS12
echo "R2 / R3: rev 7d's diff on the measured build${P1BL:+ + P1b} + nolift${I219L:+ + I-219}, and on the nolift arm the user tried"
tree $T/v9 $BASE; ap $T/v9 $V9F; pin $T/v9 647c9ef2b1e2 e1359ab9994a "v9-final"
cmp -s $T/v9/$CSS $T/c/$CSS || { echo "rev 7d changes the CSS: R2 does not cover it: refuse"; exit 3; }
diff -u --label a/$JS --label b/$JS $T/v9/$JS $T/c/$JS > $T/rev7d.diff; [ $? -eq 1 ] || { echo "rev 7d diff failed: refuse"; exit 3; }
echo "  rev 7d diff (v9-final -> C): $(h $T/rev7d.diff), $(grep -c '^@@' $T/rev7d.diff) hunks"
tree $T/r2 $T/v9; apl $T/r2 $NAVL; [ -z "$ALT" ] && pin $T/r2 a6426953727a e1359ab9994a "v9-final + F1+U2"
ap $T/r2 $P1
if [ -z "$ALT" ]; then pin $T/r2 4da641f828bb a81b9af7b2c9 "v9-final + F1+U2 + P1 (measured)"; else stage $T/r2 "v9-final + $NAVN + P1"; fi
[ -n "$P1BL" ] && { apl $T/r2 $P1BL; stage $T/r2 "measured + P1b"; }
ap $T/r2 $T/rev7d.diff; stage $T/r2 "measured${P1BL:+ + P1b} + rev 7d (= N)" $N_JS12 $N_CSS12
ap $T/r2 $NL; [ -n "$I219L" ] && ap $T/r2 $I219L
stage $T/r2 "measured${P1BL:+ + P1b} + rev 7d + nolift${I219L:+ + I-219}" $V_JS12 $V_CSS12
ROUTES="r1b r2 r3"
if [ -n "$ALT" ]; then ROUTES="r1b r2"; echo "  R3 skipped: the nolift arm as tried carries F1+U2"; else
tree $T/r3 $BASE; ap $T/r3 $T/nolift-arm.diff; pin $T/r3 4da641f828bb a4ed5432f2f7 "nolift arm as tried (Try-it option B)"
[ -n "$P1BL" ] && apl $T/r3 $P1BL
ap $T/r3 $T/rev7d.diff; [ -n "$I219L" ] && ap $T/r3 $I219L
stage $T/r3 "nolift arm${P1BL:+ + P1b} + rev 7d${I219L:+ + I-219}" $V_JS12 $V_CSS12
fi
for r in $ROUTES; do for f in $JS $CSS; do cmp -s $T/r1/$f $T/$r/$f || { echo "route $r differs on $f: refuse"; exit 3; }; done; done
echo "  R1 = $(echo $ROUTES | tr r R | sed 's/ / = /g'), byte for byte"
if [ -n "$I219L" ]; then
  echo "CI: C + I-219"
  tree $T/ci $T/c; ap $T/ci $I219L; stage $T/ci "CI = C + I-219" $CI_JS12 $CI_CSS12
fi
echo "code parity: C -> V vs the stacked deltas; N -> V vs nolift${I219L:+ + I-219}${I219L:+; C -> CI vs I-219}"
node fixes/v10/codeparity.mjs $T/c $T/r1 $NAVL $P1 $P1BL $NL $I219L || { echo "code parity failed: refuse"; exit 3; }
node fixes/v10/codeparity.mjs $T/n $T/r1 $NL $I219L || { echo "code parity (N -> V) failed: refuse"; exit 3; }
if [ -n "$I219L" ]; then node fixes/v10/codeparity.mjs $T/c $T/ci $I219L || { echo "code parity (C -> CI) failed: refuse"; exit 3; }; fi
for a in c n r1 ${I219L:+ci}; do node --check $T/$a/$JS || { echo "$a fails node --check: refuse"; exit 3; }; done
[ -n "$DRY" ] && { echo "DRY: order and parity ok, nothing written"; exit 0; }
ARMS="C N V"; [ -n "$I219L" ] && ARMS="C CI N V"
mkdir -p $D; tree $D/C $T/c; tree $D/N $T/n; tree $D/V $T/r1; [ -n "$I219L" ] && tree $D/CI $T/ci
NF=6; [ -n "$I219L" ] && NF=8
[ "$(find $D -type f | wc -l | tr -d ' ')" = $NF ] || { echo "snapshot holds files beyond the arms' files: refuse"; find $D -type f; rm -rf $D; exit 3; }
(cd $D && for a in $ARMS; do shasum -a 256 $a/$JS $a/$CSS; done > HASHES.txt)
for a in $ARMS; do chmod -R a-w $D/$a; done; chmod a-w $D/HASHES.txt
cat $D/HASHES.txt; echo "HASHES $(h $D/HASHES.txt)"; echo "snap ok $D"

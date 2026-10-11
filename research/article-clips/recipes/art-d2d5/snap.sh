#!/bin/sh
# snap.sh (art-day2-day5-clips, 2026-10-11, owner T-170 #359/#363): the two builds for the Day 2 and Day 5 clips as
# immutable, read-only snapshot copies under out/d2d5/snap/ (gitignored), with HASHES.txt; refuses an existing target.
#   W = aw1-10c, the build the owner swiped as "B" on 1 Oct 08:00Z ("laggy, the same"; fixes/iphone-wave2/README.md §2):
#       all-wave1 + scroll-engine /10c, rebuilt from main's patches with strict `patch -F0` on the baseline snapshot's
#       JS/CSS: fixes/all-wave1/patch.diff (-> JS 69b915568658 / CSS 213e21d3db9a, all-wave1 README "Overlay") then
#       fixes/se10c-aw1/patch.diff (stacked on all-wave1 -> JS 757e2cbc44e7 / CSS c6aad94b455f, se10c-aw1 results.json
#       served check; the same pair iphone-wave2 served as "aw1-10c").
#   S = v6 = B-R2, the 4 Oct 07:33Z breakthrough build (fixes/BEST_BUILDS.md v6; fixes/hero-exit-threaded/README.md
#       "B-R2"): no baseline-relative patch of it is on main, so it is copied read-only from fix-hero-exit-threaded's
#       immutable snapshot best-BR2-8018ce062d30 (as P-095o did) and checked against the full sha256 in that README.
# usage: sh research/article-clips/recipes/art-d2d5/snap.sh <path of best-BR2-8018ce062d30>
cd "$(dirname "$0")/../../../.." || exit 2
SRC_S=$1
J=_app/immutable/nodes/2.DyWL8TcE.js; C=_app/immutable/assets/2.gBuqKVzi.css
T=out/d2d5/snap
[ -e $T ] && { echo "REFUSE: $T exists (immutable)"; exit 4; }
[ -n "$SRC_S" ] && [ -f "$SRC_S/$J" ] || { echo "usage: snap.sh <best-BR2-8018ce062d30 dir>"; exit 2; }
node tools/baseline.mjs status > /dev/null || { echo "REFUSE: baseline not the pinned snapshot"; exit 3; }
h() { shasum -a 256 "$1" | cut -c1-12; }
mkdir -p $T/W/_app/immutable/nodes $T/W/_app/immutable/assets $T/S/_app/immutable/nodes $T/S/_app/immutable/assets
cat site-pretty/$J > $T/W/$J; cat site-pretty/$C > $T/W/$C
[ "$(h $T/W/$J) $(h $T/W/$C)" = "4606120cf392 27776f3d4138" ] || { echo "baseline JS/CSS not the original"; exit 4; }
patch -s -d $T/W -p1 -F0 --no-backup-if-mismatch -i "$PWD/fixes/all-wave1/patch.diff" || exit 4
echo "all-wave1  $(h $T/W/$J) $(h $T/W/$C)"
[ "$(h $T/W/$J) $(h $T/W/$C)" = "69b915568658 213e21d3db9a" ] || { echo "all-wave1 hash mismatch"; exit 4; }
patch -s -d $T/W -p1 -F0 --no-backup-if-mismatch -i "$PWD/fixes/se10c-aw1/patch.diff" || exit 4
echo "aw1-10c    $(h $T/W/$J) $(h $T/W/$C)"
[ "$(h $T/W/$J) $(h $T/W/$C)" = "757e2cbc44e7 c6aad94b455f" ] || { echo "aw1-10c hash mismatch"; exit 4; }
node --check $T/W/$J || exit 4
cat "$SRC_S/$J" > $T/S/$J; cat "$SRC_S/$C" > $T/S/$C
[ "$(shasum -a 256 $T/S/$J | cut -d' ' -f1)" = 8018ce062d301134fb0e96e836a4a91b611a7a8fc3b6d8f5869659e3216f996f ] &&
[ "$(shasum -a 256 $T/S/$C | cut -d' ' -f1)" = 71b65c6677209db88a9150e9e23eb5fc2188381d7b809c2337d6c0bd18ec1eb8 ] || { echo "v6 hash mismatch"; exit 4; }
node --check $T/S/$J || exit 4
echo "v6         $(h $T/S/$J) $(h $T/S/$C)"
(cd $T && shasum -a 256 W/$J W/$C S/$J S/$C > HASHES.txt)
chmod -R a-w $T/W $T/S $T/HASHES.txt
echo "SNAP OK $(shasum -a 256 $T/HASHES.txt | cut -c1-12)"

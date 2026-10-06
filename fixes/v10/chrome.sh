#!/bin/sh
# v10 Chrome parity (int-v8), each part in its own shared probe hold (300 s cap; nothing timed, so the phone holds keep
# priority). Logs in out/v10/chrome-<part>.log. Snapshot out/v10/snap-f5068db34a32-a4ed5432f2f7 (sh fixes/v10/build.sh):
# C = main's v9-final 1b2eecc66011, N = v10 before nolift, V = v10 (with nolift).
#   fling       fixes/v10/flingout.mjs (nav-hit-cache base v10u2: C, V, VA = 1b2e+P1, N, N+audit; fast and slow fling)
#   px-nl       em-px A = N, V = V: nolift's effect; fixes/v10/nlregion.mjs: every difference inside the earn button
#   px-tryit    em-px A = the nolift Try-it build (baseline + joinwl-nolift/patch.diff @9f9f703f = 4da641f828bb /
#               a4ed5432f2f7), V = v10: nlregion --identical (rev 7d changes no static render)
#   px-meas     em-px A = the measured build 4da641f828bb, V = N: nlregion --identical
#   px-v10      em-px A = C, V = N        (the stack's effect on the rev 7d base ...)
#   px-v9f      em-px A = v9-final 647c9ef2b1e2, V = the measured build (... must match the measured effect stop by stop)
#   cnt-<x>     em-chrome counts on V, N, the measured build, C, v9-final
# Usage (worktree root, in the background): sh fixes/v10/chrome.sh [part ...]   (default: all, in that order)
cd "$(dirname "$0")/../.." || exit 2
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
S=out/v10/snap-f5068db34a32-a4ed5432f2f7; MEAS=out/emp1v9f/snap-4da641f828bb; V9F=out/emv9f/snap-a6426953727a
TRY=out/v10/tryit-nolift-4da641f828bb-a4ed5432f2f7
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $S/HASHES.txt)" = 0f91ea014cb3 ] || { echo "v10 HASHES.txt is not 0f91ea014cb3: refuse"; exit 3; }
(cd $S && shasum -a 256 -c --quiet HASHES.txt) && (cd $MEAS && shasum -a 256 -c --quiet HASHES.txt) && (cd $V9F && shasum -a 256 -c --quiet HASHES.txt) || { echo "a snapshot changed: refuse"; exit 3; }
if [ ! -e $TRY ]; then # the nolift arm as the user tried it, built once from the baseline, read-only
  BASE=$(node --input-type=module -e "import { resolveTree } from './tools/lib/paths.mjs'; console.log(resolveTree('site-pretty'))") || exit 3
  mkdir -p $TRY.tmp/_app/immutable/nodes $TRY.tmp/_app/immutable/assets
  cp $BASE/$JS $TRY.tmp/$JS && cp $BASE/$CSS $TRY.tmp/$CSS && chmod -R u+w $TRY.tmp || exit 3
  git show 9f9f703f:fixes/joinwl-nolift/patch.diff > out/v10/nolift-arm.diff || exit 3
  [ "$(h out/v10/nolift-arm.diff)" = bec7169bd7cc ] || { echo "nolift arm patch is not bec7169bd7cc: refuse"; exit 3; }
  (cd $TRY.tmp && patch -p1 -s -F 0 -N < ../../../out/v10/nolift-arm.diff) || { echo "nolift arm does not apply: refuse"; exit 3; }
  rm -f $TRY.tmp/$JS.orig $TRY.tmp/$CSS.orig
  [ "$(h $TRY.tmp/$JS)" = 4da641f828bb ] && [ "$(h $TRY.tmp/$CSS)" = a4ed5432f2f7 ] || { echo "nolift arm is not 4da641f828bb / a4ed5432f2f7: refuse"; exit 3; }
  mv $TRY.tmp $TRY && chmod -R a-w $TRY/_app   # (rename first: a read-only directory can't be renamed)
fi
[ "$(h $TRY/$JS)" = 4da641f828bb ] && [ "$(h $TRY/$CSS)" = a4ed5432f2f7 ] || { echo "$TRY changed: refuse"; exit 3; }
PARTS=${*:-fling px-nl px-tryit px-meas px-v10 px-v9f cnt-v10 cnt-n cnt-meas cnt-1b2e cnt-647c}
hold() { # hold <part> <doing> <cmd...>
  P=$1; D=$2; shift 2
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds ${MAXS:-300} --owner "$OWNER" --doing "v10 parity: $D (counts and pixels only)" -- "$@" > out/v10/chrome-$P.log 2>&1
  echo "$P EXIT $?" | tee -a out/v10/chrome-$P.log
}
pxjson() { sed -n 's/^wrote \(.*px\.json\)$/\1/p' out/v10/chrome-$1.log | tail -1; }
for P in $PARTS; do
  case $P in
    fling) hold $P "fling-out probe" node fixes/v10/flingout.mjs --out out/v10/flingout.json ;;
    px-nl) hold $P "pixels nolift on v10" node fixes/v10/gates/em-px.mjs --engine chrome --a $S/N --v $S/V --label v10-nl
      node fixes/v10/nlregion.mjs "$(pxjson $P)" | tee -a out/v10/chrome-$P.log ;;
    px-tryit) hold $P "pixels v10 vs nolift Try-it" node fixes/v10/gates/em-px.mjs --engine chrome --a $TRY --v $S/V --label v10-vs-tryit
      node fixes/v10/nlregion.mjs "$(pxjson $P)" --identical | tee -a out/v10/chrome-$P.log ;;
    px-meas) hold $P "pixels v10 (pre-nolift) vs measured" node fixes/v10/gates/em-px.mjs --engine chrome --a $MEAS/V --v $S/N --label n-vs-meas
      node fixes/v10/nlregion.mjs "$(pxjson $P)" --identical | tee -a out/v10/chrome-$P.log ;;
    px-v10) hold $P "pixels v10 (pre-nolift) vs main" node fixes/v10/gates/em-px.mjs --engine chrome --a $S/C --v $S/N --label n-vs-1b2e ;;
    px-v9f) hold $P "pixels measured vs v9-final" node fixes/v10/gates/em-px.mjs --engine chrome --a $V9F/C --v $MEAS/V --label meas-vs-647c ;;
    cnt-v10) hold $P "counts v10" node fixes/v10/em-chrome.mjs --overlay $S/V --label v10 ;;
    cnt-n) hold $P "counts v10 pre-nolift" node fixes/v10/em-chrome.mjs --overlay $S/N --label v10n ;;
    cnt-meas) hold $P "counts measured" node fixes/v10/em-chrome.mjs --overlay $MEAS/V --label meas ;;
    cnt-1b2e) hold $P "counts main" node fixes/v10/em-chrome.mjs --overlay $S/C --label 1b2e ;;
    cnt-647c) hold $P "counts v9-final" node fixes/v10/em-chrome.mjs --overlay $V9F/C --label 647c ;;
    *) echo "part $P?"; exit 2 ;;
  esac
done

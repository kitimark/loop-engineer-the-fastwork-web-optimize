#!/bin/sh
# v13 (arch-compositor-morph; lead 2026-10-07, P-160): v13 = v12 + c3
#   v12  807ea24c4bf5 / a9a47b10326a   out/cm/v12 (v12-build.sh; the P-159 V, out/cm/snap159b HASHES 48736dab87cf)
#   c3   fixes/compositor-morph/c3-on-v12.diff   0f4a51ea92d5 (JS + CSS; made on v12; landed bcaaadca)
# patch -p1 -F 0 (no fuzz) on a copy of v12; the result must equal the gated build out/cm/c3 byte for byte and pass
# node --check. Writes nothing: the P-160 snapshot (phone-c3/cm-serve.sh snap) copies V from out/cm/c3, which this
# proves equal to v12 + c3. (out/cm/v13 is an unrelated 2026-10-06 experiment folder; the name is not used.)
#   sh fixes/compositor-morph/v13-build.sh
cd "$(dirname "$0")/../.." || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
D3=fixes/compositor-morph/c3-on-v12.diff
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $D3)" = 0f4a51ea92d5 ] || { echo "$D3 is $(h $D3), pinned 0f4a51ea92d5: refuse"; exit 3; }; echo "  delta $D3: 0f4a51ea92d5 ok"
pin() { [ "$(h $1/$JS)" = $2 ] && [ "$(h $1/$CSS)" = $3 ] || { echo "$4 is $(h $1/$JS) / $(h $1/$CSS), pinned $2 / $3: refuse"; exit 3; }; echo "  $4: $2 / $3 ok"; }
pin out/cm/v12 807ea24c4bf5 a9a47b10326a "v12 (input)"
T=out/cm/v13tmp-$$; rm -rf $T; mkdir -p $T/_app/immutable/nodes $T/_app/immutable/assets; trap 'rm -rf $T' EXIT
cp out/cm/v12/$JS $T/$JS && cp out/cm/v12/$CSS $T/$CSS && chmod -R u+w $T || exit 3
TAB=$(printf '\t')
sed -E -e "s#^--- [^$TAB]*(_app/immutable/[^[:space:]]*).*#--- a/\1#" -e "s#^\+\+\+ [^$TAB]*(_app/immutable/[^[:space:]]*).*#+++ b/\1#" \
  -e "s#^diff --git .*##" $D3 > $T.diff || exit 3
(cd $T && patch -p1 -s -F 0 -N < "$OLDPWD/$T.diff") || { rm -f $T.diff; echo "c3 does not apply strictly on v12: refuse"; exit 3; }
rm -f $T.diff $T/$JS.orig $T/$CSS.orig
pin $T 1e6daf11957a 9c1067cff473 "v13 = v12 + c3"
cmp -s $T/$JS out/cm/c3/$JS && cmp -s $T/$CSS out/cm/c3/$CSS || { echo "v13 differs from the gated out/cm/c3: refuse"; exit 3; }
echo "  v13 = out/cm/c3 byte for byte"
node --check $T/$JS || { echo "node --check failed: refuse"; exit 3; }
echo "  node --check ok"
echo "OK: v13 = v12 + c3 = out/cm/c3"

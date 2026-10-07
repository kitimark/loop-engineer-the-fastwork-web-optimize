#!/bin/sh
# g0.0 (= v14 with the original end-of-page; gpu-original step 0) rebuilt from main alone: the baseline's two files
# (site-pretty, pinned by baseline.json) plus fixes/g0-revert/patch.diff (baseline-relative), checked against HASHES.
#   sh fixes/g0-revert/rebuild.sh [<out dir>]      # default out/g0/g00-rebuild; refuses an existing dir
# Then serve it as an overlay: node tools/serve.mjs --root site-pretty --overlay <out dir> --port auto --vendors=local
cd "$(dirname "$0")/../.." || exit 2
R=$(pwd)
O=${1:-out/g0/g00-rebuild}
[ -e "$O" ] && { echo "$O exists: refuse (pick another dir or remove it yourself)"; exit 3; }
B=$(node -e "import('./tools/lib/paths.mjs').then((m) => console.log(m.resolveTree('site-pretty')))") || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
mkdir -p "$O/_app/immutable/nodes" "$O/_app/immutable/assets"
cp "$B/$JS" "$O/$JS" && cp "$B/$CSS" "$O/$CSS" && chmod u+w "$O/$JS" "$O/$CSS" || exit 3
patch -s -p1 -d "$O" < fixes/g0-revert/patch.diff || { echo "PATCH FAILED"; exit 4; }
(cd "$O" && shasum -a 256 -c "$R/fixes/g0-revert/HASHES") || { echo "HASH MISMATCH"; exit 5; }
chmod -R a-w "$O"
echo "g0.0 rebuilt in $O (read-only)"

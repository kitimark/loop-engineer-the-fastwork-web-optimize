#!/bin/sh
# v14 (= v13a + K6, the best build since P-161, landed e8ad1d8b) rebuilt from main alone: the baseline's two files
# (site-pretty, pinned by baseline.json) plus v14.diff, checked against HASHES. No other build is needed.
#   sh fixes/compositor-morph/v14/rebuild.sh [<out dir>]      # default out/cm/v14-rebuild; refuses an existing dir
# Then serve it as an overlay: node tools/serve.mjs --root site-pretty --overlay <out dir> --port auto --vendors=local
cd "$(dirname "$0")/../../.." || exit 2
R=$(pwd)
O=${1:-out/cm/v14-rebuild}
[ -e "$O" ] && { echo "$O exists: refuse (pick another dir or remove it yourself)"; exit 3; }
B=$(node -e "import('./tools/lib/paths.mjs').then((m) => console.log(m.resolveTree('site-pretty')))") || exit 2
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
mkdir -p "$O/_app/immutable/nodes" "$O/_app/immutable/assets"
cp "$B/$JS" "$O/$JS" && cp "$B/$CSS" "$O/$CSS" && chmod u+w "$O/$JS" "$O/$CSS" || exit 3
patch -s -p1 -d "$O" < fixes/compositor-morph/v14/v14.diff || { echo "PATCH FAILED"; exit 4; }
(cd "$O" && shasum -a 256 -c "$R/fixes/compositor-morph/v14/HASHES") || { echo "HASH MISMATCH"; exit 5; }
chmod -R a-w "$O"
echo "v14 rebuilt in $O (read-only)"

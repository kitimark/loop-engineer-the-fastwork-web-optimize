#!/bin/sh
# g0.0l phone snapshot: immutable copies of C = g0.0k (fixes/g0-0k/patch.diff) and V = g0.0l (fixes/g0-0l/patch.diff)
# under out/g0-0l/snap/{C,V}, built from the committed patches into scratch overlays, plus HASHES.txt; read-only.
# usage: sh fixes/g0-0l/phone/g0l-snap.sh        (refuses an existing snapshot)
cd "$(dirname "$0")/../../.." || exit 2
D=out/g0-0l/snap
[ -e $D/HASHES.txt ] && { echo "snapshot exists at $D (read-only): refuse to rebuild"; exit 3; }
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
node tools/fix.mjs apply people-blink --from g0-0k --reset > /dev/null || exit 3
node tools/fix.mjs apply g0-0l --reset > /dev/null || exit 3
mkdir -p $D/C/_app/immutable/nodes $D/C/_app/immutable/assets $D/V/_app/immutable/nodes $D/V/_app/immutable/assets
cp fixes/people-blink/overlay/$JS $D/C/$JS && cp fixes/people-blink/overlay/$CSS $D/C/$CSS || exit 3
cp fixes/g0-0l/overlay/$JS $D/V/$JS && cp fixes/g0-0l/overlay/$CSS $D/V/$CSS || exit 3
(cd $D && find C V -type f | sort | xargs shasum -a 256 > HASHES.txt)
chmod -R a-w $D/C $D/V $D/HASHES.txt
echo "snapshot $D: HASHES.txt $(shasum -a 256 $D/HASHES.txt | cut -c1-12)"; cat $D/HASHES.txt

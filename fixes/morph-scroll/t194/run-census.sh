#!/bin/sh
# Serve v9-final + 7d (fixes/settle-cache/overlay = JS 1b2eecc66011 / CSS e1359ab9994a), prove the served hashes, run
# touch-census.mjs, stop the server. Run inside: node tools/lock.mjs run chrome-measure --shared --weight probe ...
# usage: sh fixes/morph-scroll/t194/run-census.sh <arm> [extra census args]
ARM=${1:-v9}; shift
O=out/t194-census; mkdir -p $O
node tools/serve.mjs --root site-pretty --overlay fixes/settle-cache/overlay --https --vendors=local --port 0 --state $O/serve.json --owner fix-hero-exit-threaded --doing "T-194 layout census (no timing)" > $O/serve.log 2>&1 &
SP=$!
node tools/wait.mjs serve $O/serve.json --pid $SP --owner fix-hero-exit-threaded --reason "census server up" --timeout 60 > $O/wait.log 2>&1 || { echo "server did not start"; kill $SP; exit 4; }
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$O/serve.json','utf8')).port)")
SJ=$(curl -sk "https://127.0.0.1:$PORT/_app/immutable/nodes/2.DyWL8TcE.js" | shasum -a 256 | cut -c1-12)
SC=$(curl -sk "https://127.0.0.1:$PORT/_app/immutable/assets/2.gBuqKVzi.css" | shasum -a 256 | cut -c1-12)
echo "SERVED JS $SJ CSS $SC"
[ "$SJ" = 1b2eecc66011 ] && [ "$SC" = e1359ab9994a ] || { echo "SERVED HASH WRONG"; kill $SP; exit 4; }
node fixes/morph-scroll/t194/touch-census.mjs --url "https://127.0.0.1:$PORT/" --arm "$ARM" --out $O/$ARM.json "$@"
R=$?
node fixes/morph-scroll/t194/touch-census.mjs --url "https://127.0.0.1:$PORT/" --arm "$ARM-wk" --out $O/$ARM-wk.json --webkit-path "$@"
R2=$?
echo "EXIT webkit-path arm $R2"
kill $SP
echo "EXIT $R"

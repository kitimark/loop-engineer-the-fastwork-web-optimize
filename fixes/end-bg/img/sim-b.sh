#!/bin/sh
# PR-025 B cost card, Simulator part (counts only, no time): one functional session, the arms in the order given, each
# one page load + the fs gesture (fixes/morph-scroll/g-fastshort-v1.json: fast short swipes from the top to the page
# bottom) with --count-only and the in-page counter fixes/end-bg/img/img-inject.mjs.
# Builds from immutable read-only snapshots: C out/snapshots/endbg-C-e1359ab9994a (JS 1b2eecc66011), B
# out/snapshots/endbg-B-049b13ced4e3 (JS 049b13ced4e3, checked file by file against fixes/end-bg/img/b-manifest.json).
# Run (shared lane, simulator weight; <= 300 s, two arms per session):
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-bg -- \
#     node tools/sim.mjs session --functional --owner fix-end-bg -- sh fixes/end-bg/img/sim-b.sh K1 C B
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-bg -- \
#     node tools/sim.mjs session --functional --owner fix-end-bg -- sh fixes/end-bg/img/sim-b.sh K2 B C
# Output: out/end-bg/simb/<tag>-<arm>.json (gesture records with run.inject[0].value). Last line "SIMB <tag> DONE" or
# "SIMB <tag> VOID <why>" (exit 4). Nothing here prints a LAN address.
cd "$(dirname "$0")/../../.." || exit 2
TAG=$1; shift; [ -n "$TAG" ] && [ $# -gt 0 ] || { echo "usage: sh fixes/end-bg/img/sim-b.sh <tag> <arm>..."; exit 2; }
O=out/end-bg/simb; mkdir -p $O
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
snap() { case $1 in C) echo out/snapshots/endbg-C-e1359ab9994a ;; B) echo out/snapshots/endbg-B-049b13ced4e3 ;; esac; }
jsPin() { case $1 in C) echo 1b2eecc66011 ;; B) echo 049b13ced4e3 ;; esac; }
for A in "$@"; do [ -n "$(snap $A)" ] || { echo "SIMB $TAG VOID unknown arm $A"; exit 4; }; done
node fixes/end-bg/img/rebuild-b.mjs --check out/snapshots/endbg-B-049b13ced4e3 > $O/$TAG-check.log 2>&1 || { echo "SIMB $TAG VOID B snapshot != manifest ($(tail -1 $O/$TAG-check.log))"; exit 4; }
H=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
PIDS=""
for A in "$@"; do
  rm -f $O/serve-$TAG-$A.json
  node tools/serve.mjs --root "$H/site-pretty" --overlay "$(snap $A)" --port auto --vendors=local --latency 150 --state $O/serve-$TAG-$A.json > $O/serve-$TAG-$A.log 2>&1 &
  PIDS="$PIDS $!"
  node tools/wait.mjs serve $O/serve-$TAG-$A.json --pid $! --timeout 60 --owner fix-end-bg --reason "PR-025 B Simulator server $A" > /dev/null || { kill $PIDS; echo "SIMB $TAG VOID server $A"; exit 4; }
done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$O/serve-$TAG-$1.json','utf8')).port)"; }
h() { curl -s "http://localhost:$(port $1)/$2" | shasum -a 256 | cut -c1-12; }
for A in "$@"; do
  [ "$(h $A $JS)" = "$(jsPin $A)" ] && [ "$(h $A $CSS)" = e1359ab9994a ] || { kill $PIDS; echo "SIMB $TAG VOID served $A JS $(h $A $JS) CSS $(h $A $CSS)"; exit 4; }
done
echo "SERVED ok: $(for A in "$@"; do printf '%s JS %s ' $A "$(jsPin $A)"; done)CSS e1359ab9994a"
node tools/sim.mjs wda start > $O/$TAG-wda.log 2>&1 || { kill $PIDS; echo "SIMB $TAG VOID wda start"; exit 4; }
for A in "$@"; do
  F=$O/$TAG-$A.json; rm -f $F
  node tools/sim.mjs open "http://localhost:$(port $A)/" > $O/$TAG-$A-open.log 2>&1 || { kill $PIDS; echo "SIMB $TAG VOID open $A"; exit 4; }
  node tools/sim.mjs gesture fixes/morph-scroll/g-fastshort-v1.json --count-only --inject fixes/end-bg/img/img-inject.mjs --label "imgb-$TAG-$A" --out $F > $O/$TAG-$A.log 2>&1; r=$?
  echo "RUN $TAG $A exit $r load1 $(sysctl -n vm.loadavg | cut -d' ' -f2) $( [ -s $F ] && echo 'record ok' || echo 'no record')"
done
kill $PIDS 2>/dev/null
echo "SIMB $TAG DONE"

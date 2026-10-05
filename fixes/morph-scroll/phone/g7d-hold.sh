#!/bin/sh
# PR-018 rev 7d phone G check (fix-hero-exit-threaded; counts only, no timing verdict): WDA gestures at the end of the
# page on C = rev 7c (ms-428961bda278, the control) and V = rev 7d candidate (ms-29c0d537e0c9: a close fling at lift-off
# is released when the finger went >= 5 px/ms or >= 300 px). Both arms on base v8, CSS 659b02f7169d. Profile
# xcode-serious: thermal-gate.mjs --accept-induced at the start and the end, no pre-warm. Run by the iphone lease holder
# (RUNNER, default fix-hero-exit-threaded), inside its own exclusive no-timing hold, e.g.
#   node tools/lock.mjs run chrome-measure --owner fix-hero-exit-threaded --no-timing --max-seconds 600 --doing "rev 7d G count check" -- \
#     caffeinate -i -s sh fixes/morph-scroll/phone/g7d-hold.sh H1 foC foV nlV nlC
#   ... H2 fsV fsC e4V e4C
# Items (<script><arm>): fo g-flingout-v1 (560 px / 140 ms closes from open: V should leave the end, C is caught),
#   nl g-nearline-v1 (250 / 280 px closes at ~3.6-4.1 px/ms: both should close), fs g-fastshort-v1 (12 short flicks
#   at the end: no new close or open misses on V), e4 g-momentum-v1 (E1-E4 at the end, E4 = a 200 px close flick).
# Every gesture runs with --inject fixes/morph-scroll/msdbg-inject.mjs (V's touchend log: page Fv and finger travel;
# scroll positions), then Safari is parked. Records: out/morph-scroll/g7d/<H>-<item>.json; counts:
#   node fixes/morph-scroll/sim7d-analyze.mjs out/morph-scroll/g7d
# Nothing here prints the LAN address (Hard rule 12). Last line: "HOLD <H> VALID <s>" or "HOLD <H> VOID <why>".
H=$1; shift
R=${RUNNER:-fix-hero-exit-threaded}
O=out/morph-scroll/g7d
mkdir -p "$O"
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
serve() { # name snapdir|-
  rm -f "$O/serve-$1.json"
  if [ "$2" = - ]; then node tools/serve.mjs --root site-pretty --port 0 --no-cache --vendors=local --quiet --state "$O/serve-$1.json" > /dev/null 2>&1 &
  else node tools/serve.mjs --root site-pretty --overlay "$PWD/out/snapshots/$2" --port 0 --no-cache --vendors=local --quiet --state "$O/serve-$1.json" > /dev/null 2>&1 & fi
  PIDS="$PIDS $!"
  node tools/wait.mjs serve "$O/serve-$1.json" --owner "$R" --timeout 60 --reason "rev 7d phone server $1" > /dev/null || { echo "HOLD $H VOID server $1"; exit 4; }
}
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$O/serve-$1.json','utf8')).port)"; }
url() { node tools/lan.mjs --url --port "$(port "$1")"; }
served() { curl -s "http://127.0.0.1:$(port "$1")/_app/immutable/nodes/2.DyWL8TcE.js" | shasum -a 256 | cut -c1-12; }
serve B -
serve C ms-428961bda278
serve V ms-29c0d537e0c9
[ "$(served C)" = 428961bda278 ] && [ "$(served V)" = 29c0d537e0c9 ] || { echo "HOLD $H VOID served hashes C $(served C) V $(served V)"; exit 4; }
T0=$(date +%s)
echo "HOLD $H start $(date -u +%FT%TZ) items $*"
node tools/iphone.mjs wda check || { echo "HOLD $H VOID wda not ready"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "ms7d-$H-$1" --expect serious --max-c 44 --accept-induced --url "$(url B)"; }
gate start; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; }
# one uncounted warm-up load per arm port (browser caches are per origin, arch-unknowns U5)
for A in C V; do node tools/iphone.mjs open "$(url $A)" --owner "$R" > /dev/null || { echo "HOLD $H VOID warm-up open $A"; exit 4; }; echo "WARMUP $A"; done
for I in "$@"; do
  case $I in
    fo?) S=fixes/morph-scroll/g-flingout-v1.json ;;
    nl?) S=fixes/morph-scroll/g-nearline-v1.json ;;
    fs?) S=fixes/morph-scroll/g-fastshort-v1.json ;;
    e4?) S=fixes/morph-scroll/g-momentum-v1.json ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  A=$(echo "$I" | cut -c3)
  case $A in C|V) ;; *) echo "HOLD $H VOID bad arm in $I"; exit 4 ;; esac
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  node tools/iphone.mjs open "$(url $A)" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  node tools/iphone.mjs gesture "$S" --owner "$R" --label "ms7d-$H-$I" --inject fixes/morph-scroll/msdbg-inject.mjs --out "$O/$H-$I.json" > "$O/$H-$I.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I exit $r $(date -u +%TZ)"
done
gate end; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

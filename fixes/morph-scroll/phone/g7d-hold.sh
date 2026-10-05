#!/bin/sh
# PR-018 rev 7d phone G check (fix-hero-exit-threaded; counts only, no timing verdict): WDA gestures at the end of the
# page on C = rev 7c (ms-428961bda278, the control) and V = rev 7d candidate (ms-29c0d537e0c9: a close fling at lift-off
# is released when the finger went >= 5 px/ms or >= 300 px). Both arms on base v8, CSS 659b02f7169d. Profile
# xcode-serious: thermal-gate.mjs --accept-induced at the start and the end, no pre-warm. Run by the iphone lease holder
# (RUNNER, default fix-hero-exit-threaded), inside its own exclusive no-timing hold, e.g.
#   node tools/lock.mjs run chrome-measure --owner fix-hero-exit-threaded --no-timing --max-seconds 600 --doing "rev 7d G count check" -- \
#     caffeinate -i -s sh fixes/morph-scroll/phone/g7d-hold.sh H1 foC foV nlV nlC
#   ... H2 fsV fsC; H3 e4C e4V (fs's gesture budget is 229 s per run: two fs and two e4 plus re-runs don't fit one hold)
# Items (<script><arm>): fo g-flingout-v1 (560 px / 140 ms closes from open: V should leave the end, C is caught),
#   nl g-nearline-v1 (250 / 280 px closes at ~3.6-4.1 px/ms: both should close), fs g-fastshort-v1 (12 short flicks
#   at the end: no new close or open misses on V), e4 g-momentum-v1 (E1-E4 at the end, E4 = a 200 px close flick).
# Every gesture runs with --inject fixes/morph-scroll/msdbg-inject.mjs (V's touchend log: page Fv and finger travel;
# scroll positions), then Safari is parked. Records: out/morph-scroll/g7d/<H>-<item>.json; counts:
#   node fixes/morph-scroll/sim7d-analyze.mjs out/morph-scroll/g7d
# Nothing here prints the LAN address (Hard rule 12). Per item "ITEM <item> OK|VOID <why>"; a void item (gesture exit
# non-zero, or no record) gets one re-run at the hold end, else it is INSUFFICIENT. Last line: "HOLD <H> VALID <s>"
# (every counted item has a record) or "HOLD <H> VOID <why>" (exit 3 end gate, 4 setup, 5 start gate, 6 failed items).
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
for I in "$@"; do # check every item before any run
  case $I in fo[CV]|nl[CV]|fs[CV]|e4[CV]) ;; *) echo "HOLD $H VOID unknown item $I"; exit 4 ;; esac
done
# one item: <item> <file name>; prints "ITEM <item> OK <file>" or "ITEM <item> VOID <why>", returns 0 / 1.
# An item is VOID when the gesture exits non-zero or leaves no record (ops D4); an earlier record of the same name is
# moved aside first, so the record test sees only this run's file (ops D5, as int-v8's hold.sh in 60a271d7).
item() {
  case $1 in
    fo?) S=fixes/morph-scroll/g-flingout-v1.json ;;
    nl?) S=fixes/morph-scroll/g-nearline-v1.json ;;
    fs?) S=fixes/morph-scroll/g-fastshort-v1.json ;;
    e4?) S=fixes/morph-scroll/g-momentum-v1.json ;;
  esac
  A=$(echo "$1" | cut -c3); F=$O/$2
  if [ -e "$F.json" ]; then
    mv "$F.json" "$F.json.prev-$H-$(date +%s)" || { echo "ITEM $1 VOID cannot move aside $F.json"; return 1; }
    echo "MOVED $2.json aside (an earlier hold's file)"
  fi
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  node tools/iphone.mjs open "$(url $A)" --owner "$R" > /dev/null || { echo "ITEM $1 VOID open $A failed"; return 1; }
  node tools/iphone.mjs gesture "$S" --owner "$R" --label "ms7d-$H-$1" --inject fixes/morph-scroll/msdbg-inject.mjs --out "$F.json" > "$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $1 exit $r $(date -u +%TZ)"
  [ $r -ne 0 ] && { echo "ITEM $1 VOID exit $r (see $F.log)"; return 1; }
  [ -s "$F.json" ] || { echo "ITEM $1 VOID exit 0, no run file"; return 1; }
  echo "ITEM $1 OK $2.json"; return 0
}
VOIDS=""
for I in "$@"; do item "$I" "$H-$I" || VOIDS="$VOIDS $I"; done
# re-run rule (ticket "Validity"): each void item gets ONE re-run at the hold end, same arm, as <H>-<item>-rerun.json;
# a re-run that is void again makes the item INSUFFICIENT (no third try in this block)
FAILED=""
for I in $VOIDS; do echo "RERUN $I (one re-run at the hold end)"; item "$I" "$H-$I-rerun" || FAILED="$FAILED $I"; done
gate end; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ -n "$FAILED" ] && { echo "HOLD $H VOID counted item(s) failed:$FAILED (INSUFFICIENT after one re-run)"; exit 6; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s${VOIDS:+ (re-run:$VOIDS)}"

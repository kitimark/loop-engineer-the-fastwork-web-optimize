#!/bin/sh
# P-145 runner (card: fixes/end-bg/README.md "P-145"): one hold of the P-145 block, end-screen pictures vs title sweeps.
# From p137-hold.sh (P-137's runner, read and run once already) with three arms instead of two; everything else as there:
# wda check, served-hash check, compiled-program pin, start/end thermal gate, stale files moved aside, time guard, Mac
# sleep check.
# Builds (immutable snapshots, served by fixes/end-bg/phone/p145-serve.sh on plain http, --vendors=local --latency 150):
#   C  v9-final + morph-scroll rev 7d                        JS 1b2eecc66011  CSS e1359ab9994a   out/p145/serve-C.json
#   P  C + fixes/end-bg/sim/pictures-off.css (paint only)    JS 1b2eecc66011  CSS a9fd8338d8ed   out/p145/serve-P.json
#   T  C + fixes/end-bg/sim/titles-off.css (paint only)      JS 1b2eecc66011  CSS 8f4d806323a9   out/p145/serve-T.json
#   B  the plain baseline (the thermal gate's timer page)                                         out/p145/serve-B.json
# Every arm's served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Script fs = fixes/morph-scroll/g-fastshort-v1.json, compiled program pinned 8737f212c0ff, E procedure: P-137's.
# Usage: started only by fixes/end-bg/phone/p145-block.sh, inside ONE phone hold with the block mark
# (`lock.mjs run iphone --block P-145 --max-seconds 3600`), each hold its own 600 s chrome-measure --no-timing run:
#   TICKET=P-145 node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-145 <H>" -- \
#     caffeinate -i -s sh fixes/end-bg/phone/p145-hold.sh <H> <items>
# Plan (2 fs runs per 600 s hold, GESTURE_BUDGET_S about 229; counted order a rotated Latin square C P T | P T C | T C P):
#   part 1: H1 WC WP | H2 WT S0 | H3 EC1 EP1 | H4 ET1 EP2 | H5 ET2 EC2
#   part 2: H6 ET3 EC3 | H7 EP3 | H8 <re-runs, max 2> S1
# Items:
#   WC / WP / WT   uncounted warm-up on that arm's port: E procedure, Timeline off, --warmup     -> g-W<A>-<H>.json
#   S0 / S1        sentinel on C: E procedure, Timeline OFF (S0 after the warm-ups, S1 at the block end)  -> g-S0/S1.json
#   E<A><n>        counted run on arm A (C, P, T), n 1-3, Timeline on                            -> g-E<A><n>.json + tl-
#   E<A><n>r       the one re-run of a counted run that failed a run gate, same arm and procedure
# After each counted run the frozen P-129 run gates (research/serious-heat/phone/p129-gates.mjs, role E) print
# "GATES <run> E ok|INVALID <why>"; a failed or record-less counted run goes into "RERUN-NEEDED". S0/S1: "SENTINEL <run>
# PASS|FAIL"; a failing S0 voids the block before any counted run, a failing S1 voids every counted run (exit 8).
# Time guard, P145_GATE (start|end|both|none) and P145_DRY=1 as P137_GATE / P137_DRY in p137-hold.sh.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-145 ] || { echo "TICKET is not P-145: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-145 sh fixes/end-bg/phone/p145-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
O=out/p145/runs; SV=out/p145
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
JS_PIN=1b2eecc66011; C_CSS=e1359ab9994a; P_CSS=a9fd8338d8ed; T_CSS=8f4d806323a9
GM=${P145_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "P145_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/end-bg/phone/p145-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WP|WT|S0|S1|E[CPT][1-3]|E[CPT][1-3]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PP=$(port P) && PT=$(port T) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/end-bg/phone/p145-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $JS_PIN ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PP $JS)" = $JS_PIN ] && [ "$(served $PP $CSS)" = $P_CSS ] && [ "$(served $PT $JS)" = $JS_PIN ] && [ "$(served $PT $CSS)" = $T_CSS ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (P-145) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-145 profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/end-bg/phone/p145-block.sh fixes/end-bg/phone/p145-serve.sh fixes/end-bg/phone/p145-read.mjs fixes/end-bg/phone/p137-read.mjs \
  fixes/end-bg/sim/pictures-off.css fixes/end-bg/sim/titles-off.css \
  $GATES research/serious-heat/p129-read.mjs $FS research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs \
  $SV/snap/C/$JS $SV/snap/C/$CSS $SV/snap/P/$CSS $SV/snap/T/$CSS)"
hashok || { echo "HOLD $H VOID served hashes C $(served $PC $JS)/$(served $PC $CSS), P $(served $PP $JS)/$(served $PP $CSS), T $(served $PT $JS)/$(served $PT $CSS); pinned JS $JS_PIN C $C_CSS P $P_CSS T $T_CSS (no run)"; exit 4; }
echo "SERVED JS $JS_PIN, C $C_CSS, P $P_CSS, T $T_CSS ok"
BE=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in S*) echo C ;; W?|E?*) echo "$1" | cut -c2 ;; esac; }
if [ "$P145_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && PU=$(node tools/lan.mjs --url --port "$PP") && TU=$(node tools/lan.mjs --url --port "$PT") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p145-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (P145_GATE=$GM)" ;; esac
RERUN=""; SFAIL=""
for I in "$@"; do
  if late "$sE"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $sE + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  case $I in
    W*) F=g-$I-$H; EX="--warmup"; TL="" ;;
    S[01]) F=g-$I; EX=""; TL="" ;;
    E*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
  esac
  case $(arm $I) in P) U=$PU ;; T) U=$TU ;; *) U=$CU ;; esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p145-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I arm $(arm $I) exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W*) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted warm-up; the hold goes on)" ;;
    S[01]) node $GATES $O $I; s=$?
      [ $s -ne 0 ] && { SFAIL="$SFAIL $I"; [ $I = S0 ] && { echo "HOLD $H VOID SENTINEL S0 FAIL: the block is void before any counted run"; exit 8; }; } ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (P145_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last hold, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

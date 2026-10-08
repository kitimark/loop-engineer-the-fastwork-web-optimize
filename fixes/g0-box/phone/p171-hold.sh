#!/bin/sh
# P-171 (lead 2026-10-09, candidate 1 D signed NAMED): a copy of the eop kit with C = g0.0h (JS 9162843e750f, CSS 26d28a0a263b,
# from out/g0box/p168/f-B2) and V = ws3 (JS f4b28aaebb75, CSS 26d28a0a263b, from out/g0box/eop10/ws3; plus its analytics.js 7ed47cc67fee), snapshot out/g0box/snap6,
# logs out/p171p, labels p171-; no K arm (p171-k.env empty). Everything else is the eop kit's (below, the copied header).
# end-of-page (eop, lead 2026-10-09, user T-228 #98): a copy of the P-164 g0b kit with its own log dir (out/p171p), labels
# eop-, items up to n = 6, and a third arm K (a candidate) pinned in fixes/g0-box/phone/p171-k.env (K_NAME, K_DIR =
# an immutable snapshot dir with K/<JS>, K/<CSS> and HASHES.txt, K_JS, K_CSS, K_HASHES; K_NAME empty = no K arm).
# Same G program (g-fastshort-g0.json, 38d7fe5d7fa8), the same gates (p129-gates-g0.mjs), Timeline on in counted runs.
# Header below is the g0b kit's.
# g0-box phone kit (card: fixes/g0-box/README.md "Phone card draft"): one hold of the block. A copy of fix-g0-box's P-163 kit
# (research/end-of-page-fresh/phone/, credit: fix-g0-box, arch-compositor-morph, fix-end-morph) with these pins:
#   C = g0.0e (g0.0c + join-fade + logo-close, fixes/g0-0e, 8bc50d29) JS 9162843e750f  CSS 26d28a0a263b
#   V = g0.0f = g0.0e + v3-W (fixes/v3w-g00e/patch.diff)             JS d0f48dc4f82e  CSS 26d28a0a263b
# snapshot out/g0box/snap5 (C from out/g0box/g00e, V from out/g0box/g00f, read-only), logs out/g0bp, owner fix-g0-box.
# The P-161..P-163 lessons are kept unchanged (tool-serious via iphone.mjs rearm, Safari parked before the rearm, thermal
# clear after the hold, the get-ready step on preflight AUTH or "Failed to initialize for UI testing", the --block mark).
# Original header of the copied file:
# end-of-page-fresh phone runner (card: research/end-of-page-fresh/README.md §8): one hold of the D1b vs v14 block. A copy
# of arch-compositor-morph's fixes/compositor-morph/phone-c3bk6/cm-hold.sh (credit: arch-compositor-morph, fix-end-morph),
# with C = v14 (JS d23ee885d54f / CSS 4fafb83f1e72), V = D1b, bar mode v14 (JS 30ff7c0d1ad5 / CSS 2ab0464e540a) and no probe page or
# attribution items (A*). Original header:
# compositor-morph phone runner (card: fixes/compositor-morph/README.md "Phone card"): one hold of the block. A copy of
# fix-end-morph's fixes/end-morph-f12/phone/p155-hold.sh (credit: fix-end-morph; P-152 rev 1.4 lineage) with two arms
# (C, V), the probe page's attribution items, and the ticket id in $CM_TICKET.
# Builds (immutable snapshot out/g0box/snap6, served by fixes/g0-box/phone/g0b-serve.sh, plain http, --latency 150):
#   C  v9-final rev 7d (int-v11)    JS 1b2eecc66011  CSS e1359ab9994a   out/g0bp/serve-C.json
#   V  c3b-a + K6 (pre, WebKit only)    JS d23ee885d54f  CSS 4fafb83f1e72   out/g0bp/serve-V.json
#   B  the plain baseline (the thermal gate's timer page)               out/g0bp/serve-B.json
#   P  the probe page (out/cm/probe; ?v=none|sda|raf)                    out/g0bp/serve-P.json
# Script fs = fixes/g0-box/phone/g-fastshort-g0.json (P-164: g-fastshort-v1, the E procedure of P-152/P-155, made to run on g0
# builds: optional atEnd, approach capped at 12, re-approach at 2; compiled program 38d7fe5d7fa8; v1 8737f212c0ff aborts on g0);
# probe script pr = fixes/compositor-morph/phone/g-probe-v1.json (compiled program pinned at the dry run, $PROG_PR).
# Items:
#   WC / WV        uncounted warm-up on C's / V's port: E procedure, Timeline off, --warmup     -> g-W<a>-<H>.json
#   S1             end sentinel on C: E procedure, Timeline off                                  -> g-S1.json
#   E<a><n>        counted run on arm a (C, V), n 1-4, Timeline on                              -> g-E<a><n>.json + tl-E<a><n>.json
#   E<a><n>r       the one re-run of a counted run that failed a run gate
#   A<v>           attribution run on the probe page, v = N (none), S (sda), R (raf), Timeline on, uncounted
#                                                                                                -> g-A<v>.json + tl-A<v>.json
# After each counted run P-129's run gates (research/serious-heat/phone/p129-gates.mjs, role E) print "GATES <run> E ok|INVALID".
# S1: "SENTINEL S1 PASS|FAIL"; a failing S1 voids every counted run (exit 8). Time guard as P-155 (exit 7).
# CM_GATE=start|end|both|none (default both). CM_DRY=1: pins, compiled programs, served hashes and the plan only.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>". Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set (the signed ticket id): no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-NNN sh fixes/g0-box/phone/p171-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-fix-g0-box}
O=out/p171p/runs; SV=out/p171p
[ -f fixes/g0-box/phone/p171-k.env ] && . fixes/g0-box/phone/p171-k.env
FS=fixes/g0-box/phone/g-fastshort-g0.json; PROG_FS=38d7fe5d7fa8
PR=fixes/compositor-morph/phone/g-probe-v1.json; PROG_PR=${CM_PROG_PR:-7ff27a2413c8}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=9162843e750f; V_JS=f4b28aaebb75; C_CSS=26d28a0a263b; V_CSS=26d28a0a263b
C_AN=a2ceb9775ea7; V_AN=7ed47cc67fee   # served /analytics.js (ws3 arms its wheel listener there; p171-serve.sh pins the same)
GM=${CM_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "CM_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/g0-box/phone/p171-hold.sh; GATES=fixes/g0-box/phone/p129-gates-g0.mjs   # P-164 lead ruling: the g0 copy (FS_HASH 38d7fe5d7fa8)
mkdir -p $O
for I in "$@"; do case $I in WC|WV|S1|E[CV][1-6]|E[CV][1-6]r) ;; WK|EK[1-6]|EK[1-6]r) [ -n "$K_NAME" ] || { echo "HOLD $H VOID item $I needs a K arm (eop-k.env K_NAME empty) (no run)"; exit 4; } ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/g0-box/phone/p171-serve.sh first) (no run)"; exit 4; }
PK=""; [ -n "$K_NAME" ] && { PK=$(port K) || { echo "HOLD $H VOID no K server state (no run)"; exit 4; }; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PV $JS)" = $V_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PV $CSS)" = $V_CSS ] \
  && [ "$(served $PC analytics.js)" = $C_AN ] && [ "$(served $PV analytics.js)" = $V_AN ] \
  && { [ -z "$K_NAME" ] || { [ "$(served $PK $JS)" = "$K_JS" ] && [ "$(served $PK $CSS)" = "$K_CSS" ]; }; }; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H $CM_TICKET profile ${CM_PROFILE:-xcode-serious} checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/g0-box/phone/p171-block.sh fixes/g0-box/phone/p171-serve.sh fixes/g0-box/phone/p171-k.env fixes/compositor-morph/phone/cm-read.mjs \
  $GATES fixes/g0-box/phone/p129-read-g0.mjs $FS $PR research/phone-thermal-gate/thermal-gate.mjs \
  fixes/rest-script/tools/pmcheck.mjs out/g0box/snap6/C/$JS out/g0box/snap6/V/$JS out/g0box/snap6/C/$CSS out/g0box/snap6/V/$CSS out/g0box/snap6/V/analytics.js)"
hashok || { echo "HOLD $H VOID served hashes C $(served $PC $JS)/$(served $PC $CSS) V $(served $PV $JS)/$(served $PV $CSS); pinned C $C_JS/$C_CSS V $V_JS/$V_CSS (no run)"; exit 4; }
echo "SERVED C $C_JS/$C_CSS/$C_AN ok, V $V_JS/$V_CSS/$V_AN ok${K_NAME:+, K ($K_NAME) $K_JS/$K_CSS ok}"
budget() { # script pinned-hash -> prints the budget; exit 4 on a hash mismatch
  B=$(node tools/iphone.mjs gesture $1 --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
  h=$(echo "$B" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); s=$(echo "$B" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
  [ "$h" = "$2" ] && [ -n "$s" ] || { echo "HOLD $H VOID compiled program $1 ${h:-none} (pinned $2), budget ${s:-none} (no run)" >&2; return 4; }
  echo $s
}
sE=$(budget $FS $PROG_FS) || exit 4; echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
sP=$(budget $PR $PROG_PR) || exit 4; echo "PROG pr $PROG_PR ok, GESTURE_BUDGET_S $sP"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WV|EV*) echo V ;; WK|EK*) echo K ;; A*) echo P ;; *) echo C ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json (budget $sE s)" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json (budget $sE s)" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json (budget $sE s)" ;; A*) echo "PLAN $I attribution on the probe page (v $I) Timeline-on g-$I.json tl-$I.json (budget $sP s)" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && VU=$(node tools/lan.mjs --url --port "$PV") && { [ -z "$PK" ] || KU=$(node tools/lan.mjs --url --port "$PK"); } || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p171-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (CM_GATE=$GM)" ;; esac
RERUN=""; SFAIL=""
for I in "$@"; do
  case $I in A*) bI=$sP ;; *) bI=$sE ;; esac
  if late "$bI"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $bI + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  SC=$FS
  case $I in
    W*) F=g-$I-$H; EX="--warmup"; TL="" ;;
    S1) F=g-$I; EX=""; TL="" ;;
    E*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
    A*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json"; SC=$PR ;;
  esac
  case $I in AN) U="${PU}index.html?v=none" ;; AS) U="${PU}index.html?v=sda" ;; AR) U="${PU}index.html?v=raf" ;; *) case $(arm $I) in V) U=$VU ;; K) U=$KU ;; *) U=$CU ;; esac ;; esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $SC $EX $TL --owner "$R" --label "p171-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I arm $(arm $I) exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W*|A*) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted; the hold goes on)" ;;
    S1) node $GATES $O $I; s=$?; [ $s -ne 0 ] && SFAIL="$SFAIL $I" ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (CM_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

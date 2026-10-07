#!/bin/sh
# compositor-morph phone runner (card: fixes/compositor-morph/README.md "Phone card"): one hold of the block. A copy of
# fix-end-morph's fixes/end-morph-f12/phone/p155-hold.sh (credit: fix-end-morph; P-152 rev 1.4 lineage) with two arms
# (C, V), the probe page's attribution items, and the ticket id in $CM_TICKET.
# Builds (immutable snapshot out/cm/snap11, served by fixes/compositor-morph/phone-v11/cm-serve.sh, plain http, --latency 150):
#   C  v9-final rev 7d (int-v11)    JS 1b2eecc66011  CSS e1359ab9994a   out/cmp11/serve-C.json
#   V  v11 (Vc + V13 + H1c)         JS 9b4a829d15a0  CSS 62743920fe1a   out/cmp11/serve-V.json
#   B  the plain baseline (the thermal gate's timer page)               out/cmp11/serve-B.json
#   P  the probe page (out/cm/probe; ?v=none|sda|raf)                    out/cmp11/serve-P.json
# Script fs = fixes/morph-scroll/g-fastshort-v1.json (the E procedure of P-152/P-155, compiled program 8737f212c0ff);
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
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-NNN sh fixes/compositor-morph/phone-v11/cm-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-arch-compositor-morph}
O=out/cmp11/runs; SV=out/cmp11
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
PR=fixes/compositor-morph/phone/g-probe-v1.json; PROG_PR=${CM_PROG_PR:-7ff27a2413c8}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=1b2eecc66011; V_JS=9b4a829d15a0; C_CSS=e1359ab9994a; V_CSS=62743920fe1a
GM=${CM_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "CM_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/compositor-morph/phone-v11/cm-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WV|S1|E[CV][1-4]|E[CV][1-4]r|A[NSR]) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) && PB=$(port B) && PP=$(port P) || { echo "HOLD $H VOID no server state in $SV (start fixes/compositor-morph/phone-v11/cm-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PV $JS)" = $V_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PV $CSS)" = $V_CSS ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H $CM_TICKET profile ${CM_PROFILE:-xcode-serious} checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/compositor-morph/phone-v11/cm-block.sh fixes/compositor-morph/phone-v11/cm-serve.sh fixes/compositor-morph/phone/cm-read.mjs \
  $GATES research/serious-heat/p129-read.mjs $FS $PR research/phone-thermal-gate/thermal-gate.mjs \
  fixes/rest-script/tools/pmcheck.mjs out/cm/snap11/C/$JS out/cm/snap11/V/$JS out/cm/snap11/C/$CSS out/cm/snap11/V/$CSS)"
hashok || { echo "HOLD $H VOID served hashes C $(served $PC $JS)/$(served $PC $CSS) V $(served $PV $JS)/$(served $PV $CSS); pinned C $C_JS/$C_CSS V $V_JS/$V_CSS (no run)"; exit 4; }
echo "SERVED C $C_JS/$C_CSS ok, V $V_JS/$V_CSS ok"
budget() { # script pinned-hash -> prints the budget; exit 4 on a hash mismatch
  B=$(node tools/iphone.mjs gesture $1 --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
  h=$(echo "$B" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); s=$(echo "$B" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
  [ "$h" = "$2" ] && [ -n "$s" ] || { echo "HOLD $H VOID compiled program $1 ${h:-none} (pinned $2), budget ${s:-none} (no run)" >&2; return 4; }
  echo $s
}
sE=$(budget $FS $PROG_FS) || exit 4; echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
sP=$(budget $PR $PROG_PR) || exit 4; echo "PROG pr $PROG_PR ok, GESTURE_BUDGET_S $sP"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WV|EV*) echo V ;; A*) echo P ;; *) echo C ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json (budget $sE s)" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json (budget $sE s)" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json (budget $sE s)" ;; A*) echo "PLAN $I attribution on the probe page (v $I) Timeline-on g-$I.json tl-$I.json (budget $sP s)" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && VU=$(node tools/lan.mjs --url --port "$PV") && PU=$(node tools/lan.mjs --url --port "$PP") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "cm-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
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
  case $I in AN) U="${PU}index.html?v=none" ;; AS) U="${PU}index.html?v=sda" ;; AR) U="${PU}index.html?v=raf" ;; *) case $(arm $I) in V) U=$VU ;; *) U=$CU ;; esac ;; esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $SC $EX $TL --owner "$R" --label "cm-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
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

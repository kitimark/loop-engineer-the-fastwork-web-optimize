#!/bin/sh
# g0.0l phone kit (card: fixes/g0-0l/README.md "Phone check card"; fix-scrollcb-g0, 2026-10-09): one hold of the block.
# A copy of fix-cm-return's P-173 kit (fixes/g0-0k/phone/g0k-hold.sh; lineage fix-scrollcb-g0's P-172 kit, fix-menu-layers,
# fix-g0-box, fix-end-morph, arch-compositor-morph) with these changes:
#   pins  C = g0.0k (best on main, fixes/g0-0k)                        JS e0b7b1e7e158  CSS a9d4fa8992d9
#         V = g0.0l = g0.0k + people-blink--b2 (fixes/g0-0l)          JS ac48233916ad  CSS 440582cec781
#   snapshot out/g0-0l/snap (fixes/g0-0l/phone/g0l-snap.sh, HASHES.txt 7391321242fa), logs out/g0lp, owner fix-scrollcb-g0
#   programs (instead of fs): FLICK fixes/g0-0l/phone/g-flick-g0l.json (22b636f36a82) and APPROACH g-approach-g0l.json
#   (65f6de58009c); gates fixes/g0-0l/phone/g0l-gates.mjs (P-129's G1-G6, G6 accepts these two programs); no probe page
#   items (A*), no K arm.
# Items (one per hold):
#   WC / WV   uncounted warm-up on C's / V's port: FLICK (with pb-lite) then APPROACH, Timeline off, --warmup
#                                                                  -> g-W<a>-<H>f.json, g-W<a>-<H>a.json
#   S0 / S1   start / end sentinel on C: APPROACH, Timeline off, no logger (P-129's rule: moving fps >= 50, slow <= 6 %)
#                                                                  -> g-S<n>.json
#   E<a><n>   counted on arm a (C, V), n 1-4: FLICK with --inject pb-lite.mjs and Timeline, then APPROACH with Timeline
#                                                                  -> g-E<a><n>f.json tl-E<a><n>f.json g-E<a><n>a.json tl-E<a><n>a.json
#   E<a><n>r  the one re-run of a counted item that failed a run gate (both records again)
# Thermal gates, the time guard (exit 7), pmcheck and the profile handling are the P-173 kit's, unchanged.
# CM_GATE=start|end|both|none (default both). CM_DRY=1: pins, compiled programs, served hashes and the plan only.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>". Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set (the signed ticket id): no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-NNN sh fixes/g0-0l/phone/g0l-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-fix-scrollcb-g0}
O=out/g0lp/runs; SV=out/g0lp; SNAP=out/g0-0l/snap
FL=fixes/g0-0l/phone/g-flick-g0l.json; PROG_FL=22b636f36a82
AP=fixes/g0-0l/phone/g-approach-g0l.json; PROG_AP=65f6de58009c
LOGGER=fixes/g0-0l/phone/pb-lite.mjs
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=e0b7b1e7e158; V_JS=ac48233916ad; C_CSS=a9d4fa8992d9; V_CSS=440582cec781
GM=${CM_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "CM_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/g0-0l/phone/g0l-hold.sh; GATES=fixes/g0-0l/phone/g0l-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WV|S0|S1|E[CV][1-6]|E[CV][1-6]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/g0-0l/phone/g0l-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PV $JS)" = $V_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PV $CSS)" = $V_CSS ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H $CM_TICKET profile ${CM_PROFILE:-xcode-serious} checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/g0-0l/phone/g0l-block.sh fixes/g0-0l/phone/g0l-serve.sh fixes/g0-0l/phone/g0l-read.mjs \
  $GATES fixes/g0-0l/phone/g0l-read-gates.mjs $FL $AP $LOGGER research/phone-thermal-gate/thermal-gate.mjs \
  fixes/rest-script/tools/pmcheck.mjs $SNAP/C/$JS $SNAP/V/$JS $SNAP/C/$CSS $SNAP/V/$CSS)"
hashok || { echo "HOLD $H VOID served hashes C $(served $PC $JS)/$(served $PC $CSS) V $(served $PV $JS)/$(served $PV $CSS); pinned C $C_JS/$C_CSS V $V_JS/$V_CSS (no run)"; exit 4; }
echo "SERVED C $C_JS/$C_CSS ok, V $V_JS/$V_CSS ok"
budget() { # script pinned-hash -> prints the budget; exit 4 on a hash mismatch
  B=$(node tools/iphone.mjs gesture $1 --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
  h=$(echo "$B" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); s=$(echo "$B" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
  [ "$h" = "$2" ] && [ -n "$s" ] || { echo "HOLD $H VOID compiled program $1 ${h:-none} (pinned $2), budget ${s:-none} (no run)" >&2; return 4; }
  echo $s
}
sF=$(budget $FL $PROG_FL) || exit 4; echo "PROG flick $PROG_FL ok, GESTURE_BUDGET_S $sF"
sA=$(budget $AP $PROG_AP) || exit 4; echo "PROG approach $PROG_AP ok, GESTURE_BUDGET_S $sA"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WV|EV*) echo V ;; *) echo C ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $I in
    W*) echo "PLAN $I warm-up on $(arm $I): FLICK (pb-lite) + APPROACH, Timeline off, --warmup g-$I-${H}f.json g-$I-${H}a.json (budget $sF + $sA s)" ;;
    S*) echo "PLAN $I sentinel on C: APPROACH, Timeline off g-$I.json (budget $sA s)" ;;
    E*) echo "PLAN $I counted on $(arm $I): FLICK (pb-lite) Timeline-on g-${I}f.json tl-${I}f.json, APPROACH Timeline-on g-${I}a.json tl-${I}a.json (budget $sF + $sA s)" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && VU=$(node tools/lan.mjs --url --port "$PV") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "g0l-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (CM_GATE=$GM)" ;; esac
RERUN=""; SFAIL=""
one() { # <item> <part f|a|s> -> runs one gesture record; prints RUN; returns the gesture exit code
  I=$1; P=$2
  case $P in f) SC=$FL; bI=$sF ;; *) SC=$AP; bI=$sA ;; esac
  if late "$bI"; then echo "HOLD $H VOID time: $I$P would start at $(( $(date +%s) - T0 )) s (+ $bI + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I$P"; exit 4; }
  case $I in
    W*) F=g-$I-$H$P; EX="--warmup"; TL="" ;;
    S0|S1) F=g-$I; EX=""; TL="" ;;
    E*) F=g-$I$P; EX=""; TL="--timeline $O/tl-$I$P.json" ;;
  esac
  [ $P = f ] && EX="$EX --inject $LOGGER"
  case $(arm $I) in V) U=$VU ;; *) U=$CU ;; esac
  for f in "$O/$F.json" "$O/tl-$I$P.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I$P"; exit 4; }
  node tools/iphone.mjs gesture $SC $EX $TL --owner "$R" --label "g0l-$H-$I$P" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I$P arm $(arm $I) exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  return $r
}
for I in "$@"; do
  case $I in
    W*) one $I f; r=$?; [ $r -ne 0 ] && echo "ITEM ${I}f exit $r (uncounted; the hold goes on)"
        one $I a; r=$?; [ $r -ne 0 ] && echo "ITEM ${I}a exit $r (uncounted; the hold goes on)" ;;
    S0|S1) one $I s; node $GATES $O $I; s=$?; [ $s -ne 0 ] && SFAIL="$SFAIL $I" ;;
    *) one $I f; rf=$?; one $I a; ra=$?
       if [ $rf -ne 0 ] || [ $ra -ne 0 ] || [ ! -s "$O/g-${I}f.json" ] || [ ! -s "$O/g-${I}a.json" ]; then echo "ITEM $I VOID exit f $rf a $ra"; RERUN="$RERUN $I"
       else node $GATES $O ${I}f ${I}a || RERUN="$RERUN $I"; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (CM_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

#!/bin/sh
# P-165 phone kit (card: fixes/g0-box/README.md "P-165", signed c31626f2): ONE hold of the real-heat block (profile
# real-serious). A copy of g0b-hold.sh (P-164; credit: fix-g0-box, arch-compositor-morph, fix-end-morph) with the heat
# pre-warm of P-116's fixes/v8-best/phone/p116/hold.sh (credit: iphone-runner, int-v8) and these changes:
#   - real heat only: the gate runs WITHOUT --accept-induced (PASS = Serious, Is Induced = No, battery < 44 C, not
#     Critical); nothing here sets a thermal condition (no thermal.mjs set, no iphone.mjs rearm, no Xcode step);
#   - every phone run passes --profile real-serious (I-246, main 8f2d9e8c);
#   - S items (iphone.mjs run --driver scroll --probe std) beside the G items; more than one item per hold;
#   - the G program is g-fastshort-g0b (compiled 31fc66329daf) and the run gates are p129-gates-g0b.mjs (FS_HASH 31fc66329daf).
# Arms (served by fixes/g0-box/phone/p165-serve.sh, out/p165/serve-{B,C,V}.json):
#   B  the plain baseline: pre-warm page and the gate's timer page           JS 4606120cf392  CSS 27776f3d4138
#   C  v0, the original page (the plain baseline on its own port)           JS 4606120cf392  CSS 27776f3d4138
#   V  g0.0f (out/g0box/snap4/V)                                            JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# Items (S: Timeline off; G: Timeline on in counted runs):
#   wC / wV          S warm-up on that arm's port (--warmup, uncounted)                       -> s-w<a>-<H>.json
#   C<n> / V<n>      S counted run n (a counted C run is a heat sentinel, iphone-run's default)  -> s-<a><n>.json
#   C<n>x / V<n>x    the TAIL's one re-run of a sentinel-voided or failed S run               -> s-<item>.json
#   sC               S heat sentinel on C (--arm C --heat-sentinel, uncounted, never --warmup) -> s-sC-<H>.json
#   WC / WV          G warm-up on that arm's port (--warmup)                                  -> g-W<a>-<H>.json
#   EC<n> / EV<n>    G counted run n, Timeline on                                             -> g-E<a><n>.json + tl-E<a><n>.json
#   E<a><n>r / E<a><n>x   the TAIL's one re-run (r: a run gate or error; x: voided by a failing sentinel)
#   PW               a heat hold: pre-warm runs on B back to back, the gate after every 3rd, until the gate passes
# Steps: served hashes; WDA check; the START GATE. Too cool (exit 2): up to 2 pre-warm runs on B (iphone.mjs run
# --driver scroll --probe std --profile real-serious --warmup), the gate after each; still too cool: VOID TOOCOOL
# (exit 5, no counted run; the block runs a PW hold, then this hold again). Ceiling (exit 3): VOID CEILING (exit 6).
# Induced (exit 4): VOID INDUCED (exit 9, the block stops). Then the items in order (time guard: an item starts only while
# elapsed + its budget + 30 <= 600 s, else VOID exit 7, the block runs the hold once more), the END GATE and the I-098
# sleep check (pmcheck.mjs). Lines the block and the readers use:
#   RUN <item> arm <a> exit <r> ...            (g0b-read.mjs / p153 holdStatus: every run of a VALID hold)
#   SENTINEL <item> PASS|FAIL batt <C> ...     (every counted C S run and every sC)
#   GATES <item> E ok|INVALID ...              (P-129 run gates, g0b copy, on every counted G run)
#   RERUN-NEEDED <items>                       (counted runs that errored or failed a run gate)
#   HOLD <H> VALID <s> s [SENTINEL-FAIL <items>]   exit 0, or exit 8 when a sentinel failed (the hold is still VALID;
#                                              the sentinel chain voids runs in the scorer, the block cools and re-runs)
#   HOLD <H> VOID <why>                        exit 3 (end gate / sleep), 4 (setup), 5 TOOCOOL, 6 CEILING, 7 time, 9 INDUCED
# CM_DRY=1: pins, compiled program, served hashes and the plan only ("HOLD <H> DRY ok"). Nothing here prints the LAN
# address (Hard rule 12).
#   CM_TICKET=P-165 sh fixes/g0-box/phone/p165-hold.sh <H> <item> ...
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set (the signed ticket id): no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-165 sh fixes/g0-box/phone/p165-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-fix-g0-box}
SV=out/p165; O=out/p165/runs
FS=fixes/g0-box/phone/g-fastshort-g0b.json; PROG_FS=31fc66329daf
PROF="--profile real-serious"
GATES=fixes/g0-box/phone/p129-gates-g0b.mjs
SELF=fixes/g0-box/phone/p165-hold.sh
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
B_JS=4606120cf392; B_CSS=27776f3d4138; C_JS=4606120cf392; C_CSS=27776f3d4138; V_JS=30fd80ccbb3f; V_CSS=1d1e5d62a2c4
BUDGET_S=100; BUDGET_PW=130
mkdir -p $O
for I in "$@"; do case $I in wC|wV|[CV][1-8]|[CV][1-8]x|sC|WC|WV|E[CV][1-4]|E[CV][1-4][rx]|PW) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PB=$(port B) && PC=$(port C) && PV=$(port V) || { echo "HOLD $H VOID no server state in $SV (start p165-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PB $JS)" = $B_JS ] && [ "$(served $PB $CSS)" = $B_CSS ] && [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PV $JS)" = $V_JS ] && [ "$(served $PV $CSS)" = $V_CSS ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* profile real-serious"
echo "PIN $H $CM_TICKET profile real-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/g0-box/phone/p165-block.sh fixes/g0-box/phone/p165-serve.sh fixes/g0-box/phone/p165-run.sh fixes/g0-box/phone/p165-score.mjs \
  fixes/g0-box/phone/g0b-read.mjs $GATES fixes/g0-box/phone/p129-read-g0b.mjs $FS research/phone-thermal-gate/thermal-gate.mjs \
  fixes/rest-script/tools/pmcheck.mjs out/g0box/snap4/V/$JS out/g0box/snap4/V/$CSS)"
hashok || { echo "HOLD $H VOID served hashes B $(served $PB $JS)/$(served $PB $CSS) C $(served $PC $JS)/$(served $PC $CSS) V $(served $PV $JS)/$(served $PV $CSS) (no run)"; exit 4; }
echo "SERVED B $B_JS/$B_CSS ok, C $C_JS/$C_CSS ok, V $V_JS/$V_CSS ok"
B=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
h=$(echo "$B" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$B" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$h" = "$PROG_FS" ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program $FS ${h:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
arm() { case $1 in wV|V*|WV|EV*) echo V ;; PW) echo B ;; *) echo C ;; esac; }
kind() { case $1 in wC|wV|[CV][1-8]|[CV][1-8]x|sC) echo S ;; PW) echo P ;; *) echo G ;; esac; }
desc() { case $1 in w?) echo "warm-up (--warmup)" ;; sC) echo "heat sentinel, uncounted" ;; C*) echo "counted, heat sentinel" ;; [V]*) echo "counted" ;; W?) echo "warm-up (--warmup), Timeline off" ;; E*) echo "counted, Timeline on" ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $(kind $I) in
    S) echo "PLAN $I S on $(arm $I) $(desc $I) $PROF (budget $BUDGET_S s)" ;;
    G) echo "PLAN $I G on $(arm $I) $(desc $I) $PROF (budget $sE s)" ;;
    P) echo "PLAN $I heat hold: pre-warm S runs on B (--warmup $PROF), the gate after every 3rd run, until the gate passes or the hold runs out of time" ;; esac; done
  echo "PLAN gates thermal-gate.mjs --expect serious --max-c 44 (no --accept-induced) at the start and the end; run gates $GATES"
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && VU=$(node tools/lan.mjs --url --port "$PV") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate1() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p165-$H-$1" --expect serious --max-c 44 --url "$BU"; }
# P-165 H1 06:34Z: a second Safari page (I-037) made the gate's open fail (exit 1, no read). Lead 06:4xZ: park before
# every gate; a gate with no read gets one retry after a safari-restart, then the hold is VOID GATEERR (exit 4: the
# block stops after its preflight check, which posts a close-tabs step when Safari has several pages)
gate() {
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  gate1 "$1"; gr=$?
  if [ $gr -eq 1 ]; then echo "GATE $1 no read (exit 1): safari-restart, then once more"
    node tools/iphone.mjs safari-restart --owner "$R" --url "$BU" --timeout 60 > "$O/$H-gate-restart.log" 2>&1
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    gate1 "$1"; gr=$?; fi
  return $gr
}
NPW=0
prewarm() {
  NPW=$((NPW + 1))
  node tools/iphone.mjs open "$BU" --owner "$R" > /dev/null || { echo "HOLD $H VOID open B failed (pre-warm)"; exit 4; }
  node tools/iphone.mjs run --driver scroll --probe std $PROF --warmup --owner "$R" --block "$CM_TICKET" --label "p165-$H-pw$NPW" --out "$O/pw-$H-$NPW.json" > "$O/pw-$H-$NPW.log" 2>&1
  echo "PREWARM $NPW exit $? $(date -u +%TZ) $(grep -m1 -E 'batt|temperature' "$O/pw-$H-$NPW.log" | cut -c1-80)"
}
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
# the start gate, with the heat pre-warm
# a heat hold (PW, lead 06:4xZ): pre-warm runs back to back, the gate after every 3rd run (and before the hold runs out
# of time); an item hold: at most 2 pre-warm runs, the gate after each
case " $* " in *" PW "*) PWMAX=12; PWEVERY=3 ;; *) PWMAX=2; PWEVERY=1 ;; esac
gate start; g=$?
while [ $g -eq 2 ] && [ $NPW -lt $PWMAX ] && ! late $BUDGET_PW; do
  prewarm
  if [ $((NPW % PWEVERY)) -eq 0 ] || [ $NPW -ge $PWMAX ] || late $BUDGET_PW; then gate start; g=$?; fi
done
case $g in
  0) echo "START GATE PASS after $NPW pre-warm run(s)" ;;
  2) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate too cool after $NPW pre-warm run(s) (TOOCOOL)"; exit 5 ;;
  3) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate ceiling (CEILING: Critical or battery >= 44 C)"; exit 6 ;;
  4) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate: Serious is induced (INDUCED): stop the block"; exit 9 ;;
  1) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate: no read twice (GATEERR)"; exit 4 ;;
  *) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate exit $g (no run)"; exit 5 ;;
esac
RERUN=""; SFAIL=""
for I in "$@"; do
  [ "$I" = PW ] && continue
  case $(kind $I) in G) bI=$sE ;; *) bI=$BUDGET_S ;; esac
  if late "$bI"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $bI + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  A=$(arm $I); case $A in V) U=$VU ;; *) U=$CU ;; esac
  case $I in
    w?) F=s-$I-$H; EX="--warmup" ;;
    sC) F=s-sC-$H; EX="--arm C --heat-sentinel --run sC-$H" ;;
    [CV]*) F=s-$I; EX="--arm $A --run $I" ;;
    W?) F=g-$I-$H; EX="--warmup"; TL="" ;;
    E*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
  esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    case $I in E*) ;; *) [ "$f" = "$O/tl-$I.json" ] && continue ;; esac
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  if [ "$(kind $I)" = S ]; then
    node tools/iphone.mjs run --driver scroll --probe std $PROF $EX --owner "$R" --block "$CM_TICKET" --label "p165-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  else
    node tools/iphone.mjs gesture $FS $PROF $EX $TL --owner "$R" --label "p165-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  fi
  # exit 8: the run's own profile read refused (the phone left real Serious, or hit the ceiling, between the gate and
  # the run): no data; the hold is VOID as too cool and runs again after a heat hold (a ceiling then shows at its gate)
  if [ $r -eq 8 ]; then node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    echo "HOLD $H VOID profile misfit at $I ($(grep -m1 -E 'PROFILE|refus' "$O/$F.log" | cut -c1-100)) (TOOCOOL)"; exit 5; fi
  echo "RUN $I arm $A exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    w?|W?) [ $r -ne 0 ] && echo "ITEM $I exit $r (warm-up, uncounted; the hold goes on)" ;;
    sC|C*)
      if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "SENTINEL $I FAIL no record (exit $r)"; SFAIL="$SFAIL $I"; case $I in C*) RERUN="$RERUN $I" ;; esac
      else
        sl=$(node -e "const j=JSON.parse(require('fs').readFileSync('$O/$F.json','utf8'));const m=j.meta||{},s=m.sentinel||{};const b=m.battery||{};const t=(b.end&&b.end.temperatureC)??(b.start&&b.start.temperatureC)??null;console.log((s.pass===true?'PASS':'FAIL')+' batt '+t+' C '+JSON.stringify({criterion:s.criterion,value:s.value})+(m.error?' error':''))")
        echo "SENTINEL $I $sl"
        case $sl in PASS*) ;; *) SFAIL="$SFAIL $I" ;; esac
      fi ;;
    V*) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r"; RERUN="$RERUN $I"; fi ;;
    E*) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
        else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
done
gate end; g=$?
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the TAIL; at most 2 per leg)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
if [ -n "$SFAIL" ]; then echo "HOLD $H VALID $(($(date +%s) - T0)) s SENTINEL-FAIL$SFAIL"; exit 8; fi
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

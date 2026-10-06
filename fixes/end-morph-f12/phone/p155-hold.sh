#!/bin/sh
# P-155 runner (card: fixes/end-morph-f12/README.md "Split block", signed as P-155): one hold of the P-155 block, the
# F1-only / U2-only split of end-morph F1+U2 on v9-final. P-152's p152-hold.sh (rev 1.4, e48dd4563c45) with three arms
# (C, F, U), all three arms' served JS and CSS pinned, and no attribution items.
# Builds (immutable snapshot out/split/snap, HASHES.txt sha256/12 6a368e804fb0, copied into out/p155/snap and served by
# fixes/end-morph-f12/phone/p155-serve.sh on plain http, --vendors=local --latency 150):
#   C  v9-final as landed                JS 647c9ef2b1e2  CSS e1359ab9994a   out/p155/serve-C.json
#   F  C + end-morph F1 only             JS b1c1320fde83  CSS e1359ab9994a   out/p155/serve-F.json
#   U  C + nav-hit-cache U2 only         JS 4389044c1ec4  CSS e1359ab9994a   out/p155/serve-U.json
#   B  the plain baseline (the thermal gate's timer page)                    out/p155/serve-B.json
# All three arms' served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Script fs = fixes/morph-scroll/g-fastshort-v1.json, compiled program pinned 8737f212c0ff, E procedure: as P-152.
# Usage: started only by fixes/end-morph-f12/phone/p155-block.sh, inside a phone hold with the block mark
# (`lock.mjs run iphone --block P-155 --max-seconds 3600`), each hold its own 600 s chrome-measure --no-timing run:
#   TICKET=P-155 node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-155 <H>" -- \
#     caffeinate -i -s sh fixes/end-morph-f12/phone/p155-hold.sh <H> <items>
# Plan (ONE item per 600 s hold, each after Safari parked, cooling below 38 °C and a WDA check (p155-block.sh)):
#   part 1: H1 WC | H2 WF | H3 WU | H4 S0      part 2: H5 EC1 | H6 EF1 | H7 EU1      part 3: H8 EF2 | H9 EU2 | H10 EC2
#   part 4: H11 EU3 | H12 EC3 | H13 EF3        part 5: H14 TAIL (re-runs, max 2, one per hold, then S1)
#   (counted order: a rotated Latin square over parts 2-4, 3 v 3 v 3; sentinels on C; start and end gates on every hold)
# Items:
#   WC / WF / WU   uncounted warm-up on C's / F's / U's port: E procedure, Timeline off, --warmup  -> g-W<a>-<H>.json
#   S0 / S1        sentinel on C: E procedure, Timeline off                                         -> g-S0.json / g-S1.json
#   E<a><n>        counted run on arm a (C, F, U), n 1-3, Timeline on                               -> g-E<a><n>.json + tl-E<a><n>.json
#   E<a><n>r       the one re-run of a counted run that failed a run gate, same arm and procedure
# After each counted run the frozen P-129 reader's run gates (research/serious-heat/phone/p129-gates.mjs, role E) print
# "GATES <run> E ok" or "GATES <run> E INVALID <why>"; a failed or record-less counted run goes into "RERUN-NEEDED".
# S0/S1: "SENTINEL <run> PASS|FAIL"; a failing S0 voids the block before any counted run, a failing S1 voids every
# counted run (exit 8).
# Time guard: no fs item starts when elapsed + its budget + 30 s > 600: the rest is skipped, Safari parked, exit 7, the
# hold is re-run whole.
# P155_GATE=start|end|both|none (default both): which thermal gates this hold runs. P155_DRY=1: pins, compiled-program
# and served-hash checks and the plan only.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-155 ] || { echo "TICKET is not P-155: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-155 sh fixes/end-morph-f12/phone/p155-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
O=out/p155/runs; SV=out/p155
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=647c9ef2b1e2; F_JS=b1c1320fde83; U_JS=4389044c1ec4; CSS_PIN=e1359ab9994a
GM=${P155_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "P155_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/end-morph-f12/phone/p155-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WF|WU|S0|S1|E[CFU][1-3]|E[CFU][1-3]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PF=$(port F) && PU=$(port U) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/end-morph-f12/phone/p155-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PF $JS)" = $F_JS ] && [ "$(served $PU $JS)" = $U_JS ] && \
  [ "$(served $PC $CSS)" = $CSS_PIN ] && [ "$(served $PF $CSS)" = $CSS_PIN ] && [ "$(served $PU $CSS)" = $CSS_PIN ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (P-155) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-155 profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/end-morph-f12/phone/p155-block.sh fixes/end-morph-f12/phone/p155-serve.sh fixes/end-morph-f12/phone/p155-read.mjs \
  fixes/end-morph-f12/phone/p152-read.mjs $GATES research/serious-heat/p129-read.mjs $FS research/phone-thermal-gate/thermal-gate.mjs \
  fixes/rest-script/tools/pmcheck.mjs $SV/snap/C/$JS $SV/snap/F/$JS $SV/snap/U/$JS $SV/snap/C/$CSS)"
hashok || { echo "HOLD $H VOID served hashes C $(served $PC $JS) F $(served $PF $JS) U $(served $PU $JS) CSS $(served $PC $CSS)/$(served $PF $CSS)/$(served $PU $CSS); pinned C $C_JS F $F_JS U $U_JS CSS $CSS_PIN (no run)"; exit 4; }
echo "SERVED C JS $C_JS ok, F JS $F_JS ok, U JS $U_JS ok, CSS $CSS_PIN"
BE=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WF|EF*) echo F ;; WU|EU*) echo U ;; *) echo C ;; esac; }
if [ "$P155_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && FU=$(node tools/lan.mjs --url --port "$PF") && UU=$(node tools/lan.mjs --url --port "$PU") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p155-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (P155_GATE=$GM)" ;; esac
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
  case $(arm $I) in F) U=$FU ;; U) U=$UU ;; *) U=$CU ;; esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p155-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
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
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (P155_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last part, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

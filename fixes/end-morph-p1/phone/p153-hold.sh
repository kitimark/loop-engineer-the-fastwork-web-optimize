#!/bin/sh
# P-153 runner (card: fixes/end-morph-p1/README.md "P-153"): one hold of the P-153 block, the phone no-worse check of
# end-morph P1 (PR-012 rev 1's composited clip reveal, ported onto v9-final + F1 + U2). A copy of fix-end-morph's P-152
# runner (fixes/end-morph-f12/phone/p152-hold.sh b5b38c853340 at d705bdd6), itself fix-end-bg's P-137 runner (fixes/end-bg/phone/p137-hold.sh at 24041a92, itself
# from P-129's p129-hold.sh: wda check, served-hash check, compiled-program pin, start/end thermal gate, stale files moved
# aside, time guard, Mac sleep check) with: the arms of P-153, both arms' served JS and CSS pinned, and two attribution
# items AC1 / AV1 (after the end sentinel; decide nothing). P-153 changes against P-152: the arms and the pins (C and V
# now differ in CSS too, so each arm's CSS has its own pin), the snapshot and the names; nothing else.
# Builds (immutable snapshot, int-v8's out/emp1v9f/snap-4da641f828bb, HASHES.txt sha256/12 c5138adb7dd2, copied into
# out/p153/snap and served by fixes/end-morph-p1/phone/p153-serve.sh on plain http, --vendors=local --latency 150):
#   C  v9-final + F1 + U2                JS a6426953727a  CSS e1359ab9994a   out/p153/serve-C.json
#   V  C + P1                            JS 4da641f828bb  CSS a81b9af7b2c9   out/p153/serve-V.json
#   B  the plain baseline (the thermal gate's timer page)                    out/p153/serve-B.json
# Both arms' served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Script fs = fixes/morph-scroll/g-fastshort-v1.json, compiled program pinned 8737f212c0ff (the reader's G6), E procedure
# (first touch about 4.6 s after page ready; G4 E [4.0, 5.5] s): the same script and procedure as P-137 and T-194. Its
# swipes run from the top to the page bottom and back, through the end-zone morph (open and close) with toolbar steps.
# Usage: started only by fixes/end-morph-p1/phone/p153-block.sh, inside a phone hold with the block mark
# (`lock.mjs run iphone --block P-153 --max-seconds 3600`), each hold its own 600 s chrome-measure --no-timing run:
#   TICKET=P-153 node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-153 <H>" -- \
#     caffeinate -i -s sh fixes/end-morph-p1/phone/p153-hold.sh <H> <items>
# Plan (card rev 1.3: at most ONE counted run per 600 s hold, the phone below 38 °C before every hold; GESTURE_BUDGET_S
# about 229):
#   part 1: H1 WC | H2 WV | H3 S0 | H4 EC1 | H5 EV1      part 2: H6 EV2 | H7 EC2 | H8 EC3 | H9 EV3
#   part 3: H10 EV4 | H11 EC4 | H12.. <re-runs, max 2, one per hold> | S1 in its own hold      part 4: HA AC1 AV1
#   (counted order C V V C C V V C, 4 v 4; sentinels on C; a start and an end gate on every hold; attribution after S1)
#   (rev 1-1.2: 2 fs runs per hold, H1 WC WV | H2 S0 EC1 | H3 EV1 EV2 | H4 EC2 EC3 | H5 EV3 EV4 | H6 EC4 | H7 .. S1 | HA)
# Items:
#   WC / WV        uncounted warm-up on C's / V's port: E procedure, Timeline off, --warmup     -> g-WC-<H>.json / g-WV-<H>.json
#   S0 / S1        sentinel on C: E procedure, Timeline off                                       -> g-S0.json / g-S1.json
#   EC<n> / EV<n>  counted run on C / V, n 1-4, Timeline on                                       -> g-EC<n>.json + tl-EC<n>.json
#   EC<n>r / EV<n>r  the one re-run of a counted run that failed a run gate, same arm and procedure
#   AC1 / AV1      attribution run on C / V after S1, Timeline on (paint records, decide nothing)  -> g-AC1.json + tl-AC1.json
# After each counted run the frozen P-129 reader's run gates (research/serious-heat/phone/p129-gates.mjs, role E; gate
# lines only, no counts) print "GATES <run> E ok" or "GATES <run> E INVALID <why>"; a failed or record-less counted run
# goes into "RERUN-NEEDED". S0/S1: "SENTINEL <run> PASS|FAIL"; a failing S0 voids the block before any counted run, a
# failing S1 voids every counted run (exit 8). Attribution items are never re-run and never void a hold.
# Time guard: no fs item starts when elapsed + its budget + 30 s > 600: the rest is skipped, Safari parked, exit 7, the
# hold is re-run whole.
# P153_GATE=start|end|both|none (default both): which thermal gates this hold runs (the block driver sets both on every
# hold since rev 1.2). P153_DRY=1: pins, compiled-program and served-hash checks and the plan only.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-153 ] || { echo "TICKET is not P-153: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-153 sh fixes/end-morph-p1/phone/p153-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
O=out/p153/runs; SV=out/p153
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=a6426953727a; V_JS=4da641f828bb; C_CSS=e1359ab9994a; V_CSS=a81b9af7b2c9
GM=${P153_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "P153_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/end-morph-p1/phone/p153-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WV|S0|S1|E[CV][1-4]|E[CV][1-4]r|AC1|AV1) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PV=$(port V) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/end-morph-p1/phone/p153-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PV $JS)" = $V_JS ] && [ "$(served $PV $CSS)" = $V_CSS ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (P-153) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-153 profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/end-morph-p1/phone/p153-block.sh fixes/end-morph-p1/phone/p153-serve.sh fixes/end-morph-p1/phone/p153-read.mjs \
  $GATES research/serious-heat/p129-read.mjs $FS research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs \
  $SV/snap/C/$JS $SV/snap/C/$CSS $SV/snap/V/$JS $SV/snap/V/$CSS)"
hashok || { echo "HOLD $H VOID served hashes C JS $(served $PC $JS) CSS $(served $PC $CSS), V JS $(served $PV $JS) CSS $(served $PV $CSS); pinned C $C_JS/$C_CSS V $V_JS/$V_CSS (no run)"; exit 4; }
echo "SERVED C JS $C_JS CSS $C_CSS ok, V JS $V_JS CSS $V_CSS ok"
BE=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WV|EV*|AV*) echo V ;; *) echo C ;; esac; }
if [ "$P153_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; A*) echo "PLAN $I attribution on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && VU=$(node tools/lan.mjs --url --port "$PV") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p153-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (P153_GATE=$GM)" ;; esac
RERUN=""; SFAIL=""
for I in "$@"; do
  if late "$sE"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $sE + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  case $I in
    W*) F=g-$I-$H; EX="--warmup"; TL="" ;;
    S[01]) F=g-$I; EX=""; TL="" ;;
    E*|A*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
  esac
  [ "$(arm $I)" = V ] && U=$VU || U=$CU
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p153-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I arm $(arm $I) exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W*) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted warm-up; the hold goes on)" ;;
    A*) [ $r -ne 0 ] && echo "ITEM $I exit $r (attribution; decides nothing, no re-run)" ;;
    S[01]) node $GATES $O $I; s=$?
      [ $s -ne 0 ] && { SFAIL="$SFAIL $I"; [ $I = S0 ] && { echo "HOLD $H VOID SENTINEL S0 FAIL: the block is void before any counted run"; exit 8; }; } ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (P153_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last hold, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

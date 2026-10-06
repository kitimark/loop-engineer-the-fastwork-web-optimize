#!/bin/sh
# v10 no-worse phone check (int-v8, lead 2026-10-06 15:36Z: "a short phone no-worse check on V vs C in your own hold,
# profile xcode-serious, no cooling wait"). A copy of fix-end-morph-p1's P-156 kit (fixes/end-morph-p1/phone/p156-*.sh,
# credited) with: the arms C = main's C (rev 7d, 1b2eecc66011 / e1359ab9994a) and A = v10 + CM's V (a33a6c7c1f2b / 62743920fe1a)
# from out/v10/snap-a33a6c7c1f2b-62743920fe1a, ticket v10cm-nw, folder out/v10cmnw, env NW_*; the arm letter A is kept so
# pA-read.mjs and the gates read it unchanged. Part A (fs) only. The original header follows.
# P-156 runner (card: fixes/end-morph-p1b-a/README.md "Phone card P-156"): one hold of the P-156 block, the phone check of
# A = C + P1 + P1b (a) against C on the landing base. A copy of this topic's P-153 runner (p153-hold.sh, rev 1.3: one
# counted run per 600 s hold, start and end thermal gates, served-hash and compiled-program pins, stale files moved
# aside, time guard, Mac sleep check) with: the arms C / A, a second program for part B (g-park30-v1), and no
# attribution items.
# Builds (out/v10cmnw/snap, served by fixes/v10/phone/nw-serve.sh on plain http, --vendors=local --latency 150):
#   C, A  the base in out/v10cmnw/snap/BASE (1: C1 fe7c668d35e8 / A1 f83aa54c2acc; 0: C0 387a2b38790b / A0 888ed8eb2d15;
#         CSS C e1359ab9994a, A cfb8b8c5b019)                                    out/v10cmnw/serve-{C,A}.json
#   B     the plain baseline (the thermal gate's timer page)                     out/v10cmnw/serve-B.json
# Both arms' served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Programs: part A fs = fixes/morph-scroll/g-fastshort-v1.json (pinned 8737f212c0ff, P-153's), part B park30 =
# fixes/end-morph-p1/phone/g-park30-v1.json (pinned 6f9209453750; 30 s rests at the end, open and closed). Both start with
# P-153's E procedure (reload, 4 s, first touch; G4 E [4.0, 5.5] s).
# Usage: started only by fixes/v10/phone/nw-block.sh, inside a phone hold with the block mark
# (`lock.mjs run iphone --block v10cm-nw --max-seconds 3600`), each hold its own 600 s chrome-measure --no-timing run:
#   TICKET=v10cm-nw node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-156 <H>" -- \
#     caffeinate -i -s sh fixes/v10/phone/nw-hold.sh <H> <items>
# Items:
#   WC / WA          uncounted warm-up on C / A: fs, Timeline off, --warmup              -> g-WC-<H>.json / g-WA-<H>.json
#   S0 / S1          sentinel on C: fs, Timeline off                                    -> g-S0.json / g-S1.json
#   EC<n> / EA<n>    part A counted run on C / A, n 1-4, fs, Timeline on                -> g-EC<n>.json + tl-EC<n>.json
#   BC<n> / BA<n>    part B counted run on C / A, n 1-2, park30, Timeline on            -> g-BC<n>.json + tl-BC<n>.json
#   <item>r          the one re-run of a counted run that failed a run gate
#   PC               the uncounted pilot (rev 2, the lead's 10:15Z ruling): park30 on C, Timeline on, gated by
#                    pA-read.mjs --gates (G1-G7, G7 = the park gates); in its own hold H0 before the block; a failed
#                    pilot voids its hold (exit 9) and the block does not start      -> g-PC.json + tl-PC.json
# Gates after each run (gate lines only, no counts): part A and sentinels by research/serious-heat/phone/p129-gates.mjs
# (role E / S), part B by fixes/end-morph-p1/phone/pA-read.mjs --gates (P-129's gates with G6 = the park30 hash).
# Time guard: no item starts when elapsed + its program's budget + 30 s > 600: the rest is skipped, Safari parked,
# exit 7, the hold is re-run whole.
# NW_GATE=start|end|both|none (default both). NW_DRY=1: pins, compiled-program and served-hash checks, plan only.
# NW_DIR (default out/v10cmnw): the servers' state, snapshot copy, hold logs and runs/ (a dry run uses its own folder).
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL, 9 pilot FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = v10cm-nw ] || { echo "TICKET is not v10cm-nw: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=v10cm-nw sh fixes/v10/phone/nw-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
SV=${NW_DIR:-out/v10cmnw}; O=$SV/runs
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
PK=fixes/end-morph-p1/phone/g-park30-v1.json; PROG_PK=6f9209453750
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
[ -e $SV/snap/BASE ] || { echo "HOLD $H VOID no snapshot copy (start nw-serve.sh first) (no run)"; exit 4; }
[ "$(cat $SV/snap/BASE)" = v10 ] || { echo "HOLD $H VOID unknown base (no run)"; exit 4; }
C_JS=1b2eecc66011; A_JS=a33a6c7c1f2b
C_CSS=e1359ab9994a; A_CSS=62743920fe1a
# optional third arm D = Vc (nw-serve.sh NW_VC): pinned by snap/DPIN, items WD / ED<n> / BD<n>
D_JS=""; D_CSS=""; [ -e $SV/snap/DPIN ] && { D_JS=$(cut -d: -f1 $SV/snap/DPIN); D_CSS=$(cut -d: -f2 $SV/snap/DPIN); }
GM=${NW_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "NW_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/v10/phone/nw-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs; RD=fixes/end-morph-p1/phone/pA-read.mjs
mkdir -p $O
for I in "$@"; do case $I in PC|WC|WA|S0|S1|E[CA][1-4]|E[CA][1-4]r|B[CA][12]|B[CA][12]r) ;;
  WD|ED[1-4]|ED[1-4]r|BD[12]|BD[12]r) [ -n "$D_JS" ] || { echo "HOLD $H VOID item $I needs arm D (no snap/DPIN) (no run)"; exit 4; } ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PD=""; [ -n "$D_JS" ] && { PD=$(port D) || { echo "HOLD $H VOID no server state for D (no run)"; exit 4; }; }
PC=$(port C) && PA=$(port A) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/v10/phone/nw-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PC $CSS)" = $C_CSS ] && [ "$(served $PA $JS)" = $A_JS ] && [ "$(served $PA $CSS)" = $A_CSS ] && { [ -z "$D_JS" ] || { [ "$(served $PD $JS)" = $D_JS ] && [ "$(served $PD $CSS)" = $D_CSS ]; }; }; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (v10cm-nw) start $(date -u +%FT%TZ) items $* gates $GM base $(cat $SV/snap/BASE)"
echo "PIN $H v10cm-nw profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/v10/phone/nw-block.sh fixes/v10/phone/nw-serve.sh $RD fixes/end-morph-p1/phone/p153-read.mjs \
  $GATES research/serious-heat/p129-read.mjs $FS $PK research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs \
  $SV/snap/C/$JS $SV/snap/C/$CSS $SV/snap/A/$JS $SV/snap/A/$CSS ${D_JS:+$SV/snap/D/$JS $SV/snap/D/$CSS})"
hashok || { echo "HOLD $H VOID served hashes C JS $(served $PC $JS) CSS $(served $PC $CSS), A JS $(served $PA $JS) CSS $(served $PA $CSS); pinned C $C_JS/$C_CSS A $A_JS/$A_CSS (no run)"; exit 4; }
echo "SERVED C JS $C_JS CSS $C_CSS ok, A JS $A_JS CSS $A_CSS ok${D_JS:+, D JS $D_JS CSS $D_CSS ok}"
prog() { # file pin -> prints the budget, or fails
  b=$(node tools/iphone.mjs gesture $1 --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
  h=$(echo "$b" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); s=$(echo "$b" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
  [ "$h" = $2 ] && [ -n "$s" ] && echo $s
}
sE=$(prog $FS $PROG_FS) || { echo "HOLD $H VOID compiled program fs (pinned $PROG_FS) (no run)"; exit 4; }
sB=$(prog $PK $PROG_PK) || { echo "HOLD $H VOID compiled program park30 (pinned $PROG_PK) (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok budget $sE s, park30 $PROG_PK ok budget $sB s"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WA|EA*|BA*) echo A ;; WD|ED*|BD*) echo D ;; *) echo C ;; esac; }
if [ "$NW_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) fs Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C fs Timeline-off g-$I.json" ;;
    PC) echo "PLAN PC pilot (uncounted) on C park30 Timeline-on g-PC.json tl-PC.json, gates G1-G7" ;;
    E*) echo "PLAN $I part A counted on $(arm $I) fs Timeline-on g-$I.json tl-$I.json" ;; B*) echo "PLAN $I part B counted on $(arm $I) park30 Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && AU=$(node tools/lan.mjs --url --port "$PA") && { [ -z "$PD" ] || DU=$(node tools/lan.mjs --url --port "$PD"); } || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "v10cmnw-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (NW_GATE=$GM)" ;; esac
RERUN=""; SFAIL=""; PFAIL=""
for I in "$@"; do
  case $I in B*|PC) P=$PK; BS=$sB ;; *) P=$FS; BS=$sE ;; esac
  if late "$BS"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $BS + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  case $I in
    W*) F=g-$I-$H; EX="--warmup"; TL="" ;;
    S[01]) F=g-$I; EX=""; TL="" ;;
    E*|B*|PC) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
  esac
  case $(arm $I) in A) U=$AU ;; D) U=$DU ;; *) U=$CU ;; esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $P $EX $TL --owner "$R" --label "v10cmnw-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I arm $(arm $I) exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W*) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted warm-up; the hold goes on)" ;;
    PC) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then PFAIL="gesture exit $r"; else node $RD --gates $O PC || PFAIL="park30 gates"; fi
      [ -n "$PFAIL" ] && echo "PILOT FAIL ($PFAIL)" || echo "PILOT ok" ;;
    S[01]) node $GATES $O $I; s=$?
      [ $s -ne 0 ] && { SFAIL="$SFAIL $I"; [ $I = S0 ] && { echo "HOLD $H VOID SENTINEL S0 FAIL: the block is void before any counted run"; exit 8; }; } ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else case $I in B*) node $RD --gates $O $I || RERUN="$RERUN $I" ;; *) node $GATES $O $I || RERUN="$RERUN $I" ;; esac; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (NW_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last holds, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
[ -n "$PFAIL" ] && { echo "HOLD $H VOID PILOT FAIL ($PFAIL): the block does not start; report to the lead"; exit 9; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

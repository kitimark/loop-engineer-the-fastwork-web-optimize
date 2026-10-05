#!/bin/sh
# P-150 runner (card: fixes/end-bg/README.md "P-150"): one hold of the P-150 block, the phone no-worse check of PR-025
# option B (lighter files + AVIF). From p137-hold.sh (read and run once) with: arm N instead of V, both arms' served JS,
# CSS and index.html hashed, and every item opened with `iphone.mjs safari-restart --url` instead of `open`, so each run
# starts in a fresh Safari web process: no picture decoded by an earlier run can be reused, and every picture's first
# decode falls inside the run (the risk this check tests: AVIF's first decode).
# Builds (immutable snapshots, served by fixes/end-bg/phone/p150-serve.sh on plain http, --vendors=local --latency 150):
#   C  v9-final + morph-scroll rev 7d                    JS 1b2eecc66011  CSS e1359ab9994a  index site-pretty's  out/p150/serve-C.json
#   N  C + option B (rebuild-b.mjs, manifest-checked)    JS 049b13ced4e3  CSS e1359ab9994a  index 10919c0334b4    out/p150/serve-N.json
#   B  the plain baseline (the thermal gate's timer page)                                                     out/p150/serve-B.json
# Script fs = fixes/morph-scroll/g-fastshort-v1.json (swipes from the top to the page bottom: every picture comes into
# view), compiled program pinned 8737f212c0ff (the reader's G6), E procedure (G4 E [4.0, 5.5] s), as P-137.
# Usage: started only by fixes/end-bg/phone/p150-block.sh, inside a phone hold with the block mark
# (`lock.mjs run iphone --block P-150 --max-seconds 3600`), each hold its own 600 s chrome-measure --no-timing run:
#   TICKET=P-150 node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-150 <H>" -- \
#     caffeinate -i -s sh fixes/end-bg/phone/p150-hold.sh <H> <items>
# Plan (2 fs runs per 600 s hold): part 1: H1 WC WN | H2 S0 EC1 | H3 EN1 EN2     part 2: H4 EC2 EC3 | H5 EN3 | H6 <re-runs, max 2> S1
#   (counted order C N N C C N; sentinels on C; a gate at each phone hold's edges)
# Items:
#   WC / WN        uncounted warm-up on C's / N's port: E procedure, Timeline off, --warmup     -> g-WC-<H>.json / g-WN-<H>.json
#   S0 / S1        sentinel on C: E procedure, Timeline off                                       -> g-S0.json / g-S1.json
#   EC<n> / EN<n>  counted run on C / N, n 1-3, Timeline on                                       -> g-EC<n>.json + tl-EC<n>.json
#   EC<n>r / EN<n>r  the one re-run of a counted run that failed a run gate, same arm and procedure
# Gates, sentinels, time guard, P150_GATE (start|end|both|none), P150_DRY=1 and exit codes as in p137-hold.sh:
# last line "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-150 ] || { echo "TICKET is not P-150: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-150 sh fixes/end-bg/phone/p150-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
O=out/p150/runs; SV=out/p150
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
C_JS=1b2eecc66011; N_JS=049b13ced4e3; CSS_PIN=e1359ab9994a; N_HTML=10919c0334b4; C_HTML=26e46ddee017
GM=${P150_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "P150_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/end-bg/phone/p150-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in WC|WN|S0|S1|E[CN][1-3]|E[CN][1-3]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PC=$(port C) && PN=$(port N) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/end-bg/phone/p150-serve.sh first) (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $PC $JS)" = $C_JS ] && [ "$(served $PC $CSS)" = $CSS_PIN ] && [ "$(served $PC index.html)" = $C_HTML ] && [ "$(served $PN $JS)" = $N_JS ] && [ "$(served $PN $CSS)" = $CSS_PIN ] && [ "$(served $PN index.html)" = $N_HTML ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (P-150) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-150 profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF fixes/end-bg/phone/p150-block.sh fixes/end-bg/phone/p150-serve.sh fixes/end-bg/phone/p150-read.mjs fixes/end-bg/phone/p137-read.mjs \
  fixes/end-bg/img/rebuild-b.mjs fixes/end-bg/img/b-manifest.json \
  $GATES research/serious-heat/p129-read.mjs $FS research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs \
  $SV/snap/C/$JS $SV/snap/C/$CSS $SV/snap/N/$JS $SV/snap/N/index.html)"
node fixes/end-bg/img/rebuild-b.mjs --check $SV/snap/N > $O/$H-manifest.log 2>&1 || { echo "HOLD $H VOID N snapshot != manifest ($(tail -1 $O/$H-manifest.log)) (no run)"; exit 4; }
hashok || { echo "HOLD $H VOID served hashes C JS $(served $PC $JS) CSS $(served $PC $CSS) index $(served $PC index.html), N JS $(served $PN $JS) CSS $(served $PN $CSS) index $(served $PN index.html); pinned C $C_JS/$CSS_PIN/$C_HTML N $N_JS/$CSS_PIN/$N_HTML (no run)"; exit 4; }
echo "SERVED C JS $C_JS index $C_HTML ok, N JS $N_JS index $N_HTML ok, CSS $CSS_PIN; N manifest 38/38"
BE=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WN|EN*) echo N ;; *) echo C ;; esac; }
if [ "$P150_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && NU=$(node tools/lan.mjs --url --port "$PN") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p150-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (P150_GATE=$GM)" ;; esac
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
  [ "$(arm $I)" = N ] && U=$NU || U=$CU
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs safari-restart --owner "$R" --url "$U" > "$O/$F-restart.log" 2>&1 || { echo "HOLD $H VOID safari-restart failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p150-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
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
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (P150_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last hold, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

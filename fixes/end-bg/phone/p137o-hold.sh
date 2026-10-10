#!/bin/sh
# P-137o runner (fixes/end-bg/README.md "P-137o"): one hold of the P-137o block, the original (O) against C at the end
# of the page, on P-137's script and read. A copy of p137-hold.sh (P-137, iphone-runner, 2026-10-05) with only these
# changes: arms O (the original baseline) and C instead of C and V; items WO / EO<n>; output out/p137o; the runner is
# cap-end-orig; the thermal condition is held by the thermal tool (FW_PHONE_CONDITION=tool, set by p137o-block.sh's
# `iphone.mjs rearm`; Xcode no longer holds one, I-225/I-257), and Safari's page target is pinned by its pid (I-262).
# The start/end thermal gate is P-137's (thermal-gate.mjs --accept-induced); when that read errors (exit 1, no read:
# the xctrace hang of I-259) the hold falls back to iphone.mjs's own profile read (exit 0 = Serious under our
# condition), logged as "GATE <edge> fallback".
# Builds (served by fixes/end-bg/phone/p137o-serve.sh on plain http, --vendors=local --latency 150):
#   O  the original, baseline b1789284481295-a455e793      JS 4606120cf392  CSS 27776f3d4138   out/p137o/serve-O.json
#   C  v9-final + morph-scroll rev 7d (overlay)            JS 1b2eecc66011  CSS e1359ab9994a   out/p137o/serve-C.json
#   B  the plain baseline (the thermal gate's timer page)                                     out/p137o/serve-B.json
# Both arms' served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Script fs = fixes/morph-scroll/g-fastshort-v1.json, compiled program pinned 8737f212c0ff, E procedure (G4 [4.0, 5.5] s).
# Items:
#   WO / WC        uncounted warm-up on O's / C's port: E procedure, Timeline off, --warmup   -> g-WO-<H>.json / g-WC-<H>.json
#   S0 / S1        sentinel on C: E procedure, Timeline off                                    -> g-S0.json / g-S1.json
#   EO<n> / EC<n>  counted run on O / C, n 1-4, Timeline on                                    -> g-E?<n>.json + tl-E?<n>.json
#   E?<n>r         the one re-run of a counted run that failed a run gate
# Gates, sentinels, time guard, exit codes and last line: as p137-hold.sh (P137O_GATE=start|end|both|none, P137O_DRY=1).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-137o ] || { echo "TICKET is not P-137o: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-137o sh fixes/end-bg/phone/p137o-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-cap-end-orig}
O=out/p137o/runs; SV=out/p137o
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
GM=${P137O_GATE:-both}
case $GM in start|end|both|none) ;; *) echo "P137O_GATE must be start, end, both or none (got $GM): no run"; exit 2 ;; esac
SELF=fixes/end-bg/phone/p137o-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
export FW_PHONE_CONDITION=tool
mkdir -p $O
for I in "$@"; do case $I in WO|WC|S0|S1|E[OC][1-4]|E[OC][1-4]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PO=$(port O) && PC=$(port C) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (start fixes/end-bg/phone/p137o-serve.sh first) (no run)"; exit 4; }
hashok() { sh fixes/end-bg/phone/p137o-serve.sh check > /dev/null; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
safpid() { # I-262: pin the inspector's tab picker to Safari (pid from WDA activeAppInfo)
  SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  [ -n "$SP" ] && export FW_IPHONE_APPID=PID:$SP; }
T0=$(date +%s)
echo "HOLD $H (P-137o) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-137o profile xcode-serious(tool-held) checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null) baseline $(node -e "console.log(require('./baseline.json').snapshot)")$(pins \
  $SELF fixes/end-bg/phone/p137o-block.sh fixes/end-bg/phone/p137o-serve.sh fixes/end-bg/phone/p137o-read.mjs fixes/end-bg/phone/p137-read.mjs \
  $GATES research/serious-heat/p129-read.mjs $FS research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs \
  site-pretty/$JS site-pretty/$CSS $SV/snap/C/$JS $SV/snap/C/$CSS)"
hashok || { echo "HOLD $H VOID served hashes: $(sh fixes/end-bg/phone/p137o-serve.sh check | head -1) (no run)"; exit 4; }
echo "SERVED O and C ok"
BE=$(node tools/iphone.mjs gesture $FS --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG_FS), budget ${sE:-none} (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $1 in WO|EO*) echo O ;; *) echo C ;; esac; }
if [ "$P137O_DRY" = 1 ]; then
  for I in "$@"; do case $I in W*) echo "PLAN $I warm-up on $(arm $I) E Timeline-off --warmup g-$I-$H.json" ;; S*) echo "PLAN $I sentinel on C E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted on $(arm $I) E Timeline-on g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && CU=$(node tools/lan.mjs --url --port "$PC") && OU=$(node tools/lan.mjs --url --port "$PO") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { safpid; node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p137o-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; g=$?
  if [ $g -eq 1 ]; then node tools/iphone.mjs profile --owner "$R" > "$O/$H-profile-$1.log" 2>&1; g=$?
    echo "GATE $1 fallback (thermal-gate read error): iphone.mjs profile exit $g $(tail -1 "$O/$H-profile-$1.log" | cut -c1-160)"; fi
  return $g; }
case $GM in start|both) gate start; g=$?
  [ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; } ;; *) echo "GATE start skipped (P137O_GATE=$GM)" ;; esac
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
  [ "$(arm $I)" = O ] && U=$OU || U=$CU
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  safpid
  k=0; until node tools/iphone.mjs open "$U" --owner "$R" > "$O/$H-open-$I.log" 2>&1; do
    k=$((k + 1)); [ $k -ge 3 ] && { tail -1 "$O/$H-open-$I.log"; echo "HOLD $H VOID open failed at $I"; exit 4; }; sleep 5; safpid; done
  [ $k -gt 0 ] && echo "OPEN $I after $k retries"
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p137o-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  TH=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$O/$F.json','utf8')).meta.profile||{};const s=p.start||{},e=p.end||{};console.log((s.state||'?')+'/'+(e.state||'?')+' '+(s.battC??'?')+'->'+(e.battC??'?')+' C holder '+(e.holder||s.holder||'?')+' drift '+!!p.drift)}catch(e){console.log('? no record')}")
  echo "RUN $I arm $(arm $I) exit $r $(date -u +%TZ) thermal $TH load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W*) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted warm-up; the hold goes on)" ;;
    S[01]) node $GATES $O $I; s=$?
      [ $s -ne 0 ] && { SFAIL="$SFAIL $I"; [ $I = S0 ] && { echo "HOLD $H VOID SENTINEL S0 FAIL: the block is void before any counted run"; exit 8; }; } ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
  [ $r -eq 8 ] && { echo "HOLD $H VOID profile misfit at $I (exit 8)"; exit 3; }
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped (P137O_GATE=$GM)" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last hold, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

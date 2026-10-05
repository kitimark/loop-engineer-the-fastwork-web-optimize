#!/bin/sh
# P-129 runner (card: research/serious-heat/README.md §5 "P-129" rev 2 + arch-serious-heat's addendum on the L idle flag):
# one hold of the P-129 block. Built from P-124's g7d-hold.sh and P-122's hold122.sh (wda check, served-hash check,
# compiled-program pin, start/end thermal gate, stale files moved aside, time guard, Mac sleep check).
# Build: P-124's V, PR-018 rev 7d research build, snapshot out/snapshots/ms-29c0d537e0c9 (a read-only copy of
# fix-hero-exit-threaded's), JS 29c0d537e0c9, CSS 659b02f7169d; served on plain http by serve.mjs --overlay, state
# out/p129/serve-V.json; out/p129/serve-B.json is the plain baseline (the thermal gate's timer page). TICKET-7d's hash
# check: the served JS and CSS are hashed before every item; a mismatch voids the hold (exit 4).
# Script fs = fixes/morph-scroll/g-fastshort-v1.json, compiled program pinned 8737f212c0ff (G6), for E and L alike: L adds
# only `--idle-after-reload 17000` (I-203: idle after the script's own reload, outside the program hash), so its first
# touch lands about 17 + 4.6 = 21.6 s after page ready (G4 L [20, 23] s; E's is about 4.6 s, G4 E [4.0, 5.5] s).
# Usage (the lead's ruling Q2: chrome-measure --no-timing holds of 600 s under one --block P-129 phone mark, as P-122):
#   TICKET=P-129 node tools/lock.mjs run iphone --owner iphone-runner --block P-129 --max-seconds 900 -- \
#     node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 --doing "P-129 <H>" -- \
#     caffeinate -i -s sh research/serious-heat/phone/p129-hold.sh <H> <items>
# Plan (2 fs runs per 600 s hold: GESTURE_BUDGET_S 229, + the idle for L):
#   H1 W S0 | H2 E1 L1 | H3 L2 E2 | H4 E3 L3 | H5 L4 E4 | H6 <re-runs, at most 2 per block> S1 (H7 S1 when 2 re-runs)
#   (counted order E L L E E L L E; S1 last; a gate at every hold's start and end)
# Items:
#   W        uncounted warm-up: E procedure, Timeline off, --warmup          -> g-W-<H>.json
#   S0 / S1  sentinel: E procedure, Timeline off                             -> g-S0.json / g-S1.json
#   E<n>     counted early run, Timeline on                                  -> g-E<n>.json + tl-E<n>.json
#   L<n>     counted late run, Timeline on, --idle-after-reload 17000        -> g-L<n>.json + tl-L<n>.json
#   E<n>r / L<n>r  the one re-run of a counted run that failed a run gate (block step 5), same procedure
# After each counted run the frozen reader's run gates run on it (p129-gates.mjs: gate lines only, no part A/B/S
# numbers): "GATES <run> ok" or "GATES <run> INVALID <why>"; a failed or record-less counted run is listed in
# "RERUN-NEEDED" (the runner re-runs it in the last hold before S1). S0/S1: "SENTINEL <run> PASS|FAIL"; a failing S0
# voids the block before any counted run, a failing S1 voids every counted run (exit 8).
# Time guard (as P-122's F5): no fs item starts when elapsed + its budget + 30 s > 600 (gesture-run refuses with less
# left in the 600 s hold, I-112): the rest is skipped, Safari parked, exit 7, the hold is re-run whole.
# P129_DRY=1: pins, compiled-program and served-hash checks and the plan only; no gate, no phone command.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (2 usage, 3 end gate / Mac sleep, 4 setup, 5 start
# gate / WDA, 7 time guard, 8 sentinel FAIL). Nothing here prints the LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-129 ] || { echo "TICKET is not P-129: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-129 sh research/serious-heat/phone/p129-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-iphone-runner}
O=out/p129/runs; SV=out/p129; SNAP=out/snapshots/ms-29c0d537e0c9
FS=fixes/morph-scroll/g-fastshort-v1.json; PROG_FS=8737f212c0ff
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css; JS_PIN=29c0d537e0c9; CSS_PIN=659b02f7169d
LIDLE=17000; LFLAG="--idle-after-reload $LIDLE"
SELF=research/serious-heat/phone/p129-hold.sh; GATES=research/serious-heat/phone/p129-gates.mjs
mkdir -p $O
for I in "$@"; do case $I in W|S0|S1|E[1-4]|L[1-4]|E[1-4]r|L[1-4]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PV=$(port V) && PB=$(port B) || { echo "HOLD $H VOID no server state in $SV (no run)"; exit 4; }
served() { curl -s "http://127.0.0.1:$PV/$1" | shasum -a 256 | cut -c1-12; }
hashok() { [ "$(served $JS)" = $JS_PIN ] && [ "$(served $CSS)" = $CSS_PIN ]; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
echo "HOLD $H (P-129) start $(date -u +%FT%TZ) items $*"
echo "PIN $H P-129 profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $SELF $GATES research/serious-heat/p129-read.mjs research/serious-heat/p129-selftest.mjs $FS \
  research/phone-thermal-gate/thermal-gate.mjs research/phone-thermal-gate/verdict.mjs fixes/rest-script/tools/pmcheck.mjs \
  $SNAP/$JS $SNAP/$CSS)"
hashok || { echo "HOLD $H VOID served hashes JS $(served $JS) CSS $(served $CSS), pinned $JS_PIN $CSS_PIN (no run)"; exit 4; }
echo "SERVED V JS $JS_PIN CSS $CSS_PIN ok"
# compiled program and budget, E and L (the idle flag must leave the program hash alone)
budget() { node tools/iphone.mjs gesture $FS $1 --owner "$R" --timeline $O/dry-tl.json --dry-run 2>&1; }
BE=$(budget "") ; BL=$(budget "$LFLAG")
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); hL=$(echo "$BL" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p')
sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p'); sL=$(echo "$BL" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG_FS ] && [ "$hL" = $PROG_FS ] && [ -n "$sE" ] && [ -n "$sL" ] || {
  echo "HOLD $H VOID compiled program E ${hE:-none} L ${hL:-none} (pinned $PROG_FS), budget E ${sE:-none} L ${sL:-none} (no run)"; exit 4; }
# I-203 adds the idle to the budget: an L budget no larger than E's means this tools version ignores the flag
[ "$sL" -gt "$sE" ] && echo "$BL" | grep -q "^IDLE_AFTER_RELOAD_MS $LIDLE" || {
  echo "HOLD $H VOID L budget $sL s (E $sE s) or no IDLE_AFTER_RELOAD_MS $LIDLE line: --idle-after-reload not in this tools version (I-203; rebase on main) (no run)"; exit 4; }
echo "PROG fs $PROG_FS ok (E and L), GESTURE_BUDGET_S E $sE L $sL"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
if [ "$P129_DRY" = 1 ]; then
  for I in "$@"; do case $I in W) echo "PLAN W warm-up E Timeline-off --warmup g-W-$H.json" ;; S*) echo "PLAN $I sentinel E Timeline-off g-$I.json" ;;
    E*) echo "PLAN $I counted E Timeline-on g-$I.json tl-$I.json" ;; L*) echo "PLAN $I counted L Timeline-on $LFLAG g-$I.json tl-$I.json" ;; esac; done
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") && VU=$(node tools/lan.mjs --url --port "$PV") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p129-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
gate start; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no run)"; exit 5; }
RERUN=""; SFAIL=""
for I in "$@"; do
  case $I in L*) B=$sL ;; *) B=$sE ;; esac
  if late "$B"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $B + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  case $I in
    W) F=g-W-$H; EX="--warmup"; TL="" ;;
    S[01]) F=g-$I; EX=""; TL="" ;;
    E*) F=g-$I; EX=""; TL="--timeline $O/tl-$I.json" ;;
    L*) F=g-$I; EX="$LFLAG"; TL="--timeline $O/tl-$I.json" ;;
  esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$VU" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  node tools/iphone.mjs gesture $FS $EX $TL --owner "$R" --label "p129-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    W) [ $r -ne 0 ] && echo "ITEM W exit $r (uncounted warm-up; the hold goes on)" ;;
    S[01]) node $GATES $O $I; s=$?
      [ $s -ne 0 ] && { SFAIL="$SFAIL $I"; [ $I = S0 ] && { gate end > /dev/null 2>&1; echo "HOLD $H VOID SENTINEL S0 FAIL: the block is void before any counted run"; exit 8; }; } ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r$( [ -s "$O/$F.json" ] || echo ', no run file')"; RERUN="$RERUN $I"
       else node $GATES $O $I || RERUN="$RERUN $I"; fi ;;
  esac
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the last hold, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL: every counted run of the block is void"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

#!/bin/sh
# P-142 v9.2 phone no-worse check (C = v9-final as landed 8b5ce9b3; V = v9.2 = v9.1d + people-word a + nav-fade
# (rev 1.2, U2 OUT); fixes/v9-2/README.md "P-142"): one phone hold. A copy of P-134's fixes/v9-1d/phone/hold134.sh (itself
# P-132's / P-122's hold122.sh with the same gates, guards and item grammar) with the ticket, the folders, the labels
# (p142-) and the servers (serve142.sh) changed, and one part added: G parts M, X, S as P-134 plus H (nav-fade's hero
# flip, P-139's stand-in); part R stays dropped. Scripts:
#   M = p121/flick-middle-v2.json, X = p121/flick-end-v2.json speed=fast, S = the same speed=slow,
#   H = fixes/v8-best/phone/g/flick-hero-v1.json (T-113: 3 s idle at the top, fast flicks down through the hero to
#       y >= 1800 and back to the top, twice: four 0.72 hero flips a run).
# Every G run (both arms, warm-ups too) carries nav-hit-cache's flicker logger (--inject flicker-inject.mjs; its gate
# flicker-gate.mjs). Servers: fixes/v9-2/phone/serve142.sh, copies out/p142/snap (HASHES.txt).
# Committed before any P-142 data. Refuses to run unless TICKET=P-142.
# N2 (mgmt-ops-10's P-121 read): before the gate, every G part in the hold is compiled with `iphone.mjs gesture
# --dry-run` and its GESTURE_HASH (sha256/12 of the compiled program) must equal the pin below, else HOLD VOID (exit 4).
# Usage (runner; a phone hold with the block mark, and inside it an exclusive no-timing chrome-measure hold):
#   TICKET=P-142 node tools/lock.mjs run iphone --owner iphone-runner --block P-142 --max-seconds 900 -- \
#     node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 \
#     --doing "v9.2 P-142 H1a" -- caffeinate -i -s sh fixes/v9-2/phone/hold142.sh H1a sCo wgMC wgMV gMC1 gMV1 gMV2 sCc
# Time guard (ops F5, lead ruling; sized on the 600 s chrome-measure hold after ops' N1 on 551a80f1): no G item (wg* or
# g*) starts when elapsed + 180 s (150 s GESTURE_BUDGET_S, which gesture-run needs left in its own 600 s hold, + 30 s for
# the time before T0, the served-hash check and the open) > 600 s, i.e. after 420 s: the rest of the hold's items are
# skipped, Safari is parked, the hold is VOID "time" (exit 7) and is re-run whole (late() below).
# The end gate (up to ~90 s) may then run past 600 s: the hold shows OVERDUE, nothing is killed.
# Items:
#   wC / wV              uncounted S load warm-up on that arm's port
#   sCo / sCc            uncounted S sentinel on C opening / closing a G hold (labels per hold)
#   wg<P>C / wg<P>V      uncounted G warm-up of part P (M | X | S)
#   g<P>C<n> / g<P>V<n>  counted G run n of part P
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5/6; 7 = time guard). Nothing here prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-142 ] || { echo "TICKET is not P-142: no run"; exit 2; }
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p142/snap; O=out/p142/runs; G1=fixes/v9-best/phone/p121; G2=fixes/v9-best/phone/p122; G3=fixes/v9-2/phone; GH=fixes/v8-best/phone/g
INJ=fixes/nav-hit-cache/flicker-inject.mjs
mkdir -p $O
# N2: compiled program pins (GESTURE_HASH sha256/12), from iphone.mjs gesture --dry-run on the pinned scripts
PROG_M=607b59612abb; PROG_X=21aaafd3a9fd; PROG_S=7312cdcd2574; PROG_H=53a8e657fa28
script() { case $1 in M) echo "$G1/flick-middle-v2.json" ;; X) echo "$G1/flick-end-v2.json --param speed=fast" ;;
  S) echo "$G1/flick-end-v2.json --param speed=slow" ;; H) echo "$GH/flick-hero-v1.json" ;; esac; }
prog() { case $1 in M) echo $PROG_M ;; X) echo $PROG_X ;; S) echo $PROG_S ;; H) echo $PROG_H ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
late() { [ $(( $1 - T0 + 180 )) -gt 600 ]; }
echo "HOLD $H ($TICKET) start $(date -u +%FT%TZ) items $*"
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
echo "PIN $H $TICKET profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $G3/hold142.sh $G3/score142.mjs $G3/serve142.sh $G3/nf-read.mjs $G2/score.mjs $INJ fixes/nav-hit-cache/flicker-gate.mjs fixes/v9-best/phone/score.mjs fixes/v8-best/phone/score.mjs \
  $G1/gate.mjs research/phone-thermal-gate/thermal-gate.mjs research/phone-thermal-gate/verdict.mjs \
  fixes/rest-script/tools/pmcheck.mjs $G1/flick-middle-v2.json $G1/flick-end-v2.json $GH/flick-hero-v1.json $S/HASHES.txt)"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p142-$H-$1" --expect serious --max-c 44 --accept-induced --url "$B"; }
SR="--driver scroll --probe std --owner $R --block $TICKET"
PARTS=""
for I in "$@"; do case $I in
  w[CV]|sC[oc]) ;;
  wgR*|gR*) echo "HOLD $H VOID item $I: P-142 has no part R (no run)"; exit 4 ;;
  wg[MXSH][CV]) PARTS="$PARTS $(echo "$I" | cut -c3)" ;;
  g[MXSH][CV][0-9]*) PARTS="$PARTS $(echo "$I" | cut -c2)" ;;
  *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;;
esac; done
if [ -n "$PARTS" ]; then
  node tools/iphone.mjs wda check > "$O/p142-$H-wda.log" 2>&1; w=$?
  [ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
  for P in $(echo $PARTS | tr ' ' '\n' | sort -u); do
    h=$(node tools/iphone.mjs gesture $(script $P) --dry-run 2>&1 | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p')
    [ "$h" = "$(prog $P)" ] || { echo "HOLD $H VOID part $P compiled program ${h:-none}, pinned $(prog $P) (N2, no run)"; exit 4; }
    echo "PROG $P $h ok"
  done
fi
gate start; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no counted run)"; exit 5; }
BAD=""
for I in "$@"; do
  case $I in wg*|g*) now=$(date +%s)
    if late "$now"; then echo "HOLD $H VOID time: $I would start at $((now - T0)) s (+ 180 > 600), items from $I on skipped; re-run the hold whole"
      node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi ;; esac
  sh $G3/serve142.sh check > "$O/p142-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  case $I in
    wC) A=C; K=S; EX="--warmup --arm C"; L=p142-wC-$H ;;
    wV) A=V; K=S; EX="--warmup --arm V"; L=p142-wV-$H ;;
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=p142-$I-$H ;;
    wg[MXSH][CV]) P=$(echo "$I" | cut -c3); A=$(echo "$I" | cut -c4); K=G; L=p142-$I-$H ;;
    g[MXSH][CV][0-9]*) P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=p142-$I ;;
  esac
  case $A in C) U=$CU ;; V) U=$VU ;; esac
  [ -e "$O/$L.json" ] && { mv "$O/$L.json" "$O/$L.json.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $O/$L.json"; exit 4; }
    echo "MOVED $L.json aside (an earlier hold's file)"; }
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $EX --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) node tools/iphone.mjs gesture $(script $P) --inject $INJ --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  if [ $r -ne 0 ] || [ ! -s "$O/$L.json" ]; then
    echo "ITEM $I VOID exit $r$( [ -s "$O/$L.json" ] || echo ', no run file')"
    case $I in g[MXSH][CV][0-9]*) BAD="$BAD $I" ;; esac
  fi
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$BAD" ] && { echo "HOLD $H VOID counted item(s) failed:$BAD"; exit 6; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

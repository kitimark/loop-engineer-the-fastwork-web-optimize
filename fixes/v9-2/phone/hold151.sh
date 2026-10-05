#!/bin/sh
# P-151 (the P-142 bisect) phone hold: a copy of fixes/v9-2/phone/hold142.sh with the ticket, the block argument, the
# folders, the labels (p151-<Q>-) and the servers (serve151.sh) changed; parts X and S only (M, H and R are refused).
# Blocks (fixes/v9-2/README.md "P-151"): Q1 C = v9.2 - scb, V = v9.2; Q2 C = v9.2 - g11, V = v9.2; Q3 C = v9-final,
# V = v9-final + 7d. Scripts: X = p121/flick-end-v2.json speed=fast, S = the same speed=slow (pins as P-142).
# Every G run (both arms, warm-ups too) carries nav-hit-cache's flicker logger (--inject flicker-inject.mjs).
# The running block's servers must be up (sh fixes/v9-2/phone/serve151.sh <Q>); the served-hash check before every item
# names the block. Committed before any P-151 data. Refuses to run unless TICKET=P-151.
# N2 (as P-142): every G part in the hold is compiled with `iphone.mjs gesture --dry-run` and its GESTURE_HASH must equal
# the pin below, else HOLD VOID (exit 4).
# Usage (runner; a phone hold with the block mark, and inside it an exclusive no-timing chrome-measure hold):
#   TICKET=P-151 RUNNER=int-v8 node tools/lock.mjs run iphone --owner int-v8 --block P-151 --max-seconds 900 --keep 120 -- \
#     node tools/lock.mjs run chrome-measure --owner int-v8 --no-timing --max-seconds 600 --doing "P-151 Q1 Ha" \
#     -- caffeinate -i -s sh fixes/v9-2/phone/hold151.sh Q1 Ha sCo wgXC wgXV gXC1 gXV1 gXV2 sCc
# Time guard (as P-142): no G item starts when elapsed + 180 s > 600 s: the rest is skipped, Safari parked, HOLD VOID
# "time" (exit 7), re-run whole.
# Items:
#   sCo / sCc            uncounted S sentinel on the block's control C opening / closing a G hold (labels per hold)
#   wg<P>C / wg<P>V      uncounted G warm-up of part P (X | S)
#   g<P>C<n> / g<P>V<n>  counted G run n of part P
# Last line: "HOLD <Q> <H> VALID" (exit 0) or "HOLD <Q> <H> VOID <why>" (exit 3/4/5/6; 7 = time guard). Nothing here
# prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-151 ] || { echo "TICKET is not P-151: no run"; exit 2; }
Q=$1; shift
case "$Q" in Q1|Q2|Q3) ;; *) echo "unknown block '$Q' (Q1|Q2|Q3): no run"; exit 2 ;; esac
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p151/snap; O=out/p151/runs; G1=fixes/v9-best/phone/p121; G2=fixes/v9-best/phone/p122; G3=fixes/v9-2/phone
INJ=fixes/nav-hit-cache/flicker-inject.mjs
[ "$(cat $S/block 2>/dev/null)" = "$Q" ] || { echo "HOLD $Q $H VOID the running servers are block '$(cat $S/block 2>/dev/null)', not $Q (no run)"; exit 4; }
mkdir -p $O
PROG_X=21aaafd3a9fd; PROG_S=7312cdcd2574
script() { case $1 in X) echo "$G1/flick-end-v2.json --param speed=fast" ;; S) echo "$G1/flick-end-v2.json --param speed=slow" ;; esac; }
prog() { case $1 in X) echo $PROG_X ;; S) echo $PROG_S ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
late() { [ $(( $1 - T0 + 180 )) -gt 600 ]; }
echo "HOLD $Q $H ($TICKET) start $(date -u +%FT%TZ) items $*"
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
echo "PIN $Q $H $TICKET profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $G3/hold151.sh $G3/score151.mjs $G3/score142.mjs $G3/serve151.sh $G2/score.mjs $INJ fixes/nav-hit-cache/flicker-gate.mjs fixes/v9-best/phone/score.mjs fixes/v8-best/phone/score.mjs \
  $G1/gate.mjs research/phone-thermal-gate/thermal-gate.mjs research/phone-thermal-gate/verdict.mjs \
  fixes/rest-script/tools/pmcheck.mjs $G1/flick-end-v2.json $S/$Q/HASHES.txt)"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p151-$Q-$H-$1" --expect serious --max-c 44 --accept-induced --url "$B"; }
SR="--driver scroll --probe std --owner $R --block $TICKET"
PARTS=""
for I in "$@"; do case $I in
  sC[oc]) ;;
  wg[XS][CV]) PARTS="$PARTS $(echo "$I" | cut -c3)" ;;
  g[XS][CV][0-9]*) PARTS="$PARTS $(echo "$I" | cut -c2)" ;;
  wg[MHR]*|g[MHR]*) echo "HOLD $Q $H VOID item $I: P-151 runs parts X and S only (no run)"; exit 4 ;;
  *) echo "HOLD $Q $H VOID unknown item $I (no run)"; exit 4 ;;
esac; done
if [ -n "$PARTS" ]; then
  node tools/iphone.mjs wda check > "$O/p151-$Q-$H-wda.log" 2>&1; w=$?
  [ $w -ne 0 ] && { echo "HOLD $Q $H VOID wda check exit $w (no run)"; exit 5; }
  for P in $(echo $PARTS | tr ' ' '\n' | sort -u); do
    h=$(node tools/iphone.mjs gesture $(script $P) --dry-run 2>&1 | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p')
    [ "$h" = "$(prog $P)" ] || { echo "HOLD $Q $H VOID part $P compiled program ${h:-none}, pinned $(prog $P) (N2, no run)"; exit 4; }
    echo "PROG $P $h ok"
  done
fi
gate start; g=$?
[ $g -ne 0 ] && { echo "HOLD $Q $H VOID start gate exit $g (no counted run)"; exit 5; }
BAD=""
for I in "$@"; do
  case $I in wg*|g*) now=$(date +%s)
    if late "$now"; then echo "HOLD $Q $H VOID time: $I would start at $((now - T0)) s (+ 180 > 600), items from $I on skipped; re-run the hold whole"
      node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi ;; esac
  sh $G3/serve151.sh check "$Q" > "$O/p151-$Q-$H-check-$I.log" 2>&1 || { echo "HOLD $Q $H VOID served hash check failed before $I"; exit 4; }
  case $I in
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=p151-$Q-$I-$H ;;
    wg[XS][CV]) P=$(echo "$I" | cut -c3); A=$(echo "$I" | cut -c4); K=G; L=p151-$Q-$I-$H ;;
    g[XS][CV][0-9]*) P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=p151-$Q-$I ;;
  esac
  case $A in C) U=$CU ;; V) U=$VU ;; esac
  [ -e "$O/$L.json" ] && { mv "$O/$L.json" "$O/$L.json.prev-$H-$(date +%s)" || { echo "HOLD $Q $H VOID cannot move aside $O/$L.json"; exit 4; }
    echo "MOVED $L.json aside (an earlier hold's file)"; }
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $Q $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $EX --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) node tools/iphone.mjs gesture $(script $P) --inject $INJ --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  if [ $r -ne 0 ] || [ ! -s "$O/$L.json" ]; then
    echo "ITEM $I VOID exit $r$( [ -s "$O/$L.json" ] || echo ', no run file')"
    case $I in g[XS][CV][0-9]*) BAD="$BAD $I" ;; esac
  fi
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $Q $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $Q $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$BAD" ] && { echo "HOLD $Q $H VOID counted item(s) failed:$BAD"; exit 6; }
echo "HOLD $Q $H VALID $(($(date +%s) - T0)) s"

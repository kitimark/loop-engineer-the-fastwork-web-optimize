#!/bin/sh
# P-136 nav-hit-cache U2 short phone no-worse check (C = v9-final + rev 7d, main 189ca7ed, vs V = C + U2; README "P-136"):
# one phone hold. A copy of P-122's fixes/v9-best/phone/p122/hold122.sh (ec6cc97f190b: wda check before a G hold, N2
# compiled-program pins, item exits, stale run files moved aside, time guard, thermal gates, sleep check) with only
# P-136's items, folders and servers changed: G parts X and S only (U2 acts only while the morph is open at the page
# end; no M or R part), on P-121's path-matched script:
#   X = fixes/v9-best/phone/p121/flick-end-v2.json speed=fast, S = the same speed=slow.
# Every G run (both arms, warm-ups too) carries nav-hit-cache's flicker logger (--inject flicker-inject.mjs; its gate
# flicker-gate.mjs). Servers: p136/serve136.sh, copies out/p136/snap (HASHES.txt). Run files: out/p136/runs.
# Committed before any P-136 data. Refuses to run unless TICKET=P-136.
# Usage (runner; a phone hold with the block mark, and inside it an exclusive no-timing chrome-measure hold):
#   TICKET=P-136 node tools/lock.mjs run iphone --owner iphone-runner --block P-136 --max-seconds 900 -- \
#     node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 \
#     --doing "nav U2 P-136 H1" -- caffeinate -i -s sh fixes/nav-hit-cache/p136/hold136.sh H1 sCo wgXC wgXV gXC1 gXV1 gXV2 sCc
# Holds (README "P-136"): H1 sCo wgXC wgXV gXC1 gXV1 gXV2 sCc | H2 sCo gXC2 gXC3 gXV3 gXV4 gXC4 sCc |
#   H3 sCo wgSC wgSV gSC1 gSV1 gSV2 sCc | H4 sCo gSC2 gSC3 gSV3 sCc (X: C V V C C V V C; S: C V V C C V).
# Time guard (P-122's, unchanged): no G item (wg* or g*) starts after 420 s of the 600 s hold (elapsed + 180 s > 600):
# the rest is skipped, Safari is parked, the hold is VOID "time" (exit 7) and is re-run whole.
# Items:
#   sCo / sCc            uncounted S sentinel on C opening / closing a G hold (labels per hold)
#   wg<P>C / wg<P>V      uncounted G warm-up of part P (X | S)
#   g<P>C<n> / g<P>V<n>  counted G run n of part P
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5/6; 7 = time guard). Nothing here prints the LAN address.
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-136 ] || { echo "TICKET is not P-136: no run"; exit 2; }
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/p136/snap; O=out/p136/runs; G1=fixes/v9-best/phone/p121; G2=fixes/nav-hit-cache/p136
INJ=fixes/nav-hit-cache/flicker-inject.mjs
mkdir -p $O
# N2: compiled program pins (GESTURE_HASH sha256/12), from iphone.mjs gesture --dry-run on the pinned scripts
PROG_X=21aaafd3a9fd; PROG_S=7312cdcd2574
script() { case $1 in X) echo "$G1/flick-end-v2.json --param speed=fast" ;; S) echo "$G1/flick-end-v2.json --param speed=slow" ;; esac; }
prog() { case $1 in X) echo $PROG_X ;; S) echo $PROG_S ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
late() { [ $(( $1 - T0 + 180 )) -gt 600 ]; }
echo "HOLD $H ($TICKET) start $(date -u +%FT%TZ) items $*"
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
echo "PIN $H $TICKET profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  $G2/hold136.sh $G2/score.mjs $G2/serve136.sh $INJ fixes/nav-hit-cache/flicker-gate.mjs fixes/v9-best/phone/p122/score.mjs \
  fixes/v9-best/phone/score.mjs fixes/v8-best/phone/score.mjs \
  $G1/gate.mjs research/phone-thermal-gate/thermal-gate.mjs research/phone-thermal-gate/verdict.mjs \
  fixes/rest-script/tools/pmcheck.mjs $G1/flick-end-v2.json $S/HASHES.txt)"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p136-$H-$1" --expect serious --max-c 44 --accept-induced --url "$B"; }
SR="--driver scroll --probe std --owner $R --block $TICKET"
PARTS=""
for I in "$@"; do case $I in
  sC[oc]) ;;
  wg[XS][CV]) PARTS="$PARTS $(echo "$I" | cut -c3)" ;;
  g[XS][CV][0-9]*) PARTS="$PARTS $(echo "$I" | cut -c2)" ;;
  *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;;
esac; done
if [ -n "$PARTS" ]; then
  node tools/iphone.mjs wda check > "$O/p136-$H-wda.log" 2>&1; w=$?
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
  sh $G2/serve136.sh check > "$O/p136-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  case $I in
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=p136-$I-$H ;;
    wg[XS][CV]) P=$(echo "$I" | cut -c3); A=$(echo "$I" | cut -c4); K=G; L=p136-$I-$H ;;
    g[XS][CV][0-9]*) P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=p136-$I ;;
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
    case $I in g[XS][CV][0-9]*) BAD="$BAD $I" ;; esac
  fi
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$BAD" ] && { echo "HOLD $H VOID counted item(s) failed:$BAD"; exit 6; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

#!/bin/sh
# v9 phone no-worse check (v8 C vs v9 V; PHONE TICKET draft in fixes/v9-best/README.md): one phone hold. A copy of
# fix-double-drive's P-118 hold.sh (fixes/double-drive/phone/hold.sh, itself a copy of int-v8's P-116 hold.sh) with
# this ticket's arms and P-111's legs: M (iphone.mjs run --driver morph, P-098's driver, as P-111) and G parts M and E
# (P-105's flick scripts, byte for byte). The served check before every item, the park after every G run, the gates and
# the sleep check are P-118's, unchanged. Profile xcode-serious (user T-162 #3): no heat pre-warm; the start and end
# gates run thermal-gate.mjs --accept-induced (PASS = Serious AND induced by Xcode, battery < 44 C, not Critical).
# Committed before any phone data. Refuses to run until the lead registered the ticket (TICKET=P-120 in the env).
# Checkout: int-v8's worktree (.claude/worktrees/agent-a068af37646232e05): the runner calls this file by its path there;
# it cds to that checkout, reads out/pv9/snap/serve-*.json and runs serve.sh check there. The PIN line at each hold
# start names the checkout, its HEAD and the sha256/12 of every script and pinned tool (ops gap G1).
# Runs under the iphone lease held by the runner (RUNNER, default iphone-runner), INSIDE the runner's exclusive no-timing
# hold, so no shared job runs beside it:
#   TICKET=P-<id> node tools/lock.mjs run chrome-measure --owner iphone-runner --no-timing --max-seconds 600 \
#     --doing "v9 H1" -- caffeinate -i -s sh fixes/v9-best/phone/hold.sh H1 wC wV mC1 mV2 mV3 mC4
#   ... H2 mC5 mV6 mV7 mC8
#   ... H3 sCo wgMC wgMV gMC1 gMV1 gMV2 gMC2 gMC3 gMV3 sCc
#   ... H4 sCo wgEC wgEV gEC1 gEV1 gEV2 gEC2 gEC3 gEV3 sCc
# Amendment A2 (P-120, after H1; README "Amendment A2"): H1's M runs are void and H2 is replaced by H2' = holds H5, H6:
#   ... H5 wC wV nC1 nV2 nV3 nC4
#   ... H6 wC wV nC5 nV6 nV7 nC8
# Items:
#   wC / wV          uncounted S load warm-up on that arm's port (A3/U5)
#   mC<n> / mV<n>    H1's M items: refused since A2 (the hold ends VOID before its gate)
#   nC<n> / nV<n>    counted M run n (A2): the same driver call in both arms, --cycles 4 (score.mjs trimM drops all up
#                    to m = 0 after the first close, then scores O1 C1 O2 C2 O3 C3 as P-111); every counted C M run is
#                    a validity sentinel (held m=1 p95 <= 18 ms, P-111)
#   sCo / sCc        uncounted S run on C as the validity sentinel, opening / closing a G hold (labels apart, per hold:
#                    pv9-sCo-<H> / pv9-sCc-<H>)
#   wg<P>C / wg<P>V  uncounted G warm-up of part P (M | E) on that arm's port
#   g<P>C<n> / g<P>V<n>  counted G run n of part P: M = flick-middle-v1.json (sha256/12 0f97205f1d42), E =
#                    flick-end-v1.json (93a1cf7bb091), both fixes/v8-best/phone/g/
# The servers (sh fixes/v9-best/phone/serve.sh) are up before the hold; B = the plain baseline (no overlay), the gate's
# timer page. Before every item the served JS/CSS of all three ports is re-checked (serve.sh check; a wrong hash ends
# the hold VOID). Nothing here prints the LAN address (Hard rule 12).
# Steps: 0. (A2) a hold with any G item first runs iphone.mjs wda check (I-112): exit != 0 ends the hold VOID before the
# gate; 1. the start gate (once; no pre-warm, no retry); 2. the items in order (each G run parks Safari); 3. the end
# gate after the last run, then the I-098 sleep check over the hold (fixes/rest-script/tools/pmcheck.mjs).
# Item exits (A2, lead ruling after H3a): an item that exits non-zero or writes no run file is void ("ITEM <I> VOID");
# any void counted item (n.., g..) voids the hold (exit 6, after the end gate and sleep check so the log is complete);
# a void warm-up or sentinel item is reported and left to the scorer (a sentinel without data voids its runs).
# Gate exits: 0 PASS; 2 condition dropped or Nominal/Fair; 3 ceiling (Critical or battery >= 44 C); 7 real heat instead
# of the Xcode condition (another profile, never pooled); any non-zero voids the hold (P-116's failure path). A failing
# sentinel (scored later) voids every run since the last passing one; the block is rerun with no cooling wait.
# Before the items it prints the hold's lock state (chrome-measure line only), so the block log shows the exclusive
# hold; every run record keeps the Mac load (mac.start / mac.end load1).
# Last line: "HOLD <H> VALID" (exit 0) or "HOLD <H> VOID <why>" (exit 3/4/5/6).
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$TICKET" ] || { echo "TICKET unset: the v9 ticket is not registered yet, no run (set TICKET=P-<id>)"; exit 2; }
H=$1; shift
R=${RUNNER:-iphone-runner}
S=out/pv9/snap; O=out/pv9/runs; G=fixes/v8-best/phone/g
mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$1.json','utf8')).port)"; }
B=$(node tools/lan.mjs --url --port "$(port B)") || exit 2
CU=$(node tools/lan.mjs --url --port "$(port C)") || exit 2
VU=$(node tools/lan.mjs --url --port "$(port V)") || exit 2
T0=$(date +%s)
echo "HOLD $H ($TICKET) start $(date -u +%FT%TZ) items $*"
# PIN line (ops gap G1): sha256/12 of every script and pinned tool this hold uses, the snapshot's HASHES.txt, the checkout
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
echo "PIN $H $TICKET profile xcode-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $(git rev-parse --short=8 HEAD 2>/dev/null)$(pins \
  fixes/v9-best/phone/hold.sh fixes/v9-best/phone/serve.sh fixes/v9-best/phone/score.mjs fixes/v8-best/phone/score.mjs \
  research/phone-thermal-gate/thermal-gate.mjs research/phone-thermal-gate/verdict.mjs fixes/rest-script/tools/pmcheck.mjs \
  $G/flick-middle-v1.json $G/flick-end-v1.json $S/HASHES.txt)"
node tools/lock.mjs status 2>&1 | grep '^chrome-measure' | sed 's/checkout .*//'
gate() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "pv9-$H-$1" --expect serious --max-c 44 --accept-induced --url "$B"; }
SR="--driver scroll --probe std --owner $R --block $TICKET"
MR="--driver morph --probe std --owner $R --block $TICKET"
# A2: refuse H1's M items before anything runs; WDA check before the gate when the hold has a G item (I-112)
for I in "$@"; do case $I in m[CV][0-9]*) echo "HOLD $H VOID item $I: H1 M items are void under A2, use n<arm><n> (no run)"; exit 4 ;; esac; done
case " $* " in *" g"[ME]*|*" wg"[ME]*) node tools/iphone.mjs wda check > "$O/pv9-$H-wda.log" 2>&1; w=$?
  [ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; } ;; esac
gate start; g=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID start gate exit $g (no counted run)"; exit 5; }
BAD=""
for I in "$@"; do
  sh fixes/v9-best/phone/serve.sh check > "$O/pv9-$H-check-$I.log" 2>&1 || { echo "HOLD $H VOID served hash check failed before $I"; exit 4; }
  node tools/lock.mjs renew iphone --owner "$R" --ttl 900 > /dev/null
  case $I in
    wC) A=C; K=S; EX="--warmup --arm C"; L=pv9-wC-$H ;;
    wV) A=V; K=S; EX="--warmup --arm V"; L=pv9-wV-$H ;;
    sC[oc]) A=C; K=S; EX="--warmup --heat-sentinel --arm C"; L=pv9-$I-$H ;;
    n[CV][0-9]*) A=$(echo "$I" | cut -c2); K=M; EX="--arm $A --run ${I#n?} --cycles 4"; L=pv9-$I ;;
    wg[ME][CV]) P=$(echo "$I" | cut -c3); A=$(echo "$I" | cut -c4); K=G; L=pv9-$I-$H ;;
    g[ME][CV][0-9]*) P=$(echo "$I" | cut -c2); A=$(echo "$I" | cut -c3); K=G; L=pv9-$I ;;
    *) echo "HOLD $H VOID unknown item $I"; exit 4 ;;
  esac
  case $A in C) U=$CU ;; V) U=$VU ;; esac
  [ "$K" = G ] && case $P in M) SC=$G/flick-middle-v1.json ;; E) SC=$G/flick-end-v1.json ;; esac
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open $A failed at $I"; exit 4; }
  case $K in
    S) node tools/iphone.mjs run $SR $EX --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    M) node tools/iphone.mjs run $MR $EX --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$? ;;
    G) node tools/iphone.mjs gesture "$SC" --owner "$R" --label "$L" --out "$O/$L.json" > "$O/$L.log" 2>&1; r=$?
       node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1 ;;
  esac
  echo "RUN $I exit $r $(date -u +%TZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  if [ $r -ne 0 ] || [ ! -s "$O/$L.json" ]; then
    echo "ITEM $I VOID exit $r$( [ -s "$O/$L.json" ] || echo ', no run file')"
    case $I in n[CV][0-9]*|g[ME][CV][0-9]*) BAD="$BAD $I" ;; esac
  fi
done
gate end; g=$?
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$BAD" ] && { echo "HOLD $H VOID counted item(s) failed:$BAD"; exit 6; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

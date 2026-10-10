#!/bin/sh
# P-095o runner (fixes/hero-exit-threaded/README.md "P-095o"): one 600 s --no-timing chrome-measure hold of the P-095o
# block, the original (O) next to P-095's C (v4 = best-build) and V (v6 = B-R2) in the hero, on P-095's script and
# scorers. Shape and rules from fixes/end-bg/phone/p137o-hold.sh; run rules from P-095's card (iphone-runner's p095.mjs):
#   G driver fixes/hero-exit-threaded/gestures/hero-pass-v1.json (compiled program pinned c414f67158e3), Timeline on for
#   counted runs, band y 1..780; void = gesture exit/abort/errors, no Timeline file, scoreF.mjs's own void rules on the
#   single run (Timeline errors or > 1 epoch, > 10 % uncovered moving band frames), LPM (median dt > 25 ms).
#   Sentinel: P-095's heat sentinel on C, `iphone.mjs run --driver scroll --probe std --heat-sentinel` (bottom >= 58 fps,
#   scroll >= 44 fps), Timeline off.
# Condition: tool-held Serious (FW_PHONE_CONDITION=tool, set by block.sh's rearm; P-095 on 4 Oct was REAL Serious),
# thermal-gate.mjs --accept-induced --max-c 44 at the phone hold's edges (P095O_GATE), fallback profile read on a gate
# read error (I-259). Safari pinned by pid (I-262).
# Items: wO wC wV (uncounted warm-ups, --warmup, Timeline off) -> g-w<A>-<H>.json; S0 S1 (sentinels on C) -> s-<S>.json;
#   O1..O3 C1..C3 V1..V3 (counted) -> g-<item>.json + tl-<item>.json; <item>r = the one re-run of a void counted run.
# Last line: "HOLD <H> VALID <s> s" (exit 0) or "HOLD <H> VOID <why>" (exit 3 end gate / sleep / misfit, 4 setup,
# 5 start gate / WDA, 7 time guard, 8 sentinel FAIL). Prints no LAN address (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
[ "$TICKET" = P-095o ] || { echo "TICKET is not P-095o: no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: TICKET=P-095o sh fixes/hero-exit-threaded/p095o/hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-cap-end-orig}; K=fixes/hero-exit-threaded/p095o
O=out/p095o/runs; SV=out/p095o
G=fixes/hero-exit-threaded/gestures/hero-pass-v1.json; PROG=c414f67158e3
SCORE=fixes/hero-exit-threaded/pF/scoreF.mjs
GM=${P095O_GATE:-both}
export FW_PHONE_CONDITION=tool
mkdir -p $O $O/void
for I in "$@"; do case $I in w[OCV]|S0|S1|[OCV][1-3]|[OCV][1-3]r) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)"; }
PO=$(port O) && PC=$(port C) && PV=$(port V) && PB=$(port B) || { echo "HOLD $H VOID no server state (start $K/serve.sh first)"; exit 4; }
hashok() { sh $K/serve.sh check > /dev/null; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
safpid() { SP=$(curl -s --max-time 5 http://127.0.0.1:8100/wda/activeAppInfo | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).value;console.log(v.bundleId==='com.apple.mobilesafari'?v.pid:'')}catch{console.log('')}})")
  [ -n "$SP" ] && export FW_IPHONE_APPID=PID:$SP; }
T0=$(date +%s)
echo "HOLD $H (P-095o) start $(date -u +%FT%TZ) items $* gates $GM"
echo "PIN $H P-095o profile xcode-serious(tool-held) head $(git rev-parse --short=8 HEAD 2>/dev/null) baseline $(node -e "console.log(require('./baseline.json').snapshot)")$(pins \
  $K/hold.sh $K/block.sh $K/serve.sh $K/read.mjs $G $SCORE fixes/hero-exit-threaded/pF/framesF.mjs research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs)"
hashok || { echo "HOLD $H VOID served hashes: $(sh $K/serve.sh check | head -1) (no run)"; exit 4; }
echo "SERVED O C V ok"
BE=$(node tools/iphone.mjs gesture $G --owner "$R" --dry-run 2>&1)
hE=$(echo "$BE" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p'); sE=$(echo "$BE" | sed -n 's/^GESTURE_BUDGET_S \([0-9]*\).*/\1/p')
[ "$hE" = $PROG ] && [ -n "$sE" ] || { echo "HOLD $H VOID compiled program ${hE:-none} (pinned $PROG) (no run)"; exit 4; }
echo "PROG hero-pass $PROG ok, GESTURE_BUDGET_S $sE"
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
arm() { case $I in w?) echo $I | cut -c2 ;; S?) echo C ;; *) echo $I | cut -c1 ;; esac; }
fnof() { case $1 in O) echo "C:s=4163" ;; C) echo "C:s=4391" ;; V) echo "V:s=4503,heRest=4455" ;; esac; }  # writer lines: O baseline, C/V P-095's
if [ "$P095O_DRY" = 1 ]; then for I in "$@"; do echo "PLAN $I arm $(arm)"; done; echo "HOLD $H DRY ok"; exit 0; fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1 || { echo "HOLD $H VOID wda check failed (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$PB") || { echo "HOLD $H VOID no LAN url"; exit 4; }
gate() { safpid; node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p095o-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; g=$?
  if [ $g -eq 1 ]; then node tools/iphone.mjs profile --owner "$R" > "$O/$H-profile-$1.log" 2>&1; g=$?
    echo "GATE $1 fallback (thermal-gate read error): iphone.mjs profile exit $g $(tail -1 "$O/$H-profile-$1.log" | cut -c1-160)"; fi
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; return $g; }
case $GM in start|both) gate start || { echo "HOLD $H VOID start gate exit $? (no run)"; exit 5; } ;; *) echo "GATE start skipped" ;; esac
RERUN=""; SFAIL=""
for I in "$@"; do
  A=$(arm); case $I in S?) NEED=120 ;; *) NEED=$sE ;; esac
  if late $NEED; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s; re-run the hold whole"; node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  eval P=\$P$A; U=$(node tools/lan.mjs --url --port "$P")
  safpid
  k=0; until node tools/iphone.mjs open "$U" --owner "$R" > "$O/$H-open-$I.log" 2>&1; do
    k=$((k + 1)); [ $k -ge 3 ] && { echo "HOLD $H VOID open failed at $I"; exit 4; }; sleep 5; safpid; done
  case $I in
    w?) F=$O/g-$I-$H.json; node tools/iphone.mjs gesture $G --warmup --owner "$R" --label "p095o-$H-$I" --out $F > $O/g-$I-$H.log 2>&1; r=$? ;;
    S?) F=$O/s-$I.json; [ -e $F ] && mv $F $F.prev-$(date +%s)
        node tools/iphone.mjs run --driver scroll --probe std --owner "$R" --arm C --build v4-best-A --block P-095o --heat-sentinel --low-power off --label "p095o-$I" --out $F > $O/s-$I.log 2>&1; r=$? ;;
    *)  F=$O/g-$I.json; TL=$O/tl-$I.json
        for f in $F $TL; do [ -e $f ] && mv $f $O/void/$(basename $f .json)-$H-$(date +%s).json; done
        node tools/iphone.mjs gesture $G --owner "$R" --label "p095o-$H-$I" --timeline $TL --out $F > $O/g-$I.log 2>&1; r=$? ;;
  esac
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  TH=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$F','utf8')).meta.profile||{};const s=p.start||{},e=p.end||{};console.log((s.state||'?')+'/'+(e.state||'?')+' '+(s.battC??'?')+'->'+(e.battC??'?')+' C holder '+(e.holder||s.holder||'?'))}catch(e){console.log('? no record')}")
  echo "RUN $I arm $A exit $r $(date -u +%TZ) thermal $TH load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  [ $r -eq 8 ] && { echo "HOLD $H VOID profile misfit at $I (exit 8)"; exit 3; }
  case $I in
    w?) [ $r -ne 0 ] && echo "ITEM $I exit $r (uncounted warm-up; the hold goes on)" ;;
    S?) PS=$(node -e "try{const m=JSON.parse(require('fs').readFileSync('$F','utf8')).meta||{};console.log((m.sentinel?.pass===true?'PASS':'FAIL')+' '+JSON.stringify(m.sentinel?.value??null)+' rafHz '+m.rafHz)}catch(e){console.log('FAIL no record')}")
        echo "SENTINEL $I $PS (exit $r)"
        case $PS in PASS*) ;; *) SFAIL="$SFAIL $I"; [ $I = S0 ] && { echo "HOLD $H VOID SENTINEL S0 FAIL: no counted run starts"; exit 8; } ;; esac ;;
    *)  V=""
        [ $r -ne 0 ] && V="gesture exit $r"
        [ -s $F ] || V="$V no record"; [ -s $TL ] || V="$V no Timeline file"
        if [ -z "$V" ]; then
          MD=$(node -e "const g=JSON.parse(require('fs').readFileSync('$F','utf8'));const d=(g.run?.segments||[]).flatMap(s=>s.frames||[]).map(f=>f[1]).filter(x=>x>0).sort((a,b)=>a-b);console.log(d.length?d[d.length>>1]:0)")
          node -e "process.exit($MD > 25 ? 1 : 0)" || V="LPM suspected (median dt $MD)"
          TAG=$(fnof $A | cut -d: -f1)
          SL=$(node $SCORE $TAG:$F:$TL --fn "$(fnof $A)" --band 1:780 2>&1 | grep -E "^[CV] \S+: (VOID|valid)" | head -1)
          case "$SL" in *": valid"*) ;; *": VOID"*) V="$V scoreF $(echo "$SL" | sed 's/.*: VOID \(.*\); moving.*/\1/' | cut -c1-120)" ;; *) V="$V scoreF gave no row" ;; esac
          echo "SCOREF $I $(echo "$SL" | cut -c1-160)"
        fi
        if [ -n "$V" ]; then echo "ITEM $I VOID$V"; RERUN="$RERUN $(echo $I | cut -c1-2)"; fi ;;
  esac
done
g=0; case $GM in end|both) gate end; g=$? ;; *) echo "GATE end skipped" ;; esac
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN (one re-run each in the tail, before S1; at most 2 per block)"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
[ -n "$SFAIL" ] && { echo "HOLD $H VOID SENTINEL$SFAIL FAIL"; exit 8; }
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

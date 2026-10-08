#!/bin/sh
# P-166 stage 2 phone kit (card: fixes/g0-box/README.md "P-166", stage 2 signed by the lead 41b8b179, 10:06Z): ONE hold
# of the W attribution block (profile real-serious). A copy of p165-hold.sh (P-165's final heat rules) with W items:
#   - real heat only: the gate runs WITHOUT --accept-induced; nothing here sets a thermal condition;
#   - every phone run passes --profile real-serious (I-246);
#   - heat runs: the heat-fling WDA program (137ef5c2c60a) on the mirror's B port (P-165's heat-method rule: mirror is the
#     default), uncounted, one HEATRATE line each (out/p166ph/heatrate.log; memory heat-probe-for-blog);
#   - heat margin after a passing start gate: fling runs on the mirror while the battery reads under 39.0 C (none at
#     >= 39.0), at most 2 in an item hold, no re-gate (the end gate decides);
#   - GRIDCHECK: on every gate exit 6 with real Serious and an 8 ms timer grid, a Safari restart and one re-gate;
#     accepted only when that gate's own restart still reads < 25 ms (out/p166ph/grid-accept.txt).
# Arms (fixes/g0-box/phone/p166-serve.sh; out/p166/serve-<arm>.json):
#   B   the plain baseline: heat page and the gate's timer page             JS 4606120cf392  CSS 27776f3d4138
#   0   v0 (server v0)                                                      JS 4606120cf392  CSS 27776f3d4138
#   e   g0.0e (server e)                                                    JS 5c39f7a96e41  CSS d4e684032482
#   n   e-nohe knock-out (server enohe), spot A                             JS 779fc9f36fc1  CSS d4e684032482
#   f   g0.0f (server f), spot B                                            JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
# Spots (W driver, iphone.mjs run --driver window --probe std --hold 2 --sentinel 3):
#   A   --from 0 --to 750       (the first 3 steps of 250 px; he-css goes live at y > 30)
#   B   --from 4000 --to 5000   (jump, settle, idle 3 s, steps 4000 -> 5000; +is-play between 4500 and 4750)
# Items:
#   <S>w<a>    W warm-up at spot S on arm a's port (--warmup, Timeline off, uncounted)  -> w-<S>w<a>-<H>.json
#   <S><a><n>  W counted run n (1-3), Timeline on (--timeline), v0 runs judged as the heat sentinel (--arm C)
#                                                                                       -> w-<S><a><n>.json + tl-<S><a><n>.json
#   <S>s0      the Timeline-off v0 control sentinel at the spot's end (uncounted, --heat-sentinel, never --warmup)
#   PW         a heat hold: fling heat runs on the mirror, the gate after every 3rd, until the gate passes
# Lines: RUN <item> arm <a> exit <r> ... | SENTINEL <item> PASS|FAIL ... | ITEM <item> VOID ... | RERUN-NEEDED <items> |
#   HOLD <H> VALID <s> s [SENTINEL-FAIL <items>] (exit 0 / 8) | HOLD <H> VOID <why> (3 end gate/sleep, 4 setup, 5 TOOCOOL,
#   6 CEILING, 7 time, 9 INDUCED, 10 heat page). CM_DRY=1: pins, served hashes, the tools head and the plan only.
#   CM_TICKET=P-166 sh fixes/g0-box/phone/p166-hold.sh <H> <item> ...
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set (the signed ticket id): no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-166 sh fixes/g0-box/phone/p166-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-fix-g0-box}
SV=out/p166; LG=out/p166ph; O=out/p166ph/runs
PROF="--profile real-serious"
HF=fixes/g0-box/phone/heat-fling.json; PROG_HF=137ef5c2c60a
HR=$LG/heatrate.log; GA=$LG/grid-accept.txt
SELF=fixes/g0-box/phone/p166-hold.sh
TOOLS_MIN=db884e9d   # iphone.mjs run --timeline (I-247); the signature's condition 1
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
BUDGET_W=${CM_BUDGET_W:-75}; BUDGET_PW=120
mkdir -p $O
for I in "$@"; do case $I in [AB]w[0enf]|[AB][0enf][1-3]|[AB][0enf][1-3]x|[AB]s0|PW) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
srv() { case $1 in 0) echo v0 ;; e) echo e ;; n) echo enohe ;; f) echo f ;; B) echo B ;; esac; }
pin() { case $1 in B|0) echo "4606120cf392 27776f3d4138" ;; e) echo "5c39f7a96e41 d4e684032482" ;; n) echo "779fc9f36fc1 d4e684032482" ;; f) echo "30fd80ccbb3f 1d1e5d62a2c4" ;; esac; }
alet() { case $1 in 0) echo C ;; e) echo A ;; n) echo B ;; f) echo V ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)" 2>/dev/null; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
ARMS_USED="B"; for I in "$@"; do case $I in PW) ;; *) a=$(echo "$I" | cut -c2); [ "$a" = w ] || [ "$a" = s ] && a=$(echo "$I" | cut -c3); case " $ARMS_USED " in *" $a "*) ;; *) ARMS_USED="$ARMS_USED $a" ;; esac ;; esac; done
for a in B 0 e n f; do eval "P_$a=\$(port $(srv $a))"; done
hashok() { for a in $ARMS_USED; do eval "p=\$P_$a"; [ -n "$p" ] || return 1; [ "$(served $p $JS) $(served $p $CSS)" = "$(pin $a)" ] || return 1; done; }
hashline() { for a in $ARMS_USED; do eval "p=\$P_$a"; printf ' %s(%s) %s/%s' "$a" "$(srv $a)" "$(served $p $JS)" "$(served $p $CSS)"; done; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
HEAD=$(git rev-parse --short=8 HEAD 2>/dev/null)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* profile real-serious"
echo "PIN $H $CM_TICKET profile real-serious checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $HEAD$(pins \
  $SELF fixes/g0-box/phone/p166-block.sh fixes/g0-box/phone/p166-serve.sh fixes/g0-box/phone/p166-run.sh $HF \
  research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs tools/iphone.mjs tools/lib/iphone-run.mjs tools/lib/gesture-run.mjs)"
git merge-base --is-ancestor $TOOLS_MIN HEAD 2>/dev/null || { echo "HOLD $H VOID tools head $HEAD does not contain $TOOLS_MIN (run --timeline, I-247) (no run)"; exit 4; }
echo "TOOLS head $HEAD contains $TOOLS_MIN (run --timeline) ok"
hashok || { echo "HOLD $H VOID served hashes$(hashline) (no run)"; exit 4; }
echo "SERVED$(hashline) ok"
HFOK=0
if [ -f "$HF" ]; then
  HB=$(node tools/iphone.mjs gesture $HF --owner "$R" --dry-run 2>&1)
  hh=$(echo "$HB" | sed -n 's/^GESTURE_HASH \(.\{12\}\).*/\1/p')
  if [ "$hh" = "$PROG_HF" ]; then HFOK=1; echo "HEAT fling $PROG_HF ok (on the mirror's B port, ~120 s per run)"
  else echo "HEAT fling ${hh:-none} (pinned $PROG_HF): not used, scroll runs on B instead"; fi
fi
spot() { echo "$1" | cut -c1; }
armof() { case $1 in ?w?) echo "$1" | cut -c3 ;; ?s0) echo 0 ;; *) echo "$1" | cut -c2 ;; esac; }
range() { case $(spot $1) in A) echo "--from 0 --to 750" ;; B) echo "--from 4000 --to 5000" ;; esac; }
desc() { case $1 in ?w?) echo "W warm-up (--warmup, Timeline off, uncounted)" ;; ?s0) echo "Timeline-off v0 control sentinel (uncounted)" ;; ?0*) echo "W counted, Timeline on, heat sentinel" ;; *) echo "W counted, Timeline on" ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $I in
    PW) echo "PLAN $I heat hold: fling heat runs on the mirror B port (--warmup $PROF), the gate after every 3rd, until it passes" ;;
    *) echo "PLAN $I spot $(spot $I) arm $(armof $I) ($(srv $(armof $I))) $(range $I) $(desc $I) $PROF (budget $BUDGET_W s)" ;; esac; done
  echo "PLAN gates thermal-gate.mjs --expect serious --max-c 44 (no --accept-induced) at the start and the end; margin 39.0 C"
  echo "HOLD $H DRY ok"; exit 0
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
BU=$(node tools/lan.mjs --url --port "$P_B") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
hread() { node fixes/g0-box/phone/heatread.mjs 2>/dev/null; }
HP=
hflush() { [ -n "$HP" ] || return 0; L="$HP state1=${1:-?}"; echo "$L"; echo "$(date -u +%FT%TZ) $H $L" >> $HR; HP=; }
gstate() { tail -1 out/thermal-gate/gates.jsonl 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).state||"?")}catch{console.log("?")}})'; }
gfield() { tail -1 out/thermal-gate/gates.jsonl 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s),k=process.argv[1];const v=k==="median"?(r.timer&&r.timer.median):r[k];console.log(v===undefined||v===null?"?":v)}catch{console.log("?")}})' "$1"; }
gate1() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p166-$H-$1" --expect serious --max-c 44 --url "$BU"; }
gate() {
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  gate1 "$1"; gr=$?
  if [ $gr -eq 1 ]; then echo "GATE $1 no read (exit 1): safari-restart, then once more"
    node tools/iphone.mjs safari-restart --owner "$R" --url "$BU" --timeout 60 > "$O/$H-gate-restart.log" 2>&1
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    gate1 "$1"; gr=$?; fi
  if [ $gr -eq 6 ] && [ "$(gfield state)" = Serious ] && [ "$(gfield induced)" = No ] && [ "$(gfield median | cut -d. -f1)" -lt 25 ] 2>/dev/null; then
    GR=0
    echo "GRIDCHECK $H $1 before: state Serious induced No timer $(gfield median) ms batt $(gfield battC) C: safari-restart, then re-gate"
    node tools/iphone.mjs safari-restart --owner "$R" --url "$BU" --timeout 60 > "$O/$H-grid-restart.log" 2>&1; rr=$?
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    gate1 "$1"; gr=$?
    echo "GRIDCHECK $H $1 after (safari-restart exit $rr): gate exit $gr state $(gfield state) induced $(gfield induced) timer $(gfield median) ms"
    [ $gr -eq 6 ] && [ "$(gfield state)" = Serious ] && [ "$(gfield induced)" = No ] && [ "$(gfield median | cut -d. -f1)" -lt 25 ] 2>/dev/null && { GR=1; echo "$(date -u +%FT%TZ) $H $1 timer $(gfield median) ms after safari-restart: exit 6 accepted (lead ruling)" >> $GA; }
    if [ $gr -eq 6 ] && [ $GR = 1 ]; then echo "GATE $1 exit 6 accepted (lead ruling: real Serious, induced No; timer grid $(gfield median) ms recorded, not judged)"; gr=0; fi
  fi
  return $gr
}
NPW=0
prewarm() { # one uncounted heat run on the mirror's B port, with its HEATRATE line
  NPW=$((NPW + 1)); M=$([ $HFOK = 1 ] && echo fling || echo scroll)
  t0=$(hread); s0=$(date +%s)
  node tools/iphone.mjs open "$BU" --owner "$R" > "$O/pw-$H-$NPW-open.log" 2>&1 || { hflush "?"; echo "HOLD $H VOID open of the heat page failed (HEATOPEN): $(tail -1 "$O/pw-$H-$NPW-open.log" | cut -c1-100)"; exit 10; }
  if [ $HFOK = 1 ]; then node tools/iphone.mjs gesture $HF --warmup $PROF --owner "$R" --label "p166-$H-pw$NPW-fling" --out "$O/pw-$H-$NPW.json" > "$O/pw-$H-$NPW.log" 2>&1; pr=$?
  else node tools/iphone.mjs run --driver scroll --probe std $PROF --warmup --owner "$R" --block "$CM_TICKET" --label "p166-$H-pw$NPW" --out "$O/pw-$H-$NPW.json" > "$O/pw-$H-$NPW.log" 2>&1; pr=$?; fi
  ok=1
  if [ $pr -ne 0 ] && [ $pr -ne 8 ]; then ok=0; pr="$M $pr"
    node tools/iphone.mjs open "$BU" --owner "$R" > /dev/null 2>&1
    node tools/iphone.mjs scroll --warmup $PROF --owner "$R" --label "p166-$H-pw$NPW-s" > "$O/pw-$H-$NPW-s.log" 2>&1; pr="$pr, scroll fallback $?"; fi
  t1=$(hread); s1=$(date +%s); st0=$(grep -m1 -o 'phone is [A-Za-z]*' "$O/pw-$H-$NPW.log" | sed 's/phone is //')
  hflush "${st0:-?}"
  rate=$(node -e 'const [a,b,s]=process.argv.slice(1).map(Number);console.log(Number.isFinite(a)&&Number.isFinite(b)&&s>0&&process.argv[1]!==""&&process.argv[2]!==""?((b-a)/s*60).toFixed(3):"?")' "$t0" "$t1" "$((s1 - s0))")
  [ "$rate" = "?" ] && ok=0
  HP="HEATRATE method=$M page=mirror t0=${t0:-?} t1=${t1:-?} sec=$((s1 - s0)) rate=$rate state0=${st0:-?} ok=$ok"
  echo "PREWARM $NPW ($M on the mirror) exit $pr $(date -u +%TZ)"
}
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
case " $* " in *" PW "*) PWMAX=12; PWEVERY=3 ;; *) PWMAX=2; PWEVERY=1 ;; esac
gate start; g=$?
while [ $g -eq 2 ] && [ $NPW -lt $PWMAX ] && ! late $BUDGET_PW; do
  prewarm
  if [ $((NPW % PWEVERY)) -eq 0 ] || [ $NPW -ge $PWMAX ] || late $BUDGET_PW; then gate start; g=$?; hflush "$(gstate)"; fi
done
hflush "?"
case $g in
  0) echo "START GATE PASS after $NPW pre-warm run(s)" ;;
  2) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate too cool after $NPW pre-warm run(s) (TOOCOOL)"; exit 5 ;;
  3) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate ceiling (CEILING: Critical or battery >= 44 C)"; exit 6 ;;
  4) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate: Serious is induced (INDUCED): stop the block"; exit 9 ;;
  1) node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate: no read twice (GATEERR)"; exit 4 ;;
  *) [ $HFOK = 1 ] && { prewarm; hflush "?"; }
     node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; echo "HOLD $H VOID start gate exit $g (no counted run; $NPW heat run(s))"; exit 5 ;;
esac
MARGIN_C=39.0
case " $* " in *" PW "*) MMAX=6 ;; *) MMAX=2 ;; esac
NEED=0; PRE=0
for I in "$@"; do case $I in PW) ;; *) [ $((PRE + BUDGET_W + 30)) -gt $NEED ] && NEED=$((PRE + BUDGET_W + 30)); PRE=$((PRE + BUDGET_W)) ;; esac; done
below() { [ -n "$1" ] && node -e 'process.exit(Number(process.argv[1]) < Number(process.argv[2]) ? 0 : 1)' "$1" "$MARGIN_C"; }
NM=0
if [ $HFOK = 1 ]; then
  while [ $NM -lt $MMAX ]; do
    bt=$(hread); below "$bt" || break
    [ $(( $(date +%s) - T0 + 160 + NEED )) -le 600 ] || { echo "MARGIN battery $bt C < $MARGIN_C C, but no time for a heat run ($NM done)"; break; }
    NM=$((NM + 1)); echo "MARGIN $NM: battery $bt C < $MARGIN_C C: fling heat run on the mirror before the first item"
    prewarm; hflush "?"
  done
  [ $NM -gt 0 ] && echo "MARGIN done: $NM heat run(s), battery $(hread) C"
fi
RERUN=""; SFAIL=""
for I in "$@"; do
  [ "$I" = PW ] && continue
  if late "$BUDGET_W"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $BUDGET_W + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  a=$(armof $I); eval "p=\$P_$a"; U=$(node tools/lan.mjs --url --port "$p") || { echo "HOLD $H VOID no LAN url at $I"; exit 4; }
  TL=""
  case $I in
    ?w?) F=w-$I-$H; EX="--warmup" ;;
    ?s0) F=w-$I-$H; EX="--arm C --heat-sentinel --run $I-$H" ;;
    *) F=w-$I; TL="--timeline $O/tl-$I.json"; EX="--arm $(alet $a) --run $I"; [ $a = 0 ] && EX="$EX --heat-sentinel" ;;
  esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ "$f" = "$O/tl-$I.json" ] && [ -z "$TL" ] && continue
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  ts=$(date +%s)
  node tools/iphone.mjs run --driver window --probe std $(range $I) --hold 2 --sentinel 3 $PROF $EX $TL --build "$(srv $a)" \
    --owner "$R" --block "$CM_TICKET" --label "p166-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$?
  if [ $r -eq 8 ]; then node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    echo "HOLD $H VOID profile misfit at $I ($(grep -m1 -E 'PROFILE|refus' "$O/$F.log" | cut -c1-100)) (TOOCOOL)"; exit 5; fi
  echo "RUN $I arm $a ($(srv $a)) spot $(spot $I) exit $r $(date -u +%TZ) $(( $(date +%s) - ts )) s load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    ?w?) [ $r -ne 0 ] && echo "ITEM $I exit $r (warm-up, uncounted; the hold goes on)" ;;
    ?s0|?0[1-3]|?0[1-3]x)
      if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "SENTINEL $I FAIL no record (exit $r)"; SFAIL="$SFAIL $I"; case $I in ?s0) ;; *) RERUN="$RERUN $I" ;; esac
      else
        sl=$(node -e "const j=JSON.parse(require('fs').readFileSync('$O/$F.json','utf8'));const m=j.meta||{},s=m.sentinel||{};const b=m.battery||{};const t=(b.end&&b.end.temperatureC)??(b.start&&b.start.temperatureC)??null;console.log((s.pass===true?'PASS':'FAIL')+' batt '+t+' C '+JSON.stringify({criterion:s.criterion,value:s.value})+(m.error?' error':''))")
        echo "SENTINEL $I $sl"
        case $sl in PASS*) ;; *) SFAIL="$SFAIL $I" ;; esac
      fi ;;
    *) if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "ITEM $I VOID exit $r"; RERUN="$RERUN $I"
       elif [ -n "$TL" ] && [ ! -s "$O/tl-$I.json" ]; then echo "ITEM $I VOID no Timeline file"; RERUN="$RERUN $I"; fi ;;
  esac
done
gate end; g=$?
node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
node fixes/rest-script/tools/pmcheck.mjs "$T0" "$(date +%s)"; p=$?
[ -n "$RERUN" ] && echo "RERUN-NEEDED$RERUN"
[ $g -ne 0 ] && { echo "HOLD $H VOID end gate exit $g"; exit 3; }
[ $p -ne 0 ] && { echo "HOLD $H VOID Mac sleep or dark wake in the hold (I-098)"; exit 3; }
if [ -n "$SFAIL" ]; then echo "HOLD $H VALID $(($(date +%s) - T0)) s SENTINEL-FAIL$SFAIL"; exit 8; fi
echo "HOLD $H VALID $(($(date +%s) - T0)) s"

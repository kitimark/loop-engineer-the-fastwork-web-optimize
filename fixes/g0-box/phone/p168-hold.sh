#!/bin/sh
# P-168 phone kit (card: fixes/g0-box/README.md "P-168"; DRAFT, nothing runs before the lead signs). A copy of P-166's
# p166-hold.sh via P-168's p168-hold.sh (stage 2, lead amendment 10:4xZ, user T-247 #12; lead ruling 11:1xZ) with P-168's arms 0 / e / k: ONE hold of the W attribution block, profile tool-serious (P-164's induced Serious
# via our tool: the block's `iphone.mjs rearm` starts a detached `thermal.mjs set serious`; no Xcode step, no heat phase,
# no margin, no cooling by state):
#   - the gates run WITH --accept-induced (the condition is ours); every phone run passes --profile serious and runs with
#     FW_PHONE_CONDITION=tool (exported by p168-block.sh), so a misfit names the rearm, never an Xcode step;
#   - a start gate that reads Critical (exit 3) or too cool (exit 2: the condition was lost), and a run that refuses
#     its profile (exit 8, MISFIT), void the hold before any counted run (exit 5); the block re-arms and runs it again.
# Arms (fixes/g0-box/phone/p168-serve.sh; out/p168/serve-<arm>.json; k = the part's candidate named by P168_K):
#   B   the plain baseline: the gate's timer page                           JS 4606120cf392  CSS 27776f3d4138
#   0   v0 (server v0)                                                      JS 4606120cf392  CSS 27776f3d4138
#   e   g0.0f (server f; the slot keeps P-168's letter)                     JS 30fd80ccbb3f  CSS 1d1e5d62a2c4
#   k   window A: f-cv25 (server fcv25)                                     JS b700ddaf88b4  CSS fa5888cfa299
#       (f-ko25, server fko25, JS 120386db2e02 CSS 1d1e5d62a2c4: diagnostic only, P168_K=fko25)
#       window B: g0.0g (server g)                                          JS 30fd80ccbb3f  CSS 2390e4715327
# Spots (W driver, iphone.mjs run --driver window --probe std --hold 2 --sentinel 3):
#   A   --from 0 --to 750       (the first 3 steps of 250 px; he-css goes live at y > 30)
#   B   --from 4000 --to 5000   (jump, settle, idle 3 s, steps 4000 -> 5000; +is-play between 4500 and 4750)
# Items:
#   <S>w<a>    W warm-up at spot S on arm a's port (--warmup, Timeline off, uncounted)  -> w-<S>w<a>-<H>.json
#   <S><a><n>  W counted run n (1-3), Timeline on (--timeline), v0 runs judged as the heat sentinel (--arm C)
#                                                                                       -> w-<S><a><n>.json + tl-<S><a><n>.json
#   <S>sC      the heat sentinel (lead ruling 11:1xZ, protocol §5.2 "Timeline blocks"): ONE uncounted Timeline-OFF S
#              control run on v0 (iphone.mjs run --driver scroll --probe std --arm C --heat-sentinel, to the page bottom,
#              never --warmup), at each part's start after the warm-ups and in the TAIL         -> s-<S>sC-<H>.json
#   Counted W runs (Timeline on) are never judged as sentinels (a W "bottom" is the window end, not the page bottom;
#   v0's W end phase at spot A reads 56 fps with Timeline off too: H1's Aw0). Only a failing sC stops the block.
# Lines: RUN <item> arm <a> exit <r> ... | SENTINEL <item> PASS|FAIL ... | ITEM <item> VOID ... | RERUN-NEEDED <items> |
#   HOLD <H> VALID <s> s [SENTINEL-FAIL <items>] (exit 0 / 8) | HOLD <H> VOID <why> (3 end gate/sleep, 4 setup,
#   5 start gate or MISFIT, 7 time, 11 LINK). CM_DRY=1: pins, served hashes, the tools head and the plan only.
#   CM_TICKET=P-168 sh fixes/g0-box/phone/p168-hold.sh <H> <item> ...
cd "$(dirname "$0")/../../.." || exit 2
[ -n "$CM_TICKET" ] || { echo "CM_TICKET is not set (the signed ticket id): no run"; exit 2; }
H=$1; shift
[ -n "$H" ] && [ $# -gt 0 ] || { echo "usage: CM_TICKET=P-168 sh fixes/g0-box/phone/p168-hold.sh <H> <items>"; exit 2; }
R=${RUNNER:-fix-g0-box}
SV=out/p168; LG=out/p168ph; O=out/p168ph/runs
K=${P168_K:?P168_K must name the part's test arm: fcv25 (window A; fko25 diagnostic) or g (window B)}
PROF="--profile serious"
SELF=fixes/g0-box/phone/p168-hold.sh
TOOLS_MIN=db884e9d   # iphone.mjs run --timeline (I-247); the signature's condition 1
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
BUDGET_W=${CM_BUDGET_W:-75}
mkdir -p $O
for I in "$@"; do case $I in [AB]w[0ek]|[AB][0ek][1-3]|[AB][0ek][1-3]x|[AB]sC) ;; *) echo "HOLD $H VOID unknown item $I (no run)"; exit 4 ;; esac; done
srv() { case $1 in 0) echo v0 ;; e) echo f ;; k) echo $K ;; B) echo B ;; esac; }
kpin() { case $K in fcv25) echo "b700ddaf88b4 fa5888cfa299" ;; fko25) echo "120386db2e02 1d1e5d62a2c4" ;; g) echo "30fd80ccbb3f 2390e4715327" ;; esac; }
pin() { case $1 in B|0) echo "4606120cf392 27776f3d4138" ;; e) echo "30fd80ccbb3f 1d1e5d62a2c4" ;; k) kpin ;; esac; }
alet() { case $1 in 0) echo C ;; e) echo A ;; k) echo V ;; esac; }
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SV/serve-$1.json','utf8')).port)" 2>/dev/null; }
served() { curl -s "http://127.0.0.1:$1/$2" | shasum -a 256 | cut -c1-12; }
ARMS_USED="B"; for I in "$@"; do a=$(echo "$I" | cut -c2); [ "$a" = w ] && a=$(echo "$I" | cut -c3); [ "$a" = s ] && a=0; case " $ARMS_USED " in *" $a "*) ;; *) ARMS_USED="$ARMS_USED $a" ;; esac; done
for a in B 0 e k; do eval "P_$a=\$(port $(srv $a))"; done
hashok() { for a in $ARMS_USED; do eval "p=\$P_$a"; [ -n "$p" ] || return 1; [ "$(served $p $JS) $(served $p $CSS)" = "$(pin $a)" ] || return 1; done; }
hashline() { for a in $ARMS_USED; do eval "p=\$P_$a"; printf ' %s(%s) %s/%s' "$a" "$(srv $a)" "$(served $p $JS)" "$(served $p $CSS)"; done; }
pins() { for f in "$@"; do printf ' %s=%s' "$f" "$(shasum -a 256 "$f" | cut -c1-12)"; done; }
T0=$(date +%s)
HEAD=$(git rev-parse --short=8 HEAD 2>/dev/null)
echo "HOLD $H ($CM_TICKET) start $(date -u +%FT%TZ) items $* profile ${CM_PROFILE:-tool-serious} condition ${FW_PHONE_CONDITION:-unset}"
echo "PIN $H $CM_TICKET profile ${CM_PROFILE:-tool-serious} checkout $(pwd | sed 's|.*/\.claude/worktrees/||') head $HEAD$(pins \
  $SELF fixes/g0-box/phone/p168-block.sh fixes/g0-box/phone/p168-serve.sh fixes/g0-box/phone/p168-run.sh fixes/g0-box/phone/p168-build.py \
  research/phone-thermal-gate/thermal-gate.mjs fixes/rest-script/tools/pmcheck.mjs tools/iphone.mjs tools/thermal.mjs tools/lib/iphone-run.mjs)"
git merge-base --is-ancestor $TOOLS_MIN HEAD 2>/dev/null || { echo "HOLD $H VOID tools head $HEAD does not contain $TOOLS_MIN (run --timeline, I-247) (no run)"; exit 4; }
echo "TOOLS head $HEAD contains $TOOLS_MIN (run --timeline) ok"
hashok || { echo "HOLD $H VOID served hashes$(hashline) (no run)"; exit 4; }
echo "SERVED$(hashline) ok"
spot() { echo "$1" | cut -c1; }
armof() { case $1 in ?w?) echo "$1" | cut -c3 ;; ?sC) echo 0 ;; *) echo "$1" | cut -c2 ;; esac; }
range() { case $(spot $1) in A) echo "--from 0 --to 750" ;; B) echo "--from 4000 --to 5000" ;; esac; }
BUDGET_S=${CM_BUDGET_S:-100}
budget() { case $1 in ?sC) echo $BUDGET_S ;; *) echo $BUDGET_W ;; esac; }
desc() { case $1 in ?w?) echo "W warm-up (--warmup, Timeline off, uncounted)" ;; ?sC) echo "S heat sentinel on v0 (--driver scroll, Timeline off, uncounted, --heat-sentinel)" ;; *) echo "W counted, Timeline on (no sentinel judgement)" ;; esac; }
if [ "$CM_DRY" = 1 ]; then
  for I in "$@"; do case $I in ?sC) rg="to the page bottom" ;; *) rg=$(range $I) ;; esac
    echo "PLAN $I spot $(spot $I) arm $(armof $I) ($(srv $(armof $I))) $rg $(desc $I) $PROF (budget $(budget $I) s)"; done
  echo "PLAN gates thermal-gate.mjs --expect serious --max-c 44 --accept-induced at the start and the end (tool-serious)"
  echo "HOLD $H DRY ok"; exit 0
fi
[ "$FW_PHONE_CONDITION" = tool ] || { echo "HOLD $H VOID FW_PHONE_CONDITION is not tool (run it from p168-block.sh with CM_THERMAL=serious) (no run)"; exit 4; }
# USB link and attach check (lead 10:2xZ): the link must be ok (else the hold ends before any run, exit 11; the block
# re-plugs and restarts WDA and Safari via relink, or stops cleanly after CM_LINK_MAX). The first hold of the block (no
# attach.txt) and any hold whose usbmux attach number changed since the last hold: wda ensure plus a Safari restart.
BU=$(node tools/lan.mjs --url --port "$P_B") || { echo "HOLD $H VOID no LAN url (no run)"; exit 4; }
LK=$(node tools/usblink.mjs status --json 2>/dev/null)
lst=$(echo "$LK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).state)}catch{console.log("?")}})')
lat=$(echo "$LK" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s).mux.attach;console.log(a==null?"?":a)}catch{console.log("?")}})')
[ "$lst" = ok ] || { echo "HOLD $H VOID before any run: USB link $lst (LINK)"; exit 11; }
AT=$LG/attach.txt
if [ ! -s $AT ] || [ "$(cat $AT)" != "$lat" ]; then
  echo "ATTACH $( [ -s $AT ] && echo "changed $(cat $AT) -> $lat" || echo "first hold, attach $lat"): wda ensure + safari-restart before the gate"
  node tools/iphone.mjs wda ensure --owner "$R" > "$O/$H-wda-ensure.log" 2>&1 || { echo "HOLD $H VOID before any run: wda ensure exit $? (LINK)"; exit 11; }
  node tools/iphone.mjs safari-restart --owner "$R" --url "$BU" --timeout 60 > "$O/$H-attach-restart.log" 2>&1 || { echo "HOLD $H VOID before any run: safari-restart failed (LINK)"; exit 11; }
  echo "$lat" > $AT; echo "ATTACH ok: WDA ready, Safari restarted"
fi
node tools/iphone.mjs wda check > "$O/$H-wda.log" 2>&1; w=$?
[ $w -ne 0 ] && { echo "HOLD $H VOID wda check exit $w (no run)"; exit 5; }
gate1() { node research/phone-thermal-gate/thermal-gate.mjs --owner "$R" --label "p168-$H-$1" --expect serious --max-c 44 --accept-induced --url "$BU"; }
gate() {
  node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  gate1 "$1"; gr=$?
  if [ $gr -eq 1 ]; then echo "GATE $1 no read (exit 1): safari-restart, then once more"
    node tools/iphone.mjs safari-restart --owner "$R" --url "$BU" --timeout 60 > "$O/$H-gate-restart.log" 2>&1
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    gate1 "$1"; gr=$?; fi
  return $gr
}
gate start; g=$?
[ $g -eq 0 ] || { node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
  case $g in 2) why="too cool: the induced condition is gone" ;; 3) why="ceiling: Critical or battery >= 44 C" ;; *) why="see out/thermal-gate/gates.jsonl" ;; esac
  echo "HOLD $H VOID start gate exit $g ($why) (no counted run)"; exit 5; }
echo "START GATE PASS (tool-serious)"
RERUN=""; SFAIL=""
late() { [ $(( $(date +%s) - T0 + $1 + 30 )) -gt 600 ]; }
for I in "$@"; do
  if late "$(budget $I)"; then echo "HOLD $H VOID time: $I would start at $(( $(date +%s) - T0 )) s (+ $(budget $I) + 30 > 600), items from $I on skipped; re-run the hold whole"
    node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1; exit 7; fi
  hashok || { echo "HOLD $H VOID served hash changed before $I"; exit 4; }
  a=$(armof $I); eval "p=\$P_$a"; U=$(node tools/lan.mjs --url --port "$p") || { echo "HOLD $H VOID no LAN url at $I"; exit 4; }
  TL=""
  case $I in
    ?w?) F=w-$I-$H; EX="--warmup" ;;
    ?sC) F=s-$I-$H; EX="--arm C --heat-sentinel --run $I-$H" ;;
    *) F=w-$I; TL="--timeline $O/tl-$I.json"; EX="--arm $(alet $a) --run $I" ;;
  esac
  for f in "$O/$F.json" "$O/tl-$I.json"; do
    [ "$f" = "$O/tl-$I.json" ] && [ -z "$TL" ] && continue
    [ -e "$f" ] && { mv "$f" "$f.prev-$H-$(date +%s)" || { echo "HOLD $H VOID cannot move aside $f"; exit 4; }; echo "MOVED $(basename "$f") aside (an earlier hold's file)"; }
  done
  node tools/iphone.mjs open "$U" --owner "$R" > /dev/null || { echo "HOLD $H VOID open failed at $I"; exit 4; }
  ts=$(date +%s)
  case $I in
    ?sC) node tools/iphone.mjs run --driver scroll --probe std $PROF $EX --build "$(srv $a)" \
           --owner "$R" --block "$CM_TICKET" --label "p168-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$? ;;
    *) node tools/iphone.mjs run --driver window --probe std $(range $I) --hold 2 --sentinel 3 $PROF $EX $TL --build "$(srv $a)" \
         --owner "$R" --block "$CM_TICKET" --label "p168-$H-$I" --out "$O/$F.json" > "$O/$F.log" 2>&1; r=$? ;;
  esac
  if [ $r -eq 8 ]; then node tools/iphone.mjs park --owner "$R" > /dev/null 2>&1
    echo "HOLD $H VOID profile misfit at $I ($(grep -m1 -E 'PROFILE|refus' "$O/$F.log" | cut -c1-100)) (MISFIT)"; exit 5; fi
  echo "RUN $I arm $a ($(srv $a)) spot $(spot $I) exit $r $(date -u +%TZ) $(( $(date +%s) - ts )) s load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)"
  case $I in
    ?w?) [ $r -ne 0 ] && echo "ITEM $I exit $r (warm-up, uncounted; the hold goes on)" ;;
    ?sC)
      if [ $r -ne 0 ] || [ ! -s "$O/$F.json" ]; then echo "SENTINEL $I FAIL no record (exit $r)"; SFAIL="$SFAIL $I"
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

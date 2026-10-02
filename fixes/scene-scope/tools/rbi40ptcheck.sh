#!/bin/sh
# RBi40pt (P-056) checks, headless Chrome, functional, counts and pixels, no timing. One mode per shared slot:
#   lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner scene-scope -- sh out/scene-scope/rbi40ptcheck.sh <mode>
# Modes: page (S0 S0b RBi40p RBi40pt PCp at 430x932: state walk + title census + frozen frames y3200..5300, fee loop held)
#        wide (S0 S0b RBi40p RBi40pt at 1440x900: state walk + title census, no frames)
#        flip (RBi40p RBi40pt: flipprobe2 at the three flips, 3 reps)
# Arms from immutable snapshots out/scene-scope/snap2; S0b = the S0 files on a 2nd server (A/A); PCp = S0 + an injected
# positive-control style. Fresh random ports, --no-cache, GET counts.
W=$(git rev-parse --show-toplevel)
cd "$W" || exit 1
O=out/scene-scope
BASE=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/site-pretty
MODE=$1
date -u +"RBI40PT $MODE start %H:%M:%SZ"
uptime
case "$MODE" in
  page) ARMS="S0 S0b RBi40p RBi40pt PCp" ;;
  wide) ARMS="S0 S0b RBi40p RBi40pt" ;;
  flip) ARMS="RBi40p RBi40pt" ;;
  vt1) ARMS="S0 S0b RBi40pt" ;;
  vt2) ARMS="S0 RBi40p PCp" ;;
  vt3) ARMS="RBi40p S0 RBi40pt" ;;
  vt4) ARMS="S0 RBi40pt" ;;
  iol|iol2) ARMS="S0 RBi40pt" ;;
  tismoke) ARMS="S0 RBi40pti" ;;
  tiflip) ARMS="RBi40pti" ;;
  tirep) ARMS="S0 S0b RBi40pti RBi40pt" ;;
  tirep2) ARMS="S0 S0b RBi40pti" ;;
  tiframes|tionset) ARMS="S0 S0b RBi40pti" ;;
  t4smoke|t4hold1|t4hold2) ARMS="S0 S0b RBi40pti" ;;
  t5a|t5b) ARMS="S0 S0b RBi40pti" ;;
  *) echo "bad mode"; exit 2 ;;
esac
PIDS=""
trap 'kill $PIDS 2>/dev/null' EXIT
pmset -g assertions | grep -E "UserIsActive|PreventUserIdleDisplaySleep" | sed "s/^/host-awake start: /"
for a in $ARMS; do
  src=$a; case $a in S0b|PCp) src=S0 ;; esac
  rm -f $O/serve-t$a.json
  node tools/serve.mjs --root $BASE --overlay $O/snap2/$src --port 0 --vendors=local --latency 150 --no-cache --state $O/serve-t$a.json > $O/serve-t$a.log 2>&1 &
  PIDS="$PIDS $!"
  node tools/wait.mjs serve $O/serve-t$a.json --pid $! > /dev/null || { echo "serve $a failed"; tail -3 $O/serve-t$a.log; }
  p=$(node -e "console.log(require('./$O/serve-t$a.json').port)")
  eval "P_$a=$p"
  echo "arm $a :$p CSS $(curl -s http://localhost:$p/_app/immutable/assets/2.gBuqKVzi.css | shasum -a 256 | cut -c1-12) JS $(curl -s http://localhost:$p/_app/immutable/nodes/2.DyWL8TcE.js | shasum -a 256 | cut -c1-12)"
done
U() { eval "echo http://localhost:\$P_$1/"; }
case "$MODE" in
  page) rm -rf $O/q40tp && mkdir -p $O/q40tp
        FEEHOLD=1 STEP=250 YMAX=5345 FY0=3200 FY1=5300 FSTEP=100 WAIT=300 node $O/pageframes2.mjs $O/q40tp "S0=$(U S0)" "S0b=$(U S0b)" "RBi40p=$(U RBi40p)" "RBi40pt=$(U RBi40pt)" "PCp=$(U PCp)"; echo "pageframes2 exit $?" ;;
  wide) rm -rf $O/q40tw && mkdir -p $O/q40tw
        FEEHOLD=1 FRAMES=0 VW=1440 VH=900 DPR=1 STEP=300 YMAX=9000 WAIT=300 node $O/pageframes2.mjs $O/q40tw "S0=$(U S0)" "S0b=$(U S0b)" "RBi40p=$(U RBi40p)" "RBi40pt=$(U RBi40pt)"; echo "pageframes2 exit $?" ;;
  vt1|vt2|vt3) rm -rf $O/q40t$MODE && mkdir -p $O/q40t$MODE
        T="W0=$(U S0)"; for a in $ARMS; do T="$T $a=$(U $a)"; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 SPOT=356,5570 FY0=3200 FY1=5300 FSTEP=100 node $O/pageframes3.mjs $O/q40t$MODE $T; echo "pageframes3 exit $?" ;;
  vt4) rm -rf $O/q40tvt4 && mkdir -p $O/q40tvt4
        T=""; for r in 1 2 3 4 5 6; do T="$T S0r$r=$(U S0) RBi40ptr$r=$(U RBi40pt)"; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=800 SPOT=356,5570 FY0=4400 FSTEP=200 FY1=4800 node $O/pageframes3.mjs $O/q40tvt4 $T; echo "pageframes3 exit $?" ;;
  iol) mkdir -p $O/q40ti
        VW=1440 VH=900 DPR=1 SECS=7 node $O/iolate.mjs $O/q40ti "S0=$(U S0)" "RBi40pt=$(U RBi40pt)"; echo "iolate 1440 exit $?"
        VW=430 VH=932 DPR=3 SECS=7 node $O/iolate.mjs $O/q40ti "S0=$(U S0)" "RBi40pt=$(U RBi40pt)"; echo "iolate 430 exit $?" ;;
  iol2) mkdir -p $O/q40ti2
        TICK=0 SAMPLES=3100,4500,6000,7500 VW=1440 VH=900 DPR=1 SECS=8 node $O/iolate.mjs $O/q40ti2 "S0=$(U S0)" "RBi40pt=$(U RBi40pt)" "S0b=$(U S0)" "RBi40ptb=$(U RBi40pt)"; echo "iolate 1440 exit $?"
        TICK=0 SAMPLES=1000,1800,2500,3500 VW=430 VH=932 DPR=3 SECS=5 node $O/iolate.mjs $O/q40ti2 "S0=$(U S0)" "RBi40pt=$(U RBi40pt)" "S0b=$(U S0)" "RBi40ptb=$(U RBi40pt)"; echo "iolate 430 exit $?" ;;
  tismoke) mkdir -p $O/q40us
        SCEN=S node $O/onset.mjs $O/q40us S430 "S0=$(U S0)" "RBi40pti=$(U RBi40pti)"; echo "onset S exit $?"
        SCEN=H CAP=8 VW=1440 VH=900 DPR=1 node $O/onset.mjs $O/q40us H1440 "S0=$(U S0)" "RBi40pti=$(U RBi40pti)"; echo "onset H exit $?" ;;
  tiframes) rm -rf $O/q40ui && mkdir -p $O/q40ui/w430 $O/q40ui/w1440
        T="W0=$(U S0) S0=$(U S0) RBi40pti=$(U RBi40pti) S0b=$(U S0b)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 SPOT=356,5570 FY0=3200 FY1=5300 FSTEP=100 node $O/pageframes3.mjs $O/q40ui/w430 $T; echo "pageframes3 430 exit $?"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 VW=1440 VH=900 DPR=1 FY0=6000 FY1=8400 FSTEP=100 node $O/pageframes3.mjs $O/q40ui/w1440 $T; echo "pageframes3 1440 exit $?" ;;
  tionset) rm -rf $O/q40uo && mkdir -p $O/q40uo
        T="W0=$(U S0) S0r1=$(U S0) RBi40ptir1=$(U RBi40pti) S0br1=$(U S0b) RBi40ptir2=$(U RBi40pti) S0br2=$(U S0b) S0r2=$(U S0) S0br3=$(U S0b) S0r3=$(U S0) RBi40ptir3=$(U RBi40pti)"
        for sc in S H J; do
          SCEN=$sc CAP=10 VW=430 VH=932 DPR=3 node $O/onset.mjs $O/q40uo ${sc}430 $T; echo "onset $sc 430 exit $?"
          SCEN=$sc CAP=10 VW=1440 VH=900 DPR=1 node $O/onset.mjs $O/q40uo ${sc}1440 $T; echo "onset $sc 1440 exit $?"
        done ;;
  tirep) rm -rf $O/q40ur && mkdir -p $O/q40ur/w430 $O/q40ur/w1440
        T="W0=$(U S0) S0=$(U S0) RBi40pti=$(U RBi40pti) RBi40pt=$(U RBi40pt) S0b=$(U S0b) RBi40ptiB=$(U RBi40pti)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 FY0=3800 FY1=4700 FSTEP=100 node $O/pageframes3.mjs $O/q40ur/w430 $T; echo "pageframes3 430 exit $?"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 VW=1440 VH=900 DPR=1 FY0=7300 FY1=7600 FSTEP=100 node $O/pageframes3.mjs $O/q40ur/w1440 $T; echo "pageframes3 1440 exit $?"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" Y=4200 X=228 PY=4762 node $O/spotprobe.mjs "S0=$(U S0)" "RBi40pti=$(U RBi40pti)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" VW=1440 VH=900 DPR=1 Y=7500 X=450 PY=8300 node $O/spotprobe.mjs "S0=$(U S0)" "RBi40pti=$(U RBi40pti)" ;;
  tirep2) rm -rf $O/q40ur2 && mkdir -p $O/q40ur2
        T="W0=$(U S0)"; for r in 1 2 3 4; do T="$T S0r$r=$(U S0) RBi40ptir$r=$(U RBi40pti) S0br$r=$(U S0b)"; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 VW=1440 VH=900 DPR=1 FY0=7400 FY1=7600 FSTEP=100 node $O/pageframes3.mjs $O/q40ur2 $T; echo "pageframes3 1440 exit $?" ;;
  t4smoke) rm -rf $O/q40vs && mkdir -p $O/q40vs/w430 $O/q40vs/w1440
        T="W0=$(U S0) S0=$(U S0) S0b=$(U S0b)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 HOLDIO=1 FY0=3800 FY1=4700 FSTEP=100 node $O/pageframes4.mjs $O/q40vs/w430 $T; echo "pageframes4 430 exit $?"
        T="W0=$(U S0) RBi40ptir1=$(U RBi40pti) S0r1=$(U S0)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 HOLDIO=0 CAPY=7500 VW=1440 VH=900 DPR=1 FY0=7000 FY1=7500 FSTEP=100 node $O/pageframes4.mjs $O/q40vs/w1440 $T; echo "pageframes4 1440 exit $?" ;;
  t4hold1) rm -rf $O/q40v && mkdir -p $O/q40v/w430 $O/q40v/w1440a
        T="W0=$(U S0) S0=$(U S0) RBi40pti=$(U RBi40pti) S0b=$(U S0b) RBi40ptiB=$(U RBi40pti)"
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 HOLDIO=1 FY0=3800 FY1=4700 FSTEP=100 node $O/pageframes4.mjs $O/q40v/w430 $T; echo "pageframes4 430 exit $?"
        T="W0=$(U S0)"; for r in 1 2 3 4 5 6 7 8 9; do case $r in 1|3|5|7|9) T="$T RBi40ptir$r=$(U RBi40pti) S0r$r=$(U S0)" ;; *) T="$T S0r$r=$(U S0) RBi40ptir$r=$(U RBi40pti)" ;; esac; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 HOLDIO=0 CAPY=7500 VW=1440 VH=900 DPR=1 FY0=7000 FY1=7500 FSTEP=100 node $O/pageframes4.mjs $O/q40v/w1440a $T; echo "pageframes4 1440 exit $?" ;;
  t4hold2) rm -rf $O/q40v2 && mkdir -p $O/q40v2/w1440b
        T="W0=$(U S0)"; for r in 10 11 12 13 14 15 16 17 18 19 20 21 22; do case $r in 11|13|15|17|19|21) T="$T RBi40ptir$r=$(U RBi40pti) S0r$r=$(U S0)" ;; *) T="$T S0r$r=$(U S0) RBi40ptir$r=$(U RBi40pti)" ;; esac; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 HOLDIO=0 CAPY=7500 VW=1440 VH=900 DPR=1 FY0=7000 FY1=7500 FSTEP=100 node $O/pageframes4.mjs $O/q40v2/w1440b $T; echo "pageframes4 1440 exit $?" ;;
  t5a) rm -rf $O/q40w && mkdir -p $O/q40w
        T="W0=$(U S0)"; for r in 1 2 3 4 5; do case $r in 1|3|5) T="$T RBi40ptir$r=$(U RBi40pti) S0r$r=$(U S0)" ;; *) T="$T S0r$r=$(U S0) RBi40ptir$r=$(U RBi40pti)" ;; esac; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 VW=1440 VH=900 DPR=1 FY0=6000 FY1=7500 FSTEP=100 node $O/pageframes3.mjs $O/q40w $T; echo "pageframes3 1440 exit $?" ;;
  t5b) rm -rf $O/q40w2 && mkdir -p $O/q40w2
        T="W0=$(U S0)"; for r in 6 7 8 9 10; do case $r in 7|9) T="$T RBi40ptir$r=$(U RBi40pti) S0r$r=$(U S0)" ;; *) T="$T S0r$r=$(U S0) RBi40ptir$r=$(U RBi40pti)" ;; esac; done
        CHROMEARGS="--disable-checker-imaging --disable-gpu-rasterization" SETTLE=600 VW=1440 VH=900 DPR=1 FY0=6000 FY1=7500 FSTEP=100 node $O/pageframes3.mjs $O/q40w2 $T; echo "pageframes3 1440 exit $?" ;;
  tiflip) rm -rf $O/q40uf && mkdir -p $O/q40uf
        LISTCSS=$O/snap2/RBi40pti/_app/immutable/assets/2.gBuqKVzi.css node $O/flipprobe2.mjs RBi40pti "$(U RBi40pti)" $O/q40uf 3 2>&1 | grep -v '^$' | cut -c1-900; echo "flipprobe2 RBi40pti exit $?" ;;
  flip) rm -rf $O/q40tf && mkdir -p $O/q40tf
        for a in RBi40p RBi40pt; do LISTCSS=$O/snap2/$a/_app/immutable/assets/2.gBuqKVzi.css node $O/flipprobe2.mjs $a "$(U $a)" $O/q40tf 3 2>&1 | grep -v '^$' | cut -c1-900; echo "flipprobe2 $a exit $?"; done ;;
esac
kill $PIDS 2>/dev/null
pmset -g assertions | grep -E "UserIsActive|PreventUserIdleDisplaySleep" | sed "s/^/host-awake end: /"
for a in $ARMS; do echo "GETs $a: css $(grep -c 'GET /_app/immutable/assets/2.gBuqKVzi.css' $O/serve-t$a.log) js $(grep -c 'GET /_app/immutable/nodes/2.DyWL8TcE.js' $O/serve-t$a.log)"; done
uptime
date -u +"RBI40PT $MODE end %H:%M:%SZ"
echo "EXIT"

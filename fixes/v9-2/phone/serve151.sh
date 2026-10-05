#!/bin/sh
# P-151 (the P-142 bisect) phone servers: a copy of fixes/v9-2/phone/serve142.sh with per-block arm pairs. Immutable
# snapshot copies, plain http (I-003), OS-assigned ports (--port 0, I-131), --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   block Q1 (scroll-cb): C = v9.2 - scb  (1b2eecc66011 / f1997edf5309, out/v91d/att/S), V = v9.2 (941aa13e5bdf / f1997edf5309)
#   block Q2 (g11):       C = v9.2 - g11  (941aa13e5bdf / e1359ab9994a, out/v91d/att/G), V = v9.2
#   block Q3 (rev 7d):    C = v9-final    (647c9ef2b1e2 / e1359ab9994a, out/p142/snap/C), V = v9-final + 7d = v9.2 - scb - g11
#                         (1b2eecc66011 / e1359ab9994a, out/v91d/att/C)
#   v9.2 = out/v91d/att/V (= out/p142/snap/V). Copies: out/p151/snap/<Q>/{C,V} (HASHES.txt per block).
# Usage: sh fixes/v9-2/phone/serve151.sh snap           copy all three blocks once; refuses if out/p151/snap exists or a hash differs
#        sh fixes/v9-2/phone/serve151.sh <Q>            start B C V for block Q (stops this script's servers first), check, print ports
#        sh fixes/v9-2/phone/serve151.sh check <Q>      re-check the served hashes of the running servers for block Q (exit 4 if wrong)
#        sh fixes/v9-2/phone/serve151.sh stop           stop them (only these three, by their pid files)
# The running block is written to out/p151/snap/block (one line). Phone URLs only via tools/lan.mjs; never commit them.
cd "$(dirname "$0")/../../.." || exit 2
S=out/p151/snap
OWNER=${FW_AGENT:-int-v8}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
J_V=941aa13e5bdf0b7a89278eae21e99630d345047377f21ea40d00c9fe97ec408e
J_7=1b2eecc660111822b119cf06edcc8676ce5c303a8981915792d1b93cf1b88428
J_F=647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2
C_V=f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308
C_F=e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba
# per block: source of C, source of V, expected C js/css, V js/css
src() { case "$1:$2" in
  Q1:C) echo out/v91d/att/S ;; Q1:V) echo out/v91d/att/V ;;
  Q2:C) echo out/v91d/att/G ;; Q2:V) echo out/v91d/att/V ;;
  Q3:C) echo out/p142/snap/C ;; Q3:V) echo out/v91d/att/C ;; esac; }
want() { case "$1:$2" in
  Q1:C) echo "$J_7 $C_V" ;; Q1:V) echo "$J_V $C_V" ;;
  Q2:C) echo "$J_V $C_F" ;; Q2:V) echo "$J_V $C_V" ;;
  Q3:C) echo "$J_F $C_F" ;; Q3:V) echo "$J_7 $C_F" ;; esac; }
okQ() { case "$1" in Q1|Q2|Q3) return 0 ;; esac; echo "unknown block '$1' (Q1|Q2|Q3)"; exit 2; }
if [ "$1" = snap ]; then
  [ -e $S ] && { echo "$S exists: refuse (immutable)"; exit 3; }
  for Q in Q1 Q2 Q3; do for X in C V; do
    F=$(src $Q $X)
    mkdir -p $S/$Q/$X/_app/immutable/nodes $S/$Q/$X/_app/immutable/assets
    cp $F/$JS $S/$Q/$X/$JS && cp $F/$CSS $S/$Q/$X/$CSS || exit 3
  done
    (cd $S/$Q && shasum -a 256 C/$JS C/$CSS V/$JS V/$CSS > HASHES.txt)
    for X in C V; do set -- $(want $Q $X)
      grep -q "^$1  $X/$JS" $S/$Q/HASHES.txt && grep -q "^$2  $X/$CSS" $S/$Q/HASHES.txt ||
        { echo "SNAPSHOT $Q $X NOT THE TICKET'S BUILD: refuse"; exit 3; }
    done
    chmod -R a-w $S/$Q/C $S/$Q/V; chmod a-w $S/$Q/HASHES.txt
    echo "$Q:"; cat $S/$Q/HASHES.txt
  done
  echo "snap ok"; exit 0
fi
if [ "$1" = stop ]; then
  for A in B C V; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  rm -f $S/block; echo stopped; exit 0
fi
if [ "$1" = check ]; then Q=$2; okQ "$Q"; [ "$(cat $S/block 2>/dev/null)" = "$Q" ] || { echo "running block is '$(cat $S/block 2>/dev/null)', not $Q"; exit 4; }
else Q=$1; okQ "$Q"; fi
(cd $S/$Q && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT $Q CHANGED: refuse"; exit 3; }
if [ "$1" != check ]; then
  for A in B C V; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $S/$Q/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C V; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-151 $Q phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
  echo "$Q" > $S/block
fi
bad=0
for A in B C V; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-64)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-64)
  if [ $A = B ]; then case "$(echo $J | cut -c1-12):$(echo $C | cut -c1-12)" in 4606120cf392:27776f3d4138) ok=ok ;; *) ok=WRONG; bad=1 ;; esac
  else set -- $(want $Q $A); if [ "$J" = "$1" ] && [ "$C" = "$2" ]; then ok=ok; else ok=WRONG; bad=1; fi; fi
  echo "$A pid $(cat $S/serve-$A.pid) port $P block $Q served JS $(echo $J | cut -c1-12) CSS $(echo $C | cut -c1-12) $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

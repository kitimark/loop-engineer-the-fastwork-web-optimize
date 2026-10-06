#!/bin/sh
# P-156 phone servers (card: fixes/end-morph-p1b-a/README.md "Phone card P-156"). A copy of this topic's P-153 server
# script (fixes/end-morph-p1/phone/p153-serve.sh) with the P-156 arms. Plain http (I-003), OS-assigned ports,
# --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = the landing base's control, A = C + P1 + P1b (a); the base is P156_BASE (required on the first start):
#     1 = v9-final + U2 + i219:  C1 JS fe7c668d35e8 CSS e1359ab9994a,  A1 JS f83aa54c2acc CSS cfb8b8c5b019
#     0 = v9-final + i219:       C0 JS 387a2b38790b CSS e1359ab9994a,  A0 JS 888ed8eb2d15 CSS cfb8b8c5b019
# The snapshot: out/p1b/snapi/{C,A}<base> (fixes/end-morph-p1/p1b/snap.mjs, read-only), copied once into out/p156/snap
# with the base recorded in out/p156/snap/BASE; every start and check verifies the four files against the pins below.
# Usage: P156_BASE=1|0 sh fixes/end-morph-p1/phone/p156-serve.sh start   copy (first time), start B C A, check, print ports
#        sh fixes/end-morph-p1/phone/p156-serve.sh check    re-check the copy and the served hashes (exit 4 if wrong)
#        sh fixes/end-morph-p1/phone/p156-serve.sh stop     stop these three servers (by their pid files)
# State: out/p156/serve-{B,C,A}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/p156; D=$S/snap
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
case "$1" in start|check|stop) ;; *) echo "usage: P156_BASE=1|0 sh fixes/end-morph-p1/phone/p156-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C A; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
if [ ! -e $D/BASE ]; then
  case "$P156_BASE" in 1|0) ;; *) echo "first start needs P156_BASE=1 (B1, U2 landed) or 0 (B0): refuse"; exit 3 ;; esac
  SRC=out/p1b/snapi
  [ -e "$SRC/C$P156_BASE/$JS" ] && [ -e "$SRC/A$P156_BASE/$JS" ] || { echo "no snapshot at $SRC/{C,A}$P156_BASE (run fixes/end-morph-p1/p1b/snap.mjs): refuse"; exit 3; }
  mkdir -p $D && cp -R "$SRC/C$P156_BASE" $D/C && cp -R "$SRC/A$P156_BASE" $D/A && echo "$P156_BASE" > $D/BASE && chmod -R a-w $D/C $D/A $D/BASE
  echo "copied base $P156_BASE into $D"
fi
BASE=$(cat $D/BASE)
[ -z "$P156_BASE" ] || [ "$P156_BASE" = "$BASE" ] || { echo "P156_BASE=$P156_BASE but the copy in $D is base $BASE: refuse"; exit 3; }
case $BASE in
  1) PIN="C:fe7c668d35e8:e1359ab9994a A:f83aa54c2acc:cfb8b8c5b019" ;;
  0) PIN="C:387a2b38790b:e1359ab9994a A:888ed8eb2d15:cfb8b8c5b019" ;;
  *) echo "BASE file says '$BASE': refuse"; exit 3 ;;
esac
h() { shasum -a 256 "$1" | cut -c1-12; }
for p in $PIN; do a=${p%%:*}; r=${p#*:}; j=${r%%:*}; c=${r#*:}
  [ "$(h $D/$a/$JS)" = $j ] && [ "$(h $D/$a/$CSS)" = $c ] || { echo "SNAPSHOT $a is not $j/$c: refuse"; exit 3; }; done
x=$(cd $D && find C A -type f | sort | tr '\n' ' ')
[ "$x" = "A/$CSS A/$JS C/$CSS C/$JS " ] || { echo "SNAPSHOT has other files than the four pinned ones ($x): refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in B C A; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $D/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in B C A; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "P-156 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in B C A; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case " B:4606120cf392:27776f3d4138 $PIN " in *" $A:$J:$C "*) ok=ok ;; *) ok=WRONG; bad=1 ;; esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok (base $BASE)"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

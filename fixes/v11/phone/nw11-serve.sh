#!/bin/sh
# v11 no-worse phone servers (int-v11, lead 2026-10-06: "v11's own short phone no-worse block, C vs v11, with a proper
# S1"). A credited copy of int-v8's fixes/v10/phone/nw-serve.sh (itself fix-end-morph-p1's P-156 kit) with: arm C = main's
# C (rev 7d, 1b2eecc66011 / e1359ab9994a) and arm A = v11 (Vc + V13 + H1c, 9b4a829d15a0 / 62743920fe1a) copied from the
# immutable v11 snapshot out/v11/snap-9b4a829d15a0-62743920fe1a (HASHES 1704db6c4af6, fixes/v11/build.sh), base "v11",
# folder out/v11nw, ticket v11-nw; no third arm. The arm letter A is kept so the hold, the gates and the reader read it
# unchanged. Plain http (I-003), OS-assigned ports, --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
# Usage: sh fixes/v11/phone/nw11-serve.sh start   copy (first time), start B C A, check, print ports
#        sh fixes/v11/phone/nw11-serve.sh check   re-check the copy and the served hashes (exit 4 if wrong)
#        sh fixes/v11/phone/nw11-serve.sh stop    stop these three servers (by their pid files)
# State: out/v11nw/serve-{B,C,A}.json (ports), .pid, .log; NW_DIR=<folder> uses that folder instead (dry runs).
# Phone URLs only via tools/lan.mjs; never copy the LAN address into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=${NW_DIR:-out/v11nw}; D=$S/snap
OWNER=${FW_AGENT:-int-v11}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/v11/phone/nw11-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C A; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
SRC=out/v11/snap-9b4a829d15a0-62743920fe1a
if [ ! -e $D/BASE ]; then
  [ "$(shasum -a 256 $SRC/HASHES.txt | cut -c1-12)" = 1704db6c4af6 ] && (cd $SRC && shasum -a 256 -c --quiet HASHES.txt) || { echo "no v11 snapshot at $SRC (HASHES 1704db6c4af6): refuse"; exit 3; }
  mkdir -p $D && cp -R "$SRC/C" $D/C && cp -R "$SRC/V11" $D/A && echo v11 > $D/BASE && chmod -R a-w $D/C $D/A $D/BASE
  echo "copied v11 C and V11 (as A) into $D"
fi
BASE=$(cat $D/BASE)
[ "$BASE" = v11 ] || { echo "BASE file says '$BASE': refuse"; exit 3; }
PIN="C:1b2eecc66011:e1359ab9994a A:9b4a829d15a0:62743920fe1a"; ARMS="B C A"; SNAPA="A C"
h() { shasum -a 256 "$1" | cut -c1-12; }
for p in $PIN; do a=${p%%:*}; r=${p#*:}; j=${r%%:*}; c=${r#*:}
  [ "$(h $D/$a/$JS)" = $j ] && [ "$(h $D/$a/$CSS)" = $c ] || { echo "SNAPSHOT $a is not $j/$c: refuse"; exit 3; }; done
x=$(cd $D && find $SNAPA -type f | sort | tr '\n' ' ')
y=$(for a in $SNAPA; do printf '%s/%s %s/%s ' $a $CSS $a $JS; done)
[ "$x" = "$y" ] || { echo "SNAPSHOT has other files than the four pinned ones ($x): refuse"; exit 3; }
if [ "$1" = start ]; then
  for A in $ARMS; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    OV="--overlay $D/$A"; [ "$A" = B ] && OV=""
    node tools/serve.mjs --root site-pretty $OV --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in $ARMS; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v11 no-worse phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case " B:4606120cf392:27776f3d4138 $PIN " in *" $A:$J:$C "*) ok=ok ;; *) ok=WRONG; bad=1 ;; esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok (base $BASE)"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

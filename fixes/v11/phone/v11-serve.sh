#!/bin/sh
# v11 phone servers (int-v11): arms C and V11 straight from the immutable v11 snapshot (fixes/v11/build.sh), plain http
# (I-003), OS-assigned ports, --vendors=local --latency 150 (as int-v8's fixes/v10/phone/nw-serve.sh, credited; its arm
# letters are not used here). Every start and check verifies the snapshot (HASHES 1704db6c4af6) and the served hashes.
#   C   1b2eecc66011 / e1359ab9994a   main's v9-final rev 7d
#   V11 9b4a829d15a0 / 62743920fe1a   v11 = Vc + V13 + H1c
# Usage (worktree root): sh fixes/v11/phone/v11-serve.sh start | check | stop
# State: out/v11phone/serve-{C,V11}.json (ports), .pid, .log. Phone URLs only via tools/lan.mjs or http://lan:<port>/;
# never copy the LAN address into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=out/v11phone; D=out/v11/snap-9b4a829d15a0-62743920fe1a
OWNER=${FW_AGENT:-int-v11}
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
PIN="C:1b2eecc66011:e1359ab9994a V11:9b4a829d15a0:62743920fe1a"; ARMS="C V11"
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/v11/phone/v11-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in $ARMS; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
h() { shasum -a 256 "$1" | cut -c1-12; }
[ "$(h $D/HASHES.txt)" = 1704db6c4af6 ] && (cd $D && shasum -a 256 -c --quiet HASHES.txt) || { echo "no v11 snapshot at $D (HASHES 1704db6c4af6): refuse"; exit 3; }
for p in $PIN; do a=${p%%:*}; r=${p#*:}; j=${r%%:*}; c=${r#*:}
  [ "$(h $D/$a/$JS)" = $j ] && [ "$(h $D/$a/$CSS)" = $c ] || { echo "SNAPSHOT $a is not $j/$c: refuse"; exit 3; }; done
if [ "$1" = start ]; then
  for A in $ARMS; do
    [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null
    rm -f $S/serve-$A.json
    node tools/serve.mjs --root site-pretty --overlay $D/$A --port 0 --state $S/serve-$A.json --vendors=local --latency 150 > $S/serve-$A.log 2>&1 &
    echo $! > $S/serve-$A.pid
  done
  for A in $ARMS; do
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v11 phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
  done
fi
bad=0
for A in $ARMS; do
  P=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$S/serve-$A.json','utf8')).port)")
  J=$(curl -s http://localhost:$P/$JS | shasum -a 256 | cut -c1-12)
  C=$(curl -s http://localhost:$P/$CSS | shasum -a 256 | cut -c1-12)
  case " $PIN " in *" $A:$J:$C "*) ok=ok ;; *) ok=WRONG; bad=1 ;; esac
  echo "$A pid $(cat $S/serve-$A.pid) port $P served JS $J CSS $C $ok"
done
[ $bad -eq 0 ] || { echo "SERVED HASH WRONG: stop and report"; exit 4; }

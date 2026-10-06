#!/bin/sh
# v10 no-worse phone check (int-v8, lead 2026-10-06 15:36Z: "a short phone no-worse check on V vs C in your own hold,
# profile xcode-serious, no cooling wait"). A copy of fix-end-morph-p1's P-156 kit (fixes/end-morph-p1/phone/p156-*.sh,
# credited) with: the arms C = main's C (rev 7d, 1b2eecc66011 / e1359ab9994a) and A = v10 + CM's V (a33a6c7c1f2b / 62743920fe1a)
# from out/v10/snap-a33a6c7c1f2b-62743920fe1a, ticket v10cm-nw, folder out/v10cmnw, env NW_*; the arm letter A is kept so
# pA-read.mjs and the gates read it unchanged. Part A (fs) only. The original header follows.
# P-156 phone servers (card: fixes/end-morph-p1b-a/README.md "Phone card P-156"). A copy of this topic's P-153 server
# script (fixes/end-morph-p1/phone/p153-serve.sh) with the P-156 arms. Plain http (I-003), OS-assigned ports,
# --latency 150, --vendors=local.
#   B = the plain baseline (the thermal gate's timer page; no counted run)
#   C = the landing base's control, A = C + P1 + P1b (a); the base is P156_BASE (required on the first start):
#     1 = v9-final + U2 + i219:  C1 JS fe7c668d35e8 CSS e1359ab9994a,  A1 JS f83aa54c2acc CSS cfb8b8c5b019
#     0 = v9-final + i219:       C0 JS 387a2b38790b CSS e1359ab9994a,  A0 JS 888ed8eb2d15 CSS cfb8b8c5b019
# The snapshot: out/p1b/snapi/{C,A}<base> (fixes/end-morph-p1/p1b/snap.mjs, read-only), copied once into out/v10cmnw/snap
# with the base recorded in out/v10cmnw/snap/BASE; every start and check verifies the four files against the pins below.
# Usage: P156_BASE=1|0 sh fixes/v10/phone/nw-serve.sh start   copy (first time), start B C A, check, print ports
#        sh fixes/v10/phone/nw-serve.sh check    re-check the copy and the served hashes (exit 4 if wrong)
#        sh fixes/v10/phone/nw-serve.sh stop     stop these three servers (by their pid files)
# State: out/v10cmnw/serve-{B,C,A}.json (ports), .pid, .log; NW_DIR=<folder> uses that folder instead (dry runs).
# Phone URLs only via tools/lan.mjs; never copy the LAN address
# into a committed file (Hard rule 12).
cd "$(dirname "$0")/../../.." || exit 2
S=${NW_DIR:-out/v10cmnw}; D=$S/snap
OWNER=${FW_AGENT:-iphone-runner}
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
case "$1" in start|check|stop) ;; *) echo "usage: sh fixes/v10/phone/nw-serve.sh start|check|stop"; exit 2 ;; esac
if [ "$1" = stop ]; then
  for A in B C A D; do [ -f $S/serve-$A.pid ] && kill "$(cat $S/serve-$A.pid)" 2>/dev/null; rm -f $S/serve-$A.pid; done
  echo stopped; exit 0
fi
mkdir -p $S
SRC=out/v10/snap-a33a6c7c1f2b-62743920fe1a
if [ ! -e $D/BASE ]; then
  [ "$(shasum -a 256 $SRC/HASHES.txt | cut -c1-12)" = dd33efddcece ] && (cd $SRC && shasum -a 256 -c --quiet HASHES.txt) || { echo "no v10 snapshot at $SRC (HASHES dd33efddcece): refuse"; exit 3; }
  mkdir -p $D && cp -R "$SRC/C" $D/C && cp -R "$SRC/V" $D/A && echo v10 > $D/BASE && chmod -R a-w $D/C $D/A $D/BASE
  echo "copied v10 C and V (as A) into $D"
  # optional third arm D = Vc (lead 16:05Z: C / V / Vc in one rotated block when arch's pre-warm (c) is ready in time)
  if [ -n "$NW_VC" ]; then
    printf '%s\n' "$NW_VC_PIN" | grep -qE '^[0-9a-f]{12}:[0-9a-f]{12}$' || { echo "NW_VC needs NW_VC_PIN=<js12>:<css12>: refuse"; exit 3; }
    cp -R "$NW_VC/V" $D/D && echo "$NW_VC_PIN" > $D/DPIN && chmod -R a-w $D/D $D/DPIN
    echo "copied Vc (as D) from $NW_VC into $D"
  fi
fi
BASE=$(cat $D/BASE)
[ "$BASE" = v10 ] || { echo "BASE file says '$BASE': refuse"; exit 3; }
PIN="C:1b2eecc66011:e1359ab9994a A:a33a6c7c1f2b:62743920fe1a"; ARMS="B C A"; SNAPA="A C"
[ -e $D/DPIN ] && { PIN="$PIN D:$(cat $D/DPIN)"; ARMS="B C A D"; SNAPA="A C D"; }
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
    node tools/wait.mjs serve $S/serve-$A.json --pid "$(cat $S/serve-$A.pid)" --owner "$OWNER" --reason "v10 no-worse phone server $A" > /dev/null || { echo "server $A failed, see $S/serve-$A.log"; exit 1; }
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

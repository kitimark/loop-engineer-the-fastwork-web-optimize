#!/bin/sh
# people-blink: read-only test copies of the proposal builds (A = g0.0k from fixes/people-blink/overlay, P = B2 instant,
# Q = B3 quick fade) under out/people-blink/<dir>/, plus each option's delta.diff against g0.0k. Prints the pins.
# usage: sh fixes/people-blink/pb-snap.sh <dir>     (refuses an existing dir)
cd "$(dirname "$0")/../.." || exit 2
D=out/people-blink/$1
[ -n "$1" ] && [ ! -e "$D" ] || { echo "usage: pb-snap.sh <new dir under out/people-blink>"; exit 2; }
JS=_app/immutable/nodes/2.DyWL8TcE.js; CSS=_app/immutable/assets/2.gBuqKVzi.css
for X in A:people-blink P:people-blink--b2 Q:people-blink--b3; do
  A=${X%%:*}; T=${X#*:}
  mkdir -p $D/$A/_app/immutable/nodes $D/$A/_app/immutable/assets
  cp fixes/$T/overlay/$JS $D/$A/$JS && cp fixes/$T/overlay/$CSS $D/$A/$CSS || exit 3
  echo "$A $T JS $(shasum -a 256 $D/$A/$JS | cut -c1-12) CSS $(shasum -a 256 $D/$A/$CSS | cut -c1-12)"
done
chmod -R a-w $D
for T in people-blink--b2 people-blink--b3; do
  { diff -u --label a/$JS --label b/$JS fixes/people-blink/overlay/$JS fixes/$T/overlay/$JS
    diff -u --label a/$CSS --label b/$CSS fixes/people-blink/overlay/$CSS fixes/$T/overlay/$CSS; } > fixes/$T/delta.diff
  echo "$T delta.diff $(wc -l < fixes/$T/delta.diff) lines"
done

#!/bin/sh
# P-142 rev 1.4 "1c-scroll re-run" (lead ruling after ops-reader-P142p1's part 1 read; fixes/v9-2/README.md "Rev 1.4"):
# the Simulator census scroll window only, F (v9-final) vs V (v9.2 = v9.1d), n = 3, three functional Simulator sessions
# (F:1 V:1 · V:2 F:2 · F:3 V:3), fixed sim92.mjs --scroll-only, each step its own shared hold through hostgate.sh (N4).
# A load failing sim92check (or VOID otherwise) gets ONE re-run (rep + 10) in a fourth session; a second VOID leaves its
# arm short of 3 valid loads and part1read.mjs scores the item INSUFFICIENT. Committed before any rev 1.4 data; runs only
# after the lead's go. Log out/v92/part1-r14.log; records out/v92/sim/p142-scroll.json.
#   sh fixes/v9-2/rerun14.sh            (in the background)
cd "$(dirname "$0")/../.." || exit 2
S=out/v92/snap-941aa13e5bdf
L=out/v92/part1-r14.log
R=out/v92/sim/p142-scroll.json
mkdir -p out/v92/sim
[ -e $R ] && { echo "RECORDS EXIST: $R (refuse; move it aside by hand with a reason)" >> $L; exit 3; }
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "SNAPSHOT CHANGED: refuse" >> $L; exit 3; }
echo "PIN rerun14 $(date -u +%FT%TZ) head $(git rev-parse --short=8 HEAD) rerun14.sh $(shasum -a 256 fixes/v9-2/rerun14.sh | cut -c1-12) sim92.mjs $(shasum -a 256 fixes/v9-2/sim92.mjs | cut -c1-12) sim92check.mjs $(shasum -a 256 fixes/v9-2/sim92check.mjs | cut -c1-12) part1read.mjs $(shasum -a 256 fixes/v9-2/part1read.mjs | cut -c1-12) hostgate.sh $(shasum -a 256 fixes/v9-2/hostgate.sh | cut -c1-12) HASHES $(shasum -a 256 $S/HASHES.txt | cut -c1-12)" >> $L
probe() { # $1 doing, rest: sim92 order. N4: load1 > 200 at the step start -> VOID-HOST (exit 9), one re-run; twice -> stop.
  d="$1"; shift
  for try in 1 2; do
    echo "=== sim92 --scroll-only $* $(date -u +%H:%M:%SZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2) try $try" >> $L
    node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 rev 1.4: $d (counts, no timing)" -- \
      sh fixes/v9-2/hostgate.sh node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-2/sim92.mjs $R --scroll-only "$@" >> $L 2>&1
    e=$?
    echo "EXIT $e $d $(date -u +%H:%M:%SZ) load1-end $(sysctl -n vm.loadavg | cut -d' ' -f2)" >> $L
    [ $e -ne 9 ] && return 0
  done
  echo "VOID-HOST twice at $d: rev 1.4 stopped (to the lead)" >> $L; exit 9
}
for P in "F:1 V:1" "V:2 F:2" "F:3 V:3"; do probe "Simulator scroll census v9-final vs v9.2 ($P)" $P; done
# one re-run per VOID load (rep + 10), in log order
RE=$(node -e "const j=JSON.parse(require('fs').readFileSync('$R','utf8'));console.log(j.loads.filter(l=>l.void).map(l=>l.arm+':'+(l.rep+10)).join(' '))")
echo "VOID loads to re-run once: ${RE:-none}" >> $L
[ -n "$RE" ] && probe "Simulator scroll census, VOID re-runs ($RE)" $RE
node fixes/v9-2/part1read.mjs --scroll $R >> $L 2>&1
echo "R14DONE $(date -u +%H:%M:%SZ)" >> $L

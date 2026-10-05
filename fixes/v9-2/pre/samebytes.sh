#!/bin/sh
# int-v8, P-142 rev 1.2 lead ruling R1 (same-bytes A/A run for the both-pairs mask): the unchanged px-chrome.mjs with both arms
# = v9.2 (A=V,V=V: loads A, V, A2, V2 are four loads of v9.2), mobile word-aligned and desktop, n = 1 each, then the pw
# functional probe re-run (pw92.sh; its first rev 1.2 run had an empty result). One shared slot each. Log out/v92/samebytes.log.
#   sh fixes/v9-2/pre/samebytes.sh     (in the background, after look92b.sh)
cd "$(dirname "$0")/../../.." || exit 2
S=out/v92/snap-30f6371751f4
export V9_SNAP=$S P142_SNAP=$S
L=out/v92/samebytes.log
node tools/wait.mjs file out/v92/looks-r12.log --match '^LOOK92B-DONE' --owner int-v8 --reason "rev 1.2 gates to finish" --timeout 5400 || exit 3
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "snap changed" >> $L; exit 3; }
echo "PIN samebytes $(date -u +%FT%TZ) head $(git rev-parse --short=8 HEAD) samebytes.sh $(shasum -a 256 fixes/v9-2/pre/samebytes.sh | cut -c1-12) px-chrome $(shasum -a 256 fixes/v9-best/gates/px-chrome.mjs | cut -c1-12) pxlib $(shasum -a 256 fixes/v9-best/gates/pxlib.mjs | cut -c1-12) pw92.sh $(shasum -a 256 fixes/v9-2/pre/pw92.sh | cut -c1-12) HASHES $(shasum -a 256 $S/HASHES.txt | cut -c1-12)" >> $L
probe() { # $1 doing, rest: command
  d="$1"; shift
  echo "=== $* $(date -u +%H:%M:%SZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)" >> $L
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2 rev 1.2: $d (no timing)" -- "$@" >> $L 2>&1
  echo "EXIT $? $d" >> $L
}
probe "same-bytes pixel run mobile (v9.2 vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=V,V=V
probe "same-bytes pixel run desktop (v9.2 vs v9.2)" node fixes/v9-best/gates/px-chrome.mjs desktop A=V,V=V
probe "people-word functional probe re-run (Try-it B bytes vs v9.2)" sh fixes/v9-2/pre/pw92.sh
echo "SAMEBYTES-DONE $(date -u +%H:%M:%SZ)" >> $L

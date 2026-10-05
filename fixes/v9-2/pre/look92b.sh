#!/bin/sh
# int-v8, P-142 rev 1.2 component gates on v9.2 = v9.1d + pw + nf (30f6371751f4 / 1c4161f56545; U2 OUT), shared holds,
# no timing, in order; one queue entry at a time. Log out/v92/looks-r12.log. Arms: out/v92/snap-30f6371751f4 {A v8,
# C v9-final + 7d, F v9-final, B v9.1d, X C + pw + nf, Opw / Onf = C + that extra, Mpw / Mnf = v9.2 minus it, V v9.2};
# out/v92/cmp-r12 {A = F, V = V} for dom-count.
#   sh fixes/v9-2/pre/look92b.sh     (in the background)
cd "$(dirname "$0")/../../.." || exit 2
S=out/v92/snap-30f6371751f4
export V9_SNAP=$S P142_SNAP=$S
mkdir -p out/v92/sim
L=out/v92/looks-r12.log
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "snap changed" >> $L; exit 3; }
echo "PIN look92b $(date -u +%FT%TZ) head $(git rev-parse --short=8 HEAD) look92b.sh $(shasum -a 256 fixes/v9-2/pre/look92b.sh | cut -c1-12) g11exact92 $(shasum -a 256 fixes/v9-2/pre/g11exact92.mjs | cut -c1-12) pw92.sh $(shasum -a 256 fixes/v9-2/pre/pw92.sh | cut -c1-12) pw-probe $(shasum -a 256 out/v92pw/probe.mjs | cut -c1-12) geo92 $(shasum -a 256 fixes/v9-2/geo92.mjs | cut -c1-12) sim92 $(shasum -a 256 fixes/v9-2/sim92.mjs | cut -c1-12) HASHES $(shasum -a 256 $S/HASHES.txt | cut -c1-12)" >> $L
probe() { # $1 weight, $2 doing, rest: command
  w="$1"; d="$2"; shift 2
  echo "=== $* $(date -u +%H:%M:%SZ) load1 $(sysctl -n vm.loadavg | cut -d' ' -f2)" >> $L
  node tools/lock.mjs run chrome-measure --shared --weight "$w" --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2 rev 1.2: $d (no timing)" -- "$@" >> $L 2>&1
  echo "EXIT $? $d" >> $L
}
probe probe "g11 exactness on v9.2" env G_SNAP=$S G_OUT=out/v92/g11exact-r12 node fixes/v9-2/pre/g11exact92.mjs V,F
probe check "function check v9.2 vs v9-final" node tools/fix.mjs check v9-2 --on v9-best --viewport both --save
probe probe "nav-fade T2 px mobile (v9.2 - nf vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=Mnf,V=V
probe probe "nav-fade T2 px desktop (v9.2 - nf vs v9.2)" node fixes/v9-best/gates/px-chrome.mjs desktop A=Mnf,V=V
probe probe "people-word px mobile (v9.2 - pw vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=Mpw,V=V
probe probe "people-word functional probe (Try-it B bytes vs v9.2)" sh fixes/v9-2/pre/pw92.sh
probe probe "rest census v9.1d vs v9.2" node fixes/v9-best/gates/census-run.mjs B,V,V2,B2
probe probe "dom-count mobile v9-final vs v9.2" env V9_SNAP=out/v92/cmp-r12 node fixes/v9-best/gates/dom-count.mjs mobile
probe probe "dom-count desktop v9-final vs v9.2" env V9_SNAP=out/v92/cmp-r12 node fixes/v9-best/gates/dom-count.mjs desktop
probe probe "nav-fade window geometry" node fixes/v9-2/geo92.mjs F,V
probe simulator "nav-fade T2 Simulator px (v9.2 - nf vs v9.2)" node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-best/gates/px-sim.mjs auto A=Mnf,V=V
probe simulator "Simulator census tool smoke on a non-ticket arm" node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-2/sim92.mjs out/v92/sim/smoke-r12.json C:1
echo "LOOK92B-DONE $(date -u +%H:%M:%SZ)" >> $L

#!/bin/sh
# int-v8, P-142 pre-data checks on v9.2 = v9.1d + pw + nhc + nf (6468db04395c / 1c4161f56545), shared holds, no timing.
# Log out/v92/looks.log. Arms: out/v92/snap-6468db04395c {A v8, C v9-final+7d, F v9-final, B v9.1d, X C+extras,
# Opw/Onhc/Onf C + that extra alone (Opw = the accepted Try-it B bytes bf75ce87958c), Mpw/Mnhc/Mnf v9.2 minus it, V v9.2};
# out/v92/cmp {A = F, V = V} for dom-count.
cd /Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05 || exit 2
D=/private/tmp/claude-501/-Users-<user>-source-fastwork-com-web-optimize/391f6dee-c7ee-40f4-93c3-f4c2dce764ec/scratchpad/v8/v92
S=out/v92/snap-6468db04395c
export V9_SNAP=$S
L=out/v92/looks.log
(cd $S && shasum -a 256 -c --quiet HASHES.txt) || { echo "snap changed" >> $L; exit 3; }
probe() { # $1 doing, rest: command
  d="$1"; shift
  echo "=== $* $(date -u +%H:%M:%SZ)" >> $L
  node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: $d (no timing)" -- "$@" >> $L 2>&1
  echo "EXIT $? $d" >> $L
}
probe "g11 exactness on v9.2" env G_SNAP=$S G_OUT=out/v92/g11exact node $D/g11exact92.mjs V,F
echo "=== fix.mjs check v9-2 --on v9-best $(date -u +%H:%M:%SZ)" >> $L
node tools/lock.mjs run chrome-measure --shared --weight check --max-seconds 300 --owner int-v8 --for v9-1 --doing "P-142 v9.2: function check v9.2 vs v9-final (no timing)" -- node tools/fix.mjs check v9-2 --on v9-best --viewport both --save >> $L 2>&1
echo "EXIT $? fix.mjs check" >> $L
probe "U2 T0 px mobile (v9.2 - U2 vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=Mnhc,V=V
probe "U2 T0 px desktop (v9.2 - U2 vs v9.2)" node fixes/v9-best/gates/px-chrome.mjs desktop A=Mnhc,V=V
probe "nav-fade T2 px mobile (v9.2 - nf vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=Mnf,V=V
probe "nav-fade T2 px desktop (v9.2 - nf vs v9.2)" node fixes/v9-best/gates/px-chrome.mjs desktop A=Mnf,V=V
probe "people-word px mobile (v9.2 - pw vs v9.2)" env PX_ALIGN=1 node fixes/v9-best/gates/px-chrome.mjs mobile A=Mpw,V=V
probe "people-word functional probe (Try-it B bytes vs v9.2)" sh $D/pw92.sh
probe "rest census v9.1d vs v9.2" node fixes/v9-best/gates/census-run.mjs B,V,V2,B2
probe "dom-count mobile v9-final vs v9.2" env V9_SNAP=out/v92/cmp node fixes/v9-best/gates/dom-count.mjs mobile
probe "dom-count desktop v9-final vs v9.2" env V9_SNAP=out/v92/cmp node fixes/v9-best/gates/dom-count.mjs desktop
echo "LOOK92DONE $(date -u +%H:%M:%SZ)" >> $L

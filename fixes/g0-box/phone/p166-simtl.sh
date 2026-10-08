#!/bin/sh
# P-166 stage 2, self-checked condition 2 (lead signature 41b8b179) and the pre-data check of the card: one uncounted W
# run per spot with --timeline on the Simulator (never timing: only that a Timeline file with RenderingFrame records and
# meta.timeline is written, and that the W steps cross the spot's class flip; dt is never read). Run inside a normal
# (timing-lane) Simulator session, because a W `run` is refused in a functional one:
#   node tools/lock.mjs run chrome-measure --owner fix-g0-box --max-seconds 420 -- \
#     node tools/sim.mjs session --owner fix-g0-box -- node tools/lock.mjs run iphone --owner fix-g0-box --max-seconds 300 -- \
#       sh fixes/g0-box/phone/p166-simtl.sh   (iphone.mjs needs the iphone hold also on the Simulator, I-168)
cd "$(dirname "$0")/../../.." || exit 2
O=out/p166/simtl; mkdir -p $O
port() { node -e "console.log(JSON.parse(require('fs').readFileSync('out/p166/serve-$1.json','utf8')).port)"; }
one() { # arm spot from to
  P=$(port $1); L=p166-simtl-$1-$2
  node tools/sim.mjs open "http://localhost:$P/" > $O/$L-open.log 2>&1
  node tools/iphone.mjs run --driver window --probe std --from $3 --to $4 --hold 2 --sentinel 3 --warmup --no-battery --build $1 \
    --owner fix-g0-box --label $L --out $O/$L.json --timeline $O/$L-tl.json > $O/$L.log 2>&1
  echo "SIMTL $1 $2 run exit $?"
  node -e '
const fs=require("fs");const [rf,tf]=process.argv.slice(1);
let r={},t={};try{r=JSON.parse(fs.readFileSync(rf,"utf8"))}catch{};try{t=JSON.parse(fs.readFileSync(tf,"utf8"))}catch{}
let n=0;const walk=x=>{if(x.type==="RenderingFrame")n++;(x.children||[]).forEach(walk)};(t.recs||[]).forEach(walk);
const m=r.meta||{};const mt=m.timeline||null;
const muts=JSON.stringify(r).match(/\+he-css|\+is-play/g)||[];
console.log(`SIMTL ${rf.split("/").pop()} kind ${t.kind} recs ${(t.recs||[]).length} RenderingFrame ${n} meta.timeline ${mt?JSON.stringify({records:mt.records,stopped:mt.stopped,errors:mt.errors}).slice(0,160):"none"} flips he-css ${muts.filter(x=>x==="+he-css").length} is-play ${muts.filter(x=>x==="+is-play").length}`);' $O/$L.json $O/$L-tl.json
}
one e A 0 750
one v0 B 4000 5000

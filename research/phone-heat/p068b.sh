#!/bin/sh
# P-068b runner (README "P-068b"): P-068's routine on F, B, V (v6), M (g0.0m), real heat, profile fair.
# usage: sh research/phone-heat/p068b.sh serve | hcheck <arm> | all | part <prep|H1a|H1b|H2a|H2b>  (out/p068b/)
cd "$(dirname "$0")/../.." || exit 2
O=cap-heat-builds
D=out/p068b
OUT=$D/samples.jsonl
mkdir -p $D
JS=_app/immutable/nodes/2.DyWL8TcE.js
CSS=_app/immutable/assets/2.gBuqKVzi.css
W="--driver window --probe std --from 0 --to 5000 --idle 20 --hold 3 --sentinel 0 --settle 8 --no-park --low-power off --profile fair --owner $O"
port() { case $1 in F) echo 6391;; B) echo 6392;; V) echo 6393;; M) echo 6394;; esac; }
url() { case $1 in F) echo "http://lan:$(port F)/heat-floor.html";; *) echo "http://lan:$(port $1)/";; esac; }
want() { # arm -> pinned sha256/12 of what is served (F: the floor page; others: JS CSS)
  case $1 in F) echo 30098372d8c1;; B) echo "4606120cf392 27776f3d4138";; V) echo "8018ce062d30 71b65c667720";; M) echo "37af49aef32b 7a8ecdd8f8e4";; esac; }
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a $D/RUNLOG.txt; }
sha() { curl -s "http://localhost:$(port $1)/$2" | shasum -a 256 | cut -c1-12; }
hcheck() {
  if [ "$1" = F ]; then got=$(sha F heat-floor.html); else got="$(sha $1 $JS) $(sha $1 $CSS)"; fi
  if [ -n "$got" ] && [ "$got" = "$(want $1)" ]; then log "HASH $1 ok ($got)"; return 0; fi
  log "HASH $1 MISMATCH: served '$got', pinned '$(want $1)'"; return 1
}
tC() { node research/phone-heat/heat.mjs once | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tC??"")}catch{console.log("")}})'; }
in_hold() { # <doing> <command>: one chrome-measure --no-timing hold (README "Routine": no other Mac job mid-segment)
  node tools/lock.mjs run chrome-measure --owner $O --no-timing --max-seconds 600 --doing "$1" -- sh -c "$2"
}
segment() { # <session> <seg> <arm>
  h=$1; n=$2; a=$3; id="$h-$n$a"
  node research/phone-heat/heat.mjs charge-wait --want held >> $D/RUNLOG.txt 2>&1
  rc=$?; [ $rc = 0 ] || { log "CHARGE $id: gate exit $rc (not held): stop; the README fallback (attempt 2, charging) needs the lead"; exit 20; }
  t=$(tC); start=direct
  if node -e "process.exit($t > 37.0 ? 0 : 1)"; then
    start=cooled; log "COOL $id from $t"
    node tools/wait.mjs phone-temp --below 37.0 --every 30 --timeout 900 --owner $O --reason "phone heat P-068b: cooling to the segment start window" >> $D/RUNLOG.txt 2>&1
    t=$(tC)
    if node -e "process.exit($t > 37.0 ? 0 : 1)"; then # after the tool-held Serious blocks before ours (lead, 00:1xZ): one more 15 min
      start=cooled-extended; log "COOL-EXTENDED $id still $t after 900 s"
      node tools/wait.mjs phone-temp --below 37.0 --every 30 --timeout 900 --owner $O --reason "phone heat P-068b: extended cooling to the start window" >> $D/RUNLOG.txt 2>&1
      t=$(tC)
    fi
  fi
  if node -e "process.exit($t < 36.0 ? 0 : 1)"; then
    start=prewarmed; log "PREWARM $id from $t"
    in_hold "phone heat P-068b pre-warm on B" "node tools/iphone.mjs profile --owner $O --profile fair && sh research/phone-heat/p068b.sh prewarm-inner" >> $D/RUNLOG.txt 2>&1
    t=$(tC)
  fi
  hcheck $a || exit 21
  log "SEGMENT $id start=$start gate tC=$t url=$(url $a)"
  echo "{\"kind\":\"gate\",\"id\":\"$id\",\"start\":\"$start\",\"gateC\":$t,\"t\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> $D/gates.jsonl
  in_hold "phone heat P-068b $id" "node tools/iphone.mjs profile --owner $O --profile fair && node research/phone-heat/heat.mjs segment --session $h --seg $n --arm $a --charge-mode held --profile fair --url $(url $a) --owner $O --out $OUT" > $D/seg-$id.log 2>&1
  rc=$?; log "SEGMENT $id exit $rc: $(grep -E '^SEGMENT' $D/seg-$id.log | tail -1)"
  # README "Charging rule" 2: a read outside held (0-360 s) excludes the segment; the arm re-runs once at the session end
  node -e "const L=require('fs').readFileSync('$OUT','utf8').trim().split('\n').map(JSON.parse).filter(l=>l.kind==='sample'&&l.id==='$id');process.exit(L.length&&L.every(l=>l.IsCharging===false&&l.ExternalConnected===true)?0:1)" \
    || { log "EXCLUDED $id (a read not held, or no reads): re-run $a at the end of $h"; echo $a >> $D/rerun-$h.txt; }
  [ $rc = 0 ] || exit 22
}
reruns() { n=$2; [ -f $D/rerun-$1.txt ] || return 0; for a in $(cat $D/rerun-$1.txt); do segment $1 $n $a; n=$((n+1)); done; }
case $1 in
  serve)
    for a in F B V M; do
      ov=""; case $a in F) ov="--overlay research/phone-heat/floor";; V) ov="--overlay $D/snap/V6";; M) ov="--overlay $D/snap/M";; esac
      nohup node tools/serve.mjs --root site-pretty $ov --port $(port $a) --vendors=local --latency 150 --state $D/serve-$a.json \
        --owner $O --doing "P-068b heat arm $a" > $D/serve-$a.log 2>&1 &
      echo "serve $a pid $! port $(port $a)"
    done;;
  hcheck) hcheck $2;;
  warm-inner) # inside the prep hold: one uncounted W warm-up per arm's port (A3)
    for a in F B V M; do
      node tools/iphone.mjs open "$(url $a)" --owner $O || exit 1
      node tools/iphone.mjs run $W --arm $a --block heat-warm --label heat-warm-$a --warmup
    done
    node tools/iphone.mjs park --owner $O;;
  prewarm-inner) # inside a pre-warm hold: W warm-ups on B until the battery reads 36.0 C, at most 8
    node tools/iphone.mjs open "$(url B)" --owner $O || exit 1
    for i in 1 2 3 4 5 6 7 8; do
      t=$(tC); echo "prewarm read $t"; node -e "process.exit($t >= 36.0 ? 0 : 1)" && break
      node tools/iphone.mjs run $W --arm B --block heat-prewarm --label heat-prewarm-$i --warmup
    done
    node tools/iphone.mjs park --owner $O;;
  part)
    case $2 in
      prep)
        log "PREP P-068b: thermal condition, then one uncounted warm-up W run per arm's port (A3)"
        node tools/thermal.mjs status --owner $O >> $D/RUNLOG.txt 2>&1
        if node tools/thermal.mjs status --owner $O 2>&1 | grep -q '^ACTIVE'; then log "PREP a thermal condition is active: clear it (fair wants none)"; node tools/thermal.mjs clear --owner $O >> $D/RUNLOG.txt 2>&1; fi
        if ! node tools/thermal.mjs status --owner $O 2>&1 | tee -a $D/RUNLOG.txt | grep -q '^NONE'; then log "PREP thermal condition not NONE after clear: stop (the lead's call)"; exit 23; fi
        log "PREP thermal condition NONE"
        for a in F B V M; do hcheck $a || exit 21; done
        in_hold "phone heat P-068b warm-ups F B V M" "node tools/iphone.mjs profile --owner $O --profile fair && sh research/phone-heat/p068b.sh warm-inner" >> $D/RUNLOG.txt 2>&1
        rc=$?; log "PREP done exit $rc"; exit $rc;;
      H1a) segment H1 1 F; segment H1 2 B;;
      H1b) segment H1 3 V; segment H1 4 M; reruns H1 5;;
      H2a) segment H2 1 M; segment H2 2 V;;
      H2b) segment H2 3 B; segment H2 4 F; reruns H2 5;;
      *) echo "part prep|H1a|H1b|H2a|H2b"; exit 2;;
    esac;;
  all)
    log "ALL P-068b start"
    for p in prep H1a H1b H2a H2b; do
      node tools/lock.mjs run iphone --owner $O --block P-068b --max-seconds 3600 --keep 180 --doing "phone heat P-068b $p (F, B, v6, g0.0m)" \
        -- sh research/phone-heat/p068b.sh part $p
      rc=$?; log "PART $p exit $rc"; [ $rc = 0 ] || { log "ALL STOPPED at $p"; exit $rc; }
    done
    log "ALL DONE";;
  *) sed -n 2,3p "$0"; exit 2;;
esac
# padding (keep last): a running 'all' sh resumes reading this file at byte 7354 after its case ends; keep that inside
############################################################################################################################################################################################################################################################################################################

#!/bin/sh
# One functional fw-sim session for sim-vp.mjs (de-breakpoints, T-034). Inside a shared-lane hold:
#   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-breakpoints -- sh research/breakpoints/simvp.sh
# env: VP (test overlay, default out/breakpoints/snap/vp980), COVL (control overlay), VOVL (variant overlay), OUTNAME.
VP=${VP:-out/breakpoints/snap/vp980}
COVL=${COVL:-out/breakpoints/snap/hero-C}
VOVL=${VOVL:-out/breakpoints/snap/hero-V2}
OUT=out/breakpoints/${OUTNAME:-simvp}
mkdir -p "$OUT"
rm -f "$OUT/serve-C.json" "$OUT/serve-V.json"
node tools/serve.mjs --root site-pretty --overlay "$VP,$COVL" --port 0 --vendors=local --no-cache --quiet --state "$OUT/serve-C.json" > "$OUT/serve-C.log" 2>&1 &
PC=$!
node tools/serve.mjs --root site-pretty --overlay "$VP,$VOVL" --port 0 --vendors=local --no-cache --quiet --state "$OUT/serve-V.json" > "$OUT/serve-V.log" 2>&1 &
PV=$!
trap 'kill $PC $PV 2>/dev/null' EXIT INT TERM
UC=$(node tools/wait.mjs serve "$OUT/serve-C.json" --pid $PC --timeout 60 --reason "control server for the wide WebKit check" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
UV=$(node tools/wait.mjs serve "$OUT/serve-V.json" --pid $PV --timeout 60 --reason "variant server for the wide WebKit check" | sed -n 's/.*MIRROR_URL=\([^ ]*\).*/\1/p')
[ -n "$UC" ] && [ -n "$UV" ] || { echo "servers did not come up: C=$UC V=$UV"; exit 2; }
for U in "$UC" "$UV"; do
  echo "$U index: $(curl -sk "$U" | grep -o 'name="viewport" content="[^"]*"')  js: $(curl -sk -D - -o /dev/null "${U}_app/immutable/nodes/2.DyWL8TcE.js" | grep -i 'x-mirror-source' | tr -d '\r')"
done
node tools/sim.mjs session --functional --owner de-breakpoints -- node research/breakpoints/sim-vp.mjs --arms "C=$UC,V=$UV,C2=$UC" --out "$OUT"
echo "EXIT $?"

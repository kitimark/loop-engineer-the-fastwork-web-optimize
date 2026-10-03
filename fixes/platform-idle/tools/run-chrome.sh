# platform-idle (P-077) Chrome loads in one shared-lane hold (counts only). Arms: C = st6-rb2 overlay (control),
# V = platform-idle overlay (build), B = baseline (context, not judged). Each arm gets its own server (own origin).
# usage (from the worktree root):
#   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner platform-idle -- \
#     sh fixes/platform-idle/tools/run-chrome.sh <records.json> C:1 V:1 [V:2 C:2 ...]
set -u
OUT=$1; shift
D=out/platform-idle/pre
mkdir -p $D
start() { # $1 arm, $2 overlay or -
  rm -f $D/serve-$1.json
  if [ "$2" = "-" ]; then node tools/serve.mjs --root site-pretty --port 0 --https --vendors=local --no-http-twin --state $D/serve-$1.json > $D/serve-$1.log 2>&1 &
  else node tools/serve.mjs --root site-pretty --overlay "$2" --port 0 --https --vendors=local --no-http-twin --state $D/serve-$1.json > $D/serve-$1.log 2>&1 &
  fi
  echo $!
}
SC=$(start C fixes/st6-rb2/overlay); SV=$(start V fixes/platform-idle/overlay); SB=$(start B -)
node tools/wait.mjs serve $D/serve-C.json --pid $SC --reason "platform-idle control server" >/dev/null && \
node tools/wait.mjs serve $D/serve-V.json --pid $SV --reason "platform-idle build server" >/dev/null && \
node tools/wait.mjs serve $D/serve-B.json --pid $SB --reason "platform-idle baseline server" >/dev/null || { kill $SC $SV $SB; echo EXIT 1; exit 1; }
R=0
for L in "$@"; do
  A=${L%%:*}; N=${L##*:}
  node fixes/platform-idle/tools/idlecount.mjs --state $D/serve-$A.json --arm $A --rep $N --out "$OUT" || R=1
done
kill $SC $SV $SB
echo EXIT $R

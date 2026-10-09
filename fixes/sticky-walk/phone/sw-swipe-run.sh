#!/bin/sh
# sticky-walk blind swipe wrapper (lead 2026-10-09, user T-228 #121): servers (sw-serve.sh, plain http, hashes checked),
# the served-hash dry check, then sw-swipe.sh inside ONE phone hold, then the servers stop. Run it as a Bash background
# job (timeout 7200000 ms):  sh fixes/sticky-walk/phone/sw-swipe-run.sh
cd "$(dirname "$0")/../../.." || exit 2
if [ -n "$SW_ADOPT_ID" ]; then sh fixes/sticky-walk/phone/sw-serve.sh check || { echo "SWIPE STOP: servers (adopt)"; exit 4; }
else sh fixes/sticky-walk/phone/sw-serve.sh start || { echo "SWIPE STOP: servers"; exit 4; }; fi
TICKET=sw-swipe SW_S_DRY=1 sh fixes/sticky-walk/phone/sw-swipe.sh || { sh fixes/sticky-walk/phone/sw-serve.sh stop; echo "EXIT 4"; exit 4; }
TICKET=sw-swipe node tools/lock.mjs run iphone --owner fix-scrollcb-g0 --max-seconds 900 \
  --doing "blind swipe A/B for the user: g0.0i vs g0.0j" -- sh fixes/sticky-walk/phone/sw-swipe.sh
rc=$?
node tools/iphone.mjs park --owner fix-scrollcb-g0 > /dev/null 2>&1
sh fixes/sticky-walk/phone/sw-serve.sh stop
echo "EXIT $rc"
exit $rc

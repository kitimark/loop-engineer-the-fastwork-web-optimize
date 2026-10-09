#!/bin/sh
# people-blink phone wrapper: servers (sw-serve.sh, snapshot hashes checked), pb-phone.sh inside ONE phone hold,
# then the servers stop. Run as a Bash background job:  sh fixes/people-blink/phone/pb-phone-run.sh
cd "$(dirname "$0")/../../.." || exit 2
sh fixes/sticky-walk/phone/sw-serve.sh start || { echo "PB STOP: servers"; echo "EXIT 4"; exit 4; }
node tools/lock.mjs run iphone --owner fix-scrollcb-g0 --max-seconds 900 \
  --doing "people-blink: deck-landing flings on g0.0j, baseline and reveal knock-out (page log, Timeline, screen-capture numbers)" \
  -- sh fixes/people-blink/phone/pb-phone.sh
rc=$?
sh fixes/sticky-walk/phone/sw-serve.sh stop
echo "EXIT $rc"
exit $rc

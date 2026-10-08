---
name: heat-probe-for-blog
description: the phone heat probe (HEATRATE lines, °C per minute per heat method and page) is kept reproducible for the user's blog posts
metadata:
  type: project
---

**Rule (user T-247 #10, 2026-10-08):** keep the phone heat probe reproducible; the user will use it to write blog posts.

What the probe is (P-165, fix-g0-box, commit d0d764f9 on its branch, landed with the P-165 kit):
- One line per uncounted heat run: `HEATRATE method=<fling|scroll> page=<mirror|live> t0=<°C> t1=<°C> sec=<n> rate=<°C/min> state0=<thermal> ok=<0|1> state1=<thermal>`,
  in the part log and `out/p165/heatrate.log` (gitignored, per checkout).
- Battery °C is read by `fixes/g0-box/phone/heatread.mjs` right before the page open and right after the run (prints only the temperature);
  state0 is the run's own real-serious PROFILE read, state1 the next read.
- Heat methods: `iphone.mjs run --driver scroll --warmup` (scripted scroll) and `iphone.mjs gesture fixes/g0-box/phone/heat-fling.json --warmup`
  (hard end-of-page open/close flings, program 137ef5c2c60a, user T-247 #3), on the mirror's original page or the live site.
- Past rates from logs: de-heat-trace's table (OBSERVED, posted in T-247 #9): scroll 0.53 (mirror) / 0.44 (live) °C/min below 34 °C,
  0.24 at 34-37 (live); end-of-page gestures 0.13 at 37-40, ~0.03 above 40 (plateau near 41 °C). First fling run: 0.29 °C/min at 38 °C,
  Fair → real Serious (07:15Z).

**Why:** slow real-heat warm-ups cost up to 31 min (10-04); the probe shows which load heats fastest, and the user wants the numbers and the method for posts.

**How to apply:** keep `heatread.mjs`, `heat-fling.json` and the HEATRATE line format stable; any heat-method change logs the same line; a blog
write-up cites rates as OBSERVED with n, band and page, and never prints device ids, device names or LAN addresses (Hard rule 12). Related: [[phone-checks-start-warm]].

---
name: milestone-2-heat-profiles
description: "milestone 2 (after fixes 1-3 are smooth at real Serious): stay smooth from a 42-44 °C hot start and under Xcode-induced Serious"
type: project
audience: every agent
since: 2026-10-03
---

Milestone 2 starts only after milestone 1 is met: fixes 1-3 (hero-exit, cd-strip, F3) are landed and smooth on the phone
at real thermal Serious ([[phone-checks-start-warm]], user option B, T-039 #19-#20, 2026-10-03), confirmed by the
user's finger test. Since then milestone 1 already covers real Serious; (a) below keeps only the Xcode-induced case.

Milestone 2 is one set of two conditions; the page passes when it stays smooth in both:
- (a) **Xcode Serious.** Xcode > Devices and Simulators > the phone > Device Conditions > Thermal State "Serious". It is a
  user step in the console (no CLI can set or read it without a third-party install). Check the timer-driven parts
  (countdown, typing effects) for look and feel, plus the usual frame counts.
- (b) **Hot start.** The same phone tests started at 42-44 °C instead of 38-40 °C, one start method per block. Check the
  frame counts.

**Why:** user T-039 #12/#14 (2026-10-03): measure on the Serious profile as the next milestone after the page is smooth
on Fair. The lead split it in two, because Serious alone does not slow Safari down:
- Xcode's condition does not heat the device (WWDC19 session 412, CONFIRMED).
- WebKit at Serious only rounds DOM timers to a 30 ms grid. rAF halves only under RespondToThermalPressureAggressively,
  which defaults to false since WebKit a8c0b8f, 2025-01-31 (CONFIRMED in source; research/thermal-condition-cli/).
- The 4-run trial on 2026-10-03 showed 59 Hz and unchanged slow-frame counts under Serious (OBSERVED), but its
  "normal" runs were most likely already at real Serious (xctrace 10:02Z), so that comparison is superseded.
So the real-heat case needs a real hot start.

**How to apply:**
- No milestone-2 runs before milestone 1 is signed off.
- Pre-register each block as usual.
- Whether the Serious setting reaches Safari is settled by the timer probe run after P-074 (T-039); cite its result.
- Low Power Mode stays off; runs with it on are dropped.

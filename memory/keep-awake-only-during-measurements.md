---
name: keep-awake-only-during-measurements
description: "`caffeinate -i -s` inside measurement holds only"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-02
---

**Rule (user choice in console step C-024, 2026-10-02 14:54Z).** Keep the Mac awake only during measurements; never
session-wide or time-boxed.

**Why.** On 2026-10-02 the Mac idle-slept five times between 12:27Z and 14:36Z (~15 min each), freezing every agent
and lease and voiding a Simulator session. Of three options offered (awake 4 h, awake only during measurements, let it
sleep) the user chose "only during measurements": idle sleep is fine otherwise.

**How to apply.**
- Assertions only, around a timing hold, a Simulator session or a phone run; never around waits, builds, `npm test`
  or queueing. Use `caffeinate -i -s` (no settings change): `-i` alone does nothing once the Mac is in DarkWake
  (Apple IOPMLib.h, kIOPMAssertPreventUserIdleSystemSleep; CONFIRMED by ts-i070). The five "15-min sleeps" were
  Maintenance Sleeps out of DarkWake.
- The tooling does this: I-026 (`lib/awake.mjs`) kept the Mac awake on every hold and for waiters; I-070 narrows it
  to measurement holds. Rely on it.
- A run that spans a sleep is void.

Related: [defer-timing-focus-call-tree](defer-timing-focus-call-tree.md), [simulator-for-non-perf-phone-jobs](simulator-for-non-perf-phone-jobs.md).

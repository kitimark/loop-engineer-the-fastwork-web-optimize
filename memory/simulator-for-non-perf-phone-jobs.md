---
name: simulator-for-non-perf-phone-jobs
description: "no timing or perception number needed, use the Simulator"
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-06
---

**Rule.** A job that needs an iPhone but no timing or perception number runs on the iOS Simulator (`tools/sim.mjs`,
WDA-sim): mechanism checks, WDA/gesture compile tests, inspector-connection bugs, Safari restart tooling, DOM/page-state
checks, script dry runs. The real phone is for S/W/M/G timing blocks, sentinels, Timeline attribution, finger tests
and user sittings.

**Why.** On 2026-10-01 ts-gesture sat idle waiting for a phone slot to probe a WDA behaviour that was not a
performance question; the user asked why the Simulator was not used for such jobs.

**How to apply.** Before ordering the phone queue or spawning a phone task, ask whether it needs a timing or
perception number; if not, send it to the Simulator and keep at most a short phone confirmation when the result
depends on the device. A Simulator job still runs in a chrome-measure hold (it loads the Mac). Simulator timing never
decides a verdict (F-084).

**Update 2026-10-06 10:02Z (user, T-204 #35).** When the iPhone is free, agents may use it for proofs and any
testing, not only timing blocks: the project now focuses on the end-of-page optimization with few agents on the phone.
Still: the phone only inside a phone hold (`lock.mjs run iphone`), queued FIFO; ticketed timing blocks and user steps go
first; no phone use while another agent's marked block runs; heat rules and the idle alarm apply. The Simulator stays
the default when the phone is busy.

Related: [verify-platform-claims](verify-platform-claims.md).

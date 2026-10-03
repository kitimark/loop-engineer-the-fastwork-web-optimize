---
name: defer-timing-focus-call-tree
description: "no timing A/Bs or phone gain blocks except the listed exceptions"
type: project
audience: every agent
since: 2026-10-01
updated: 2026-10-02
---

**Rule (user direction, 2026-10-01 19:27Z).** Timing/performance measurement is deferred. Work on the Chrome call tree
(what runs, how often, style/layout counts, roots) and Safari layout and rendering attribution (Timeline
layout/style/paint records, roots, nested layouts), not fps or dt>50 verdicts. Chrome may run 3 agents in parallel
(nothing timed while shared); more only after the headless lane is released.

**Why.** The single exclusive `chrome-measure` lock and phone timing blocks serialized everything (24 h retrospective:
the inner loop must be counts).

**How to apply.** Don't queue timing A/Bs (`fix.mjs ab` gain runs, bench timing) or phone gain blocks. Phone time goes
to Timeline attribution runs, and to the Simulator where its records match the phone. Push the shared lane first.
Revisit when the user lifts the deferral.

**Exceptions.**
- 2026-10-02: PR-001 (accepted 06:31Z: pick the best-performing option) and the stack test (T-014, 07:07Z): one phone
  session comparing the best build with the five ready fixes stacked (cdwc, f3-arm-scope, re-keep-op, blur-cubic,
  st6), plus a blind swipe for the user.
- 2026-10-02 21:57Z (T-027 #5): the user asked the two highest-gain fixes to move; the lead picked hero-carousel st6
  and f3-arm-scope. Their phone timing tests (st6 scripted at rest, F3 P-036 robot finger) may run, queued after G2
  and P-065.
- Everything else stays deferred unless the user lifts it.

Related: [simulator-for-non-perf-phone-jobs](simulator-for-non-perf-phone-jobs.md), [verify-platform-claims](verify-platform-claims.md).

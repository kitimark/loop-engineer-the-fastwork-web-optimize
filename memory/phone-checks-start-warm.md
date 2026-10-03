---
name: phone-checks-start-warm
description: "phone checks start warm (38-40 °C); Low Power Mode runs excluded, not tested; no countdown-only test page"
type: project
audience: every agent
since: 2026-10-03
---

**Rule (user decision, T-029 #30, 2026-10-03 08:52Z, on the lead's recommendation in #29).**
- Phone checks start warm, at about 38-40 °C (everyday use; this page warms the phone). No cooling to a cold start.
  Cards name their start band; a block keeps one start method for every run (P-073 lesson: method confounded with arm).
- Low Power Mode (30 Hz) is left out: keep recording it, drop and re-run any LPM run; not tested as its own question
  unless the user asks.
- No countdown-only test page: isolation uses the real page with the rest frozen (FRZ, P-075/P-076).

**Why.** Our runs show no smoothness change between 34 and 42 °C (isolated-measurement README §1.2), and warm starts
save most cooling waits; LPM is a different page (half frame rate), not a slower one.

**How to apply.** Use `wait.mjs phone-temp --below <X>` only to get back under the band's top (it is met at exactly X,
F-169); pre-warm on the plain baseline page the same way for every arm. Existing signed cards keep their bands.

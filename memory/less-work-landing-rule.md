---
name: less-work-landing-rule
description: "a 'does less work' fix lands on cost-card counts plus one short phone no-worse check; top-3 smoothness fixes keep phone + finger test"
type: project
audience: every agent
since: 2026-10-03
---

**Rule (user decision, T-029 #30, 2026-10-03 08:52Z, on the lead's recommendation in #29).** A fix whose benefit is
"the page does less work" (heat fixes, idle and script-at-rest fixes) may land on: fewer work counts, shown on the full
page in Chrome and the Simulator (the rendering cost card, `research/architecture/isolated-measurement/README.md` §6),
plus one short phone check that it does not feel or measure worse. No measured smoothness win on the phone is needed.
The three smoothness fixes the user ranks highest (T-035: hero-exit, cd-strip, F3) still need a phone check and the
user's own finger test before landing.

**Why.** Full-page phone timing blocks heat the phone and wait on cooling (T-029 #18, #23); the countdown pilot
(P-075/P-076) showed element-owned counts carry over from a frozen page to the full page.

**How to apply.** Cards for "less work" fixes judge counts per event (not per time window), take frame-driven counts
from the full page, and add one short no-worse phone check; frame-driven counts and illusion rules (pixel-identical)
still apply. Smoothness claims ("feels smoother") still need phone data and, for the top three, a user finger test.
Signed D gates already written for a fix stay as signed unless the lead re-signs them and tells the user.

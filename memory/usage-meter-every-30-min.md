---
name: usage-meter-every-30-min
description: "re-create the 30-min cron each session; data stays local"
type: project
audience: lead
since: 2026-10-01
updated: 2026-10-01
---

**Rule (user request T-010, 2026-10-01 22:02Z).** Measure the session's plan usage every 30 minutes and carry the
series across sessions.

**How to apply.**
- At every session start, re-create the 30-minute cron (crons are session-only).
- Meter: `node research/management/tools/usage.mjs` (read-only, reads the local transcripts). Each run appends to
  `<git-common-dir>/fastwork-mirror/usage/usage.jsonl`; the user's own readings go in `usage/calibration.jsonl`. Both
  stay local: account usage is personal data (Hard rule 12), so readings and window times are not copied here.
- Post a 3-line summary to thread T-010 each time. If the estimate passes ~85 % of the window, propose in T-010 what
  to park.

**Why.** The user watches plan usage and wants work prioritised against it.

Related: [user-tasks-via-console](user-tasks-via-console.md).

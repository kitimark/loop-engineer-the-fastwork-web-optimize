---
name: proposal-revision-visible
description: "after changes-requested the user always sees who revises, which step and by when; a revision is posted when its Try-it pages work, not after every check"
type: feedback
audience: every agent
since: 2026-10-04
updated: 2026-10-04
---

**Rule.** Once the user decides changes-requested, the proposal must show at all times who is revising it, which
step it is on and when rev N+1 is expected. The author posts rev N+1 as soon as its Try-it pages work and the
answer to each point of the note is written; slower checks follow as later revisions or in the proposal's talk.

**Why.** On 2026-10-04 the user saw "changes requested" on both open proposals and no "waiting for your review" on
any (T-154 #7). PR-018 rev 6 was decided at 18:02Z and rev 7 posted at 20:10Z, 2 h 8 min with nothing visible.
PR-021 was decided at 19:42Z and still not revised 30 min later. The authors held each revision until every check
had passed (Chrome probes and phone A/Bs queued behind shared locks). Nothing flagged a revision as slow, so the lead
heard of it only when the user asked, and first answered "nothing is broken" (T-154 #6). The user asked the lead
for the cause, a workaround and a long-term fix: "This is your responsibility" (T-154 #9).

**How to apply.**
- Author: within 10 min of a changes-requested decision, mark it with `proposal revising <id> --note "<step>" --eta
  <time>` (incident I-177; until it lands, ask the lead for a `proposal hold` note). Update the mark when the
  step or the time changes.
- Author: post rev N+1 once the Try-it pages work and each point is answered. A check still queued goes in the
  revise note as "still running: …, result by …".
- Lead: a check that a user-waiting revision needs gets moved up in the lock queue. At each check-in, run
  `proposal overdue` (I-177) or read `proposal list`. A revision unmarked for 15 min, or past its time, is the lead's
  to chase, not the user's to discover.
- Lead: "nothing is broken" is not an answer to a user who waited; give the cause, the workaround and the fix.

Related: [proposal-decision-is-the-spec](proposal-decision-is-the-spec.md), [user-steps-first](user-steps-first.md).

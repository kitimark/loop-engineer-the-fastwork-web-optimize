---
name: busy-workers-answer-later
description: "don't pull a busy worker agent off its own work to answer a user question; a free helper answers now, the worker replies in the thread when it is free, and a slow reply is fine"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-147 #1, 2026-10-04 18:18Z, on T-098 #7).** Don't direct-message a worker agent that has its own
work running just to answer a user question. The worker may reply to the question in the thread when it is free;
the user accepts that this can take a long time because it is busy.

**Why.** In T-098 the user asked a new question (two page parts and our fixes) while the agent assigned to that thread
(fix-hero-exit-threaded) was mid-way through the user's own PR-018 rev 7 request; pulling it off would slow the work the
user cares about most.

**How to apply.**
- A user question on a thread whose owner is busy: the lead (or the desk) answers what it can from the repo, or sends
  a read-only helper (Explore / sonnet) for code questions; the busy owner is not messaged about it.
- The owner sees the thread when its own step ends and may add to the answer then; no hurry.
- Messages that are part of the worker's own work (rulings, queue order, a land result, a user decision on its
  proposal) still go to it directly.
Related: [[answer-format]], [[trace-before-asking]], [[user-tasks-via-console]].

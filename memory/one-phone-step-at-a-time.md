---
name: one-phone-step-at-a-time
description: "user phone steps: one at a time, posted only by the lease holder after the user says ready; the lead sets the order; a step never outlives its lease"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-078 #8, 2026-10-04 06:30Z; lead plan T-078 #11).** Phone steps for the user go one at a time:
1. Only the agent that holds the `iphone` lease posts a phone step (swipe-pair, `--record`, or any step that
   needs the user on the phone), and only when no other phone step is open (pending, ready or active).
2. The lead decides the order. Agents ask the lead and don't post on their own. The lead tells the user the
   order up front.
3. Nothing appears in Your steps until the user says "ready" in a thread. Automatic phone checks run only while
   no user step is open, and never take the phone from one.
4. A step never outlives its runner's lease. Renew at least 2 min before the lease ends. Arm `console.mjs wait
   <id> --until redo` in the background from the first part on (Start over must be answered within a minute).
   Before the first `iphone.mjs open` after a hand-over, check that the previous holder's step is closed
   (`console.mjs show <id>`).

**Why.** On 2026-10-04 06:18-06:30Z the user pressed Start over on C-037. The runner missed the restart for
10 min, its lease ran out, and the next holder opened its own page and posted three more steps over it.
Crossing lead messages then flipped the order twice, and the user skipped all four steps. The user's words:
the steps from different agents conflict and block each other.

**How to apply.** Tool checks come with incident I-123: a lease guard while a step is open, a REDO wake-up,
a stuck-ready alarm, a refusal to open the phone over another agent's step, and `post` refusing a second
phone step. Until they land, the runner and the lead check by hand. Related: [[user-steps-first]],
[[no-phone-steps-during-blocks]], [[console-step-wait-yourself]].

**2026-10-05 (lead).** Any step that has the user handle the iPhone (a Try-it, an Xcode heat step) is posted with
`--phone`, by the lead too. Without it the idle alarm does not see the user on the phone: C-065 and C-067 were posted
without it and caused the two phone idle alarms of 09:25-10:25Z (25 and 13 min, T-163 #22).

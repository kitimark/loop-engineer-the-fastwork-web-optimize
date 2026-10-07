---
name: idle-alarms-are-a-pattern
description: "the lead finds why the iPhone is idle before the user asks: check the holder's live processes at 2 min, and review repeated idle alarms as one pattern, not one by one"
type: feedback
audience: lead
since: 2026-10-04
updated: 2026-10-07
---

**Rule (user, T-149 #3, 2026-10-04 18:35Z: "Why didn't you find this incident before? I'd expect you could find
this before me to ask. I saw a lot of messages that the iPhone was idle.").** The lead finds and fixes the cause of an
idle iPhone before the user notices it.

**Why.** On 10-04 the idle watch posted 15 iPhone idle threads (T-090 ... T-150). Each closed by itself when the slot
was taken, and the lead answered them one by one without asking why the phone kept going idle. At 18:32Z the lead saw
the phone held but unused for 4 min and only sent a message; the cause (a `lock.mjs wait --until mine --for 570`
still running after the lease was the holder's, I-165) sat in plain `ps` output.

**How to apply.**
- At every phone check: when the phone is held with no phone run for 2 min or more, look at the holder's live
  processes (`ps -eo etime,command | grep <owner>`) and fix or report the cause at once; don't just message.
- At every check-in: count today's idle threads (`console.mjs thread list --all | grep -i 'iPhone (held|free)'`);
  from the 3rd one, review them together (cause, minutes lost) and fix the commonest cause (tool, queue order,
  hand-over steps).
Related: [[user-steps-first]], [[one-phone-step-at-a-time]], [[trace-before-asking]].
- When you sign a phone ticket or give a "go" that has a precondition (a Simulator dry run, cooling, a pending build),
  set the owner's row in the same step: `status.mjs set <id> --by lead --phone-next <ticket> --phone-needs "<what>"`.
  An unmarked row whose next step names the phone raises a false idle alarm (10-07: T-236, T-237).

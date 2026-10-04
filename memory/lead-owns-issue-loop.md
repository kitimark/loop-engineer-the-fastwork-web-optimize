---
name: lead-owns-issue-loop
description: "every issue the user raises gets the full loop from whoever answers it (the lead by default): cause from our data, which cases, a workaround now, a long-term fix with an owner; never just a status explanation"
type: feedback
audience: every agent
since: 2026-10-04
updated: 2026-10-04
---

**Rule.** When the user raises an issue (something lags, looks wrong, waits, alarms, or a tool or the team behaves
badly), whoever answers runs the **issue loop**. The lead runs it by default and owns it for every user thread.
1. **Investigate.** Find the cause from our own data: records, logs, the board, the transcripts. Don't ask the user.
2. **Distinguish.** Say which cases are hit and which are not, with numbers: how long, how often, which items.
3. **Workaround.** Make it now, so the user's problem stops today.
4. **Long-term fix.** Fix the cause with an owner: a tool change (incident plus toolsmith), a rule (memory note), or a
   role change (AGENT_ROLES and LEAD.md). The rule exists so the user never has to raise the same issue twice.
Report all four in the first answer, under those names. "Nothing is broken", or an explanation of the current
state, is never the whole answer to a user who raised a problem.

**Why.** The user asked for exactly this loop at least 15 times on 2026-10-04. Examples: T-125 (parked rows), T-126
("investigate, do workaround and do long-term fix"), T-134 (idle alarms), T-140 (workarounds), T-149 (the lead's
own role), T-155 (automated threads), T-154 #9 and #11. At T-154 #6 the lead still answered a stuck proposal with
"nothing is broken, rev 2 is not posted yet". The user had to ask twice more, then asked the lead to find what was
wrong in its own role instructions. They found three gaps.
- The loop lived only in thread messages; no memory note, LEAD.md section or role row named it, so it did not
  survive context compaction.
- LEAD.md's loop covered fix waves only, not the user's issues.
- The answer-format lint checked the form of an answer, not whether it had a cause, a workaround and a fix.

**How to apply.**
- On every thread wake from the user, first ask: is this an issue? If yes, the reply follows the loop with the
  four labelled parts. A question about state ("why don't I see X?") counts as an issue when the user waited or
  something did not happen as promised.
- When one area keeps producing issues, hand it to an owner agent ([[lead-delegates-areas-measures]]). The lead
  still answers the user with the four parts and names the owner.
- The long-term part names its proof: the incident id, the memory note or the commit.

Related: [[trace-before-asking]], [[answer-format]], [[lead-delegates-areas-measures]], [[proposal-revision-visible]].

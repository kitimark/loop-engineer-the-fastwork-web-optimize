---
name: console-step-wait-yourself
description: "post a step, arm `console.mjs wait <id>` in its own background call in the same turn"
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-01
---

**Rule.** Whoever posts a console step (`console.mjs post`) arms `node tools/console.mjs wait <id> --until answered`
in the same turn, in **its own** Bash call with `run_in_background`, and acts on the answer (or hands it on) when it fires.

**Why.** On 2026-10-01 17:26Z the user pressed Done on C-009 (reload Safari); the lead had left the waiting to the
phone runner and nobody reacted for about 4 minutes. The user asked why it was not caught.

**How to apply.**
- Never assume another agent watches the item.
- Never start a console wait (`thread wait`, `wait <id>`, `proposal wait`) with a shell `&` tacked onto another
  command: the detached wait marks the user's message read and nothing wakes you (happened twice on 2026-10-01,
  21:21Z and 21:57Z).

Related: [user-tasks-via-console](user-tasks-via-console.md).

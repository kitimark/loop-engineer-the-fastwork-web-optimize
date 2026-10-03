---
name: user-tasks-via-console
description: "user steps go into the local console (Start, answer, next), never relayed through the lead's chat"
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-01
---

**Rule.** The user's to-dos (finger tests, swipe A/B pairs, ratings, yes/no questions) go through the local web console
(`tools/console.mjs`): a queue of steps with Start and answer buttons. Not relayed through the lead's chat; in chat the
lead keeps to short pointers ("2 steps waiting in the console").

**Why.** On 2026-10-01 the user found the lead's chat too busy to follow and asked for a click-through list of
questions. Relaying also lost data: swipe recordings started after the user had already swiped.

**How to apply.** Post steps there and wait on Start (CLAUDE.md "User console"). The console stays local (localhost,
never published).

Related: [perception-tests-touch-ab](perception-tests-touch-ab.md).

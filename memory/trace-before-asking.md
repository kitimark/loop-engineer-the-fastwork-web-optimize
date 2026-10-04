---
name: trace-before-asking
description: "when the user reports lag or a bug, trace it from our own recordings, logs and probes first; ask the user only what no data can answer"
type: feedback
audience: every agent
since: 2026-10-04
---

**Rule (user, T-087 #7, 2026-10-04 08:19Z: "Can you tracing this lag instead of asking me?").** When the user
reports a lag, a stall or a wrong display, first find the answer in what we already have: the phone frame logs of
their swipe tests (timestamp and scroll position per frame), Chrome or Simulator probes, console step history. Ask
the user only for what no recording can show (which browser they used, what they felt), and at most one short
question.

**Why.** After the C-042 swipe test the agent asked the user where the lag was (top bar crossing or end of page),
although the recording of their swipes held the frame times and scroll positions to answer it.

**How to apply.** Before you ask, check: is there a recording, log or probe that answers this? If yes, trace it and
answer with a small table (where, which page, how many slow frames), status OBSERVED where it rests on our probes.
Related: [[answer-format]], [[perception-tests-touch-ab]], [[verify-platform-claims]].

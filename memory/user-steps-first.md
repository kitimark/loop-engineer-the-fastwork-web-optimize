---
name: user-steps-first
description: "a posted user step takes the phone next; no cooling or Mac-quiet gate on it"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-07
---

**Rule.** A console step the user is waiting on (swipe pair, finger test) takes the phone next, ahead of every
measurement block and every Mac-quiet wait.

**Why.** On 2026-10-02 08:28Z (T-017) the user asked why C-019 took so long: a second stack-test block had run first,
and then the swipe pair waited on cooling and a Mac-quiet hold. The user asked for C-019 to be top priority and not to
be kept waiting. The user's time is the scarcest resource.

**How to apply.**
- No cooling or Mac-quiet gate on a user step; recordings are supporting evidence, so log the Mac load instead.
- If a step really must wait, say so in the step with an ETA.
- Check the posting agent acts at once (messages arrive only between tool rounds).
- The runner acks every change on the step with a plain one-line `--message` (doing what, ETA), so the user can
  follow on the step page (user request, T-017).
- A phone slot given to the user (a `user` lease for a hand try-out) ends as soon as the user decides the thing it was
  for or presses Done: the lead (or the owner) releases it then, never waits for a separate "done with the phone"
  reply (user T-233, 2026-10-07: the user had decided PR-032, yet the Progress page still showed them on the phone).

Related: [user-tasks-via-console](user-tasks-via-console.md), [console-step-wait-yourself](console-step-wait-yourself.md), [perception-tests-touch-ab](perception-tests-touch-ab.md).

---
name: no-phone-steps-during-blocks
description: "never ask the user to touch the iPhone while a timed block runs"
type: feedback
audience: every agent
since: 2026-10-02
updated: 2026-10-02
---

**Rule.** Never post a console step that makes the user touch the iPhone (settings, placement, finger tests) while a
timed phone block runs. Check `lock.mjs status` first; post it between blocks and tell the next runner to wait for the
answer.

**Why.** On 2026-10-02 23:50Z a phone-settings step (C-027, P-068) went out while X1 stage 2 part A was starting; the
user handled the phone for about 1.5 min, voiding overlapping runs ("phone touched") and changing brightness mid-block.

**How to apply.** A step that is itself the phone job (a swipe test) still goes first, per [user-steps-first](user-steps-first.md).

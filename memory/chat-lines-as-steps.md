---
name: chat-lines-as-steps
description: when something needs the user's own words in the Claude Code chat (a guard change, a permission OK), post it as a console step at once with the exact line to paste
metadata:
  type: feedback
---

When work needs the user to type something in the Claude Code chat themselves (an enforcement-layer change such as
the picture guard, or an OK for a command the permission system refused), the lead posts it right away as a console
step ("Your steps") with the exact line to paste and where to paste it. Don't wait until the user asks how.

**Why:** user T-170 #149 (2026-10-10): "if you have anything that needs me to go to Claude Code with a direct prompt, you
could ask me on your steps now. No need to wait for me to ask you first." Before this, the lead only mentioned the line
in thread replies, and the user had to ask (T-170 #139) how to type it.

**How to apply:** `console.mjs post --kind action` with the line in the instructions plus "then press Done", and arm a
wait on it. The chat words stay the only authority for guard changes ([[verify-platform-claims]] style rules
unchanged): the step only tells the user what to type, it never counts as the approval itself. See also
[[console-steps-only-for-actions]], [[user-tasks-via-console]].

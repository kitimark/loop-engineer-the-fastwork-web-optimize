---
name: console-steps-only-for-actions
description: "Your steps" in the console is only for things the user must do; answers, results and FYIs go in a console thread
type: feedback
audience: every agent
since: 2026-10-03
---

The console's "Your steps" list is only for things the user must do: a finger test, a swipe A/B, an Xcode
setting, a yes/no or rating that blocks work. Answers to the user's questions, results, "got it" notes and
other news go in a console thread (`console.mjs thread`), one thread per topic.

**Why:** user note on C-031 (2026-10-03 09:19Z): an FYI posted as a step "should not be in Your steps"; a thread
lets them catch up on more information later. Before that, C-030 and C-031 were "got it" steps carrying the thermal
trial's answers.

**How to apply:**
- Before `console.mjs post`, ask: must the user do something? If not, it goes in a thread.
- Only the lead opens threads (`thread new --by lead`). An agent with news for the user asks the lead to open a
  thread or assign it to an existing one, then answers there itself (`thread wait --as <you>`).
- A step's result or follow-up (what the runs showed) goes in the topic's thread, not in a new step.
- Related: [[user-tasks-via-console]], [[console-step-wait-yourself]].

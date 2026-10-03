---
name: perception-tests-touch-ab
description: "the user judges lag by finger-following; blind swipe A/B, not watched clips"
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-01
---

**Rule.** Smoothness perception tests on the iPhone are blind touch A/B pairs: the user swipes A and B and picks the
one that follows the finger better. Not watched clips.

**Why.** On 2026-10-01, after pacing v2 (watched clips), the user explained that the lag they notice is the content
not following the finger, so swiping A/B would be more accurate. That is a touch-latency effect clips cannot show.

**How to apply.** Forced choice, AB/BA counterbalancing, a catch pair; pair each arm with an objective
finger-to-pixel latency from the gesture driver (`touchToScrollMs`). Watched clips only for questions about playback
pacing.

Related: [verify-platform-claims](verify-platform-claims.md).

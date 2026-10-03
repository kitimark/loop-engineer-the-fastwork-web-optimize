---
name: proposal-decision-is-the-spec
description: "changes-requested means rev N+1 of the same proposal, every point answered"
type: feedback
audience: every agent
since: 2026-10-01
updated: 2026-10-01
---

**Rule.** A user's changes-requested decision on a proposal is the spec for rev N+1 of the **same** proposal.

**Why.** PR-001 rev 1 (a wipe) got changes-requested asking for apple.com-style image frames or video and for research
into them. The team built other arms instead (CSS contain; "onecopy", the fallback rev 1 already listed), planned them
as separate PRs, dropped the "research them" part when relaying the note, and left PR-001 at rev 1. On 2026-10-01
22:43Z (T-006) the user asked the lead to study this case and redesign how decisions are handled.

**How to apply.**
- Read the full decision with `console.mjs proposal show <id>` (list views truncate notes).
- Answer with `proposal revise <id>`: quote the request in the first lines and answer each point.
- Other arms only under "also tried, not chosen". Relay the user's note to the author unshortened.
- Post nothing that changes the visual unless stated up front.

Related: [illusion-must-be-pixel-identical](illusion-must-be-pixel-identical.md), [user-tasks-via-console](user-tasks-via-console.md).

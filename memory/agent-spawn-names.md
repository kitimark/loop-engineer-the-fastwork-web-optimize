---
name: agent-spawn-names
description: "every spawn gets `name: <role>-<topic>`; check the first spawn after each compaction"
type: feedback
audience: lead
since: 2026-10-01
updated: 2026-10-03
---

**Rule.** Pass `name: "<role>-<topic>"` (e.g. `fix-nav-morph`, `review-10d`) on every Agent spawn, even when the
Agent schema shown after a compaction does not list `name` (it is accepted; checked with a probe spawn 2026-10-01).

**Why.** After a compaction on 2026-10-01 (09:13Z) the lead stopped naming spawns; research agents could not message
each other ("no agent named X is reachable") and routed their notes through the lead. The user wants agents to work
together directly, without the lead as a bottleneck.

**How to apply.**
- Names are unique per session; a reused name resolves to the newest agent. Restarts get a suffix (`mgmt-ops-4`).
- Put the peer directory (names, owners) in every spawn prompt.
- Project agent types in `.claude/agents/` load only at session start. If they are missing from the agent list,
  spawn `general-purpose` with `name`, the role's `model`, and "read `.claude/agents/<role>.md` first".
- Check this on the **first spawn after every compaction**: it slipped again on 2026-10-03 ~00:00Z (three unnamed
  spawns); the user noticed it in console thread T-032 and asked for the naming convention to be followed.

Related: [verify-platform-claims](verify-platform-claims.md).

---
name: agent-teams-not-workflows
description: "delegate to named agent-team teammates, not to the Workflow tool, even when ultracode is on; teammates never call EnterWorktree"
type: feedback
audience: lead
since: 2026-10-13
---

**Rule (user, T-275 #3 on 2026-10-12, repeated in T-170 #432 on 2026-10-13).** Delegate work to an agent team: named
teammates (an Agent call with `name: <role>-<topic>` and the peer directory in the prompt), not to a dynamic Workflow
script. This holds even while ultracode is on and a system note says to use the Workflow tool.

**Why.** The user watches the work on the console's Agents and status pages and talks to named agents. A workflow's agents
are hidden inside one background task, and the user asked twice for teams instead.

**How to apply.**
- Spawn each worker as a named teammate. It sets its status row at the start (I-265 lesson). Reviews are a named teammate
  too.
- A teammate that changes files works in its own worktree by **absolute paths only**: Read/Edit/Write on
  `.claude/worktrees/<wt>/...`, and Bash with `cd <wt> && …` or `git -C <wt>`. It **never calls EnterWorktree**.
  OBSERVED 2026-10-13 (incident I-272): in a team, EnterWorktree switches the whole session, the lead included. After a
  further switch the previously visited worktree is no longer writable (the tool's own description says so). So three
  teammates entering three worktrees block each other, and the lead lands in a worktree. The lead creates the worktree
  first (`git worktree add .claude/worktrees/<name> -b <branch>`) and passes its path. If it happens: message every
  teammate, then ExitWorktree with action keep.
- If a workflow is already running when this comes up, stop it, keep its worktrees, and respawn the jobs as teammates
  that continue the saved work in those worktrees (done for I-268/I-269/I-270, 2026-10-13).

---
name: lead-delegates-areas-measures
description: "the lead hands a recurring problem area to an owner agent (investigate, long-term fix, delegate to the team), then only measures the area against an exit target and stops the owner when the tools carry it"
type: feedback
audience: lead
since: 2026-10-04
---

**Rule (user, T-149 #12 and #14, 2026-10-04 18:57Z / 19:0xZ: "give the responsibility to mgmt-devices for investigate,
find the long-term improvement and delegate to team for fix it. Then you measure the issues ... if it better ... we can
gracefully stop the mgmt-devices agent." / "You could have responsibility likes this. update your roles").**

When a problem keeps coming back in one area (devices, threads, the board, landing queue, usage, ...), the lead does
not keep fixing instances itself:
1. **Hand the area to an owner agent** (a light model if the work is watching/routing): it watches, investigates the
   cause, owns the long-term fix (design, incident, toolsmith brief, follow-up to landing) and only asks the lead for
   what only the lead may do (spawns, landing, user decisions, rule changes).
2. **The lead measures**: name one or two numbers for the area (e.g. idle-with-waiters minutes per 3 h, lead
   interventions) and an exit target (e.g. two windows in a row at target, no lead action), checks them at check-ins,
   and tells the user the trend.
3. **Graceful stop**: when the target holds, the owner parks and the tools carry the area; if it slips, resume it.

**Why:** the lead was the bottleneck: busy landing, it noticed idle phones after the user did (18 alarms, ~204 min on
10-04) and fixed them one by one.

**How to apply:** at the 3rd repeat of a problem in a day (see [[idle-alarms-are-a-pattern]]), pick or spawn the area
owner, write its row in `fixes/AGENT_ROLES.md` "Delegated authority" (powers, long-term-fix duty, exit metric), and
record the metric baseline. First case: mgmt-devices (roles d0f7aa32, design `research/architecture/phone-hold-v2.md`).

**2026-10-04 19:49Z (user T-155 #4):** "The thread likes this should delegate to mgmt-devices as first tier management and lead as second tier management. They could not reply to work agent." So an area owner is also the **first tier** for the user's threads in its area (it answers; the lead is second tier, on escalation), and worker agents are not assignees there: the owner gets their facts by message. Tool side: idle-alarm threads address mgmt-devices + lead only (I-175).

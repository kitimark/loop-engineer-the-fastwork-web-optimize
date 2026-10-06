---
name: breakthroughs-become-practices
description: "a breakthrough (a technique that clearly wins) is written up as a practice in research/architecture/, broadcast to every active owner, and each owner checks its own area for the same win"
type: feedback
audience: every agent
since: 2026-10-06
updated: 2026-10-06
---

**Rule.** When a technique clearly wins (a breakthrough: a large measured drop in main-thread work or slow frames that
the user accepts, or a decisive cause found), it does not stay in one fix's README:
1. The owner (or an architecture agent the lead spawns) writes it up as a practice in `research/architecture/`
   (what it is, how to spot a candidate from existing traces, the gate order, pitfalls with fixes, a one-screen
   checklist), with status words on every engine claim ([verify-platform-claims](verify-platform-claims.md)).
2. The owner posts it on the findings board as `--kind technique` with the doc path.
3. The lead adds its checklist to this memory index and messages every active topic owner.
4. Every owner checks its own area against the checklist within its next step and reports to the lead: applies
   (with the first measurable check it will run) or does not apply (one line why). Applying it follows the normal
   gates; a look change is still a proposal with Try-it.

**Why.** On 2026-10-06 the compositor-only end-of-page morph (PR-030) cut paints about 4x and the user called the page
"SOOOO ULTRA SMOOTH". The user asked (T-204 #53, T-224 #3) that such breakthroughs be documented as practices so other
agents catch up and optimize their own areas.

**How to apply.** First case: `research/architecture/gpu-compositor-playbook.md` (arch-gpu-playbook). Owners read it
before working on any scroll-linked animation. See also [read-source-first](read-source-first.md).

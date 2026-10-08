---
name: phone-problems-fix-first
description: "when the iPhone link or its test driver fails without the user having touched it, the lead investigates and repairs it first (cable watcher, proxy, WDA restart); a user step only for what no repair can do"
type: feedback
audience: every agent
since: 2026-10-08
---

**Rule (user, T-256 #1, 2026-10-08 19:4xZ: "If phone was disconnect without any my request, you could investigate to fix
first").** When a phone run fails on the link or the test driver (USB, proxy, WDA errors such as "Not authorized for
performing UI testing actions"), the lead finds the cause from our own logs and repairs it before asking the user for
anything: `usblink.mjs status` and `out/usblink-watch.log`, `iphone.mjs wda check`, then a WDA restart (`wda stop` +
`wda start`) inside a lead phone hold. Post a user step only for what no repair can do (a re-plug, a trust prompt, an
unlock the logs prove), and say in it what the logs showed.

**Why.** P-170 (2026-10-08 19:07Z) stopped on WDA Code=41. The lead posted an unlock step (C-131) at once; the user had
not locked the phone ("I was unlocked before. what's the problem ?"), and the real fix was a fresh WDA runner (19:11Z,
I-254). The step cost the user a trip to the phone for nothing.

**How to apply.** Agents report phone link or driver errors to the lead and post no step. The lead: logs, then repair,
then rerun; a user step only with evidence it is needed. After any user phone use, restart WDA before the next block.
Related: [[trace-before-asking]], [[user-steps-first]], [[one-phone-step-at-a-time]].

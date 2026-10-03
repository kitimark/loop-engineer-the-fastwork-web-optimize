---
name: console-server-detached
description: "run `console.mjs serve` with nohup; check `console.mjs url` each check-in"
type: feedback
audience: lead
since: 2026-10-02
updated: 2026-10-02
---

**Rule.** Run the user console server detached, not as a Claude Code background job:
`nohup node tools/console.mjs serve --port 5559 > out/console-serve.log 2>&1 < /dev/null & disown` (localhost only).
Check `node tools/console.mjs url` at every lead check-in; if it is down, restart it and tell the user.

**Why.** On 2026-10-02 the server ran as a Bash `run_in_background` job; those are killed at the 2-hour cap. It died
at 01:50Z and stayed down about 4.5 h unnoticed; the user asked in T-012 why the console had stopped. The user does
every step through the console, so a dead console blocks them.

**How to apply.** The "no `&`" rule for console *waits* does not apply to the server.

Related: [user-tasks-via-console](user-tasks-via-console.md), [console-step-wait-yourself](console-step-wait-yourself.md).

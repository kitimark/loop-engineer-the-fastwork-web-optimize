---
name: console-server-detached
description: "\"start the console\" = server (nohup) + the lead's thread listener (Monitor) + answer open threads + idle watch; check `console.mjs url` each check-in"
type: feedback
audience: lead
since: 2026-10-02
updated: 2026-10-12
---

**Rule.** When the user says "start the console", do all four steps, not only the server:
1. **Server, detached** (not a Claude Code background job), unless `node tools/console.mjs url` already prints it:
   `nohup node tools/console.mjs serve --port 5559 > out/console-serve.log 2>&1 < /dev/null &` (localhost only),
   then `node tools/wait.mjs url http://localhost:5559/ --owner lead --timeout 20 --reason "console server start"`.
2. **The lead's thread listener** (the "observer"): one Claude Code `Monitor` on
   `node tools/console.mjs thread wait --as lead --triage --monitor --timeout 86400`, `timeout_ms` 1800000.
   The Monitor tool stops after 30 min: re-arm it at every expiry notice.
3. **Catch up the threads:** `node tools/console.mjs thread list | grep -v '\[answered\]' | grep -v '\[closed\]'`;
   read each open one (`thread show <id> | tail -60`) and answer it there (`thread reply … --check-format` first).
4. **The idle watch** (CLAUDE.md "Idle alarm"), unless `pgrep -fl 'idle.mjs watch'` shows one:
   `nohup node tools/idle.mjs watch --by lead --interval 60 >> out/idle-watch.log 2>&1 < /dev/null &`
   (append, the log keeps its history), then `node tools/idle.mjs check` (exit 0 = nothing idle while work waits).

Check `node tools/console.mjs url` at every lead check-in; if it is down, restart it and tell the user.

**Why.** On 2026-10-02 the server ran as a Bash `run_in_background` job; those are killed at the 2-hour cap. It died
at 01:50Z and stayed down about 4.5 h unnoticed; the user asked in T-012 why the console had stopped. The user does
every step through the console, so a dead console blocks them. On 2026-10-12 the lead started only the server; the
user's open question in T-170 sat unanswered until the user asked in chat whether the observer was running, and asked
for this note so "start the console" is done fully next time, then asked for the idle watch too.

**How to apply.** The "no `&`" rule for console *waits* does not apply to the server. `& disown` inside a subshell
prints a harmless "no current job"; plain `nohup … &` is enough.

Related: [user-tasks-via-console](user-tasks-via-console.md), [console-step-wait-yourself](console-step-wait-yourself.md).

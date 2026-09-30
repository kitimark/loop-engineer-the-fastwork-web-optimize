# fastwork-com-web-optimize: agent guide

Personal, educational scroll-performance study of the public homepage https://fastwork.com/ on a
local mirror. Not affiliated with Fastwork. Details: `README.md` (mirror tooling), `research/`
(findings), `fixes/README.md` (per-fix workflow), `fixes/TOPICS.md` (what to fix, conflicts).

## Layout: four kinds of things

| | path | in git? | who writes it |
|---|---|---|---|
| (a) shared tooling | `tools/` (`serve`, `verify`, `fix`, `lock`, `iphone`, `incident`, `mirror`, `prettify`, `lib/`) | yes | any agent, with a covering test (Hard rule 6); usually a `toolsmith` per incident |
| (b) research write-ups | `research/<nn-topic>/` (README, data, one-off tools) | yes | append new studies; don't rewrite history |
| (c) private mirror baseline | `site/` (byte-identical), `site-pretty/` (Prettier copy) — **main checkout only** | **never** (gitignored) | only `mirror.mjs` / `prettify.mjs`, run by the user |
| (d) per-fix experiments | `fixes/<topic>/` `README.md`, `patch.diff`, `results.json` (+ gitignored `overlay/`) | deliverables only, local branches | one fix agent per topic, in its own worktree |

`out/` (gitignored) holds per-checkout measurement output, Chrome profiles and certs.

<!-- BEGIN hard-rules: the single list of hard rules. Other docs link here instead of repeating them. -->
## Hard rules

For the lead and every agent. **Enforced** names what stops you mechanically ("convention": only
you). Never work around an enforcement layer (`--no-verify`, `-c core.hooksPath=…`, `--no-lock`,
`git add -f`): if a rule blocks legitimate work, stop and ask the lead.

1. **Rebase + fast-forward only.** Land a branch on `main` (or any shared branch) with `git rebase main`
   on the branch, then `git merge --ff-only <branch>` in the main checkout; if the fast-forward fails,
   rebase again. MUST NOT create merge commits (`--no-ff`, a non-fast-forward `git merge`, finishing a
   conflicted merge, `git merge --continue`) or squash-merge commits (`--squash`), and MUST NOT merge
   `main` into a branch (rebase it). `git pull` only with `--rebase`.
   *Why:* linear history: each fix is one contiguous series on `main` that can be bisected, reverted, re-stacked.
   *Enforced:* `.githooks/` (`pre-merge-commit`, `commit-msg`, and `reference-transaction`, which refuses
   any merge commit on a branch even with `--no-verify`); repo config `merge.ff=only`, `pull.rebase=true`;
   the Claude Code hook `.claude/hooks/git-guard.mjs` and deny rules in `.claude/settings.json`.
   Landing steps: `fixes/LEAD.md` "Land a fix".
2. **Never push; no remote.** MUST NOT `git push` (any form), add a remote, or publish anything from
   this repo (`gh repo create`, gists, PRs). *Why:* the mirror, overlays and the Fastwork excerpts in
   `patch.diff` stay on this machine (personal study, see `README.md`). *Enforced:* deny rules,
   git-guard, the `pre-push` hook; `git remote add` and `git config remote.*` ask the user.
3. **Never commit Fastwork-derived or secret files:** `site/`, `site-pretty/`, `out/`,
   `fixes/*/overlay/`, `.serena/cache/`, `*.pem`; never `git add -f`. `patch.diff` goes on local
   branches only (rule 2). *Why:* third-party property; generated keys. *Enforced:* `.gitignore`,
   deny rules on `git add -f`/`--force`, the `pre-commit` hook refuses those paths when staged.
4. **The baseline is read-only.** MUST NOT edit `site/` or `site-pretty/`; change Fastwork code only
   in your overlay copy (`node tools/fix.mjs edit <topic> <file>`). MUST NOT run `mirror.mjs` or
   `prettify.mjs` while agents work (they rewrite the shared baseline). *Why:* every worktree measures
   against the same baseline. *Enforced:* `Edit` deny rules; mirror/prettify ask; the baseline exists
   only in the main checkout. Details: "Fix workflow in a worktree".
5. **Your own worktree, never the main checkout.** Every agent works in its own git worktree under
   `.claude/worktrees/` on its own branch; only the lead works in the main checkout and lands on `main`.
   *Why:* the main checkout holds `main`, the baseline and port 5173. *Enforced:* `fix.mjs` refuses to
   write fixes in the main checkout, `fix.mjs doctor`; otherwise convention. Details: "Parallel agents",
   roles and who may do what: `fixes/AGENT_ROLES.md`.
6. **Tooling is guarded by tests.** Agents MAY change `tools/` to fix a bug or unblock work. Such a
   change MUST come with a covering test (new or updated in `tests/`) and `npm test` MUST pass; an
   accidental edit caught by a failing test MUST be reverted; tests MUST NOT be weakened to go green
   (change a test only for a genuine, intended behaviour change). Tool fixes go in a separate commit
   from fix deliverables and are reported to the lead as an incident ("Unexpected problems"), who
   lands them on `main` first (rule 1) for everyone. Changes to measurement code (`verify.mjs`,
   `lib/cdp.mjs`, `fix.mjs ab`) MUST be called out in the fix's README and `results.json` notes: they
   affect A/B comparability. The enforcement
   layer (`.githooks/`, `.claude/hooks/`, `.claude/settings.json`) is not tooling: edits ask the user.
   *Why:* tools have bugs; tests, not a ban, keep them right for every agent. *Enforced:* the
   `pre-commit` hook runs `npm test` when tooling is staged; `fix-reviewer` checks tests and commit
   separation; ask rules on the enforcement layer. Details: "Tooling is guarded by tests".
7. **Chrome measurements only through the `chrome-measure` lock:** `tools/verify.mjs` or
   `tools/fix.mjs ab`, never `--no-lock`, and no CPU-heavy work (builds, `npx`, other Chromes) while
   anyone holds the lock. *Why:* A/B numbers only compare on a quiet machine. *Enforced:* both tools
   take the lock themselves; deny rule on `--no-lock`; `results.json` records host load.
   Details: "Shared devices".
8. **No chrome-devtools MCP performance traces.** Use `verify.mjs`, `fix.mjs ab`, `tools/lib/cdp.mjs`.
   *Why:* throttled MCP traces hang for about an hour and ignore the lock. *Enforced:* deny rules on
   `mcp__chrome-devtools__performance_*`.
9. **The iPhone only while you hold the `iphone` lease**; finger tests go through the lead.
   *Why:* one physical device, one page at a time. *Enforced:* `iphone.mjs open|scroll|record` refuse
   without the lease; the protocol is convention. Details: "Shared devices".
10. **Port 5173 is the main session's.** MUST NOT use or kill it; worktrees serve on `--port auto`
    (5200-5999); kill only processes you started. *Why:* the user's own mirror server.
    *Enforced:* `serve.mjs` defaults to `--port auto` in a worktree; otherwise convention.
11. **Serena is read-only:** navigate with it, edit with Claude Code's Edit tool, never write Serena
    memories. *Why:* Serena edits would skip the overlay and permission rules. *Enforced:*
    `.serena/project.yml` (`read_only`, `excluded_tools`) and deny rules. Details: "Serena".
12. **The user's personal data stays local.** MUST NOT send it (email, name, account ids, LAN
    addresses, device identifiers) to external services: web requests, MCP connectors, third-party
    APIs, anything published. *Why:* privacy; the study needs none of it. *Enforced:* convention.

Enforcement setup, once per clone, by the user or lead in the main checkout (repo-local config is
shared by all worktrees): `git config core.hooksPath .githooks` (= `npm run setup`; each worktree runs
the hooks of its own branch), `git config merge.ff only`, `git config pull.rebase true`. Hook tests:
`node --test 'tests/hooks/*.test.mjs'`. Known gaps: git started from a script (`node -e`, `find -exec`)
is not seen by git-guard, but the git hooks still refuse merge commits and pushes; a human can switch
the git hooks off, so for the user rule 1 stays a promise. `node tools/lock.mjs run … -- <cmd>` is
pre-approved and git-guard doesn't look inside it: never run git through it.
<!-- END hard-rules -->

## Calibrated measurement setting

Chrome, mobile viewport 430x932 DPR 3 with touch, **CPU 6x** ≈ iPhone 15 Pro Max jank on this page
(`research/cpu-throttle-calibration/`). Serve with `--vendors=local --https --latency 150` ("lags like
live"). These are the `fix.mjs ab` defaults. Confirm winners on the real iPhone when possible.

## Fix workflow in a worktree (start to finish)

```sh
node tools/fix.mjs doctor                          # baseline found? linked worktree? port? locks?
node tools/fix.mjs new <topic>                     # fixes/<topic>/README.md + overlay/
node tools/fix.mjs grep 'getBoundingClientRect'    # search the baseline (pretty JS/CSS)
node tools/fix.mjs show /_app/immutable/nodes/2.DyWL8TcE.js --lines 2660-2780
node tools/fix.mjs edit <topic> /_app/immutable/nodes/2.DyWL8TcE.js   # copy into the overlay, then Edit it
node --check fixes/<topic>/overlay/_app/immutable/nodes/2.DyWL8TcE.js
node tools/fix.mjs serve <topic>                   # run in background; prints MIRROR_URL=… and LAN URL
curl -sk -D - -o /dev/null https://localhost:<port>/_app/immutable/nodes/2.DyWL8TcE.js   # x-mirror-source: overlay
node tools/fix.mjs ab <topic> --runs 5             # A/B under the lock -> fixes/<topic>/results.json (+ patch.diff)
node tools/fix.mjs diff <topic>                    # (ab does this too) fixes/<topic>/patch.diff
# write fixes/<topic>/README.md from the template, then commit README.md, patch.diff, results.json
# on your worktree branch (local only). Never commit overlay/ (it is gitignored).
```

How it works: `tools/lib/paths.mjs` finds the baseline in the main checkout through
`git rev-parse --git-common-dir` (or `$FW_MIRROR_HOME`), so a worktree needs **no bootstrap and no
copy** of the 29-63 MB mirror. `serve.mjs --overlay` serves overlay files first and everything else
from the baseline. `fix.mjs` refuses to write fixes in the main checkout (use `--allow-main` only
when you really mean it). `fix.mjs ab --aa` measures the baseline against itself (noise floor).
`fix.mjs combine <name> <a> <b> …` applies several patches in order and reports conflicts;
`--on <other>` stacks a fix on another fix's overlay (wave 2 on top of a combined wave 1).

Reading `results.json`: `verdict` is "better"/"WORSE" only when the baseline and patched ranges
don't overlap over >= 3 runs; otherwise "within noise". Check `regressions` (new console errors,
new 404s, screenshot pixel diff: 0-0.4 % is countdown/orbit phase noise, more means a visual change,
`morphReached`) before claiming a win.

## Tooling is guarded by tests

`tools/`, `tests/`, `.githooks/`, `.claude/hooks/`, `package.json` and `.claude/settings.json` are
shared infrastructure, covered by an automated test suite (`tests/`, Node's built-in `node --test`, no
dependencies). The tests are the hardening, not permission prompts:

```sh
npm test              # default: unit + e2e + hook tests on a tiny fixture baseline; no Chrome, network or iPhone (~30 s)
npm run test:chrome   # opt-in: real Chrome, short runs, queues on the real chrome-measure lock (~2 min)
npm run test:all      # both
```

- Agents **may fix bugs in `tools/`** (or work around them) when needed. Every change to `tools/`
  comes with a test that covers it (new or updated in `tests/`), and `npm test` must pass.
- If a test fails after an accidental edit, **revert the edit**. Change a test only to reflect a
  genuine, intended behaviour change; never weaken a test just to go green.
- Tool fixes go in **their own commit**, separate from fix deliverables, and are reported to the lead
  as an incident, who lands them on main (rebase + ff-only) so every worktree gets them. The lead
  runs `npm test` on the exact commit in the **main checkout** too: it has `site/`, worktrees don't.
- `npm test` is about 35 s of CPU: while others may be measuring, run it under the lock in the
  short lane, `node tools/lock.mjs run chrome-measure --owner <you> --short --max-seconds 120 -- npm test`
  (not `test:chrome`: it takes the lock itself), and hold a short lease around a commit whose hook
  runs it: `node tools/lock.mjs acquire chrome-measure --owner <you> --short --max-seconds 180 --wait 1800`,
  `git commit`, `node tools/lock.mjs release chrome-measure --owner <you>` (`fixes/INCIDENTS.md`). A
  short job waits for the current holder only, not for the queued 5-min A/Bs (incident I-007).
- Changes to measurement code (`verify.mjs`, `lib/cdp.mjs`, `fix.mjs ab`; `serve.mjs` and
  `vendor-shim.js` where they change what is served) must be called out explicitly: they affect the
  comparability of A/B results measured before and after. Run `npm run test:chrome` after them.
- `.githooks/pre-commit` (enable once per clone: `npm run setup`, i.e.
  `git config core.hooksPath .githooks`, shared by all worktrees) runs `npm test` when a commit
  touches the paths above and blocks the commit if it fails; it also blocks staged `site/`,
  `site-pretty/`, `out/`, `fixes/*/overlay/`, `.serena/cache/` and `*.pem`. Never bypass it
  (`--no-verify`, `-c core.hooksPath=...`).
- Tests point the tools at a fixture baseline via `$FW_MIRROR_HOME` and at a temp lock dir via
  `$FW_STATE_DIR`; they never use port 5173, the iPhone or the live site.

## Agent roles (`.claude/agents/`)

- `fix-owner` (opus/high, `isolation: worktree`): one topic or conflict cluster end to end; spawn it
  with `subagent_type: "fix-owner"` and the filled-in prompt from `fixes/AGENT_PROMPT.md`. It may spawn
  `bundle-mapper` helpers.
- `toolsmith` (opus/high, worktree subagent): one incident in `tools/`/`tests/`, test-first, one
  separate commit; spawned by the lead per incident. `wave-integrator` (opus/high, worktree
  subagent): combines a landed wave, measures it, writes it up; spawned by the lead.
- `bundle-mapper` (sonnet/medium, read-only): map bundle code, find callers, summarize data, answer
  web-platform questions; pass `model: "haiku"` for mechanical jobs. `fix-reviewer` (opus/high,
  read-only): adversarial review of a finished fix, a combined wave or a measurement-code tool fix,
  spawned by the lead.
- Only fix owners and the integrator measure; the toolsmith runs tests; helpers and reviewers never
  run Chrome, the iPhone or the locks. The lead coordinates incidents and is the only one who lands.
- Roster, who may do what, nesting limits, what teammates take from a definition (not `effort`, not
  `isolation`), model/effort per task, Serena use: `fixes/AGENT_ROLES.md`. The project loop and
  landing: `fixes/LEAD.md`. Incidents: `fixes/INCIDENTS.md`.

## Parallel agents: worktree subagents or an agent team

Agent teams are enabled for this project (`env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in
`.claude/settings.json`; experimental). `worktree.baseRef: "head"` makes new worktrees start from
the local `HEAD`, so **commit the tooling first**: a worktree only has committed files.

- **Worktree subagents:** the lead calls the Agent tool with `isolation: "worktree"` (and a `name`
  so siblings can `SendMessage` each other). Claude Code creates `.claude/worktrees/<name>/` on branch
  `worktree-<name>` and keeps it if it has changes. A call that passes `isolation` stays a subagent
  even with agent teams on.
- **Agent-team teammates:** a named Agent call **without** `isolation` becomes a teammate, which
  runs in the lead's working directory (the main checkout). A teammate's **first action** is to
  enter its own worktree: the `EnterWorktree` tool with name `fix-<topic>`, or
  `git worktree add .claude/worktrees/fix-<topic> -b fix/<topic>` then `EnterWorktree` with that
  path. `fix.mjs` refuses to create fixes in the main checkout, which catches a forgotten step.
  Teammates load this CLAUDE.md, not the lead's conversation: put the topic and the prompt from
  `fixes/AGENT_PROMPT.md` in the spawn prompt. Permission prompts of teammates appear in the lead.

Team conventions (messages go to the lead and to teammates named in `fixes/TOPICS.md` conflicts):
- One teammate owns one topic (or one conflict cluster from `fixes/TOPICS.md`) and one worktree.
- **Post cross-topic findings** as soon as you find them, to the owners of the affected topics, e.g.
  "scroll engine `iE` also drives the nav callback, so changing `dE`'s contract touches
  nav-hit-test" or "future `l` also toggles `.pain is-pain-dark`". Don't edit code another topic owns;
  describe the change you need and let the owner decide.
- Report when done: topic, branch, one-line verdict with the key delta and spread, files touched.
- **Scratch files go in `<scratchpad>/<your-topic>/`** (or your worktree's `out/`), never in the
  scratchpad root: all agents of a session share one scratchpad, and same-named files overwrote each
  other (incident I-006). Any Chrome `--user-data-dir` is per topic too.
- **One `chrome-measure` queue entry per agent.** Iterate with `--runs 3`, final `--runs 5` once;
  put visual checks in the same slot (a lease slot: `lock.mjs acquire chrome-measure --owner <you>`,
  then run as that owner). Don't SIGTERM a waiting `fix.mjs ab`: it drops your queue place.
  Hold the lock only while a run is executing: never while editing or debugging; release as soon as
  the run ends. Until I-005 is fixed, a same-owner `fix.mjs ab` deletes your lease when it exits: run
  other checks first and `fix.mjs ab` last.
- **Use the iPhone while you wait for Chrome.** The phone renders by itself, so an iPhone check barely
  loads the Mac and runs in parallel with Chrome measurements (lease, plain http per I-003).

## Unexpected problems: incidents

Anything that breaks outside your own topic's code (a tool crashes or reports odd numbers; Chrome,
ports, locks, the iPhone or Serena misbehave; the baseline looks wrong; a web-platform question
blocks a decision) is an **incident**: report it once, keep working, rebase when it is announced
fixed. Report fields, triage, escalation and the lead's side: `fixes/INCIDENTS.md`.

```sh
node tools/incident.mjs list                       # open problems and their workarounds (at start and on resume)
node tools/incident.mjs open --by <you> --title "<what failed>" --error "<first error line>" \
  --cmd "<command>" --class tool|env|baseline|research|fix|unknown --blocking yes|no
#   OPENED <id>: message the lead | JOINED <id>: already reported, use its workaround | KNOWN <id>: git rebase main, retry
node tools/incident.mjs wait <id> --timeout 3600   # in the background: exits with the announcement when resolved
```

The store lives in the shared git dir (`.git/fastwork-mirror/incidents/`), so every worktree sees a
report at once. Only the lead triages, sends a `toolsmith`, lands the fix and resolves. "incident
<id> RESOLVED … fixed in <sha>" means: `git rebase main` between steps (never mid-A/B) and
continue; re-measure if it says "Re-measure".

## Serena (code navigation, read-only)

Serena is configured in `.serena/project.yml` for **navigation only**: `find_symbol`,
`find_referencing_symbols`, `get_symbols_overview`, `find_declaration`, `read_memory`. Its editing tools
are disabled (and denied in `.claude/settings.json`): **edit with Claude Code's Edit tool**, even where
Serena's own instructions say otherwise.

- **One Serena per session, rooted where the session started.** Worktree subagents and teammates share
  the lead's Serena, i.e. the **main checkout**, not their worktree. Serena paths are relative to it:
  baseline `site-pretty/_app/immutable/...`; your overlay
  `.claude/worktrees/<wt>/fixes/<topic>/overlay/_app/immutable/...` (also indexed). Before editing,
  turn a Serena result into your absolute worktree overlay path and `Read` those lines.
  Never edit a `site-pretty/` path.
- Minified names repeat: always pass `relative_path` and use full name paths (e.g. `dN/ne() callback/A`).
  Serena's line numbers are **0-based**; `sed`, `fix.mjs show` and `fixes/TOPICS.md` are 1-based.
- Memories: `hot_code_map` (verified symbol name paths and lines for every topic), `serena_usage`,
  `rules`, `project_overview`. Don't write memories; put findings in `fixes/<topic>/README.md`.
- `.serena/cache/` holds symbol data derived from Fastwork code: it is gitignored, never commit it.
  After a new mirror/prettify, warm it up with `serena project index` in the main checkout (a few seconds).
- Serena reads `.serena/project.yml` (and its tool list) only at startup: after changing it or
  `jsconfig.json` (the JS project that gives cross-file references), the user reconnects with `/mcp`.
  Never use the Serena dashboard's add/remove language: it rewrites the tracked `project.yml` from the
  running server's config. After a Serena upgrade, check `git diff .serena/project.yml`.

## Shared devices: `chrome-measure` lock and `iphone` lease

`tools/lock.mjs` (library `tools/lib/lock.mjs`) holds named locks in the shared git dir
(`.git/fastwork-mirror/locks/`), visible from every worktree. Holders are either a live process
(stale when its pid dies) or a lease with a TTL (stale when it expires). Waiters queue FIFO; a
queue entry not refreshed for 10 min is dropped. Short lane: `--short --max-seconds N` (N <= 300, on
`run` and `acquire`) is served before earlier normal waiters at the next hand-over, never preempts
the holder, alternates with normal waiters (at most one short job between two normal holders), and
ends at N s (`run` kills the command, exit 124; a short lease expires and can't be renewed). Only for
short, bounded jobs such as `npm test`; never for a measurement.

```sh
node tools/lock.mjs status                                   # who holds what, who is queued
# Chrome: automatic. verify.mjs / fix.mjs ab wait for chrome-measure and release on exit or crash.
# iPhone (one page at a time, ios_webkit_debug_proxy on :9221/:9222, LAN https://192.168.0.55:<port>/):
node tools/lock.mjs acquire iphone --owner <topic> --ttl 900 --url https://192.168.0.55:<port>/
#   exit 0 = yours; exit 3 = busy and you are queued: do other work, retry every 2-5 min (keeps your place)
node tools/iphone.mjs open https://192.168.0.55:<port>/ --owner <topic>    # navigates Safari (location.href)
node tools/iphone.mjs scroll --owner <topic> --label patched                 # scripted scroll, ~60 s
node tools/iphone.mjs record --owner <topic> --seconds 25 --label finger     # human finger scroll (see below)
node tools/lock.mjs renew iphone --owner <topic> --ttl 900                   # if you need longer
node tools/lock.mjs release iphone --owner <topic>
```

iPhone protocol on top of the lease:
1. Acquire the lease, then message the lead: "iPhone acquired for <topic>: <LAN URL>".
2. Scripted checks: `iphone.mjs scroll` for baseline and patched URLs (`fix.mjs serve` for each, or
   `serve.mjs --root site-pretty --port auto --https` for the plain baseline).
3. Finger test (touch scroll-jack, toolbar resize): message the lead "need a finger scroll on <URL>,
   top to bottom then push past the end". The lead asks the user; start `iphone.mjs record` when
   the lead confirms the user is ready.
4. Release and message the lead "iPhone released (<topic>)". Never hold it while idle; never
   navigate the phone without the lease; waiters queue instead of polling faster than every 2 min.

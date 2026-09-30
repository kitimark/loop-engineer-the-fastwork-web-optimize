# fastwork-com-web-optimize: agent guide

Personal, educational scroll-performance study of the public homepage https://fastwork.com/ on a
local mirror. Not affiliated with Fastwork. Details: `README.md` (mirror tooling), `research/`
(findings), `fixes/README.md` (per-fix workflow), `fixes/TOPICS.md` (what to fix, conflicts).

## Layout: four kinds of things

| | path | in git? | who writes it |
|---|---|---|---|
| (a) shared tooling | `tools/` (`serve`, `verify`, `fix`, `lock`, `iphone`, `mirror`, `prettify`, `lib/`) | yes | infra changes only, not fix agents |
| (b) research write-ups | `research/<nn-topic>/` (README, data, one-off tools) | yes | append new studies; don't rewrite history |
| (c) private mirror baseline | `site/` (byte-identical), `site-pretty/` (Prettier copy) — **main checkout only** | **never** (gitignored) | only `mirror.mjs` / `prettify.mjs`, run by the user |
| (d) per-fix experiments | `fixes/<topic>/` `README.md`, `patch.diff`, `results.json` (+ gitignored `overlay/`) | deliverables only, local branches | one fix agent per topic, in its own worktree |

`out/` (gitignored) holds per-checkout measurement output, Chrome profiles and certs.

## Hard rules

1. **Never commit or push Fastwork assets.** `site/`, `site-pretty/`, `fixes/*/overlay/` and `out/`
   are gitignored; never `git add -f` them. There is no remote and nothing is ever pushed
   (`git push` is denied in `.claude/settings.json`). `patch.diff` contains excerpts of Fastwork code:
   it may be committed to **local** branches only.
2. **The baseline is read-only.** Never edit `site/` or `site-pretty/` (Edit is denied; from a
   worktree the main checkout is blocked anyway). Change code only through a fix overlay:
   `node tools/fix.mjs edit <topic> <file>` copies a file into `fixes/<topic>/overlay/`, edit that copy.
   Don't run `mirror.mjs` or `prettify.mjs` while agents are working (they rewrite the shared baseline).
3. **No chrome-devtools MCP tracing** (it hangs for an hour on throttled traces). Use the raw-CDP
   tools: `tools/verify.mjs`, `tools/fix.mjs ab`, `tools/lib/cdp.mjs`.
4. **Calibrated setting:** Chrome, mobile viewport 430x932 DPR 3 with touch, **CPU 6x** ≈ iPhone
   15 Pro Max jank on this page (`research/cpu-throttle-calibration/`). Serve with
   `--vendors=local --https --latency 150` ("lags like live"). These are the `fix.mjs ab` defaults.
   Confirm winners on the real iPhone when possible.
5. **Measurements are serialized.** Every `verify.mjs` run (and so every `fix.mjs ab`) waits for the
   cross-worktree `chrome-measure` lock (FIFO). Don't bypass it with `--no-lock`, and don't start
   CPU-heavy work (builds, `npx`, other Chromes) while you hold it.
6. **Ports:** never use or kill the main session's server on **5173**. In a worktree, `serve.mjs`
   defaults to `--port auto` (a per-checkout port in 5200-5999); `--port 0` = any free port. Kill only
   processes you started.
7. **One iPhone.** Touch it only while holding the `iphone` lease (below).

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

## Agent roles (`.claude/agents/`)

- `fix-owner` (opus/high, `isolation: worktree`): one topic or conflict cluster end to end; spawn it
  with `subagent_type: "fix-owner"` and the filled-in prompt from `fixes/AGENT_PROMPT.md`. It may spawn
  `bundle-mapper` helpers.
- `bundle-mapper` (sonnet/medium, read-only): map bundle code, find callers, summarize data; pass
  `model: "haiku"` for mechanical jobs. `fix-reviewer` (opus/high, read-only): adversarial review of a
  finished fix against `fixes/README.md` "Definition of done", spawned by the lead.
- Only fix owners measure; helpers and reviewers never run Chrome, the iPhone or the locks.
- Lead procedure: `fixes/LEAD.md`. Nesting limits, what teammates take from a definition (not
  `effort`, not `isolation`), model/effort per task, Serena use: `fixes/AGENT_ROLES.md`.

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

## Shared devices: `chrome-measure` lock and `iphone` lease

`tools/lock.mjs` (library `tools/lib/lock.mjs`) holds named locks in the shared git dir
(`.git/fastwork-mirror/locks/`), visible from every worktree. Holders are either a live process
(stale when its pid dies) or a lease with a TTL (stale when it expires). Waiters queue FIFO; a
queue entry not refreshed for 10 min is dropped.

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
